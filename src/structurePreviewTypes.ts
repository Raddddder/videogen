export type SlotStatus = "matched" | "weak_match" | "missing" | "supplemented";

export type TimelineItem = {
  segment_id: string;
  target_segment_id: string;
  function: string;
  target_time_range: [number, number];
  selected_material_id: string | null;
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
  project_id: string;
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
};
