import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from app.core.paths import CONFIG_DIR, OUTPUTS_DIR


class Settings:
    """Runtime settings loaded from env plus config/defaults.json.

    The framework layer reads configuration here. Business services receive the
    resolved config as input instead of reaching into environment variables.
    """

    def __init__(self) -> None:
        self.env = os.getenv("VSME_ENV", "local")
        self.api_host = os.getenv("VSME_API_HOST", "127.0.0.1")
        self.api_port = int(os.getenv("VSME_API_PORT", "8000"))
        self.config = self._load_json(CONFIG_DIR / "defaults.json")
        self.output_dir = OUTPUTS_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

        model_config = self.config.get("models", {})
        self.model_provider = os.getenv("VSME_MODEL_PROVIDER", model_config.get("primary_provider", "ark"))
        self.model_name = os.getenv("VSME_MODEL_NAME", model_config.get("primary_model", "Doubao-Seed-2.0-lite"))

    @staticmethod
    def _load_json(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
