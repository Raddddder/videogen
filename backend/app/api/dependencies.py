from app.application.pipeline import DemoPipeline
from app.core.settings import get_settings
from app.services.json_repository import JsonRepository
from app.services.material_analyzer import MaterialAnalyzer
from app.services.media_probe import MediaProbe
from app.services.plan_generator import PlanGenerator
from app.services.report_service import ReportService
from app.services.structure_analyzer import StructureAnalyzer


def build_repository() -> JsonRepository:
    return JsonRepository(get_settings().config)


def build_structure_analyzer() -> StructureAnalyzer:
    return StructureAnalyzer(build_repository(), MediaProbe())


def build_material_analyzer() -> MaterialAnalyzer:
    return MaterialAnalyzer(build_repository())


def build_plan_generator() -> PlanGenerator:
    return PlanGenerator(build_repository())


def build_report_service() -> ReportService:
    return ReportService(build_repository())


def build_demo_pipeline() -> DemoPipeline:
    repository = build_repository()
    return DemoPipeline(
        structure_analyzer=StructureAnalyzer(repository, MediaProbe()),
        material_analyzer=MaterialAnalyzer(repository),
        plan_generator=PlanGenerator(repository),
        report_service=ReportService(repository),
    )
