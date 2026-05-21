from app.models.contracts import AnalyzeSampleRequest, StructureDNA
from app.services.json_repository import JsonRepository


class StructureAnalyzer:
    """Module A: sample video analysis.

    Real implementation slots:
    - FFmpeg metadata extraction
    - scene detection
    - ASR
    - multimodal structure extraction
    """

    def __init__(self, repository: JsonRepository) -> None:
        self.repository = repository

    def analyze(self, request: AnalyzeSampleRequest) -> StructureDNA:
        payload = self.repository.load_mock("structure_dna")
        payload["video_id"] = request.video_id
        if request.source_uri:
            payload["source_type"] = "uploaded_video"
        return StructureDNA(**payload)
