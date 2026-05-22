from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.api.dependencies import (
    build_demo_pipeline,
    build_material_analyzer,
    build_plan_generator,
    build_report_service,
    build_structure_analyzer,
)
from app.application.pipeline import DemoPipeline
from app.core.settings import get_settings
from app.models.contracts import (
    AnalyzeMaterialsRequest,
    AnalyzeSampleRequest,
    EditPlan,
    GeneratePlanRequest,
    MaterialLibrary,
    MaterialPipelineRequest,
    PipelineResult,
    StructureDNA,
    TargetBrief,
)
from app.services.material_analyzer import MaterialAnalyzer
from app.services.plan_generator import PlanGenerator
from app.services.report_service import ReportService
from app.services.structure_analyzer import StructureAnalyzer


router = APIRouter()


def demo_target() -> TargetBrief:
    return TargetBrief(
        title="新品空气炸锅带货短视频",
        category="product_talk",
        selling_points=["少油", "外酥里嫩", "一键预热", "易清洗"],
    )


@router.get("/health")
def health() -> Dict[str, Any]:
    settings = get_settings()
    return {
        "status": "ok",
        "env": settings.env,
        "model_provider": settings.model_provider,
        "model_name": settings.model_name,
    }


@router.get("/api/config")
def config() -> Dict[str, Any]:
    return get_settings().config


@router.post("/api/samples/analyze", response_model=StructureDNA)
def analyze_sample(
    request: AnalyzeSampleRequest,
    analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
) -> StructureDNA:
    return analyzer.analyze(request)


@router.post("/api/materials/analyze", response_model=MaterialLibrary)
def analyze_materials(
    request: AnalyzeMaterialsRequest,
    analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
) -> MaterialLibrary:
    return analyzer.analyze(request)


@router.post("/api/plans/generate", response_model=EditPlan)
def generate_plan(
    request: GeneratePlanRequest,
    generator: PlanGenerator = Depends(build_plan_generator),
) -> EditPlan:
    return generator.generate(request)


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


@router.post("/api/pipeline/material-demo", response_model=PipelineResult)
def run_material_demo_pipeline(
    request: MaterialPipelineRequest,
    structure_analyzer: StructureAnalyzer = Depends(build_structure_analyzer),
    material_analyzer: MaterialAnalyzer = Depends(build_material_analyzer),
    plan_generator: PlanGenerator = Depends(build_plan_generator),
    report_service: ReportService = Depends(build_report_service),
) -> PipelineResult:
    target = request.target
    sample_request = AnalyzeSampleRequest(
        project_id=request.project_id,
        video_id=request.sample_video_id,
        use_mock=True,
    )
    materials_request = AnalyzeMaterialsRequest(
        project_id=request.project_id,
        target=target,
        material_uris=request.material_uris,
        use_mock=False,
    )

    structure_dna = structure_analyzer.analyze(sample_request)
    material_library = material_analyzer.analyze(materials_request)
    edit_plan = plan_generator.generate(
        GeneratePlanRequest(
            project_id=request.project_id,
            target_title=target.title,
            variant=request.variant,
            use_mock=False,
        ),
        structure_dna,
        material_library,
    )
    comparison_report_payload = report_service.comparison_report(edit_plan)
    return PipelineResult(
        structure_dna=structure_dna,
        material_library=material_library,
        edit_plan=edit_plan,
        comparison_report=comparison_report_payload,
    )
