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
    PipelineResult,
    StructureDNA,
)
from app.services.material_analyzer import MaterialAnalyzer
from app.services.plan_generator import PlanGenerator
from app.services.report_service import ReportService
from app.services.structure_analyzer import StructureAnalyzer


router = APIRouter()


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
    sample_request = AnalyzeSampleRequest()
    materials_request = AnalyzeMaterialsRequest()
    plan_request = GeneratePlanRequest()
    return pipeline.run(sample_request, materials_request, plan_request)
