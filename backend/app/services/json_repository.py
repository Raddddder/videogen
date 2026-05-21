import json
from pathlib import Path
from typing import Any, Dict

from app.core.paths import PROJECT_ROOT


class JsonRepository:
    """Small repository for config, mock data and generated artifacts."""

    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config

    def load_project_json(self, relative_path: str) -> Dict[str, Any]:
        path = PROJECT_ROOT / relative_path
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def load_mock(self, key: str) -> Dict[str, Any]:
        mock_files = self.config.get("mock_files", {})
        if key not in mock_files:
            raise KeyError(f"Unknown mock key: {key}")
        return self.load_project_json(mock_files[key])

    def write_json(self, relative_path: str, payload: Dict[str, Any]) -> Path:
        path = PROJECT_ROOT / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
        return path
