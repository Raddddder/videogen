from pathlib import Path
from typing import Optional

import requests


class AigcImageClient:
    """文生图客户端(SiliconFlow Kolors 等)，为缺口结构段生成补全画面。

    任何失败返回 None，调用方据此回退到占位卡，不阻塞流程。
    """

    def __init__(
        self,
        enabled: bool = False,
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        image_size: str = "768x1024",
        steps: int = 15,
        timeout_sec: int = 90,
    ) -> None:
        self.enabled = enabled and bool(api_key) and bool(base_url) and bool(model)
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.image_size = image_size
        self.steps = steps
        self.timeout_sec = timeout_sec

    def generate(self, scene: str, out_path: Path) -> Optional[Path]:
        if not self.enabled:
            return None
        prompt = (
            f"竖屏9:16短视频画面，{scene}，电商带货风格，高质量，电影感打光，"
            "真实质感，主体居中，画面中不要出现任何文字、字幕或水印"
        )
        try:
            response = requests.post(
                f"{self.base_url}/images/generations",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "image_size": self.image_size,
                    "num_inference_steps": self.steps,
                },
                timeout=self.timeout_sec,
            )
            if not response.ok:
                return None
            payload = response.json()
            images = payload.get("images") or payload.get("data") or []
            if not images:
                return None
            url = images[0].get("url") if isinstance(images[0], dict) else images[0]
            if not url:
                return None
            image_bytes = requests.get(url, timeout=self.timeout_sec).content
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(image_bytes)
            return out_path
        except (requests.RequestException, ValueError, KeyError, OSError):
            return None
