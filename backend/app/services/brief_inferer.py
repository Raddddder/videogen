import json
import re
from typing import Any

import requests

from app.models.contracts import BriefInference, MaterialLibrary, PipelineResult, StructureDNA


OPENAI_COMPATIBLE_PROVIDERS = {"ark", "dashscope", "qwen", "openai"}


class BriefInferer:
    """Infer target brief fields from the current structure/material pipeline state."""

    _JSON_RE = re.compile(r"\{.*\}", re.DOTALL)
    _GENERIC_TITLES = {"", "未命名短视频", "新品带货短视频", "新品空气炸锅带货短视频", "新建结构迁移会话"}

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

    def infer(self, payload: PipelineResult) -> BriefInference:
        if self.enabled:
            inferred = self._infer_with_llm(payload)
            if inferred is not None:
                return inferred
        return self._infer_with_rules(payload)

    def _infer_with_llm(self, payload: PipelineResult) -> BriefInference | None:
        prompt_payload = {
            "current_target_title": payload.edit_plan.target_title,
            "category": payload.structure_dna.category,
            "structure_formula": payload.structure_dna.structure_formula,
            "segments": [
                {
                    "function": segment.function,
                    "transcript": segment.transcript,
                    "visual_cue": segment.visual_cue,
                    "analysis_reason": segment.analysis_reason,
                }
                for segment in payload.structure_dna.segments[:8]
            ],
            "materials": [
                {
                    "file_name": material.file_name,
                    "type": material.type,
                    "semantic_role": material.semantic_role,
                    "tags": material.tags,
                    "transcript": material.transcript,
                    "quality_score": material.quality_score,
                    "crop_risk": material.crop_risk,
                }
                for material in payload.material_library.materials[:12]
            ],
            "slot_status": [
                {
                    "function": item.function,
                    "status": item.slot_status,
                    "strategy": item.completion_strategy,
                    "gap_reason": item.gap_reason,
                }
                for item in payload.edit_plan.timeline
            ],
        }
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "你是短视频创作工作台的目标信息助手。根据样例视频结构、ASR 文本、"
                                "用户素材和槽位状态，推断前端目标信息配置。只输出 JSON。"
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                "请输出字段：title, category, selling_points, material_brief, confidence, reason。\n"
                                "要求：title 是用户要创作的新视频主题；selling_points 3-5 个，短词；"
                                "material_brief 用一句中文说明当前素材状态和主要缺口；confidence 0-1；"
                                "不要把样例内容生硬当商品，信息不足时用更稳妥的主题表述。\n\n"
                                f"JSON:\n{json.dumps(prompt_payload, ensure_ascii=False)}"
                            ),
                        },
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
                timeout=self.timeout_sec,
            )
            if not response.ok:
                return None
            content = response.json()["choices"][0]["message"]["content"]
            match = self._JSON_RE.search(content or "")
            if not match:
                return None
            return self._normalize(json.loads(match.group(0)), payload)
        except (requests.RequestException, ValueError, KeyError, TypeError):
            return None

    def _infer_with_rules(self, payload: PipelineResult) -> BriefInference:
        library = payload.material_library
        title = self._existing_title(payload)
        points = self._selling_points(library, payload.structure_dna)
        material_count = len(library.materials)
        missing_count = sum(1 for item in payload.edit_plan.timeline if item.slot_status == "missing")
        weak_count = sum(1 for item in payload.edit_plan.timeline if item.slot_status == "weak_match")
        if material_count:
            brief = f"已解析 {material_count} 个用户素材，当前有 {missing_count} 个缺口、{weak_count} 个弱匹配，需要用补拍、包装或 AIGC 补齐。"
        else:
            brief = f"当前尚未上传用户素材，已从样例中解析出 {len(payload.structure_dna.segments)} 个结构段，后续需要补充素材完成匹配。"
        return BriefInference(
            title=title,
            category=payload.structure_dna.category,
            selling_points=points,
            material_brief=brief,
            confidence=0.56,
            reason="LLM 未配置或调用失败，使用结构文本、素材标签和槽位状态规则生成。",
        )

    def _normalize(self, data: dict[str, Any], payload: PipelineResult) -> BriefInference:
        fallback = self._infer_with_rules(payload)
        points = data.get("selling_points")
        if not isinstance(points, list):
            points = fallback.selling_points
        clean_points = [str(point).strip() for point in points if str(point).strip()][:5]
        confidence = data.get("confidence", fallback.confidence)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = fallback.confidence
        return BriefInference(
            title=str(data.get("title") or fallback.title).strip()[:40],
            category=str(data.get("category") or fallback.category).strip() or "product_talk",
            selling_points=clean_points or fallback.selling_points,
            material_brief=str(data.get("material_brief") or fallback.material_brief).strip()[:160],
            confidence=confidence,
            reason=str(data.get("reason") or "LLM 根据结构、素材和缺口状态自动推断。").strip()[:160],
        )

    def _existing_title(self, payload: PipelineResult) -> str:
        target = payload.material_library.target
        candidates = [
            target.title if target else "",
            payload.edit_plan.target_title,
        ]
        for title in candidates:
            clean = title.strip()
            if clean and clean not in self._GENERIC_TITLES:
                return clean[:40]
        category = payload.structure_dna.category
        if category == "knowledge_talk":
            return "知识课结构迁移短视频"
        return "真实素材结构迁移短视频"

    @staticmethod
    def _selling_points(library: MaterialLibrary, dna: StructureDNA) -> list[str]:
        if library.target and library.target.selling_points:
            return library.target.selling_points[:5]
        candidates: list[str] = []
        for material in library.materials:
            candidates.extend(material.tags)
        for segment in dna.segments:
            candidates.extend(segment.required_material_tags)
        blocked = {"product", "talking_head", "voiceover", "copy", "AIGC", "unknown"}
        seen: set[str] = set()
        points: list[str] = []
        for raw in candidates:
            point = str(raw).strip()
            if not point or point in blocked or point in seen:
                continue
            seen.add(point)
            points.append(point)
            if len(points) >= 5:
                break
        return points or ["结构清晰", "节奏完整", "可补全"]
