import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from app.core.paths import CONFIG_DIR, OUTPUTS_DIR


DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


class Settings:
    """Runtime settings loaded from env plus config/defaults.json.

    The framework layer reads configuration here. Business services receive the
    resolved config as input instead of reaching into environment variables.
    """

    def __init__(self) -> None:
        self.env = os.getenv("VSME_ENV", "local")
        self.api_host = os.getenv("VSME_API_HOST", "127.0.0.1")
        self.api_port = int(os.getenv("PORT", os.getenv("VSME_API_PORT", "8000")))
        self.cors_allow_origins = self._parse_csv(os.getenv("CORS_ALLOW_ORIGINS", DEFAULT_CORS_ORIGINS))
        self.cors_allow_credentials = self._parse_bool(os.getenv("CORS_ALLOW_CREDENTIALS", "false"))

        self.config = self._load_json(CONFIG_DIR / "defaults.json")
        self.output_dir = OUTPUTS_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

        model_config = self.config.get("models", {})
        self.asr_provider = os.getenv("ASR_PROVIDER", "mock")
        self.llm_provider = os.getenv(
            "LLM_PROVIDER",
            os.getenv("VSME_MODEL_PROVIDER", model_config.get("primary_provider", "ark")),
        )
        self.model_provider = self.llm_provider
        self.model_name = os.getenv(
            "ARK_MODEL",
            os.getenv("VSME_MODEL_NAME", model_config.get("primary_model", "Doubao-Seed-2.0-lite")),
        )
        self.ark_base_url = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
        self.ark_api_key = os.getenv("ARK_API_KEY", "")

    @staticmethod
    def _load_json(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @staticmethod
    def _parse_csv(value: str) -> List[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    @staticmethod
    def _parse_bool(value: str) -> bool:
        return value.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
