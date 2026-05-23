import json
import os
import re
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

from app.core.paths import PROJECT_ROOT
from app.services.media_probe import MediaInfo, MediaProbe


class AsrServiceError(RuntimeError):
    """Raised when an ASR provider cannot produce a transcript."""


@dataclass(frozen=True)
class AsrWord:
    text: str
    start_sec: float
    end_sec: float
    punctuation: str = ""


@dataclass(frozen=True)
class AsrSentence:
    text: str
    start_sec: float
    end_sec: float
    speaker_id: int | None = None
    words: list[AsrWord] = field(default_factory=list)


@dataclass(frozen=True)
class AsrTranscript:
    text: str
    provider: str
    model: str = ""
    language: str = "unknown"
    emotion: str = "unknown"
    events: list[str] = field(default_factory=list)
    sentences: list[AsrSentence] = field(default_factory=list)


class AsrService:
    """Provider wrapper for speech-to-text used by Module A."""

    SILICONFLOW_TAG_RE = re.compile(r"<\|([^|]+)\|>")
    LANGUAGE_TAGS = {"zh", "en", "yue", "ja", "ko"}
    EMOTION_TAGS = {"HAPPY", "SAD", "ANGRY", "NEUTRAL", "FEARFUL", "DISGUSTED", "SURPRISED"}

    def __init__(
        self,
        provider: str = "mock",
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        timeout_sec: int = 60,
        audio_max_bytes: int = 50 * 1024 * 1024,
        public_base_url: str = "",
        language_hints: list[str] | None = None,
        poll_interval_sec: float = 1.0,
        media_probe: MediaProbe | None = None,
    ) -> None:
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.timeout_sec = timeout_sec
        self.audio_max_bytes = audio_max_bytes
        self.public_base_url = public_base_url.rstrip("/")
        self.language_hints = language_hints or []
        self.poll_interval_sec = poll_interval_sec
        self.media_probe = media_probe or MediaProbe()

    def transcribe(self, source_path: Path, output_dir: Path, media_info: MediaInfo) -> AsrTranscript:
        if not media_info.has_audio:
            return AsrTranscript(text="", provider="none", language="none", emotion="none")
        if self.provider in {"", "mock"}:
            return AsrTranscript(text="", provider="mock", model=self.model)
        if self.provider == "siliconflow":
            return self._transcribe_siliconflow(source_path, output_dir)
        if self.provider == "dashscope":
            return self._transcribe_dashscope(source_path, output_dir)
        if self.provider in {"dashscope_realtime", "dashscope-realtime"}:
            return self._transcribe_dashscope_realtime(source_path, output_dir)
        raise AsrServiceError(f"Unsupported ASR provider: {self.provider}")

    def _transcribe_siliconflow(self, source_path: Path, output_dir: Path) -> AsrTranscript:
        if not self.api_key:
            raise AsrServiceError("ASR_API_KEY is required for siliconflow ASR")
        if not self.base_url:
            raise AsrServiceError("ASR_BASE_URL is required for siliconflow ASR")
        if not self.model:
            raise AsrServiceError("ASR_MODEL is required for siliconflow ASR")

        audio_path = self.media_probe.extract_audio(source_path, output_dir / "asr_audio.mp3")
        if audio_path.stat().st_size > self.audio_max_bytes:
            raise AsrServiceError(
                f"Extracted audio is too large for ASR; limit is {self.audio_max_bytes // (1024 * 1024)}MB"
            )

        try:
            with audio_path.open("rb") as audio_file:
                response = requests.post(
                    self.base_url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    data={"model": self.model},
                    files={"file": (audio_path.name, audio_file, "audio/mpeg")},
                    timeout=self.timeout_sec,
                )
            if not response.ok:
                raise AsrServiceError(
                    f"SiliconFlow ASR failed with status {response.status_code}: {response.text[:500]}"
                )
            response_payload = response.json()
        except requests.RequestException as error:
            raise AsrServiceError(f"SiliconFlow ASR request failed: {error}") from error
        except json.JSONDecodeError as error:
            raise AsrServiceError(f"SiliconFlow ASR returned invalid JSON: {error}") from error

        raw_text = str(response_payload.get("text", ""))
        return self._parse_siliconflow_text(raw_text)

    def _parse_siliconflow_text(self, raw_text: str) -> AsrTranscript:
        tags = self.SILICONFLOW_TAG_RE.findall(raw_text)
        clean_text = self.SILICONFLOW_TAG_RE.sub("", raw_text).strip()
        language = next((tag for tag in tags if tag in self.LANGUAGE_TAGS), "unknown")
        emotion = next((tag.lower() for tag in tags if tag in self.EMOTION_TAGS), "unknown")
        events = [tag for tag in tags if tag not in self.LANGUAGE_TAGS and tag not in self.EMOTION_TAGS]
        return AsrTranscript(
            text=clean_text,
            provider="siliconflow",
            model=self.model,
            language=language,
            emotion=emotion,
            events=events,
        )

    def _transcribe_dashscope(self, source_path: Path, output_dir: Path) -> AsrTranscript:
        if not self.api_key:
            raise AsrServiceError("ASR_API_KEY or DASHSCOPE_API_KEY is required for dashscope ASR")
        if not self.base_url:
            raise AsrServiceError("ASR_BASE_URL is required for dashscope ASR")
        if not self.model:
            raise AsrServiceError("ASR_MODEL is required for dashscope ASR")

        audio_path = self.media_probe.extract_audio(source_path, output_dir / "asr_audio.mp3")
        if audio_path.stat().st_size > self.audio_max_bytes:
            raise AsrServiceError(
                f"Extracted audio is too large for ASR; limit is {self.audio_max_bytes // (1024 * 1024)}MB"
            )

        file_url = self._public_file_url(audio_path)
        task_id = self._submit_dashscope_task(file_url)
        results = self._wait_dashscope_task(task_id)
        transcription_url = self._first_dashscope_transcription_url(results)
        payload = self._download_dashscope_result(transcription_url)
        return self._parse_dashscope_result(payload)

    def _submit_dashscope_task(self, file_url: str) -> str:
        parameters: dict[str, Any] = {"channel_id": [0]}
        if self.language_hints:
            parameters["language_hints"] = self.language_hints
        payload = {
            "model": self.model,
            "input": {"file_urls": [file_url]},
            "parameters": parameters,
        }
        try:
            response = requests.post(
                self._dashscope_submit_url(),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "X-DashScope-Async": "enable",
                },
                data=json.dumps(payload),
                timeout=self.timeout_sec,
            )
            if not response.ok:
                raise AsrServiceError(
                    f"DashScope ASR submit failed with status {response.status_code}: {response.text[:500]}"
                )
            response_payload = response.json()
        except requests.RequestException as error:
            raise AsrServiceError(f"DashScope ASR submit request failed: {error}") from error
        except json.JSONDecodeError as error:
            raise AsrServiceError(f"DashScope ASR submit returned invalid JSON: {error}") from error

        task_id = str(response_payload.get("output", {}).get("task_id", ""))
        if not task_id:
            raise AsrServiceError(f"DashScope ASR submit returned no task_id: {response_payload}")
        return task_id

    def _wait_dashscope_task(self, task_id: str) -> list[dict[str, Any]]:
        deadline = time.monotonic() + self.timeout_sec
        last_payload: dict[str, Any] = {}
        while time.monotonic() < deadline:
            try:
                response = requests.get(
                    self._dashscope_task_url(task_id),
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=min(self.timeout_sec, 30),
                )
                if not response.ok:
                    raise AsrServiceError(
                        f"DashScope ASR query failed with status {response.status_code}: {response.text[:500]}"
                    )
                last_payload = response.json()
            except requests.RequestException as error:
                raise AsrServiceError(f"DashScope ASR query request failed: {error}") from error
            except json.JSONDecodeError as error:
                raise AsrServiceError(f"DashScope ASR query returned invalid JSON: {error}") from error

            output = last_payload.get("output", {})
            status = output.get("task_status")
            if status == "SUCCEEDED":
                return list(output.get("results", []))
            if status not in {"PENDING", "RUNNING"}:
                raise AsrServiceError(f"DashScope ASR task failed: {last_payload}")
            time.sleep(self.poll_interval_sec)
        raise AsrServiceError(f"DashScope ASR timed out while waiting for task {task_id}: {last_payload}")

    @staticmethod
    def _first_dashscope_transcription_url(results: list[dict[str, Any]]) -> str:
        for result in results:
            if result.get("subtask_status") == "SUCCEEDED" and result.get("transcription_url"):
                return str(result["transcription_url"])
        raise AsrServiceError(f"DashScope ASR returned no successful transcription result: {results}")

    def _download_dashscope_result(self, transcription_url: str) -> dict[str, Any]:
        try:
            response = requests.get(transcription_url, timeout=self.timeout_sec)
            if not response.ok:
                raise AsrServiceError(
                    f"DashScope ASR result download failed with status {response.status_code}: {response.text[:500]}"
                )
            return dict(response.json())
        except requests.RequestException as error:
            raise AsrServiceError(f"DashScope ASR result download failed: {error}") from error
        except json.JSONDecodeError as error:
            raise AsrServiceError(f"DashScope ASR result returned invalid JSON: {error}") from error

    def _parse_dashscope_result(self, payload: dict[str, Any]) -> AsrTranscript:
        transcripts = payload.get("transcripts", [])
        sentences: list[AsrSentence] = []
        transcript_texts: list[str] = []
        for transcript in transcripts:
            transcript_text = str(transcript.get("text", "")).strip()
            if transcript_text:
                transcript_texts.append(transcript_text)
            for sentence_payload in transcript.get("sentences", []):
                sentences.extend(self._dashscope_sentence_pieces(sentence_payload))

        text = " ".join(transcript_texts).strip()
        if sentences:
            text = " ".join(sentence.text for sentence in sentences).strip() or text
        return AsrTranscript(
            text=text,
            provider="dashscope",
            model=self.model,
            language=",".join(self.language_hints) if self.language_hints else "unknown",
            sentences=sentences,
        )

    def _transcribe_dashscope_realtime(self, source_path: Path, output_dir: Path) -> AsrTranscript:
        if not self.api_key:
            raise AsrServiceError("ASR_API_KEY or DASHSCOPE_API_KEY is required for DashScope realtime ASR")
        if not self.base_url:
            raise AsrServiceError("ASR_BASE_URL or DASHSCOPE_WEBSOCKET_URL is required for DashScope realtime ASR")
        if not self.model:
            raise AsrServiceError("ASR_MODEL is required for DashScope realtime ASR")

        audio_path = self.media_probe.extract_audio(source_path, output_dir / "asr_audio.wav")
        if audio_path.stat().st_size > self.audio_max_bytes:
            raise AsrServiceError(
                f"Extracted audio is too large for ASR; limit is {self.audio_max_bytes // (1024 * 1024)}MB"
            )

        try:
            import certifi
        except ImportError as error:
            raise AsrServiceError(
                "certifi is required for DashScope realtime ASR certificate verification."
            ) from error

        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
        os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
        try:
            import dashscope
            from dashscope.audio.asr import Recognition
        except ImportError as error:
            raise AsrServiceError(
                "DashScope SDK is required for realtime ASR. Install backend requirements first."
            ) from error

        dashscope.api_key = self.api_key
        dashscope.base_websocket_api_url = self.base_url
        recognition_kwargs: dict[str, Any] = {
            "model": self.model,
            "format": "wav",
            "sample_rate": 16000,
            "callback": None,
            "semantic_punctuation_enabled": False,
            "max_sentence_silence": 800,
        }
        if self.language_hints:
            recognition_kwargs["language_hints"] = self.language_hints[:1]

        recognition = Recognition(**recognition_kwargs)
        try:
            result = recognition.call(str(audio_path))
        except Exception as error:
            raise AsrServiceError(f"DashScope realtime ASR request failed: {error}") from error

        status_code = getattr(result, "status_code", None)
        if status_code != HTTPStatus.OK:
            message = getattr(result, "message", "unknown error")
            request_id = getattr(result, "request_id", "")
            raise AsrServiceError(f"DashScope realtime ASR failed: {message}; request_id={request_id}")

        return self._parse_dashscope_realtime_result(result)

    def _parse_dashscope_realtime_result(self, result: Any) -> AsrTranscript:
        sentence_payload = result.get_sentence()
        if isinstance(sentence_payload, dict):
            sentence_payloads = [sentence_payload]
        elif isinstance(sentence_payload, list):
            sentence_payloads = sentence_payload
        else:
            sentence_payloads = []

        sentences: list[AsrSentence] = []
        for payload in sentence_payloads:
            if isinstance(payload, dict):
                sentences.extend(self._dashscope_sentence_pieces(payload))
        text = " ".join(sentence.text for sentence in sentences).strip()
        return AsrTranscript(
            text=text,
            provider="dashscope_realtime",
            model=self.model,
            language=",".join(self.language_hints[:1]) if self.language_hints else "unknown",
            sentences=sentences,
        )

    def _dashscope_sentence_pieces(self, sentence_payload: dict[str, Any]) -> list[AsrSentence]:
        words = [
            AsrWord(
                text=str(word.get("text", "")),
                start_sec=self._ms_to_sec(word.get("begin_time")),
                end_sec=self._ms_to_sec(word.get("end_time")),
                punctuation=str(word.get("punctuation", "")),
            )
            for word in sentence_payload.get("words", [])
            if str(word.get("text", "")).strip()
        ]
        if not words:
            return [
                AsrSentence(
                    text=str(sentence_payload.get("text", "")).strip(),
                    start_sec=self._ms_to_sec(sentence_payload.get("begin_time")),
                    end_sec=self._ms_to_sec(sentence_payload.get("end_time")),
                    speaker_id=sentence_payload.get("speaker_id"),
                )
            ]

        pieces: list[AsrSentence] = []
        current_words: list[AsrWord] = []
        current_text = ""
        strong_marks = "。！？!?；;"
        soft_marks = "，,"
        for word in words:
            current_words.append(word)
            current_text = f"{current_text}{word.text}{word.punctuation}"
            duration_sec = current_words[-1].end_sec - current_words[0].start_sec
            should_split = (
                any(mark in word.punctuation for mark in strong_marks)
                or (duration_sec >= 3.0 and any(mark in word.punctuation for mark in soft_marks))
                or (duration_sec >= 6.0 and len(current_text) >= 24)
                or len(current_text) >= 42
            )
            if should_split:
                pieces.append(self._sentence_from_words(current_words, sentence_payload.get("speaker_id")))
                current_words = []
                current_text = ""
        if current_words:
            pieces.append(self._sentence_from_words(current_words, sentence_payload.get("speaker_id")))
        return pieces

    @staticmethod
    def _sentence_from_words(words: list[AsrWord], speaker_id: int | None) -> AsrSentence:
        text = "".join(f"{word.text}{word.punctuation}" for word in words).strip()
        return AsrSentence(
            text=text,
            start_sec=round(words[0].start_sec, 3),
            end_sec=round(max(words[-1].end_sec, words[0].start_sec), 3),
            speaker_id=speaker_id,
            words=words,
        )

    def _public_file_url(self, audio_path: Path) -> str:
        if not self.public_base_url:
            raise AsrServiceError(
                "DashScope fun-asr requires ASR_PUBLIC_BASE_URL because it cannot read local files. "
                "Set it to a public backend URL that serves /outputs, or upload the audio to OSS and pass that URL."
            )
        relative_path = audio_path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
        quoted_path = "/".join(quote(part) for part in relative_path.split("/"))
        return f"{self.public_base_url}/{quoted_path}"

    def _dashscope_submit_url(self) -> str:
        base_url = self.base_url.rstrip("/")
        if base_url.endswith("/services/audio/asr/transcription"):
            return base_url
        return f"{base_url}/services/audio/asr/transcription"

    def _dashscope_task_url(self, task_id: str) -> str:
        base_url = self.base_url.rstrip("/")
        service_suffix = "/services/audio/asr/transcription"
        if base_url.endswith(service_suffix):
            base_url = base_url[: -len(service_suffix)]
        return f"{base_url}/tasks/{task_id}"

    @staticmethod
    def _ms_to_sec(value: Any) -> float:
        try:
            return round(float(value) / 1000, 3)
        except (TypeError, ValueError):
            return 0.0
