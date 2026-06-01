from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from app.api.dependencies import (
    build_aigc_image_client,
    build_demo_pipeline,
    build_repository,
    build_material_analyzer,
    build_media_renderer,
    build_natural_edit_parser,
    build_plan_generator,
    build_report_service,
    build_structure_analyzer,
)
from app.application.pipeline import DemoPipeline
from app.core.paths import OUTPUTS_DIR, PROJECT_ROOT
from app.core.settings import get_settings
from app.models.contracts import (
    AnalyzeMaterialsRequest,
    AnalyzeSampleRequest,
    EditPlan,
    GeneratePlanRequest,
    InterpretEditRequest,
    ManualEdits,
    Material,
    MaterialLibrary,
    MaterialPipelineRequest,
    PipelineResult,
    StructureDNA,
    TargetBrief,
)
from app.services.asr_service import AsrServiceError
from app.services.json_repository import JsonRepository
from app.services.material_analyzer import MaterialAnalyzer
from app.services.aigc_image import AigcImageClient
from app.services.media_probe import MediaProbeDependencyError, MediaProbeError
from app.services.media_renderer import MediaRenderer, MediaRenderError
from app.services.natural_edit_parser import NaturalEditParser
from app.services.plan_generator import PlanGenerator
from app.services.report_service import ReportService
from app.services.structure_analyzer import StructureAnalyzer


router = APIRouter()


ALLOWED_SAMPLE_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm"}
ALLOWED_MATERIAL_SUFFIXES = {
    ".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv",
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    ".txt", ".md", ".csv",
    ".mp3", ".wav", ".m4a", ".aac",
}
SUPPORTED_VARIANTS = {"balanced", "high_click", "high_conversion", "fast_pacing", "premium"}
UPLOAD_CHUNK_SIZE = 1024 * 1024


@router.get("/health")
def health() -> Dict[str, Any]:
    settings = get_settings()
    return {
        "status": "ok",
        "env": settings.env,
        "model_provider": settings.model_provider,
        "model_name": settings.model_name,
        "asr_provider": settings.asr_provider,
        "asr_model": settings.asr_model,
        "asr_public_base_url_configured": bool(settings.asr_public_base_url),
    }


@router.get("/api/config")
def config() -> Dict[str, Any]:
    return get_settings().config


@router.post("/api/samples/analyze", response_model=StructureDNA)
def analyze_sample(
    request: AnalyzeSampleRequest,
    analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
) -> StructureDNA:
    return _run_structure_analysis(request, analyzer)


@router.post("/api/samples/upload", response_model=StructureDNA)
def upload_sample(
    file: UploadFile = File(...),
    project_id: str = Form("case_001"),
    video_id: str = Form("sample_uploaded"),
    analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
) -> StructureDNA:
    safe_project_id, safe_video_id, upload_path = _save_uploaded_sample(file, project_id, video_id)
    return _analyze_saved_sample(safe_project_id, safe_video_id, upload_path, analyzer)


@router.post("/api/pipeline/upload-sample", response_model=PipelineResult)
def upload_sample_pipeline(
    file: UploadFile = File(...),
    project_id: str = Form("case_001"),
    video_id: str = Form("sample_uploaded"),
    target_title: str = Form("新品空气炸锅带货短视频"),
    target_category: str = Form("product_talk"),
    selling_points: str = Form("少油,外酥里嫩"),
    material_uris: str = Form(""),
    variant: str = Form("balanced"),
    analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
    material_analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
    plan_generator: PlanGenerator = Depends(build_plan_generator),
    report_service: ReportService = Depends(build_report_service),
) -> PipelineResult:
    if variant not in SUPPORTED_VARIANTS:
        raise HTTPException(status_code=400, detail=f"Unsupported variant: {variant}")

    safe_project_id, safe_video_id, upload_path = _save_uploaded_sample(file, project_id, video_id)
    structure_dna = _analyze_saved_sample(safe_project_id, safe_video_id, upload_path, analyzer)
    material_uri_list = _split_form_list(material_uris)
    target = TargetBrief(
        title=target_title,
        category=target_category,
        selling_points=_split_form_list(selling_points),
    )
    material_library = material_analyzer.analyze(
        AnalyzeMaterialsRequest(
            project_id=safe_project_id,
            target=target,
            material_uris=material_uri_list,
            use_mock=not material_uri_list,
        )
    )
    try:
        edit_plan = plan_generator.generate(
            GeneratePlanRequest(
                project_id=safe_project_id,
                target_title=target.title,
                variant=variant,
                use_mock=False,
            ),
            structure_dna,
            material_library,
        )
    except ValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return PipelineResult(
        structure_dna=structure_dna,
        material_library=material_library,
        edit_plan=edit_plan,
        comparison_report=report_service.comparison_report(edit_plan),
    )


