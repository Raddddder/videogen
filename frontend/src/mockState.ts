import comparisonReport from "../../mocks/comparison_report.sample.json";
import editPlan from "../../mocks/edit_plan.sample.json";
import materialLibrary from "../../mocks/material_library.sample.json";
import structureDna from "../../mocks/structure_dna.sample.json";

import type {PipelineResult} from "./types";

export const fallbackPipeline: PipelineResult = {
  structure_dna: structureDna,
  material_library: materialLibrary,
  edit_plan: editPlan,
  comparison_report: comparisonReport,
} as unknown as PipelineResult;
