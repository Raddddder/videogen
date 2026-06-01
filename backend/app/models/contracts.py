from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


SegmentFunction = Literal["hook", "pain_point", "setup", "solution", "proof", "transition", "cta"]
Pacing = Literal["slow", "medium", "fast"]
SlotStatus = Literal["matched", "weak_match", "missing", "supplemented"]
CompletionStrategy = Literal["direct_match", "reorder", "copy", "packaging", "aigc", "reuse"]
Variant = Literal["balanced", "high_click", "high_conversion", "fast_pacing", "premium"]


class Packaging(BaseModel):
    subtitle_density: Optional[Literal["low", "medium", "high"]] = None
    subtitle_style: Optional[str] = None
    title_bar: Optional[str] = None
    transition: Optional[str] = None
    emphasis_elements: List[str] = Field(default_factory=list)


class BasicInfo(BaseModel):
    width: int
    height: int
    fps: float
    shot_count: int
    has_speech: bool
    cover_frame_path: Optional[str] = None


class StructureSegment(BaseModel):
    segment_id: str
    function: SegmentFunction
    time_range: Tuple[float, float]
    duration_sec: float
    duration_ratio: float
    narrative_technique: str
    shot_type: str
    emotion_score: float
    pacing: Pacing
    transcript: str
    text_pattern: str
    audio_cue: Optional[str] = None
    visual_cue: Optional[str] = None
    confidence: Optional[float] = None
    analysis_reason: Optional[str] = None
    source_sentence_ids: List[str] = Field(default_factory=list)
    required_material_tags: List[str] = Field(default_factory=list)
    packaging: Packaging


class GlobalFeatures(BaseModel):
    avg_segment_duration_sec: float
    pacing_pattern: str
    bgm_style: str
    overall_emotion_curve: List[float] = Field(default_factory=list)


class DebugTraceEvent(BaseModel):
    stage: str
    status: str
    message: str
    attempt: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    latency_ms: Optional[int] = None


class StructureDNA(BaseModel):
    schema_version: str = "1.0"
    video_id: str
    source_type: Literal["uploaded_video", "url", "cached_demo"]
    total_duration_sec: float
    category: Literal["product_talk", "knowledge_talk", "mixed_talk"]
    structure_formula: str
    basic_info: BasicInfo
    segments: List[StructureSegment]
    global_features: GlobalFeatures
    debug_trace: List[DebugTraceEvent] = Field(default_factory=list)


class TargetBrief(BaseModel):
    title: str = "未命名短视频"
    category: str = "product_talk"
    selling_points: List[str] = Field(default_factory=list)


class Material(BaseModel):
    material_id: str
    type: Literal["video_clip", "image", "copy", "audio"]
    file_name: str
    duration_sec: float
    aspect_ratio: str
    usable_ranges: List[Tuple[float, float]] = Field(default_factory=list)
    shot_type: str
    semantic_role: Literal["hook", "pain_point", "setup", "solution", "proof", "transition", "cta", "unknown"]
    tags: List[str] = Field(default_factory=list)
    emotion_score: float
    quality_score: float
    crop_risk: Literal["low", "medium", "high"]
    transcript: str = ""
    key_visuals: List[str] = Field(default_factory=list)
    preview_url: Optional[str] = None
    analysis_source: Literal["mock", "rule", "vlm", "aigc"] = "rule"


class MaterialLibrary(BaseModel):
    schema_version: str = "1.0"
    project_id: str
    target: Optional[TargetBrief] = None
    materials: List[Material]


class OverallScore(BaseModel):
    structure_consistency: float
    material_fit: float
    pacing_fit: float


class TimelinePackaging(BaseModel):
    subtitle: Optional[str] = None
    title_bar_text: Optional[str] = None
    transition: Optional[str] = None
    effect: Optional[str] = None


class TimelineItem(BaseModel):
    segment_id: str
    target_segment_id: str
    function: SegmentFunction
    target_time_range: Tuple[float, float]
    selected_material_id: Optional[str] = None
    source_range: Optional[Tuple[float, float]] = None
    slot_status: SlotStatus
    gap_reason: str = ""
    completion_strategy: CompletionStrategy
    supplement_instruction: str = ""
    script: str
    packaging: TimelinePackaging
    explanation: str


class MissingSlot(BaseModel):
    segment_id: str
    function: str
    missing_type: str
    impact: str
    suggested_fix: str


class ExportPaths(BaseModel):
    editing_guide_path: Optional[str] = None
    comparison_report_path: Optional[str] = None
    preview_video_path: Optional[str] = None
    capcut_draft_path: Optional[str] = None


class EditPlan(BaseModel):
    schema_version: str = "1.0"
    project_id: str
    source_structure_id: str
    target_title: str
    variant: Variant = "balanced"
    overall_score: OverallScore
    timeline: List[TimelineItem]
    missing_slots: List[MissingSlot] = Field(default_factory=list)
    exports: ExportPaths


class AnalyzeSampleRequest(BaseModel):
    project_id: str = "case_001"
    video_id: str = "sample_001"
    source_uri: Optional[str] = None
    use_mock: bool = True


class AnalyzeMaterialsRequest(BaseModel):
    project_id: str = "case_001"
    target: TargetBrief = Field(default_factory=TargetBrief)
    material_uris: List[str] = Field(default_factory=list)
    use_mock: bool = True


class ManualEdits(BaseModel):
    """人工微调参数：在结构迁移基础上覆盖局部文案/包装/节奏。"""
    hook_rewrite: Optional[str] = None
    cta_text: Optional[str] = None
    packaging_style: Optional[str] = None
    pacing_intensity: Optional[int] = None  # 30-100，越高节奏越快
    selling_points: Optional[List[str]] = None  # 重排后的卖点顺序


class GeneratePlanRequest(BaseModel):
    project_id: str = "case_001"
    target_title: str = "新品空气炸锅带货短视频"
    variant: Variant = "balanced"
    structure_dna: Optional[StructureDNA] = None
    material_library: Optional[MaterialLibrary] = None
    manual_edits: Optional[ManualEdits] = None
    instruction: Optional[str] = None  # 自然语言改片指令，由 LLM 解析成 manual_edits
    use_mock: bool = True


class InterpretEditRequest(BaseModel):
    instruction: str
    context: str = ""


class MaterialPipelineRequest(BaseModel):
    project_id: str = "case_real_001"
    sample_video_id: str = "sample_001"
    target: TargetBrief = Field(default_factory=TargetBrief)
    material_uris: List[str] = Field(default_factory=list)
    variant: Variant = "balanced"


class PipelineResult(BaseModel):
    structure_dna: StructureDNA
    material_library: MaterialLibrary
    edit_plan: EditPlan
    comparison_report: Dict[str, Any]
