#!/usr/bin/env python3
"""Lightweight contract validation for local scaffolding.

This intentionally avoids third-party dependencies so it can run before the
backend environment is installed. Full JSON Schema validation can be added in CI
with `jsonschema` later.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


CONTRACTS = {
    "structure_dna": {
        "schema": ROOT / "schemas" / "structure_dna.schema.json",
        "mock": ROOT / "mocks" / "structure_dna.sample.json",
        "required": ["schema_version", "video_id", "segments", "global_features"],
    },
    "material_library": {
        "schema": ROOT / "schemas" / "material_library.schema.json",
        "mock": ROOT / "mocks" / "material_library.sample.json",
        "required": ["schema_version", "project_id", "materials"],
    },
    "edit_plan": {
        "schema": ROOT / "schemas" / "edit_plan.schema.json",
        "mock": ROOT / "mocks" / "edit_plan.sample.json",
        "required": ["schema_version", "project_id", "timeline", "missing_slots", "exports"],
    },
}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def assert_required(name: str, payload: dict[str, Any], fields: list[str]) -> None:
    missing = [field for field in fields if field not in payload]
    if missing:
        raise AssertionError(f"{name} missing required fields: {', '.join(missing)}")


def assert_increasing_ranges(name: str, items: list[dict[str, Any]], key: str) -> None:
    previous_end = -1.0
    for item in items:
        start, end = item[key]
        if start < previous_end:
            raise AssertionError(f"{name} has overlapping range at {item}")
        if end <= start:
            raise AssertionError(f"{name} has invalid range at {item}")
        previous_end = end


def main() -> None:
    for name, contract in CONTRACTS.items():
        schema = load_json(contract["schema"])
        payload = load_json(contract["mock"])
        assert schema.get("title"), f"{name} schema must have a title"
        assert_required(name, payload, contract["required"])

    structure = load_json(CONTRACTS["structure_dna"]["mock"])
    edit_plan = load_json(CONTRACTS["edit_plan"]["mock"])
    assert_increasing_ranges("structure_dna.segments", structure["segments"], "time_range")
    assert_increasing_ranges("edit_plan.timeline", edit_plan["timeline"], "target_time_range")

    segment_ids = {segment["segment_id"] for segment in structure["segments"]}
    mapped_ids = {item["segment_id"] for item in edit_plan["timeline"]}
    missing_mappings = segment_ids - mapped_ids
    if missing_mappings:
        raise AssertionError(f"edit_plan missing mappings for: {sorted(missing_mappings)}")

    print("Contract validation passed.")


if __name__ == "__main__":
    main()
