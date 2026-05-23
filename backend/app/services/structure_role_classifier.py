import json
import re
import time
from dataclasses import dataclass
from typing import Any

import requests

from app.services.asr_service import AsrSentence


SEGMENT_FUNCTIONS = {"hook", "pain_point", "setup", "solution", "proof", "transition", "cta"}
PRODUCT_TALK_ROLE_ORDER = ["hook", "pain_point", "setup", "solution", "proof", "transition", "cta"]
OPENAI_COMPATIBLE_PROVIDERS = {"ark", "dashscope", "qwen", "openai"}


@dataclass(frozen=True)
class RoleAssignment:
    function: str
    sentence_ids: list[str]
    confidence: float
    reason: str


@dataclass(frozen=True)
class RoleClassificationResult:
    assignments: list[RoleAssignment]
    debug_trace: list[dict[str, object]]


class StructureRoleClassifier:
    """Classifies timestamped ASR sentences into reusable content-structure roles."""

    def __init__(
        self,
        provider: str = "mock",
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        timeout_sec: int = 60,
        max_attempts: int = 3,
    ) -> None:
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_sec = timeout_sec
        self.max_attempts = max(max_attempts, 1)

    def classify(self, sentences: list[AsrSentence], category: str = "product_talk") -> list[RoleAssignment]:
        return self.classify_with_trace(sentences, category).assignments

    def classify_with_trace(
        self,
        sentences: list[AsrSentence],
        category: str = "product_talk",
    ) -> RoleClassificationResult:
        valid_sentences = [
            sentence
            for sentence in sentences
            if sentence.text.strip() and sentence.end_sec > sentence.start_sec
        ]
        if not valid_sentences:
            return RoleClassificationResult(
                assignments=[],
                debug_trace=[
                    self._trace_event(
                        "llm_role_classification",
                        "skipped",
                        "没有可用于结构判断的 ASR 句子",
                    )
                ],
            )

        debug_trace: list[dict[str, object]] = []
        if self.provider in OPENAI_COMPATIBLE_PROVIDERS and self.api_key and self.base_url and self.model:
            for attempt in range(1, self.max_attempts + 1):
                started_at = time.perf_counter()
                try:
                    assignments = self._classify_with_openai_compatible(
                        valid_sentences,
                        category,
                        attempt,
                    )
                    latency_ms = round((time.perf_counter() - started_at) * 1000)
                    if assignments:
                        debug_trace.append(
                            self._trace_event(
                                "llm_role_classification",
                                "success",
                                f"结构模型输出 {len(assignments)} 个段落",
                                attempt=attempt,
                                latency_ms=latency_ms,
                            )
                        )
                        return RoleClassificationResult(assignments=assignments, debug_trace=debug_trace)
                    debug_trace.append(
                        self._trace_event(
                            "llm_role_classification",
                            "retry",
                            "结构模型未返回可用 JSON 段落",
                            attempt=attempt,
                            latency_ms=latency_ms,
                        )
                    )
                except Exception as error:
                    latency_ms = round((time.perf_counter() - started_at) * 1000)
                    debug_trace.append(
                        self._trace_event(
                            "llm_role_classification",
                            "retry",
                            f"{type(error).__name__}: {str(error)[:180]}",
                            attempt=attempt,
                            latency_ms=latency_ms,
                        )
                    )
        else:
            debug_trace.append(
                self._trace_event(
                    "llm_role_classification",
                    "skipped",
                    "LLM 配置不完整，使用规则兜底",
                )
            )

        assignments = [
            RoleAssignment(
                function=assignment.function,
                sentence_ids=assignment.sentence_ids,
                confidence=0.45,
                reason=f"LLM 三次失败或未配置，规则兜底：{assignment.reason}",
            )
            for assignment in self._classify_with_rules(valid_sentences)
        ]
        debug_trace.append(
            self._trace_event(
                "role_fallback",
                "used",
                "LLM 三次失败或未配置，使用关键词/位置规则兜底",
            )
        )
        return RoleClassificationResult(assignments=assignments, debug_trace=debug_trace)

    def _classify_with_openai_compatible(
        self,
        sentences: list[AsrSentence],
        category: str,
        attempt: int,
    ) -> list[RoleAssignment]:
        sentence_payload = [
            {
                "id": self._sentence_id(index),
                "start_sec": sentence.start_sec,
                "end_sec": sentence.end_sec,
                "text": sentence.text,
            }
            for index, sentence in enumerate(sentences, start=1)
        ]
        prompt_payload = {
            "category": category,
            "allowed_functions": PRODUCT_TALK_ROLE_ORDER,
            "sentences": sentence_payload,
            "output_schema": {
                "segments": [
                    {
                        "function": "hook | pain_point | setup | solution | proof | transition | cta",
                        "sentence_ids": ["s1"],
                        "confidence": 0.0,
                        "reason": "short Chinese reason",
                    }
                ]
            },
        }
        response_payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是短视频结构分析器。请根据中文口播语义，把带时间戳的 ASR 句子合并成"
                        "可复用的短视频结构段。只能输出 JSON，不要输出解释性正文、Markdown 或代码块。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "分析下面的 JSON。要求：1) 每个 sentence_id 最多使用一次；2) 保持原时间顺序；"
                        "3) 段数控制在 3 到 7 段；4) function 只能从 allowed_functions 选择；"
                        "5) confidence 范围 0 到 1；6) reason 用一句中文说明判断依据。\n\n"
                        f"JSON:\n{json.dumps(prompt_payload, ensure_ascii=False)}"
                    ),
                },
            ],
            "temperature": 0.1 if attempt == 1 else 0,
        }
        if self.provider != "ark":
            response_payload["response_format"] = {"type": "json_object"}
        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            data=json.dumps(response_payload, ensure_ascii=False),
            timeout=self.timeout_sec,
        )
        if not response.ok:
            raise RuntimeError(f"LLM HTTP {response.status_code}: {response.text[:300]}")
        content = response.json()["choices"][0]["message"]["content"]
        payload = self._parse_json_content(content)
        return self._normalize_assignments(payload, len(sentences))

    def _normalize_assignments(self, payload: dict[str, Any] | list[Any], sentence_count: int) -> list[RoleAssignment]:
        if isinstance(payload, list):
            payload = {"segments": payload}
        if not isinstance(payload, dict):
            return []
        available_ids = {self._sentence_id(index) for index in range(1, sentence_count + 1)}
        used_ids: set[str] = set()
        assignments: list[RoleAssignment] = []
        for raw_segment in payload.get("segments", []):
            function = str(raw_segment.get("function", "")).strip()
            if function not in SEGMENT_FUNCTIONS:
                continue
            sentence_ids = [
                str(sentence_id)
                for sentence_id in raw_segment.get("sentence_ids", [])
                if str(sentence_id) in available_ids and str(sentence_id) not in used_ids
            ]
            if not sentence_ids:
                continue
            used_ids.update(sentence_ids)
            assignments.append(
                RoleAssignment(
                    function=function,
                    sentence_ids=sentence_ids,
                    confidence=self._clamp_confidence(raw_segment.get("confidence")),
                    reason=str(raw_segment.get("reason", "")).strip() or "LLM 根据口播语义判断结构角色",
                )
            )
        missing_ids = [sentence_id for sentence_id in sorted(available_ids, key=self._sentence_index) if sentence_id not in used_ids]
        if missing_ids:
            assignments.extend(self._fallback_assignments_for_missing(missing_ids, sentence_count))
        assignments = sorted(assignments, key=lambda assignment: self._sentence_index(assignment.sentence_ids[0]))[:7]
        if len(assignments) < min(sentence_count, 3):
            return []
        return assignments

    def _classify_with_rules(self, sentences: list[AsrSentence]) -> list[RoleAssignment]:
        raw_assignments = [
            RoleAssignment(
                function=self._rule_role(sentence.text, index, len(sentences)),
                sentence_ids=[self._sentence_id(index)],
                confidence=0.58,
                reason="规则兜底：根据关键词和句子位置判断",
            )
            for index, sentence in enumerate(sentences, start=1)
        ]
        merged: list[RoleAssignment] = []
        for assignment in raw_assignments:
            if merged and merged[-1].function == assignment.function:
                previous = merged[-1]
                merged[-1] = RoleAssignment(
                    function=previous.function,
                    sentence_ids=[*previous.sentence_ids, *assignment.sentence_ids],
                    confidence=previous.confidence,
                    reason=previous.reason,
                )
            else:
                merged.append(assignment)
        return merged[:7]

    def _fallback_assignments_for_missing(
        self,
        sentence_ids: list[str],
        sentence_count: int,
    ) -> list[RoleAssignment]:
        assignments: list[RoleAssignment] = []
        total = max(sentence_count, len(sentence_ids), 1)
        for sentence_id in sentence_ids:
            index = self._sentence_index(sentence_id) or total
            assignments.append(
                RoleAssignment(
                    function=self._role_by_position(index, total),
                    sentence_ids=[sentence_id],
                    confidence=0.45,
                    reason="LLM 未覆盖该句，按位置补齐结构角色",
                )
            )
        return assignments

    def _rule_role(self, text: str, index: int, total: int) -> str:
        clean_text = text.lower()
        keyword_roles = [
            ("cta", ["下单", "购买", "链接", "收藏", "关注", "评论", "私信", "赶紧", "快去", "拍下"]),
            ("pain_point", ["以前", "难", "麻烦", "踩坑", "伤手", "烫手", "脏手", "油腻", "不好", "问题"]),
            ("solution", ["换成", "用它", "这个", "只要", "首先", "然后", "直接", "刷子", "产品"]),
            ("proof", ["不伤", "不烫", "干净", "效果", "对比", "轻松", "省事", "好用", "爱上"]),
            ("hook", ["为什么", "终于知道", "没想到", "你知道", "姐妹们", "注意", "别再", "原来"]),
        ]
        for role, keywords in keyword_roles:
            if any(keyword in clean_text for keyword in keywords):
                return role
        return self._role_by_position(index, total)

    @staticmethod
    def _role_by_position(index: int, total: int) -> str:
        plans = {
            1: ["hook"],
            2: ["hook", "cta"],
            3: ["hook", "solution", "cta"],
            4: ["hook", "pain_point", "solution", "cta"],
            5: ["hook", "pain_point", "solution", "proof", "cta"],
            6: ["hook", "pain_point", "setup", "solution", "proof", "cta"],
            7: ["hook", "pain_point", "setup", "solution", "proof", "transition", "cta"],
        }
        plan = plans.get(total)
        if plan and 1 <= index <= len(plan):
            return plan[index - 1]

        if index == 1:
            return "hook"
        if index == total:
            return "cta"
        ratio = index / max(total, 1)
        if ratio <= 0.28:
            return "pain_point"
        if ratio <= 0.45:
            return "setup"
        if ratio <= 0.65:
            return "solution"
        if ratio <= 0.85:
            return "proof"
        return "transition"

    @staticmethod
    def _sentence_id(index: int) -> str:
        return f"s{index}"

    @staticmethod
    def _sentence_index(sentence_id: str) -> int:
        try:
            return int(sentence_id.removeprefix("s"))
        except ValueError:
            return 0

    @staticmethod
    def _clamp_confidence(value: Any) -> float:
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            confidence = 0.7
        return round(min(max(confidence, 0.0), 1.0), 3)

    @staticmethod
    def _parse_json_content(content: str) -> dict[str, Any] | list[Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r"```(?:json)?\s*(.*?)```", content, flags=re.DOTALL | re.IGNORECASE)
            if match:
                return json.loads(match.group(1).strip())
            start = min(
                [index for index in (content.find("{"), content.find("[")) if index >= 0],
                default=-1,
            )
            if start < 0:
                raise
            end_char = "}" if content[start] == "{" else "]"
            end = content.rfind(end_char)
            if end <= start:
                raise
            return json.loads(content[start:end + 1])

    def _trace_event(
        self,
        stage: str,
        status: str,
        message: str,
        attempt: int | None = None,
        latency_ms: int | None = None,
    ) -> dict[str, object]:
        event: dict[str, object] = {
            "stage": stage,
            "status": status,
            "provider": self.provider,
            "model": self.model,
            "message": message,
        }
        if attempt is not None:
            event["attempt"] = attempt
        if latency_ms is not None:
            event["latency_ms"] = latency_ms
        return event
