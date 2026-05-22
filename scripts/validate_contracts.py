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
CONFIG = ROOT / "config" / "defaults.json"


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

MATERIAL_REQUIRED = [
    "material_id",
    "type",
    "file_name",
    "duration_sec",
    "aspect_ratio",
    "usable_ranges",
    "shot_type",
    "semantic_role",
    "tags",
    "emotion_score",
    "quality_score",
    "crop_risk",
]


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


def validate_material_library(name: str, payload: dict[str, Any]) -> None:
    for material in payload["materials"]:
        assert_required(f"{name}.{material.get('material_id', '<unknown>')}", material, MATERIAL_REQUIRED)
        if not 0 <= material["quality_score"] <= 1:
            raise AssertionError(f"{name} material quality out of range: {material}")
        if not 0 <= material["emotion_score"] <= 10:
            raise AssertionError(f"{name} material emotion out of range: {material}")
        for start, end in material["usable_ranges"]:
            if end <= start:
                raise AssertionError(f"{name} material has invalid usable range: {material}")


def validate_edit_plan(
    name: str,
    structure: dict[str, Any],
    materials: dict[str, Any],
    edit_plan: dict[str, Any],
    config: dict[str, Any],
) -> None:
    assert_increasing_ranges(f"{name}.edit_plan.timeline", edit_plan["timeline"], "target_time_range")

    segment_ids = {segment["segment_id"] for segment in structure["segments"]}
    mapped_ids = {item["segment_id"] for item in edit_plan["timeline"]}
    missing_mappings = segment_ids - mapped_ids
    if missing_mappings:
        raise AssertionError(f"{name} edit_plan missing mappings for: {sorted(missing_mappings)}")

    material_ids = {material["material_id"] for material in materials["materials"]}
    slot_statuses = set(config["pipeline"]["slot_statuses"])
    completion_strategies = set(config["pipeline"]["completion_strategies"])

    for item in edit_plan["timeline"]:
        if item["slot_status"] not in slot_statuses:
            raise AssertionError(f"{name} invalid slot_status: {item}")
        if item["completion_strategy"] not in completion_strategies:
            raise AssertionError(f"{name} invalid completion_strategy: {item}")
        selected_material_id = item.get("selected_material_id")
        if item["slot_status"] != "missing" and selected_material_id not in material_ids:
            raise AssertionError(f"{name} timeline references unknown material: {item}")
        if item["slot_status"] in {"weak_match", "missing", "supplemented"} and not item.get("supplement_instruction"):
            raise AssertionError(f"{name} gap item must include supplement_instruction: {item}")


def validate_flow(name: str, structure: dict[str, Any], materials: dict[str, Any], edit_plan: dict[str, Any]) -> None:
    config = load_json(CONFIG)
    assert_increasing_ranges(f"{name}.structure_dna.segments", structure["segments"], "time_range")
    validate_material_library(f"{name}.material_library", materials)
    validate_edit_plan(name, structure, materials, edit_plan, config)


def main() -> None:
    for name, contract in CONTRACTS.items():
        schema = load_json(contract["schema"])
        payload = load_json(contract["mock"])
        assert schema.get("title"), f"{name} schema must have a title"
        assert_required(name, payload, contract["required"])

    mock_structure = load_json(CONTRACTS["structure_dna"]["mock"])
    mock_materials = load_json(CONTRACTS["material_library"]["mock"])
    mock_edit_plan = load_json(CONTRACTS["edit_plan"]["mock"])
    validate_flow("mocks", mock_structure, mock_materials, mock_edit_plan)

    output_dir = ROOT / "outputs" / "case_001"
    output_paths = [
        output_dir / "structure_dna.json",
        output_dir / "material_library.json",
        output_dir / "edit_plan.json",
    ]
    if all(path.exists() for path in output_paths):
        validate_flow(
            "outputs/case_001",
            load_json(output_paths[0]),
            load_json(output_paths[1]),
            load_json(output_paths[2]),
        )

    print("Contract validation passed.")


if __name__ == "__main__":
    main()
