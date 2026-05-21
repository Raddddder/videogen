#!/usr/bin/env python3
"""Generate local demo artifacts from mock contracts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MOCKS = ROOT / "mocks"
OUTPUT = ROOT / "outputs" / "case_001"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def build_guide(edit_plan: dict[str, Any]) -> str:
    lines = [
        f"# {edit_plan['target_title']}",
        "",
        "## 评分",
        f"- 结构一致性：{edit_plan['overall_score']['structure_consistency']:.0%}",
        f"- 素材匹配度：{edit_plan['overall_score']['material_fit']:.0%}",
        f"- 节奏匹配度：{edit_plan['overall_score']['pacing_fit']:.0%}",
        "",
        "## 时间线",
    ]
    for item in edit_plan["timeline"]:
        start, end = item["target_time_range"]
        lines.extend(
            [
                "",
                f"### {item['function']} [{start:.1f}s - {end:.1f}s]",
                f"- 文案：{item['script']}",
                f"- 状态：{item['slot_status']}",
                f"- 策略：{item['completion_strategy']}",
                f"- 说明：{item['explanation']}",
            ]
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    structure = load_json(MOCKS / "structure_dna.sample.json")
    materials = load_json(MOCKS / "material_library.sample.json")
    edit_plan = load_json(MOCKS / "edit_plan.sample.json")
    report = load_json(MOCKS / "comparison_report.sample.json")

    write_json(OUTPUT / "structure_dna.json", structure)
    write_json(OUTPUT / "material_library.json", materials)
    write_json(OUTPUT / "edit_plan.json", edit_plan)
    write_json(OUTPUT / "comparison_report.json", report)
    (OUTPUT / "editing_guide.md").write_text(build_guide(edit_plan), encoding="utf-8")

    print(f"Demo artifacts written to {OUTPUT}")


if __name__ == "__main__":
    main()
