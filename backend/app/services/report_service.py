from typing import Any, Dict, List

from app.models.contracts import EditPlan
from app.services.json_repository import JsonRepository


class ReportService:
    """Comparison report and editing guide generation."""

    def __init__(self, repository: JsonRepository) -> None:
        self.repository = repository

    def comparison_report(self, edit_plan: EditPlan) -> Dict[str, Any]:
        formula = " -> ".join(item.function for item in edit_plan.timeline)
        gap = edit_plan.missing_slots[0] if edit_plan.missing_slots else None
        review_notes = self._review_notes(edit_plan)
        return {
            "schema_version": edit_plan.schema_version,
            "project_id": edit_plan.project_id,
            "summary": {
                "source_formula": formula,
                "target_formula": formula,
                "main_gap": gap.impact if gap else "核心结构槽位均已覆盖",
                "main_fix": gap.suggested_fix if gap else "保持当前素材顺序并按时间线执行剪辑",
            },
            "segment_mapping": [
                {
                    "source_segment_id": item.segment_id,
                    "target_segment_id": item.target_segment_id,
                    "status": item.slot_status,
                }
                for item in edit_plan.timeline
            ],
            "review_notes": review_notes,
        }

    def editing_guide_markdown(self, edit_plan: EditPlan) -> str:
        lines = [
            f"# {edit_plan.target_title}",
            "",
            "## 评分",
            f"- 结构一致性：{edit_plan.overall_score.structure_consistency:.0%}",
            f"- 素材匹配度：{edit_plan.overall_score.material_fit:.0%}",
            f"- 节奏匹配度：{edit_plan.overall_score.pacing_fit:.0%}",
            "",
            "## 槽位缺口",
        ]
        if edit_plan.missing_slots:
            for slot in edit_plan.missing_slots:
                lines.extend(
                    [
                        f"- {slot.segment_id} / {slot.function}：{slot.impact}",
                        f"  建议：{slot.suggested_fix}",
                    ]
                )
        else:
            lines.append("- 暂无明显缺口，所有结构槽位均已覆盖。")

        lines.extend(["", "## 时间线"])
        for item in edit_plan.timeline:
            start, end = item.target_time_range
            lines.extend(
                [
                    "",
                    f"### {item.function} [{start:.1f}s - {end:.1f}s]",
                    f"- 素材：{item.selected_material_id or '待补充'}",
                    f"- 文案：{item.script}",
                    f"- 状态：{item.slot_status}",
                    f"- 策略：{item.completion_strategy}",
                    f"- 缺口：{item.gap_reason or '无'}",
                    f"- 补全：{item.supplement_instruction or '无需补全'}",
                    f"- 说明：{item.explanation}",
                ]
            )
        return "\n".join(lines) + "\n"

    def _review_notes(self, edit_plan: EditPlan) -> List[str]:
        notes = [
            "结构顺序已按样例公式完整迁移。",
            f"当前整体素材匹配度为 {edit_plan.overall_score.material_fit:.0%}。",
        ]
        weak_count = sum(1 for item in edit_plan.timeline if item.slot_status == "weak_match")
        missing_count = sum(1 for item in edit_plan.timeline if item.slot_status == "missing")
        supplemented_count = sum(1 for item in edit_plan.timeline if item.slot_status == "supplemented")
        if weak_count:
            notes.append(f"有 {weak_count} 个弱匹配槽位，需要依靠包装和文案补强。")
        if supplemented_count:
            notes.append(f"有 {supplemented_count} 个槽位已用文案、图片或包装完成补足。")
        if missing_count:
            notes.append(f"有 {missing_count} 个槽位缺少可用素材，建议补拍或接入 AIGC。")
        return notes
