from app.models.contracts import AnalyzeMaterialsRequest, MaterialLibrary
from app.services.json_repository import JsonRepository


class MaterialAnalyzer:
    """Module B: user material understanding.

    Real implementation slots:
    - key frame extraction
    - visual labels
    - ASR for user clips
    - quality/crop risk scoring
    """

    def __init__(self, repository: JsonRepository) -> None:
        self.repository = repository

    def analyze(self, request: AnalyzeMaterialsRequest) -> MaterialLibrary:
        payload = self.repository.load_mock("material_library")
        payload["project_id"] = request.project_id
        payload["target"] = request.target.model_dump()
        return MaterialLibrary(**payload)