@router.post("/api/pipeline/upload-all", response_model=PipelineResult)
def upload_all_pipeline(
    sample: UploadFile = File(...),
    materials: list[UploadFile] = File(default=[]),
    project_id: str = Form("case_001"),
    video_id: str = Form("sample_uploaded"),
    target_title: str = Form("新品带货短视频"),
    target_category: str = Form("product_talk"),
    selling_points: str = Form(""),
    variant: str = Form("balanced"),
    analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
    material_analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
    plan_generator: PlanGenerator = Depends(build_plan_generator),
    report_service: ReportService = Depends(build_report_service),
) -> PipelineResult:
    """Full real pipeline: uploaded sample (A) + uploaded user materials (B) -> plan (C)."""
    if variant not in SUPPORTED_VARIANTS:
        raise HTTPException(status_code=400, detail=f"Unsupported variant: {variant}")

    safe_project_id, safe_video_id, upload_path = _save_uploaded_sample(sample, project_id, video_id)
    structure_dna = _analyze_saved_sample(safe_project_id, safe_video_id, upload_path, analyzer)
    target = TargetBrief(
        title=target_title,
        category=target_category,
        selling_points=_split_form_list(selling_points),
    )

    real_materials = [file for file in materials if file.filename]
    if real_materials:
        saved = [_save_uploaded_material(file, safe_project_id, index) for index, file in enumerate(real_materials, start=1)]
        try:
            material_library = material_analyzer.analyze_files(safe_project_id, target, saved)
        except MediaProbeDependencyError as error:
            raise HTTPException(status_code=500, detail=f"FFmpeg dependency unavailable: {error}") from error
    else:
        material_library = material_analyzer.analyze(
            AnalyzeMaterialsRequest(project_id=safe_project_id, target=target, use_mock=True)
        )

    try:
        edit_plan = plan_generator.generate(
            GeneratePlanRequest(
                project_id=safe_project_id,
                target_title=target.title,
                variant=variant,
                use_mock=False,
            ),
            structure_dna,
            material_library,
        )
    except ValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return PipelineResult(
        structure_dna=structure_dna,
        material_library=material_library,
        edit_plan=edit_plan,
        comparison_report=report_service.comparison_report(edit_plan),
    )


def _save_uploaded_sample(file: UploadFile, project_id: str, video_id: str) -> tuple[str, str, Path]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SAMPLE_SUFFIXES:
        raise HTTPException(status_code=400, detail=f"Unsupported video suffix: {suffix or 'unknown'}")

    safe_project_id = _safe_path_part(project_id, "case_001")
    safe_video_id = _safe_path_part(video_id, "sample_uploaded")
    upload_dir = OUTPUTS_DIR / safe_project_id / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = upload_dir / f"{safe_video_id}{suffix}"

    max_bytes = get_settings().max_sample_upload_bytes
    bytes_written = 0
    with upload_path.open("wb") as output:
        while chunk := file.file.read(UPLOAD_CHUNK_SIZE):
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                output.close()
                upload_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Sample video is too large; limit is {max_bytes // (1024 * 1024)}MB",
                )
            output.write(chunk)

    if bytes_written == 0:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded video file is empty")

    return safe_project_id, safe_video_id, upload_path


def _analyze_saved_sample(
    project_id: str,
    video_id: str,
    upload_path: Path,
    analyzer: StructureAnalyzer,
) -> StructureDNA:
    request = AnalyzeSampleRequest(
        project_id=project_id,
        video_id=video_id,
        source_uri=str(upload_path),
        use_mock=False,
    )
    try:
        return _run_structure_analysis(request, analyzer)
    except HTTPException as error:
        if error.status_code in {400, 422}:
            upload_path.unlink(missing_ok=True)
        raise


