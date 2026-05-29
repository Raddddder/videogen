from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from app.models.contracts import (
    EditPlan,
    ExportPaths,
    GeneratePlanRequest,
    Material,
    MaterialLibrary,
    MissingSlot,
    OverallScore,
    StructureDNA,
    StructureSegment,
    TimelineItem,
    TimelinePackaging,
)
from app.services.json_repository import JsonRepository


@dataclass(frozen=True)
class MatchCandidate:
    material: Material
    score: float
    components: Dict[str, float]


class PlanGenerator:
    """Module C: structure migration, slot matching and gap filling.

    This service contains deterministic scoring for the competition demo. The
    scoring weights and thresholds come from config/defaults.json so future model
    ranking can replace the internals without changing API contracts.
    """

    def __init__(self, repository: JsonRepository) -> None:
        self.repository = repository
        self.pipeline_config = repository.config.get("pipeline", {})
        self.plan_config = repository.config.get("plan_generation", {})
        self.weights = self.pipeline_config.get("scoring_weights", {})

    def generate(
        self,
        request: GeneratePlanRequest,
        structure_dna: Optional[StructureDNA] = None,
        material_library: Optional[MaterialLibrary] = None,
    ) -> EditPlan:
        resolved_structure = request.structure_dna or structure_dna or self._load_mock_structure()
        resolved_materials = request.material_library or material_library or self._load_mock_materials(request)

        timeline, match_scores = self._build_timeline(request, resolved_structure, resolved_materials)
        missing_slots = self._build_missing_slots(timeline)
        overall_score = self._overall_score(timeline, match_scores, request.variant)

        target_title = request.target_title
        if resolved_materials.target and resolved_materials.target.title:
            target_title = resolved_materials.target.title

        return EditPlan(
            schema_version="1.0",
            project_id=request.project_id,
            source_structure_id=resolved_structure.video_id,
            target_title=target_title,
            variant=request.variant,
            overall_score=overall_score,
            timeline=timeline,
            missing_slots=missing_slots,
            exports=self._exports(request.project_id),
        )

    def _load_mock_structure(self) -> StructureDNA:
        return StructureDNA(**self.repository.load_mock("structure_dna"))

    def _load_mock_materials(self, request: GeneratePlanRequest) -> MaterialLibrary:
        payload = self.repository.load_mock("material_library")
        payload["project_id"] = request.project_id
        return MaterialLibrary(**payload)

    def _build_timeline(
        self,
        request: GeneratePlanRequest,
        structure: StructureDNA,
        materials: MaterialLibrary,
    ) -> Tuple[List[TimelineItem], Dict[str, MatchCandidate]]:
        timeline: List[TimelineItem] = []
        match_scores: Dict[str, MatchCandidate] = {}
        used_counts: Dict[str, int] = {}
        cursor = 0.0
        duration_factor = self.plan_config.get("variant_duration_factor", {}).get(request.variant, 1.0)

        for index, segment in enumerate(structure.segments, start=1):
            duration = round(max(segment.duration_sec * duration_factor, 1.0), 1)
            target_range = (round(cursor, 1), round(cursor + duration, 1))
            cursor = target_range[1]

            candidate = self._select_candidate(segment, materials.materials, used_counts)
            status, strategy = self._status_and_strategy(segment, candidate)
            selected_material = candidate.material if candidate and status != "missing" else None
            if selected_material:
                used_counts[selected_material.material_id] = used_counts.get(selected_material.material_id, 0) + 1
                match_scores[segment.segment_id] = candidate

            gap_reason = self._gap_reason(segment, candidate, status)
            supplement_instruction = self._supplement_instruction(segment, candidate, status, strategy)

            timeline.append(
                TimelineItem(
                    segment_id=segment.segment_id,
                    target_segment_id=f"target_{index:03d}",
                    function=segment.function,
                    target_time_range=target_range,
                    selected_material_id=selected_material.material_id if selected_material else None,
                    source_range=self._source_range(selected_material, duration),
                    slot_status=status,
                    gap_reason=gap_reason,
                    completion_strategy=strategy,
                    supplement_instruction=supplement_instruction,
                    script=self._script(segment, selected_material, materials),
                    packaging=self._packaging(segment, status),
                    explanation=self._explanation(segment, candidate, status, strategy),
                )
            )

        return timeline, match_scores

    def _select_candidate(
        self,
        segment: StructureSegment,
        materials: Iterable[Material],
        used_counts: Dict[str, int],
    ) -> Optional[MatchCandidate]:
        candidates = [self._score_material(segment, material, used_counts) for material in materials]
        if not candidates:
            return None
        return max(candidates, key=lambda candidate: candidate.score)

    def _score_material(
        self,
        segment: StructureSegment,
        material: Material,
        used_counts: Dict[str, int],
    ) -> MatchCandidate:
        components = {
            "shot_type_match": self._shot_type_match(segment, material),
            "semantic_role_match": self._semantic_role_match(segment, material),
            "emotion_match": self._emotion_match(segment, material),
            "duration_match": self._duration_match(segment, material),
            "quality_score": material.quality_score,
        }
        score = sum(components[key] * float(self.weights.get(key, 0.0)) for key in components)
        score -= min(used_counts.get(material.material_id, 0) * 0.06, 0.18)
        return MatchCandidate(material=material, score=round(max(score, 0.0), 4), components=components)

    def _shot_type_match(self, segment: StructureSegment, material: Material) -> float:
        segment_shot = self._tokens(segment.shot_type)
        material_shot = self._tokens(material.shot_type)
        if segment.shot_type == material.shot_type:
            return 1.0
        if segment_shot & material_shot:
            return 0.72
        if set(segment.required_material_tags) & set(material.tags):
            return 0.58
        return 0.15

    def _semantic_role_match(self, segment: StructureSegment, material: Material) -> float:
        if material.semantic_role == segment.function:
            return 1.0
        material_tags = set(material.tags)
        if segment.function in material_tags:
            return 0.82
        if set(segment.required_material_tags) & material_tags:
            return 0.58
        if material.semantic_role == "unknown":
            return 0.2
        if {segment.function, material.semantic_role} <= {"hook", "pain_point", "setup"}:
            return 0.45
        if {segment.function, material.semantic_role} <= {"solution", "proof"}:
            return 0.48
        return 0.25

    def _emotion_match(self, segment: StructureSegment, material: Material) -> float:
        return round(max(1.0 - abs(segment.emotion_score - material.emotion_score) / 10.0, 0.0), 3)

    def _duration_match(self, segment: StructureSegment, material: Material) -> float:
        available = self._available_duration(material)
        if available <= 0:
            if material.type in {"copy", "image"} and segment.function in {"proof", "pain_point", "cta"}:
                return 0.62
            return 0.45
        ratio = min(available, segment.duration_sec) / max(available, segment.duration_sec)
        return round(max(ratio, 0.25), 3)

    def _status_and_strategy(self, segment: StructureSegment, candidate: Optional[MatchCandidate]) -> Tuple[str, str]:
        thresholds = self.plan_config.get("match_thresholds", {})
        matched_threshold = float(thresholds.get("matched", 0.72))
        weak_threshold = float(thresholds.get("weak_match", 0.52))
        component_floor = float(self.plan_config.get("direct_match_component_floor", 0.42))

        if candidate is None or candidate.score < weak_threshold:
            return "missing", "aigc"

        if candidate.material.type in set(self.plan_config.get("supplemental_material_types", [])):
            if segment.shot_type not in {"copy_card", "voiceover"}:
                return "supplemented", "copy" if candidate.material.type == "copy" else "packaging"

        if candidate.score < matched_threshold:
            return "weak_match", "packaging"

        weak_components = [
            name for name, value in candidate.components.items()
            if name != "quality_score" and value < component_floor
        ]
        if weak_components:
            return "weak_match", "packaging"

        emotion_sensitive = set(self.plan_config.get("emotion_sensitive_functions", []))
        emotion_floor = float(self.plan_config.get("emotion_weak_match_below", 0.82))
        if segment.function in emotion_sensitive and candidate.components["emotion_match"] < emotion_floor:
            return "weak_match", "packaging"

        return "matched", "direct_match"

    def _gap_reason(self, segment: StructureSegment, candidate: Optional[MatchCandidate], status: str) -> str:
        if status == "matched":
            return ""
        if candidate is None:
            return f"没有可用素材覆盖 {segment.function} 槽位"

        reasons = []
        if candidate.components["semantic_role_match"] < 0.55:
            reasons.append("素材语义角色和目标段落不完全一致")
        if candidate.components["shot_type_match"] < 0.55:
            reasons.append("镜头类型不能完整复刻样例")
        if candidate.components["duration_match"] < 0.65:
            reasons.append("可用时长偏短或需要静态包装")
        if candidate.components["emotion_match"] < 0.82:
            reasons.append("情绪强度低于样例段落")
        return "；".join(reasons) or "素材能覆盖主体信息，但需要包装补强"

    def _supplement_instruction(
        self,
        segment: StructureSegment,
        candidate: Optional[MatchCandidate],
        status: str,
        strategy: str,
    ) -> str:
        if status == "matched":
            return ""
        if status == "missing":
            return f"补拍或上传一个 {segment.shot_type} 素材；临时演示可用 AIGC 图/文案卡补齐 {segment.function} 段"
        if strategy == "copy":
            return "用卖点文案卡、局部放大和结果字幕补足证明力"
        if candidate and candidate.material.type == "image":
            return "把静态图片做成推拉镜头，叠加标题条、箭头标注和节奏点"
        return "增加标题条、关键词高亮、节奏音效和转场，让弱匹配素材承担原结构功能"

    def _script(
        self,
        segment: StructureSegment,
        material: Optional[Material],
        library: MaterialLibrary,
    ) -> str:
        if material and material.transcript.strip():
            return material.transcript.strip()[:120]

        selling_points = library.target.selling_points if library.target else []
        points = "、".join(selling_points[:2])
        if segment.function == "hook" and library.target:
            return f"很多人做{library.target.title}，第一步就容易错"
        if segment.function == "proof" and points:
            return f"{points}，效果差异一眼能看出来"
        if segment.function == "cta":
            return "想少踩坑，先收藏这条，链接我放下面了"
        return segment.transcript

    def _packaging(self, segment: StructureSegment, status: str) -> TimelinePackaging:
        effect = segment.packaging.emphasis_elements[0] if segment.packaging.emphasis_elements else segment.visual_cue
        title_bar_text = segment.packaging.title_bar
        if status in {"weak_match", "missing", "supplemented"} and title_bar_text == "none":
            title_bar_text = f"补强 {segment.function}"
        return TimelinePackaging(
            subtitle=segment.packaging.subtitle_style,
            title_bar_text=title_bar_text,
            transition=segment.packaging.transition,
            effect=effect,
        )

    def _explanation(
        self,
        segment: StructureSegment,
        candidate: Optional[MatchCandidate],
        status: str,
        strategy: str,
    ) -> str:
        if candidate is None:
            return f"{segment.function} 槽位没有候选素材，保留结构段落并给出补拍/AIGC 补全建议。"
        material = candidate.material
        if status == "missing":
            return (
                f"{segment.function} 槽位没有达标素材；最佳候选是 "
                f"{material.material_id}({material.file_name})，综合匹配分 {candidate.score:.2f}，"
                "低于弱匹配阈值，因此不进入正式时间线。"
            )
        return (
            f"选择 {material.material_id}({material.file_name}) 承接 {segment.function} 段，"
            f"综合匹配分 {candidate.score:.2f}，状态为 {status}，处理策略为 {strategy}。"
        )

    def _build_missing_slots(self, timeline: Iterable[TimelineItem]) -> List[MissingSlot]:
        slots = []
        for item in timeline:
            if item.slot_status == "matched":
                continue
            slots.append(
                MissingSlot(
                    segment_id=item.segment_id,
                    function=item.function,
                    missing_type=self._missing_type(item),
                    impact=self._impact(item),
                    suggested_fix=item.supplement_instruction,
                )
            )
        return slots

    def _missing_type(self, item: TimelineItem) -> str:
        if item.slot_status == "missing":
            return "material_absent"
        if "语义" in item.gap_reason:
            return "semantic_gap"
        if "镜头" in item.gap_reason:
            return "shot_type_mismatch"
        if "时长" in item.gap_reason:
            return "duration_gap"
        if "情绪" in item.gap_reason:
            return "emotion_gap"
        return "needs_packaging"

    def _impact(self, item: TimelineItem) -> str:
        impacts = {
            "hook": "开头吸引力不足，可能影响完播和点击",
            "pain_point": "痛点不够具体，用户代入感会下降",
            "solution": "解决方案不够直观，步骤可信度下降",
            "proof": "证明力不足，转化说服力下降",
            "cta": "结尾行动指令偏弱，转化效率下降",
        }
        return impacts.get(item.function, "该结构槽位的表达强度会下降")

    # Per-variant emphasis: which structure functions each version optimises for.
    # high_click front-loads attention (hook/transition + pacing); high_conversion
    # leans on trust and closing (proof/cta + material fit).
    _VARIANT_FOCUS: Dict[str, Dict[str, float]] = {
        "balanced": {},
        "high_click": {"hook": 1.18, "transition": 1.1, "setup": 1.05},
        "high_conversion": {"proof": 1.18, "cta": 1.18, "solution": 1.06},
        "fast_pacing": {"hook": 1.1, "transition": 1.12},
        "premium": {"proof": 1.12, "solution": 1.08},
    }
    _VARIANT_DIMENSION_BOOST: Dict[str, Dict[str, float]] = {
        "high_click": {"pacing_fit": 0.06},
        "high_conversion": {"material_fit": 0.05, "structure_consistency": 0.03},
        "fast_pacing": {"pacing_fit": 0.08},
        "premium": {"material_fit": 0.04},
    }

    def _overall_score(
        self,
        timeline: List[TimelineItem],
        candidates: Dict[str, MatchCandidate],
        variant: str = "balanced",
    ) -> OverallScore:
        if not timeline:
            return OverallScore(structure_consistency=0.0, material_fit=0.0, pacing_fit=0.0)

        focus = self._VARIANT_FOCUS.get(variant, {})
        status_weights = {"matched": 1.0, "supplemented": 0.82, "weak_match": 0.62, "missing": 0.25}
        # Function-weighted so each variant rewards the segments it cares about.
        weighted_sum = sum(status_weights[item.slot_status] * focus.get(item.function, 1.0) for item in timeline)
        weight_total = sum(focus.get(item.function, 1.0) for item in timeline)
        structure_consistency = weighted_sum / weight_total if weight_total else 0.0
        material_fit = sum(candidates[item.segment_id].score if item.segment_id in candidates else 0.2 for item in timeline) / len(timeline)
        pacing_fit = sum(
            candidates[item.segment_id].components["duration_match"] if item.segment_id in candidates else 0.35
            for item in timeline
        ) / len(timeline)

        boost = self._VARIANT_DIMENSION_BOOST.get(variant, {})
        clamp = lambda value: round(min(max(value, 0.0), 1.0), 2)
        return OverallScore(
            structure_consistency=clamp(structure_consistency + boost.get("structure_consistency", 0.0)),
            material_fit=clamp(material_fit + boost.get("material_fit", 0.0)),
            pacing_fit=clamp(pacing_fit + boost.get("pacing_fit", 0.0)),
        )

    def _source_range(self, material: Optional[Material], target_duration: float) -> Optional[Tuple[float, float]]:
        if material is None or not material.usable_ranges:
            return None
        start, end = material.usable_ranges[0]
        selected_end = min(end, start + target_duration)
        return (round(start, 2), round(selected_end, 2))

    def _available_duration(self, material: Material) -> float:
        if material.usable_ranges:
            return max(end - start for start, end in material.usable_ranges)
        return material.duration_sec

    def _exports(self, project_id: str) -> ExportPaths:
        exports = self.repository.config.get("exports", {})
        output_root = exports.get("output_dir", "outputs")
        base = f"{output_root}/{project_id}"
        return ExportPaths(
            editing_guide_path=f"{base}/{exports.get('editing_guide_name', 'editing_guide.md')}",
            comparison_report_path=f"{base}/{exports.get('comparison_report_name', 'comparison_report.json')}",
            preview_video_path=f"{base}/{exports.get('preview_video_name', 'preview.mp4')}",
            capcut_draft_path=f"{base}/{exports.get('capcut_draft_name', 'draft_content.json')}",
        )

    @staticmethod
    def _tokens(value: str) -> set[str]:
        return {token for token in value.replace("-", "_").split("_") if token}
