export type SegmentFunction =
  | "hook"
  | "pain_point"
  | "setup"
  | "solution"
  | "proof"
  | "transition"
  | "cta";

export type SlotStatus = "matched" | "weak_match" | "missing" | "supplemented";

export type StructureSegment = {
  segment_id: string;
  function: SegmentFunction;
  time_range: [number, number];
  duration_sec: number;
  duration_ratio?: number;
  narrative_technique?: string;
  shot_type?: string;
  transcript: string;
  text_pattern: string;
  audio_cue?: string;
  visual_cue?: string;
  confidence?: number;
  analysis_reason?: string;
  source_sentence_ids?: string[];
  emotion_score: number;
  pacing: "slow" | "medium" | "fast";
  required_material_tags: string[];
  packaging: {
    subtitle_density: "low" | "medium" | "high";
    subtitle_style: string;
    title_bar: string;
    transition: string;
    emphasis_elements: string[];
  };
};

export type StructureDNA = {
  schema_version: string;
  video_id: string;
  source_type?: "uploaded_video" | "url" | "cached_demo";
  total_duration_sec: number;
  category?: "product_talk" | "knowledge_talk" | "mixed_talk";
  structure_formula: string;
  basic_info?: {
    width: number;
    height: number;
    fps: number;
    shot_count: number;
    has_speech: boolean;
    cover_frame_path?: string | null;
  };
  segments: StructureSegment[];
  global_features: {
    avg_segment_duration_sec?: number;
    pacing_pattern: string;
    bgm_style: string;
    overall_emotion_curve: number[];
  };
  debug_trace?: Array<{
    stage: string;
    status: string;
    message: string;
    attempt?: number;
    provider?: string;
    model?: string;
    latency_ms?: number;
  }>;
};

export type Material = {
  material_id: string;
  type: "video_clip" | "image" | "copy" | "audio";
  file_name: string;
  duration_sec?: number;
  aspect_ratio?: string;
  usable_ranges?: [number, number][];
  shot_type: string;
  semantic_role: SegmentFunction | "unknown";
  tags: string[];
  emotion_score: number;
  quality_score: number;
  crop_risk: "low" | "medium" | "high";
  transcript: string;
  key_visuals?: string[];
};

export type MaterialLibrary = {
  schema_version: string;
  project_id: string;
  target?: {
    title: string;
    category: string;
    selling_points: string[];
  };
  materials: Material[];
};

export type TimelineItem = {
  segment_id: string;
  target_segment_id: string;
  function: SegmentFunction;
  target_time_range: [number, number];
  selected_material_id: string | null;
  source_range?: [number, number] | null;
  slot_status: SlotStatus;
  gap_reason: string;
  completion_strategy: string;
  supplement_instruction: string;
  script: string;
  packaging: {
    subtitle?: string;
    title_bar_text?: string;
    transition?: string;
    effect?: string;
  };
  explanation: string;
};

export type EditPlan = {
  schema_version: string;
  project_id: string;
  source_structure_id: string;
  target_title: string;
  variant: string;
  overall_score: {
    structure_consistency: number;
    material_fit: number;
    pacing_fit: number;
  };
  timeline: TimelineItem[];
  missing_slots: Array<{
    segment_id: string;
    function: string;
    missing_type: string;
    impact: string;
    suggested_fix: string;
  }>;
  exports: Record<string, string | null>;
};

export type ComparisonReport = {
  schema_version?: string;
  project_id?: string;
  summary?: {
    source_formula: string;
    target_formula: string;
    main_gap: string;
    main_fix: string;
  };
  segment_mapping?: Array<{
    source_segment_id: string;
    target_segment_id: string;
    status: SlotStatus;
  }>;
  review_notes?: string[];
};

export type PipelineResult = {
  structure_dna: StructureDNA;
  material_library: MaterialLibrary;
  edit_plan: EditPlan;
  comparison_report: ComparisonReport;
};