def _run_structure_analysis(request: AnalyzeSampleRequest, analyzer: StructureAnalyzer) -> StructureDNA:
    try:
        return analyzer.analyze(request)
    except MediaProbeDependencyError as error:
        raise HTTPException(status_code=500, detail=f"FFmpeg dependency unavailable: {error}") from error
    except MediaProbeError as error:
        raise HTTPException(status_code=422, detail=f"Invalid or unreadable video: {error}") from error
    except AsrServiceError as error:
        raise HTTPException(status_code=502, detail=f"ASR transcription failed: {error}") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


def _safe_path_part(value: str, fallback: str) -> str:
    safe_value = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in value)
    return safe_value.strip("_") or fallback


def _split_form_list(value: str) -> list[str]:
    normalized = value.replace("，", ",").replace("\n", ",")
    return [item.strip() for item in normalized.split(",") if item.strip()]


@router.post("/api/materials/analyze", response_model=MaterialLibrary)
def analyze_materials(
    request: AnalyzeMaterialsRequest,
    analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
) -> MaterialLibrary:
    return analyzer.analyze(request)


@router.post("/api/materials/upload", response_model=MaterialLibrary)
def upload_materials(
    files: list[UploadFile] = File(...),
    project_id: str = Form("case_001"),
    target_title: str = Form("未命名短视频"),
    target_category: str = Form("product_talk"),
    selling_points: str = Form(""),
    analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
) -> MaterialLibrary:
    if not files:
        raise HTTPException(status_code=400, detail="No material files uploaded")

    safe_project_id = _safe_path_part(project_id, "case_001")
    saved_paths = [_save_uploaded_material(file, safe_project_id, index) for index, file in enumerate(files, start=1)]
    target = TargetBrief(
        title=target_title,
        category=target_category,
        selling_points=_split_form_list(selling_points),
    )
    try:
        return analyzer.analyze_files(safe_project_id, target, saved_paths)
    except MediaProbeDependencyError as error:
        raise HTTPException(status_code=500, detail=f"FFmpeg dependency unavailable: {error}") from error


def _save_uploaded_material(file: UploadFile, safe_project_id: str, index: int) -> Path:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_MATERIAL_SUFFIXES:
        raise HTTPException(status_code=400, detail=f"Unsupported material suffix: {suffix or 'unknown'}")

    materials_dir = OUTPUTS_DIR / safe_project_id / "materials"
    materials_dir.mkdir(parents=True, exist_ok=True)
    stem = _safe_path_part(Path(file.filename or "").stem, f"material_{index:03d}")
    upload_path = materials_dir / f"{index:03d}_{stem}{suffix}"

    max_bytes = get_settings().max_sample_upload_bytes
    bytes_written = 0
    with upload_path.open("wb") as output:
        while chunk := file.file.read(UPLOAD_CHUNK_SIZE):
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                output.close()
                upload_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Material is too large; limit is {max_bytes // (1024 * 1024)}MB",
                )
            output.write(chunk)

    if bytes_written == 0:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Uploaded material '{file.filename}' is empty")

    return upload_path


@router.post("/api/plans/generate", response_model=EditPlan)
def generate_plan(
    request: GeneratePlanRequest,
    generator: PlanGenerator = Depends(build_plan_generator),
) -> EditPlan:
    return generator.generate(request)


def _merge_edits(base: ManualEdits, override: Optional[ManualEdits]) -> ManualEdits:
    """显式参数(override)覆盖自然语言解析(base)的非空字段。"""
    if override is None:
        return base
    data = base.model_dump()
    for key, value in override.model_dump().items():
        if value is not None:
            data[key] = value
    return ManualEdits(**data)


@router.post("/api/plans/regenerate", response_model=PipelineResult)
def regenerate_plan(
    request: GeneratePlanRequest,
    generator: PlanGenerator = Depends(build_plan_generator),
    report_service: ReportService = Depends(build_report_service),
    edit_parser: NaturalEditParser = Depends(build_natural_edit_parser),
) -> PipelineResult:
    """人工微调回灌：structure_dna + material_library + manual_edits / 自然语言 instruction 重生成方案。"""
    if request.structure_dna is None or request.material_library is None:
        raise HTTPException(
            status_code=400,
            detail="regenerate requires structure_dna and material_library in the request body",
        )
    if request.instruction:
        context = request.target_title or (
            request.material_library.target.title if request.material_library.target else ""
        )
        parsed = edit_parser.parse(request.instruction, context)
        if parsed is not None:
            request.manual_edits = _merge_edits(parsed, request.manual_edits)
    try:
        edit_plan = generator.generate(request)
    except ValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return PipelineResult(
        structure_dna=request.structure_dna,
        material_library=request.material_library,
        edit_plan=edit_plan,
        comparison_report=report_service.comparison_report(edit_plan),
    )


