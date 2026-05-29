import type {EditPlan, MaterialLibrary, PipelineResult, StructureDNA} from "./types";

export type VariantComparison = {
  variants: Array<{variant: string; edit_plan: EditPlan}>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/** Resolve a backend-relative asset path (e.g. /outputs/... or /public/...) against the API host. */
export function assetUrl(path?: string | null): string | undefined {
  if (!path) {
    return undefined;
  }
  if (/^(https?:|blob:|data:)/.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

export type TargetOptions = {
  projectId: string;
  targetTitle?: string;
  targetCategory?: string;
  sellingPoints?: string[];
};

function appendTarget(formData: FormData, options: TargetOptions): void {
  formData.append("project_id", options.projectId);
  if (options.targetTitle) {
    formData.append("target_title", options.targetTitle);
  }
  if (options.targetCategory) {
    formData.append("target_category", options.targetCategory);
  }
  if (options.sellingPoints?.length) {
    formData.append("selling_points", options.sellingPoints.join(","));
  }
}

/** Module B: upload real user material files, get a true MaterialLibrary back. */
export async function uploadMaterials(
  files: File[],
  options: TargetOptions,
): Promise<MaterialLibrary> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  appendTarget(formData, options);

  const response = await fetch(`${API_BASE_URL}/api/materials/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Material upload failed: ${response.status}`);
  }

  return response.json();
}

/** Full real pipeline: sample video (A) + user materials (B) -> plan (C). */
export async function uploadAllPipeline(
  sample: File,
  materials: File[],
  options: TargetOptions & {videoId: string; variant?: string},
): Promise<PipelineResult> {
  const formData = new FormData();
  formData.append("sample", sample);
  materials.forEach((file) => formData.append("materials", file));
  formData.append("video_id", options.videoId);
  if (options.variant) {
    formData.append("variant", options.variant);
  }
  appendTarget(formData, options);

  const response = await fetch(`${API_BASE_URL}/api/pipeline/upload-all`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Full pipeline failed: ${response.status}`);
  }

  return response.json();
}

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

export async function compareVariants(): Promise<VariantComparison> {
  const response = await fetch(`${API_BASE_URL}/api/pipeline/compare`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
  });

  if (!response.ok) {
    throw new Error(`Variant compare failed: ${response.status}`);
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
