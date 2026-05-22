#!/usr/bin/env python3
"""Generate local demo artifacts by running the application pipeline."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "case_001"
sys.path.insert(0, str(ROOT / "backend"))

from app.application.pipeline import DemoPipeline  # noqa: E402
from app.core.settings import get_settings  # noqa: E402
from app.models.contracts import AnalyzeMaterialsRequest, AnalyzeSampleRequest, GeneratePlanRequest, TargetBrief  # noqa: E402
from app.services.json_repository import JsonRepository  # noqa: E402
from app.services.material_analyzer import MaterialAnalyzer  # noqa: E402
from app.services.plan_generator import PlanGenerator  # noqa: E402
from app.services.report_service import ReportService  # noqa: E402
from app.services.structure_analyzer import StructureAnalyzer  # noqa: E402


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def main() -> None:
    settings = get_settings()
    repository = JsonRepository(settings.config)
    report_service = ReportService(repository)
    pipeline = DemoPipeline(
        structure_analyzer=StructureAnalyzer(repository),
        material_analyzer=MaterialAnalyzer(repository),
        plan_generator=PlanGenerator(repository),
        report_service=report_service,
    )

    target = TargetBrief(
        title="新品空气炸锅带货短视频",
        category="product_talk",
        selling_points=["少油", "外酥里嫩", "一键预热", "易清洗"],
    )
    result = pipeline.run(
        AnalyzeSampleRequest(project_id="case_001", video_id="sample_001", use_mock=True),
        AnalyzeMaterialsRequest(project_id="case_001", target=target, use_mock=True),
        GeneratePlanRequest(project_id="case_001", target_title=target.title, variant="balanced", use_mock=True),
    )

    write_json(OUTPUT / "structure_dna.json", result.structure_dna.model_dump(mode="json"))
    write_json(OUTPUT / "material_library.json", result.material_library.model_dump(mode="json"))
    write_json(OUTPUT / "edit_plan.json", result.edit_plan.model_dump(mode="json"))
    write_json(OUTPUT / "comparison_report.json", result.comparison_report)
    (OUTPUT / "editing_guide.md").write_text(report_service.editing_guide_markdown(result.edit_plan), encoding="utf-8")

    print(f"Demo artifacts written to {OUTPUT}")


if __name__ == "__main__":
    main()
