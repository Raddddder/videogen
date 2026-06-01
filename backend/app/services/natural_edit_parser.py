import json
import re
from typing import Optional

import requests

from app.models.contracts import ManualEdits


OPENAI_COMPATIBLE_PROVIDERS = {"ark", "dashscope", "qwen", "openai"}


class NaturalEditParser:
    """把自然语言改片指令解析成结构化 ManualEdits（LLM）。

    失败或未配置返回 None，调用方据此忽略自然语言、仅用显式参数。
    """

    _JSON_RE = re.compile(r"\{.*\}", re.DOTALL)

    def __init__(
        self,
        provider: str = "mock",
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        timeout_sec: int = 60,
    ) -> None:
        self.enabled = (
            provider in OPENAI_COMPATIBLE_PROVIDERS
            and bool(api_key)
            and bool(base_url)
            and bool(model)
        )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_sec = timeout_sec

    def parse(self, instruction: str, context: str = "") -> Optional[ManualEdits]:
        if not self.enabled or not instruction.strip():
            return None
        prompt = (
            "你是短视频改片助手。把用户的自然语言修改意图解析成结构化参数。\n"
            f"当前视频主题：{context or '未知'}\n"
            f"用户意图：「{instruction.strip()}」\n"
            "只输出一个 JSON 对象，字段如下：\n"
            '{"hook_rewrite": "新的开头钩子文案，用户没提到则 null",\n'
            ' "cta_text": "新的结尾引导文案，用户没提到则 null",\n'
            ' "packaging_style": "字幕/包装风格描述，用户没提到则 null",\n'
            ' "pacing_intensity": 30到100的整数(越大节奏越快)，用户没提到则 null,\n'
            ' "selling_points": ["重排或强调的卖点"]，用户没提到则 null}\n'
            "只填用户明确表达的，其余一律 null。只输出 JSON，不要解释。"
        )
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                    "max_tokens": 400,
                },
                timeout=self.timeout_sec,
            )
            if not response.ok:
                return None
            content = response.json()["choices"][0]["message"]["content"]
            match = self._JSON_RE.search(content or "")
            if not match:
                return None
            data = json.loads(match.group(0))
            return self._to_edits(data)
        except (requests.RequestException, ValueError, KeyError):
            return None

    @staticmethod
    def _to_edits(data: dict) -> ManualEdits:
        pacing = data.get("pacing_intensity")
        if pacing is not None:
            try:
                pacing = max(30, min(100, int(pacing)))
            except (TypeError, ValueError):
                pacing = None
        points = data.get("selling_points")
        if not isinstance(points, list) or not points:
            points = None
        else:
            points = [str(p).strip() for p in points if str(p).strip()] or None
        return ManualEdits(
            hook_rewrite=(data.get("hook_rewrite") or None),
            cta_text=(data.get("cta_text") or None),
            packaging_style=(data.get("packaging_style") or None),
            pacing_intensity=pacing,
            selling_points=points,
        )
