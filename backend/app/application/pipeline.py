from app.models.contracts import (
    AnalyzeMaterialsRequest,
    AnalyzeSampleRequest,
    GeneratePlanRequest,
    PipelineResult,
)
from app.services.material_analyzer import MaterialAnalyzer
from app.services.plan_generator import PlanGenerator
from app.services.report_service import ReportService
from app.services.structure_analyzer import StructureAnalyzer


class DemoPipeline:
    """Application use case for the full demo flow.

    This layer wires modules together. It does not know HTTP details and does
    not implement low-level media/model logic.
    """

    def __init__(
        self,
        structure_analyzer: StructureAnalyzer,
        material_analyzer: MaterialAnalyzer,
        plan_generator: PlanGenerator,
        report_service: ReportService,
    ) -> None:
        self.structure_analyzer = structure_analyzer
        self.material_analyzer = material_analyzer
        self.plan_generator = plan_generator
        self.report_service = report_service

    def run(
        self,
        sample_request: AnalyzeSampleRequest,
        materials_request: AnalyzeMaterialsRequest,
        plan_request: GeneratePlanRequest,
    ) -> PipelineResult:
        structure_dna = self.structure_analyzer.analyze(sample_request)
        material_library = self.material_analyzer.analyze(materials_request)
        edit_plan = self.plan_generator.generate(plan_request, structure_dna, material_library)
        comparison_report = self.report_service.comparison_report(edit_plan)
        return PipelineResult(
            structure_dna=structure_dna,
            material_library=material_library,
            edit_plan=edit_plan,
            comparison_report=comparison_report,
        )