@router.post("/api/edits/interpret", response_model=ManualEdits)
def interpret_edit(
    request: InterpretEditRequest,
    edit_parser: NaturalEditParser = Depends(build_natural_edit_parser),
) -> ManualEdits:
    """把一句话改片指令解析成结构化 ManualEdits(供前端填充微调表单)。"""
    if not edit_parser.enabled:
        raise HTTPException(status_code=503, detail="natural language editing is not configured")
    edits = edit_parser.parse(request.instruction, request.context)
    if edits is None:
        raise HTTPException(status_code=502, detail="could not interpret the instruction")
    return edits


@router.post("/api/reports/comparison")
def comparison_report(
    edit_plan: EditPlan,
    report_service: ReportService = Depends(build_report_service),
) -> Dict[str, Any]:
    return report_service.comparison_report(edit_plan)


@router.post("/api/pipeline/demo", response_model=PipelineResult)
def run_demo_pipeline(
    pipeline: DemoPipeline = Depends(build_demo_pipeline),
) -> PipelineResult:
    target = demo_target()
    sample_request = AnalyzeSampleRequest(project_id="case_001", video_id="sample_001", use_mock=True)
    materials_request = AnalyzeMaterialsRequest(project_id="case_001", target=target, use_mock=True)
    plan_request = GeneratePlanRequest(
        project_id="case_001",
        target_title=target.title,
        variant="balanced",
        use_mock=True,
    )
    return pipeline.run(sample_request, materials_request, plan_request)


@router.post("/api/pipeline/compare")
def compare_variants(
    payload: PipelineResult,
    generator: PlanGenerator = Depends(build_plan_generator),
) -> Dict[str, Any]:
    """用当前方案的 structure_dna + material_library 生成三个 variant 做并排对比。"""
    variants = []
    for variant in ("balanced", "high_click", "high_conversion"):
        plan = generator.generate(
            GeneratePlanRequest(
                project_id=payload.edit_plan.project_id,
                target_title=payload.edit_plan.target_title,
                variant=variant,
                structure_dna=payload.structure_dna,
                material_library=payload.material_library,
                use_mock=False,
            )
        )
        variants.append({"variant": variant, "edit_plan": plan.model_dump()})
    return {"variants": variants}


@router.post("/api/render/preview")
def render_preview(
    payload: PipelineResult,
    renderer: MediaRenderer = Depends(build_media_renderer),
) -> Dict[str, Any]:
    """Compose a real 9:16 preview.mp4 from the Edit Plan + materials."""
    project_id = _safe_path_part(payload.edit_plan.project_id, "case_001")
    output_path = OUTPUTS_DIR / project_id / "preview.mp4"
    try:
        renderer.render_preview(payload.edit_plan, payload.material_library, output_path)
    except MediaRenderError as error:
        raise HTTPException(status_code=500, detail=f"Preview render failed: {error}") from error
    relative = output_path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    return {"preview_url": f"/{relative}", "preview_path": relative}


_AIGC_SCENE_LABELS = {
    "hook": "吸引眼球的开场画面",
    "pain_point": "痛点困扰场景",
    "setup": "背景铺垫场景",
    "solution": "产品解决方案展示",
    "proof": "效果对比与证明画面",
    "transition": "转场过渡画面",
    "cta": "购买引导画面",
}


@router.post("/api/aigc/fill-gaps", response_model=PipelineResult)
def aigc_fill_gaps(
    payload: PipelineResult,
    aigc: AigcImageClient = Depends(build_aigc_image_client),
) -> PipelineResult:
    """对缺口段(无匹配素材)用文生图生成补全画面，挂为新素材并标 supplemented。"""
    if not aigc.enabled:
        raise HTTPException(status_code=503, detail="AIGC image generation not configured")

    project_id = _safe_path_part(payload.edit_plan.project_id, "case_001")
    aigc_dir = OUTPUTS_DIR / project_id / "aigc"
    materials = list(payload.material_library.materials)
    filled = 0
    for item in payload.edit_plan.timeline:
        if item.selected_material_id:
            continue
        scene = f"{_AIGC_SCENE_LABELS.get(item.function, '')}，{item.script}".strip("，")
        saved = aigc.generate(scene, aigc_dir / f"{item.target_segment_id}.png")
        if saved is None:
            continue
        rel = saved.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
        materials.append(
            Material(
                material_id=f"aigc_{item.target_segment_id}",
                type="image",
                file_name=saved.name,
                duration_sec=0.0,
                aspect_ratio="9:16",
                usable_ranges=[],
                shot_type="aigc_generated",
                semantic_role=item.function,
                tags=["AIGC", _AIGC_SCENE_LABELS.get(item.function, item.function)],
                emotion_score=5.0,
                quality_score=0.8,
                crop_risk="low",
                transcript=item.script,
                preview_url=f"/{rel}",
                analysis_source="aigc",
            )
        )
        item.selected_material_id = f"aigc_{item.target_segment_id}"
        item.slot_status = "supplemented"
        item.completion_strategy = "aigc"
        filled += 1

    payload.material_library.materials = materials
    return payload


