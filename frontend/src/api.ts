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

export async function uploadSamplePipeline(
  file: File,
  options: {
    projectId: string;
    videoId: string;
    targetTitle?: string;
    targetCategory?: string;
    sellingPoints?: string[];
    materialUris?: string[];
    variant?: string;
  },
): Promise<PipelineResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", options.projectId);
  formData.append("video_id", options.videoId);
  if (options.targetTitle) {
    formData.append("target_title", options.targetTitle);
  }
  if (options.targetCategory) {
    formData.append("target_category", options.targetCategory);
  }
  if (options.sellingPoints?.length) {
    formData.append("selling_points", options.sellingPoints.join(","));
  }
  if (options.materialUris?.length) {
    formData.append("material_uris", options.materialUris.join(","));
  }
  if (options.variant) {
    formData.append("variant", options.variant);
  }

  const response = await fetch(`${API_BASE_URL}/api/pipeline/upload-sample`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Sample pipeline failed: ${response.status}`);
  }

  return response.json();
}
