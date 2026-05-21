import type {PipelineResult, StructureDNA} from "./types";

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

export async function uploadSampleVideo(
  file: File,
  options: {projectId: string; videoId: string},
): Promise<StructureDNA> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", options.projectId);
  formData.append("video_id", options.videoId);

  const response = await fetch(`${API_BASE_URL}/api/samples/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Sample upload failed: ${response.status}`);
  }

  return response.json();
}
