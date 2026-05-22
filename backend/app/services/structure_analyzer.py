from pathlib import Path
from typing import Optional

from app.core.paths import OUTPUTS_DIR, PROJECT_ROOT
from app.models.contracts import AnalyzeSampleRequest, StructureDNA
from app.services.json_repository import JsonRepository
from app.services.media_probe import MediaInfo, MediaProbe


class StructureAnalyzer:
    """Module A: sample video analysis.

    Real implementation slots:
    - FFmpeg metadata extraction
    - scene detection
    - ASR
    - multimodal structure extraction
    """

    def __init__(self, repository: JsonRepository, media_probe: Optional[MediaProbe] = None) -> None:
        self.repository = repository
        self.media_probe = media_probe or MediaProbe()

    def analyze(self, request: AnalyzeSampleRequest) -> StructureDNA:
        if request.source_uri and not request.use_mock:
            return self._analyze_uploaded_video(request)

        payload = self.repository.load_mock("structure_dna")
        payload["video_id"] = request.video_id
        if request.source_uri:
            payload["source_type"] = "uploaded_video"
        return StructureDNA(**payload)

    def _analyze_uploaded_video(self, request: AnalyzeSampleRequest) -> StructureDNA:
        source_path = self._resolve_source_path(request.source_uri)
        media_info = self.media_probe.inspect(source_path)
        output_dir = OUTPUTS_DIR / request.project_id / request.video_id
        cover_path = self.media_probe.extract_cover(source_path, output_dir / "cover.jpg", media_info.duration_sec)
        payload = {
            "schema_version": "1.0",
            "video_id": request.video_id,
            "source_type": "uploaded_video",
            "total_duration_sec": media_info.duration_sec,
            "category": "product_talk",
            "structure_formula": "hook -> pain_point -> solution -> proof -> cta",
            "basic_info": {
                "width": media_info.width,
                "height": media_info.height,
                "fps": media_info.fps,
                "shot_count": 5,
                "has_speech": media_info.has_audio,
                "cover_frame_path": str(cover_path.relative_to(PROJECT_ROOT)),
            },
            "segments": self._build_rule_segments(media_info),
            "global_features": {
                "avg_segment_duration_sec": round(media_info.duration_sec / 5, 3),
                "pacing_pattern": "rule_based_until_asr_ready",
                "bgm_style": "unknown",
                "overall_emotion_curve": [8, 6, 7, 7, 8],
            },
        }
        return StructureDNA(**payload)

    @staticmethod
    def _resolve_source_path(source_uri: Optional[str]) -> Path:
        if not source_uri:
            raise ValueError("source_uri is required for uploaded video analysis")
        path = Path(source_uri)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path.resolve()

    @staticmethod
    def _build_rule_segments(media_info: MediaInfo) -> list[dict[str, object]]:
        functions = [
            ("hook", "开头钩子", "talking_head_close_up", ["talking_head", "high_energy", "clear_face"]),
            ("pain_point", "痛点", "talking_head_mid_shot", ["pain_point", "product_context"]),
            ("solution", "解决方案", "product_demo", ["product_demo", "process", "hands"]),
            ("proof", "效果证明", "comparison_shot", ["proof", "comparison", "result"]),
            ("cta", "转化 CTA", "talking_head_product_hold", ["cta", "product", "clear_voice"]),
        ]
        ratios = [0.17, 0.23, 0.30, 0.17, 0.13]
        starts = [0.0]
        for ratio in ratios[:-1]:
            starts.append(round(starts[-1] + media_info.duration_sec * ratio, 3))

        segments: list[dict[str, object]] = []
        for index, ((function, label, shot_type, tags), start) in enumerate(zip(functions, starts), start=1):
            end = round(starts[index], 3) if index < len(starts) else media_info.duration_sec
            duration = round(max(end - start, 0.001), 3)
            segments.append(
                {
                    "segment_id": f"seg_{index:03d}",
                    "function": function,
                    "time_range": [start, end],
                    "duration_sec": duration,
                    "duration_ratio": round(duration / media_info.duration_sec, 4),
                    "narrative_technique": "rule_based_placeholder",
                    "shot_type": shot_type,
                    "emotion_score": [8, 6, 7, 7, 8][index - 1],
                    "pacing": "fast" if index in (1, 5) else "medium",
                    "transcript": f"待 ASR 识别的{label}段落",
                    "text_pattern": f"{label}占位",
                    "audio_cue": "pending_asr",
                    "visual_cue": "pending_scene_detection",
                    "required_material_tags": tags,
                    "packaging": {
                        "subtitle_density": "medium",
                        "subtitle_style": "pending_asr_style",
                        "title_bar": f"{function}_title",
                        "transition": "quick_cut" if index in (1, 5) else "hard_cut",
                        "emphasis_elements": ["pending_model_review"],
                    },
                }
            )
        return segments
