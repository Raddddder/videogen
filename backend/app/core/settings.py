import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from app.core.paths import CONFIG_DIR, OUTPUTS_DIR, PROJECT_ROOT


DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


class Settings:
    """Runtime settings loaded from env plus config/defaults.json.

    The framework layer reads configuration here. Business services receive the
    resolved config as input instead of reaching into environment variables.
    """

    def __init__(self) -> None:
        self._load_dotenv(PROJECT_ROOT / ".env")
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
        self.asr_api_key = os.getenv("ASR_API_KEY", "")
        self.asr_base_url = os.getenv("ASR_BASE_URL", "")
        self.asr_model = os.getenv("ASR_MODEL", "")
        self.llm_provider = os.getenv(
            "LLM_PROVIDER",
            os.getenv("VSME_MODEL_PROVIDER", model_config.get("primary_provider", "ark")),
        )
        self.llm_model = os.getenv("LLM_MODEL", "")
        self.llm_api_key = os.getenv("LLM_API_KEY", "")
        self.llm_base_url = os.getenv("LLM_BASE_URL", "")
        self.llm_timeout_sec = int(os.getenv(
            "LLM_TIMEOUT_SEC",
            str(model_config.get("request_timeout_sec", 60)),
        ))
        self.ark_base_url = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
        self.ark_api_key = os.getenv("ARK_API_KEY", "")
        dashscope_llm_config = model_config.get("dashscope", {})
        if self.llm_provider in {"dashscope", "qwen"}:
            self.llm_api_key = self.llm_api_key or os.getenv("DASHSCOPE_API_KEY", "")
            self.llm_base_url = self.llm_base_url or os.getenv(
                "DASHSCOPE_COMPATIBLE_BASE_URL",
                dashscope_llm_config.get("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
            )
            self.llm_model = self.llm_model or dashscope_llm_config.get("model", "qwen-turbo")
        elif self.llm_provider == "ark":
            self.llm_api_key = self.llm_api_key or self.ark_api_key
            self.llm_base_url = self.llm_base_url or self.ark_base_url
            self.llm_model = self.llm_model or os.getenv(
                "ARK_MODEL",
                os.getenv("VSME_MODEL_NAME", model_config.get("primary_model", "Doubao-Seed-2.0-lite")),
            )
        else:
            self.llm_model = self.llm_model or os.getenv(
                "ARK_MODEL",
                os.getenv("VSME_MODEL_NAME", model_config.get("primary_model", "Doubao-Seed-2.0-lite")),
            )
        self.model_provider = self.llm_provider
        self.model_name = self.llm_model

        media_config = self.config.get("media", {})
        self.ffmpeg_bin = os.getenv("FFMPEG_BIN", media_config.get("ffmpeg_bin", "ffmpeg"))
        self.ffprobe_bin = os.getenv("FFPROBE_BIN", media_config.get("ffprobe_bin", "ffprobe"))
        self.media_probe_timeout_sec = int(os.getenv(
            "MEDIA_PROBE_TIMEOUT_SEC",
            str(media_config.get("probe_timeout_sec", 20)),
        ))
        self.media_cover_timeout_sec = int(os.getenv(
            "MEDIA_COVER_TIMEOUT_SEC",
            str(media_config.get("cover_timeout_sec", 30)),
        ))
        self.scene_threshold = float(os.getenv("SCENE_THRESHOLD", str(media_config.get("scene_threshold", 0.32))))
        self.min_scene_gap_sec = float(os.getenv(
            "MIN_SCENE_GAP_SEC",
            str(media_config.get("min_scene_gap_sec", 0.7)),
        ))
        self.max_scene_cuts = int(os.getenv("MAX_SCENE_CUTS", str(media_config.get("max_scene_cuts", 24))))
        self.max_sample_upload_bytes = int(os.getenv(
            "MAX_SAMPLE_UPLOAD_BYTES",
            str(media_config.get("max_sample_upload_bytes", 200 * 1024 * 1024)),
        ))

        asr_config = self.config.get("asr", {})
        siliconflow_config = asr_config.get("siliconflow", {})
        if self.asr_provider == "siliconflow":
            self.asr_base_url = self.asr_base_url or os.getenv("SILICONFLOW_ASR_BASE_URL", "") or siliconflow_config.get(
                "base_url",
                "https://api.siliconflow.cn/v1/audio/transcriptions",
            )
            self.asr_model = self.asr_model or os.getenv(
                "SILICONFLOW_ASR_MODEL",
                siliconflow_config.get("model", "FunAudioLLM/SenseVoiceSmall"),
            )
        dashscope_config = asr_config.get("dashscope", {})
        if self.asr_provider == "dashscope":
            self.asr_api_key = self.asr_api_key or os.getenv("DASHSCOPE_API_KEY", "")
            self.asr_base_url = self.asr_base_url or os.getenv(
                "DASHSCOPE_BASE_URL",
                dashscope_config.get("base_url", "https://dashscope.aliyuncs.com/api/v1"),
            )
            self.asr_model = self.asr_model or dashscope_config.get("model", "fun-asr")
        dashscope_realtime_config = asr_config.get("dashscope_realtime", {})
        if self.asr_provider == "dashscope_realtime":
            self.asr_api_key = self.asr_api_key or os.getenv("DASHSCOPE_API_KEY", "")
            self.asr_base_url = self.asr_base_url or os.getenv(
                "DASHSCOPE_WEBSOCKET_URL",
                dashscope_realtime_config.get(
                    "websocket_url",
                    "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
                ),
            )
            self.asr_model = self.asr_model or dashscope_realtime_config.get(
                "model",
                "fun-asr-realtime",
            )
        self.asr_timeout_sec = int(os.getenv("ASR_TIMEOUT_SEC", str(asr_config.get("timeout_sec", 60))))
        self.asr_audio_max_bytes = int(os.getenv(
            "ASR_AUDIO_MAX_BYTES",
            str(asr_config.get("audio_max_bytes", 50 * 1024 * 1024)),
        ))
        self.asr_public_base_url = os.getenv("ASR_PUBLIC_BASE_URL", os.getenv("PUBLIC_BASE_URL", ""))
        self.asr_language_hints = self._parse_csv(os.getenv(
            "ASR_LANGUAGE_HINTS",
            ",".join(
                dashscope_realtime_config.get(
                    "language_hints",
                    dashscope_config.get("language_hints", ["zh", "en"]),
                )
            ),
        ))
        self.asr_poll_interval_sec = float(os.getenv(
            "ASR_POLL_INTERVAL_SEC",
            str(dashscope_config.get("poll_interval_sec", 1.0)),
        ))

        # Material understanding vision model (Module B). Reuses the LLM key/base
        # by default so a single OpenAI-compatible provider can power both.
        self.material_vlm_model = os.getenv("MATERIAL_VLM_MODEL", "Qwen/Qwen3-VL-8B-Instruct")
        self.material_vlm_api_key = os.getenv("MATERIAL_VLM_API_KEY", self.llm_api_key)
        self.material_vlm_base_url = os.getenv("MATERIAL_VLM_BASE_URL", self.llm_base_url)
        self.material_vlm_timeout_sec = int(os.getenv("MATERIAL_VLM_TIMEOUT_SEC", "60"))
        _vlm_default = "true" if self.material_vlm_api_key and self.material_vlm_base_url else "false"
        self.material_vlm_enabled = self._parse_bool(os.getenv("MATERIAL_VLM_ENABLED", _vlm_default))

    @staticmethod
    def _load_json(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @staticmethod
    def _load_dotenv(path: Path) -> None:
        if not path.exists():
            return
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if key:
                os.environ.setdefault(key, value)

    @staticmethod
    def _parse_csv(value: str) -> List[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    @staticmethod
    def _parse_bool(value: str) -> bool:
        return value.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
