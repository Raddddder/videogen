import base64
import json
import re
from pathlib import Path
from typing import Any, Optional

import requests


VALID_ROLES = {"hook", "pain_point", "setup", "solution", "proof", "transition", "cta", "unknown"}

_PROMPT = (
    "你是短视频结构分析助手。看这张取自用户素材的画面，判断它在带货/种草短视频里最适合的用途。"
    "只输出一个 JSON 对象，字段如下：\n"
    '{"shot_type": "口播/产品特写/过程演示/前后对比/字幕卡/场景空镜/其他",'
    ' "semantic_role": "hook|pain_point|setup|solution|proof|transition|cta|unknown",'
    ' "tags": ["不超过6个中文短标签"],'
    ' "summary": "一句话画面描述"}\n'
    "semantic_role 必须是给定英文枚举之一。只输出 JSON，不要多余文字。"
)


class MaterialVlmClient:
    """SiliconFlow / OpenAI-compatible vision model wrapper for material tagging.

    Any failure returns None so the caller can fall back to heuristics. The VLM
    never blocks the pipeline.
    """

    _JSON_RE = re.compile(r"\{.*\}", re.DOTALL)

    def __init__(
        self,
        enabled: bool = False,
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        timeout_sec: int = 60,
    ) -> None:
        self.enabled = enabled and bool(api_key) and bool(base_url) and bool(model)
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_sec = timeout_sec

    def describe_image(self, image_path: Path) -> Optional[dict[str, Any]]:
        if not self.enabled or not image_path.exists():
            return None
        try:
            data_uri = self._to_data_uri(image_path)
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                data=json.dumps(
                    {
                        "model": self.model,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": _PROMPT},
                                    {"type": "image_url", "image_url": {"url": data_uri}},
                                ],
                            }
                        ],
                        "max_tokens": 300,
                        "temperature": 0,
                    }
                ),
                timeout=self.timeout_sec,
            )
            if not response.ok:
                return None
            content = response.json()["choices"][0]["message"]["content"]
            return self._parse(content)
        except (requests.RequestException, KeyError, ValueError, OSError):
            return None

    def _parse(self, content: str) -> Optional[dict[str, Any]]:
        match = self._JSON_RE.search(content or "")
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
        role = str(data.get("semantic_role", "unknown")).strip().lower()
        if role not in VALID_ROLES:
            role = "unknown"
        tags = data.get("tags", [])
        if not isinstance(tags, list):
            tags = []
        return {
            "shot_type": str(data.get("shot_type", "")).strip() or None,
            "semantic_role": role,
            "tags": [str(tag).strip() for tag in tags if str(tag).strip()][:6],
            "summary": str(data.get("summary", "")).strip(),
        }

    @staticmethod
    def _to_data_uri(image_path: Path) -> str:
        suffix = image_path.suffix.lower().lstrip(".") or "jpeg"
        mime = "jpeg" if suffix in {"jpg", "jpeg"} else suffix
        encoded = base64.b64encode(image_path.read_bytes()).decode()
        return f"data:image/{mime};base64,{encoded}"
