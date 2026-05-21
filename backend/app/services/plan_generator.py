from typing import Optional

from app.models.contracts import EditPlan, GeneratePlanRequest, MaterialLibrary, StructureDNA
from app.services.json_repository import JsonRepository


class PlanGenerator:
    """Module C: structure migration and edit plan generation."""

    def __init__(self, repository: JsonRepository) -> None:
        self.repository = repository

    def generate(
        self,
        request: GeneratePlanRequest,
        structure_dna: Optional[StructureDNA] = None,
        material_library: Optional[MaterialLibrary] = None,
    ) -> EditPlan:
        payload = self.repository.load_mock("edit_plan")
        resolved_structure = request.structure_dna or structure_dna
        resolved_materials = request.material_library or material_library

        payload["project_id"] = request.project_id
        payload["target_title"] = request.target_title
        payload["variant"] = request.variant
        if resolved_structure:
            payload["source_structure_id"] = resolved_structure.video_id
        if resolved_materials and resolved_materials.target:
            payload["target_title"] = resolved_materials.target.title

        return EditPlan(**payload)