@router.post("/api/pipeline/material-demo", response_model=PipelineResult)
def run_material_demo_pipeline(
    request: MaterialPipelineRequest,
    structure_analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
    material_analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
    plan_generator: PlanGenerator = Depends(build_plan_generator),
    report_service: ReportService = Depends(build_report_service),
) -> PipelineResult:
    return execute_material_demo_pipeline(
        request,
        structure_analyzer,
        material_analyzer,
        plan_generator,
        report_service,
    )


@router.get("/api/pipeline/material-demo/cases")
def list_material_demo_cases(
    repository: JsonRepository = Depends(build_repository),
) -> Dict[str, Any]:
    payload = load_material_demo_cases(repository)
    return {
        "schema_version": payload.get("schema_version", "1.0"),
        "cases": [
            {
                "case_id": item["case_id"],
                "title": item["title"],
                "description": item["description"],
                "target": item["request"]["target"],
                "material_uris": item["request"].get("material_uris", []),
                "variant": item["request"].get("variant", "balanced"),
            }
            for item in payload.get("cases", [])
        ],
    }


@router.post("/api/pipeline/material-demo/cases/{case_id}", response_model=PipelineResult)
def run_material_demo_case(
    case_id: str,
    repository: JsonRepository = Depends(build_repository),
    structure_analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
    material_analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
    plan_generator: PlanGenerator = Depends(build_plan_generator),
    report_service: ReportService = Depends(build_report_service),
) -> PipelineResult:
    request = find_material_demo_case(repository, case_id)
    return execute_material_demo_pipeline(
        request,
        structure_analyzer,
        material_analyzer,
        plan_generator,
        report_service,
    )


def demo_target() -> TargetBrief:
    return TargetBrief(
        title="新品空气炸锅带货短视频",
        category="product_talk",
        selling_points=["少油", "外酥里嫩", "一键预热", "易清洗"],
    )


def execute_material_demo_pipeline(
    request: MaterialPipelineRequest,
    structure_analyzer: StructureAnalyzer,
    material_analyzer: MaterialAnalyzer,
    plan_generator: PlanGenerator,
    report_service: ReportService,
) -> PipelineResult:
    structure_dna = structure_analyzer.analyze(
        AnalyzeSampleRequest(
            project_id=request.project_id,
            video_id=request.sample_video_id,
            use_mock=True,
        )
    )
    material_library = material_analyzer.analyze(
        AnalyzeMaterialsRequest(
            project_id=request.project_id,
            target=request.target,
            material_uris=request.material_uris,
            use_mock=False,
        )
    )
    edit_plan = plan_generator.generate(
        GeneratePlanRequest(
            project_id=request.project_id,
            target_title=request.target.title,
            variant=request.variant,
            use_mock=False,
        ),
        structure_dna,
        material_library,
    )
    return PipelineResult(
        structure_dna=structure_dna,
        material_library=material_library,
        edit_plan=edit_plan,
        comparison_report=report_service.comparison_report(edit_plan),
    )


def load_material_demo_cases(repository: JsonRepository) -> Dict[str, Any]:
    return repository.load_project_json("mocks/material_demo_cases.json")


def find_material_demo_case(repository: JsonRepository, case_id: str) -> MaterialPipelineRequest:
    payload = load_material_demo_cases(repository)
    for item in payload.get("cases", []):
        if item.get("case_id") == case_id:
            return MaterialPipelineRequest(**item["request"])
    raise HTTPException(status_code=404, detail=f"Unknown material demo case: {case_id}")
