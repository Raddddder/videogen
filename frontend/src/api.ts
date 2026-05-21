import type {PipelineResult} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function runDemoPipeline(): Promise<PipelineResult> {
  const response = await fetch(`${API_BASE_URL}/api/pipeline/demo`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
  });

  if (!response.ok) {
    throw new Error(`Demo pipeline failed: ${response.status}`);
  }

  return response.json();
}
