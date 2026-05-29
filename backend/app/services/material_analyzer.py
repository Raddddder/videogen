import re
from pathlib import Path
from typing import Dict, Iterable, List, Literal, Optional
from urllib.parse import unquote, urlparse

from app.core.paths import PROJECT_ROOT
from app.models.contracts import AnalyzeMaterialsRequest, Material, MaterialLibrary, TargetBrief
from app.services.json_repository import JsonRepository
from app.services.material_vlm import MaterialVlmClient
from app.services.media_probe import MediaProbe, MediaProbeError


MaterialType = Literal["video_clip", "image", "copy", "audio"]

_ASPECT_TARGETS = {"9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1.0, "16:9": 16 / 9}


class MaterialAnalyzer:
    """Module B: user material understanding.

    Two paths share one contract:
    - analyze(): legacy heuristic path (filename/URI) that keeps the demo
      running without media files or paid calls.
    - analyze_files(): real path for uploaded files. ffprobe gives true metrics
      (duration / dimensions / aspect / quality) and an optional vision model
      tags semantics; both gracefully fall back to heuristics.
    """

    VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".webm", ".mkv"}
    IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}
    COPY_EXTENSIONS = {".txt", ".md", ".json", ".csv"}
    AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac"}

    def __init__(
        self,
        repository: JsonRepository,
        media_probe: Optional[MediaProbe] = None,
        vlm: Optional[MaterialVlmClient] = None,
    ) -> None:
        self.repository = repository
        self.config = repository.config.get("material_analysis", {})
        self.media_probe = media_probe or MediaProbe()
        self.vlm = vlm or MaterialVlmClient()

    def analyze(self, request: AnalyzeMaterialsRequest) -> MaterialLibrary:
        if request.use_mock and not request.material_uris:
            payload = self.repository.load_mock("material_library")
            payload["project_id"] = request.project_id
            payload["target"] = request.target.model_dump()
            return MaterialLibrary(**payload)

        materials = [
            self._analyze_uri(index=index, uri=uri, target=request.target)
            for index, uri in enumerate(request.material_uris, start=1)
        ]
        return MaterialLibrary(
            schema_version="1.0",
            project_id=request.project_id,
            target=request.target,
            materials=materials,
        )

    def analyze_files(
        self,
        project_id: str,
        target: TargetBrief,
        file_paths: Iterable[Path],
    ) -> MaterialLibrary:
        """Real path for uploaded material files."""
        materials = [
            self._analyze_file(index=index, path=Path(path), target=target)
            for index, path in enumerate(file_paths, start=1)
        ]
        return MaterialLibrary(
            schema_version="1.0",
            project_id=project_id,
            target=target,
            materials=materials,
        )

    def _analyze_file(self, index: int, path: Path, target: TargetBrief) -> Material:
        file_name = path.name
        material_type = self._infer_type(file_name)
        preview_url = self._preview_url(path) if material_type != "copy" else None

        width = height = 0
        duration_sec = 0.0
        if material_type in {"video_clip", "audio"}:
            try:
                info = self.media_probe.inspect(path)
                duration_sec = info.duration_sec
                width, height = info.width, info.height
            except MediaProbeError:
                pass
        elif material_type == "image":
            try:
                width, height = self.media_probe.probe_dimensions(path)
            except MediaProbeError:
                pass

        reference_text = self._reference_text(str(path)) if material_type == "copy" else ""
        source_text = " ".join([file_name, reference_text]).lower()
        aspect_ratio = (
            self._aspect_from_dims(width, height)
            if width and height
            else self._infer_aspect_ratio(source_text, material_type)
        )

        vlm_result = None
        if material_type in {"video_clip", "image"}:
            frame = self._frame_for_vlm(path, material_type, duration_sec)
            if frame is not None:
                vlm_result = self.vlm.describe_image(frame)

        if vlm_result:
            analysis_source = "vlm"
            semantic_role = (
                vlm_result["semantic_role"]
                if vlm_result["semantic_role"] != "unknown"
                else self._infer_role(source_text, material_type)
            )
            shot_type = vlm_result["shot_type"] or self._infer_shot_type(
                source_text, semantic_role, material_type
            )
            tags = sorted(
                set(vlm_result["tags"])
                | set(self._infer_tags(source_text, semantic_role, material_type, target.selling_points))
            )
            vlm_summary = vlm_result["summary"]
        else:
            analysis_source = "rule"
            semantic_role = self._infer_role(source_text, material_type)
            shot_type = self._infer_shot_type(source_text, semantic_role, material_type)
            tags = self._infer_tags(source_text, semantic_role, material_type, target.selling_points)
            vlm_summary = ""

        quality_score = (
            self._quality_from_resolution(width, height)
            if width and height
            else self._infer_quality_score(source_text, material_type, aspect_ratio)
        )
        transcript = self._transcript(reference_text, source_text, material_type)
        if vlm_summary and not transcript.strip():
            transcript = vlm_summary

        return Material(
            material_id=f"mat_{index:03d}",
            type=material_type,
            file_name=file_name,
            duration_sec=duration_sec,
            aspect_ratio=aspect_ratio,
            usable_ranges=self._usable_ranges(material_type, duration_sec),
            shot_type=shot_type,
            semantic_role=semantic_role,
            tags=tags,
            emotion_score=self._infer_emotion_score(source_text, semantic_role),
            quality_score=quality_score,
            crop_risk=self._infer_crop_risk(aspect_ratio),
            transcript=transcript,
            key_visuals=self._key_visuals(source_text, tags),
            preview_url=preview_url,
            analysis_source=analysis_source,
        )

    def _frame_for_vlm(self, path: Path, material_type: MaterialType, duration_sec: float) -> Optional[Path]:
        if material_type == "image":
            return path
        try:
            frame_path = path.parent / f".{path.stem}_frame.jpg"
            return self.media_probe.extract_cover(path, frame_path, duration_sec or 1.0)
        except MediaProbeError:
            return None

    def _preview_url(self, path: Path) -> Optional[str]:
        try:
            relative = path.resolve().relative_to(PROJECT_ROOT.resolve())
        except ValueError:
            return None
        return "/" + relative.as_posix()

    @staticmethod
    def _aspect_from_dims(width: int, height: int) -> str:
        ratio = width / height
        return min(_ASPECT_TARGETS, key=lambda label: abs(_ASPECT_TARGETS[label] - ratio))

    @staticmethod
    def _quality_from_resolution(width: int, height: int) -> float:
        shorter = min(width, height)
        if shorter >= 1080:
            return 0.92
        if shorter >= 720:
            return 0.82
        if shorter >= 480:
            return 0.7
        return 0.55

    def _analyze_uri(self, index: int, uri: str, target: TargetBrief) -> Material:
        file_name = self._file_name_from_uri(uri)
        material_type = self._infer_type(file_name)
        reference_text = self._reference_text(uri)
        source_text = " ".join([file_name, reference_text]).lower()

        semantic_role = self._infer_role(source_text, material_type)
        shot_type = self._infer_shot_type(source_text, semantic_role, material_type)
        aspect_ratio = self._infer_aspect_ratio(source_text, material_type)
        duration_sec = self._infer_duration_sec(source_text, material_type)
        tags = self._infer_tags(source_text, semantic_role, material_type, target.selling_points)
        emotion_score = self._infer_emotion_score(source_text, semantic_role)
        quality_score = self._infer_quality_score(source_text, material_type, aspect_ratio)
        crop_risk = self._infer_crop_risk(aspect_ratio)

        return Material(
            material_id=f"mat_{index:03d}",
            type=material_type,
            file_name=file_name,
            duration_sec=duration_sec,
            aspect_ratio=aspect_ratio,
            usable_ranges=self._usable_ranges(material_type, duration_sec),
            shot_type=shot_type,
            semantic_role=semantic_role,
            tags=tags,
            emotion_score=emotion_score,
            quality_score=quality_score,
            crop_risk=crop_risk,
            transcript=self._transcript(reference_text, source_text, material_type),
            key_visuals=self._key_visuals(source_text, tags),
        )

    def _file_name_from_uri(self, uri: str) -> str:
        parsed = urlparse(uri)
        raw_path = parsed.path if parsed.scheme else uri
        name = Path(unquote(raw_path)).name
        return name or "untitled_material"

    def _infer_type(self, file_name: str) -> MaterialType:
        suffix = Path(file_name).suffix.lower()
        if suffix in self.VIDEO_EXTENSIONS:
            return "video_clip"
        if suffix in self.IMAGE_EXTENSIONS:
            return "image"
        if suffix in self.COPY_EXTENSIONS:
            return "copy"
        if suffix in self.AUDIO_EXTENSIONS:
            return "audio"
        return "video_clip"

    def _reference_text(self, uri: str) -> str:
        parsed = urlparse(uri)
        if parsed.scheme and parsed.scheme not in {"file"}:
            return ""

        candidate = Path(unquote(parsed.path if parsed.scheme == "file" else uri))
        if not candidate.is_absolute():
            candidate = PROJECT_ROOT / candidate

        try:
            resolved = candidate.resolve()
            if not resolved.is_relative_to(PROJECT_ROOT.resolve()):
                return ""
            if resolved.suffix.lower() not in self.COPY_EXTENSIONS or not resolved.exists():
                return ""
            if resolved.stat().st_size > 100_000:
                return ""
            return resolved.read_text(encoding="utf-8", errors="ignore")[:1200]
        except OSError:
            return ""

    def _infer_role(self, source_text: str, material_type: MaterialType) -> str:
        if material_type == "audio":
            return "unknown"

        role_keywords: Dict[str, List[str]] = self.config.get("role_keywords", {})
        for role in self.config.get("role_priority", []):
            if self._contains_any(source_text, role_keywords.get(role, [])):
                return role

        if material_type == "copy":
            return "proof"
        if material_type == "image":
            return "solution"
        return "unknown"

    def _infer_shot_type(self, source_text: str, semantic_role: str, material_type: MaterialType) -> str:
        if material_type == "copy":
            return "copy_card"
        if material_type == "audio":
            return "voiceover"

        for shot_type, keywords in self.config.get("shot_type_keywords", {}).items():
            if self._contains_any(source_text, keywords):
                return shot_type

        defaults = self.config.get("role_default_shot_type", {})
        return defaults.get(semantic_role, defaults.get("unknown", "product_close_up"))

    def _infer_aspect_ratio(self, source_text: str, material_type: MaterialType) -> str:
        if material_type == "copy":
            return "text"
        if material_type == "audio":
            return "audio"
        if re.search(r"(9[:x_-]?16|vertical|portrait|竖屏|reel|story)", source_text):
            return "9:16"
        if re.search(r"(4[:x_-]?5)", source_text):
            return "4:5"
        if re.search(r"(1[:x_-]?1|square|方图)", source_text):
            return "1:1"
        if re.search(r"(16[:x_-]?9|landscape|横屏)", source_text):
            return "16:9"
        return "9:16" if material_type == "video_clip" else "4:5"

    def _infer_duration_sec(self, source_text: str, material_type: MaterialType) -> float:
        patterns = [
            r"(?P<value>\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|秒)",
            r"(?:duration|dur|时长)[_-]?(?P<value>\d+(?:\.\d+)?)",
        ]
        for pattern in patterns:
            match = re.search(pattern, source_text)
            if match:
                return round(max(float(match.group("value")), 0.0), 2)

        defaults = self.config.get("default_duration_sec", {})
        return float(defaults.get(material_type, 0.0))

    def _infer_tags(
        self,
        source_text: str,
        semantic_role: str,
        material_type: MaterialType,
        selling_points: Iterable[str],
    ) -> List[str]:
        tags = {material_type}
        if semantic_role != "unknown":
            tags.add(semantic_role)

        for tag, keywords in self.config.get("keyword_tags", {}).items():
            if self._contains_any(source_text, keywords):
                tags.add(tag)

        for point in selling_points:
            if point and point.lower() in source_text:
                tags.add(point)

        return sorted(tags)

    def _infer_emotion_score(self, source_text: str, semantic_role: str) -> float:
        defaults = self.config.get("role_default_emotion_score", {})
        score = float(defaults.get(semantic_role, defaults.get("unknown", 5.0)))
        if self._contains_any(source_text, ["high_energy", "爆", "强", "冲击", "惊喜"]):
            score += 1.0
        if self._contains_any(source_text, ["calm", "低能量", "平静"]):
            score -= 1.0
        return round(min(max(score, 0.0), 10.0), 1)

    def _infer_quality_score(self, source_text: str, material_type: MaterialType, aspect_ratio: str) -> float:
        baseline = float(self.config.get("quality_baseline", {}).get(material_type, 0.75))
        if self._contains_any(source_text, ["4k", "hd", "clear", "高清", "清晰"]):
            baseline += 0.08
        if self._contains_any(source_text, ["blur", "lowres", "模糊", "糊"]):
            baseline -= 0.22
        if aspect_ratio == "9:16":
            baseline += 0.04
        if aspect_ratio == "16:9":
            baseline -= 0.1
        return round(min(max(baseline, 0.0), 1.0), 2)

    def _infer_crop_risk(self, aspect_ratio: str) -> str:
        risks = self.config.get("crop_risk_by_aspect_ratio", {})
        return risks.get(aspect_ratio, risks.get("unknown", "medium"))

    def _usable_ranges(self, material_type: MaterialType, duration_sec: float) -> List[List[float]]:
        if material_type not in {"video_clip", "audio"} or duration_sec <= 0:
            return []
        return [[0.0, round(duration_sec, 2)]]

    def _transcript(self, reference_text: str, source_text: str, material_type: MaterialType) -> str:
        if reference_text.strip():
            return " ".join(reference_text.split())[:240]
        if material_type == "copy":
            return "待补充文案素材"
        if material_type == "audio":
            return "待 ASR 的音频素材"
        return ""

    def _key_visuals(self, source_text: str, tags: Iterable[str]) -> List[str]:
        visuals = []
        for tag in tags:
            if tag in {"product", "food_closeup", "talking_head", "hands"}:
                visuals.append(tag)
        if self._contains_any(source_text, ["kitchen", "厨房"]):
            visuals.append("kitchen")
        return sorted(set(visuals))

    @staticmethod
    def _contains_any(source_text: str, keywords: Iterable[str]) -> bool:
        return any(keyword.lower() in source_text for keyword in keywords)
