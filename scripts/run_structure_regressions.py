#!/usr/bin/env python3
"""Run repeatable StructureDNA regressions on local sample videos.

Usage examples:

  backend/.venv/bin/python scripts/run_structure_regressions.py --mock-ai
  backend/.venv/bin/python scripts/run_structure_regressions.py
  backend/.venv/bin/python scripts/run_structure_regressions.py outputs/test-videos/foo.mp4 public/sample-55702300.mov
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.api.dependencies import build_media_probe, build_repository, build_structure_analyzer  # noqa: E402
from app.models.contracts import AnalyzeSampleRequest, StructureDNA  # noqa: E402
from app.services.asr_service import AsrService  # noqa: E402
from app.services.structure_analyzer import StructureAnalyzer  # noqa: E402
from app.services.structure_role_classifier import StructureRoleClassifier  # noqa: E402


ALLOWED_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm"}
DEFAULT_INPUT_DIRS = [
    ROOT / "outputs" / "test-videos",
    ROOT / "public",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run StructureDNA regressions on local sample videos.")
    parser.add_argument(
        "inputs",
        nargs="*",
        help="Optional explicit video paths. If omitted, the script discovers videos under outputs/test-videos and public/.",
    )
    parser.add_argument(
        "--mock-ai",
        action="store_true",
        help="Disable network-dependent ASR/LLM providers and use offline fallbacks for smoke regression.",
    )
    parser.add_argument(
        "--project-prefix",
        default="regression",
        help="Project id prefix used for generated outputs.",
    )
    return parser.parse_args()


def discover_inputs(explicit_inputs: Iterable[str]) -> list[Path]:
    if explicit_inputs:
        paths = [Path(item).expanduser() for item in explicit_inputs]
    else:
        paths = []
        for folder in DEFAULT_INPUT_DIRS:
            if not folder.exists():
                continue
            for path in sorted(folder.iterdir()):
                if path.is_file() and path.suffix.lower() in ALLOWED_SUFFIXES:
                    paths.append(path)

    resolved: list[Path] = []
    for path in paths:
        candidate = path if path.is_absolute() else (ROOT / path)
        candidate = candidate.resolve()
        if candidate.is_file() and candidate.suffix.lower() in ALLOWED_SUFFIXES:
            resolved.append(candidate)
    return resolved


def build_analyzer(mock_ai: bool) -> StructureAnalyzer:
    if not mock_ai:
        return build_structure_analyzer()
    media_probe = build_media_probe()
    return StructureAnalyzer(
        repository=build_repository(),
        media_probe=media_probe,
        asr_service=AsrService(provider="mock", media_probe=media_probe),
        role_classifier=StructureRoleClassifier(provider="mock"),
    )


def summarize_result(path: Path, result: StructureDNA) -> dict[str, object]:
    fallback_events = [
        event.model_dump()
        for event in result.debug_trace
        if event.status in {"fallback", "used"}
    ]
    low_confidence_segments = [
        {
            "segment_id": segment.segment_id,
            "function": segment.function,
            "confidence": segment.confidence,
            "analysis_reason": segment.analysis_reason,
        }
        for segment in result.segments
        if segment.confidence is not None and segment.confidence < 0.6
    ]
    return {
        "input_file": str(path.relative_to(ROOT)),
        "structure_formula": result.structure_formula,
        "segment_count": len(result.segments),
        "has_debug_trace": bool(result.debug_trace),
        "fallback_events": fallback_events,
        "low_confidence_segments": low_confidence_segments,
    }


def write_output(case_id: str, result: StructureDNA, summary: dict[str, object]) -> None:
    output_dir = ROOT / "outputs" / "regressions" / case_id
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "structure_dna.json").write_text(
        json.dumps(result.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    inputs = discover_inputs(args.inputs)
    if not inputs:
        print("No eligible regression videos found.")
        return 1

    analyzer = build_analyzer(args.mock_ai)
    aggregated: list[dict[str, object]] = []
    failures: list[dict[str, str]] = []

    for index, path in enumerate(inputs, start=1):
        case_id = f"{args.project_prefix}_{index:02d}_{path.stem}"
        request = AnalyzeSampleRequest(
            project_id=case_id,
            video_id=path.stem,
            source_uri=str(path),
            use_mock=False,
        )
        try:
            result = analyzer.analyze(request)
        except Exception as error:  # pragma: no cover - regression tool should keep going
            failures.append({"input_file": str(path.relative_to(ROOT)), "error": f"{type(error).__name__}: {error}"})
            continue

        summary = summarize_result(path, result)
        aggregated.append(summary)
        write_output(case_id, result, summary)

    summary_path = ROOT / "outputs" / "regressions" / "latest_summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(
        json.dumps({"cases": aggregated, "failures": failures}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Processed {len(aggregated)} case(s), failed {len(failures)} case(s).")
    print(f"Summary written to {summary_path.relative_to(ROOT)}")
    if failures:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
