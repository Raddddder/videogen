import re
import time
from pathlib import Path
from typing import Optional

from app.core.paths import OUTPUTS_DIR, PROJECT_ROOT
from app.models.contracts import AnalyzeSampleRequest, StructureDNA
from app.services.asr_service import AsrSentence, AsrService, AsrServiceError, AsrTranscript
from app.services.json_repository import JsonRepository
from app.services.media_probe import MediaInfo, MediaProbe, MediaProbeError
from app.services.structure_role_classifier import StructureRoleClassifier


class StructureAnalyzer:
    """Module A: sample video analysis.

    Real implementation slots:
    - FFmpeg metadata extraction
    - scene detection
    - ASR
    - multimodal structure extraction
    """

    def __init__(
        self,
        repository: JsonRepository,
        media_probe: Optional[MediaProbe] = None,
        asr_service: Optional[AsrService] = None,
        role_classifier: Optional[StructureRoleClassifier] = None,
    ) -> None:
        self.repository = repository
        self.media_probe = media_probe or MediaProbe()
        self.asr_service = asr_service or AsrService(media_probe=self.media_probe)
        self.role_classifier = role_classifier or StructureRoleClassifier()

    def analyze(self, request: AnalyzeSampleRequest) -> StructureDNA:
        if request.source_uri and not request.use_mock:
            return self._analyze_uploaded_video(request)

        payload = self.repository.load_mock("structure_dna")
        payload["video_id"] = request.video_id
        if request.source_uri:
            payload["source_type"] = "uploaded_video"
        return StructureDNA(**payload)

    def _analyze_uploaded_video(self, request: AnalyzeSampleRequest) -> StructureDNA:
        debug_trace: list[dict[str, object]] = []
        source_path = self._resolve_source_path(request.source_uri)
        started_at = time.perf_counter()
        media_info = self.media_probe.inspect(source_path)
        debug_trace.append(
            self._trace_event(
                "media_inspect",
                "success",
                f"读取视频元信息：{media_info.width}x{media_info.height}, {media_info.duration_sec}s",
                latency_ms=self._elapsed_ms(started_at),
            )
        )
        started_at = time.perf_counter()
        scene_cuts, scene_detection_trace = self._detect_scene_cuts(source_path, media_info, started_at)
        debug_trace.append(scene_detection_trace)
        scene_count = max(len(scene_cuts) + 1, 1)
        safe_project_id = self._safe_path_part(request.project_id, "case_001")
        safe_video_id = self._safe_path_part(request.video_id, "sample_uploaded")
        output_dir = OUTPUTS_DIR / safe_project_id / safe_video_id
        transcription, fallback_reason, fallback_confidence = self._transcribe_with_retries(
            source_path,
            output_dir,
            media_info,
            debug_trace,
        )
        segments = self._build_auto_segments(
            media_info,
            scene_cuts,
            transcription,
            debug_trace,
            fallback_reason,
            fallback_confidence,
        )
        cover_frame_path: str | None = None
        started_at = time.perf_counter()
        try:
            cover_path = self.media_probe.extract_cover(source_path, output_dir / "cover.jpg", media_info.duration_sec)
            cover_frame_path = str(cover_path.relative_to(PROJECT_ROOT))
            debug_trace.append(
                self._trace_event(
                    "cover_extraction",
                    "success",
                    "抽取样例封面帧",
                    latency_ms=self._elapsed_ms(started_at),
                )
            )
        except MediaProbeError as error:
            debug_trace.append(
                self._trace_event(
                    "cover_extraction",
                    "fallback",
                    f"封面帧抽取失败，保留结构分析结果；错误：{str(error)[:180]}",
                    latency_ms=self._elapsed_ms(started_at),
                )
            )
        formula = " -> ".join(str(segment["function"]) for segment in segments)
        avg_segment_duration_sec = (
            round(sum(float(segment["duration_sec"]) for segment in segments) / len(segments), 3)
            if segments
            else round(media_info.duration_sec, 3)
        )
        payload = {
            "schema_version": "1.0",
            "video_id": safe_video_id,
            "source_type": "uploaded_video",
            "total_duration_sec": media_info.duration_sec,
            "category": self._infer_category(media_info),
            "structure_formula": formula,
            "basic_info": {
                "width": media_info.width,
                "height": media_info.height,
                "fps": media_info.fps,
                "shot_count": scene_count,
                "has_speech": media_info.has_audio,
                "cover_frame_path": cover_frame_path,
            },
            "segments": segments,
            "global_features": {
                "avg_segment_duration_sec": avg_segment_duration_sec,
                "pacing_pattern": self._pacing_pattern(scene_cuts, len(segments)),
                "bgm_style": "audio_track_present_pending_classification" if media_info.has_audio else "no_audio_track",
                "overall_emotion_curve": [float(segment["emotion_score"]) for segment in segments],
            },
            "debug_trace": debug_trace,
        }
        return StructureDNA(**payload)

    def _transcribe_with_retries(
        self,
        source_path: Path,
        output_dir: Path,
        media_info: MediaInfo,
        debug_trace: list[dict[str, object]],
        max_attempts: int = 3,
    ) -> tuple[AsrTranscript, str | None, float | None]:
        if not media_info.has_audio:
            debug_trace.append(
                self._trace_event(
                    "asr",
                    "skipped",
                    "视频无音轨，跳过 ASR",
                    provider=self.asr_service.provider,
                    model=self.asr_service.model,
                )
            )
            return (
                AsrTranscript(text="", provider="none", language="none", emotion="none"),
                "视频无音轨，使用视觉/时长兜底",
                0.3,
            )

        last_error = ""
        for attempt in range(1, max_attempts + 1):
            started_at = time.perf_counter()
            try:
                transcription = self.asr_service.transcribe(source_path, output_dir, media_info)
                debug_trace.append(
                    self._trace_event(
                        "asr",
                        "success",
                        f"识别到 {len(transcription.sentences)} 个 ASR 句子",
                        attempt=attempt,
                        provider=transcription.provider,
                        model=transcription.model or self.asr_service.model,
                        latency_ms=self._elapsed_ms(started_at),
                    )
                )
                return transcription, None, None
            except (AsrServiceError, MediaProbeError) as error:
                last_error = f"{type(error).__name__}: {str(error)[:180]}"
                debug_trace.append(
                    self._trace_event(
                        "asr",
                        "retry",
                        last_error,
                        attempt=attempt,
                        provider=self.asr_service.provider,
                        model=self.asr_service.model,
                        latency_ms=self._elapsed_ms(started_at),
                    )
                )

        debug_trace.append(
            self._trace_event(
                "asr_fallback",
                "used",
                f"ASR 三次失败，使用镜头/时长兜底；最后错误：{last_error}",
                provider=self.asr_service.provider,
                model=self.asr_service.model,
            )
        )
        return (
            AsrTranscript(
                text="",
                provider=f"{self.asr_service.provider}_failed",
                model=self.asr_service.model,
                language="unknown",
                emotion="unknown",
            ),
            "ASR 三次失败，使用镜头/时长兜底",
            0.25,
        )

    def _detect_scene_cuts(
        self,
        source_path: Path,
        media_info: MediaInfo,
        started_at: float | None = None,
    ) -> tuple[list[float], dict[str, object]]:
        started_at = started_at if started_at is not None else time.perf_counter()
        try:
            scene_cuts = self.media_probe.detect_scene_cuts(source_path, media_info.duration_sec)
            return (
                scene_cuts,
                self._trace_event(
                    "scene_detection",
                    "success",
                    f"检测到 {len(scene_cuts)} 个镜头切点",
                    latency_ms=self._elapsed_ms(started_at),
                ),
            )
        except MediaProbeError as error:
            return (
                [],
                self._trace_event(
                    "scene_detection",
                    "fallback",
                    f"镜头检测失败，使用时长/ASR 兜底；错误：{str(error)[:180]}",
                    latency_ms=self._elapsed_ms(started_at),
                ),
            )

    @staticmethod
    def _elapsed_ms(started_at: float) -> int:
        return round((time.perf_counter() - started_at) * 1000)

    @staticmethod
    def _trace_event(
        stage: str,
        status: str,
        message: str,
        attempt: int | None = None,
        provider: str | None = None,
        model: str | None = None,
        latency_ms: int | None = None,
    ) -> dict[str, object]:
        event: dict[str, object] = {
            "stage": stage,
            "status": status,
            "message": message,
        }
        if attempt is not None:
            event["attempt"] = attempt
        if provider:
            event["provider"] = provider
        if model:
            event["model"] = model
        if latency_ms is not None:
            event["latency_ms"] = latency_ms
        return event

    @classmethod
    def _resolve_source_path(cls, source_uri: Optional[str]) -> Path:
        if not source_uri:
            raise ValueError("source_uri is required for uploaded video analysis")
        path = Path(source_uri)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        resolved = path.resolve()
        if not resolved.exists() or not resolved.is_file():
            raise ValueError("source_uri must point to an existing video file")

        allowed_roots = [
            OUTPUTS_DIR.resolve(),
            (PROJECT_ROOT / "public").resolve(),
        ]
        if not any(cls._is_relative_to(resolved, root) for root in allowed_roots):
            raise ValueError("source_uri must be an uploaded file or a public demo asset")
        return resolved

    @staticmethod
    def _safe_path_part(value: str, fallback: str) -> str:
        safe_value = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in value)
        return safe_value.strip("_") or fallback

    @staticmethod
    def _is_relative_to(path: Path, root: Path) -> bool:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            return False

    def _build_auto_segments(
        self,
        media_info: MediaInfo,
        scene_cuts: list[float],
        transcription: AsrTranscript,
        debug_trace: list[dict[str, object]] | None = None,
        fallback_reason: str | None = None,
        fallback_confidence: float | None = None,
    ) -> list[dict[str, object]]:
        cls = type(self)
        valid_sentences = cls._valid_sentences(transcription.sentences)
        classification = self.role_classifier.classify_with_trace(
            valid_sentences,
            cls._infer_category(media_info),
        )
        if debug_trace is not None:
            debug_trace.extend(classification.debug_trace)
        role_assignments = classification.assignments
        segment_sources: list[dict[str, object]] = []
        capture_mode = "duration_adaptive_position_heuristic"
        if role_assignments:
            sentence_map = {
                f"s{index}": sentence
                for index, sentence in enumerate(valid_sentences, start=1)
            }
            used_rule_fallback = any(
                event.get("stage") == "role_fallback" and event.get("status") == "used"
                for event in classification.debug_trace
            )
            capture_mode = (
                "asr_sentence_keyword_position_fallback"
                if used_rule_fallback
                else f"asr_sentence_{self.role_classifier.provider}_role_classifier"
            )
            for assignment in role_assignments:
                group = [
                    sentence_map[sentence_id]
                    for sentence_id in assignment.sentence_ids
                    if sentence_id in sentence_map
                ]
                if not group:
                    continue
                segment_sources.append(
                    {
                        "function": assignment.function,
                        "start": round(max(group[0].start_sec, 0.0), 3),
                        "end": round(
                            min(max(group[-1].end_sec, group[0].start_sec + 0.001), media_info.duration_sec),
                            3,
                        ),
                        "text": " ".join(sentence.text for sentence in group).strip(),
                        "confidence": assignment.confidence,
                        "reason": assignment.reason,
                        "source_sentence_ids": assignment.sentence_ids,
                    }
                )

        if not segment_sources and valid_sentences:
            timed_sentence_groups = cls._timed_sentence_groups(valid_sentences)
            capture_mode = "asr_sentence_timestamp_position_heuristic"
            functions = cls._functions_for_count(len(timed_sentence_groups))
            sentence_ids = {id(sentence): f"s{index}" for index, sentence in enumerate(valid_sentences, start=1)}
            segment_sources = [
                {
                    "function": function,
                    "start": round(max(group[0].start_sec, 0.0), 3),
                    "end": round(min(max(group[-1].end_sec, group[0].start_sec + 0.001), media_info.duration_sec), 3),
                    "text": " ".join(sentence.text for sentence in group).strip(),
                    "confidence": 0.5,
                    "reason": "未调用结构模型，按 ASR 时间顺序分配角色",
                    "source_sentence_ids": [sentence_ids[id(sentence)] for sentence in group],
                }
                for function, group in zip(functions, timed_sentence_groups)
            ]

        if not segment_sources:
            boundaries, capture_mode = cls._structure_boundaries(media_info.duration_sec, scene_cuts)
            functions = cls._functions_for_count(len(boundaries) - 1)
            transcript_chunks = cls._transcript_chunks(transcription.text, len(functions))
            segment_sources = [
                {
                    "function": function,
                    "start": boundaries[index],
                    "end": boundaries[index + 1],
                    "text": transcript_chunks[index] if index < len(transcript_chunks) else "",
                    "confidence": fallback_confidence if fallback_confidence is not None else 0.42,
                    "reason": fallback_reason or "未获得 ASR 句级时间戳，按时长和位置兜底",
                    "source_sentence_ids": [],
                }
                for index, function in enumerate(functions)
            ]
        segments: list[dict[str, object]] = []
        for index, source in enumerate(segment_sources, start=1):
            function = str(source["function"])
            label = cls._function_label(function)
            start = float(source["start"])
            end = float(source["end"])
            asr_text = str(source["text"])
            transcript = cls._transcript(
                label,
                start,
                end,
                media_info.has_audio,
                asr_text,
                transcription.provider,
            )
            duration = round(max(end - start, 0.001), 3)
            segments.append(
                {
                    "segment_id": f"seg_{index:03d}",
                    "function": function,
                    "time_range": [start, end],
                    "duration_sec": duration,
                    "duration_ratio": round(duration / media_info.duration_sec, 4),
                    "narrative_technique": capture_mode,
                    "shot_type": cls._shot_type(function, media_info),
                    "emotion_score": cls._emotion_score(function, index, len(segment_sources)),
                    "pacing": cls._pacing(duration),
                    "transcript": transcript,
                    "text_pattern": cls._text_pattern(function, asr_text, transcription.provider),
                    "audio_cue": cls._audio_cue(media_info.has_audio, transcription),
                    "visual_cue": cls._visual_cue(capture_mode, scene_cuts, index),
                    "confidence": source["confidence"],
                    "analysis_reason": source["reason"],
                    "source_sentence_ids": source["source_sentence_ids"],
                    "required_material_tags": cls._required_tags(function),
                    "packaging": {
                        "subtitle_density": "medium",
                        "subtitle_style": "pending_asr_style" if media_info.has_audio else "visual_caption_needed",
                        "title_bar": f"{function}_title",
                        "transition": cls._transition_style(capture_mode),
                        "emphasis_elements": ["auto_scene_capture", "pending_model_review"],
                    },
                }
            )
        return segments

    @classmethod
    def _timed_sentence_groups(
        cls,
        sentences: list[AsrSentence],
        max_segments: int = 7,
    ) -> list[list[AsrSentence]]:
        valid_sentences = cls._valid_sentences(sentences)
        if not valid_sentences:
            return []
        if len(valid_sentences) <= max_segments:
            return [[sentence] for sentence in valid_sentences]

        groups: list[list[AsrSentence]] = [[] for _ in range(max_segments)]
        total_duration = max(valid_sentences[-1].end_sec - valid_sentences[0].start_sec, 0.001)
        for sentence in valid_sentences:
            midpoint = (sentence.start_sec + sentence.end_sec) / 2
            ratio = (midpoint - valid_sentences[0].start_sec) / total_duration
            index = min(max(int(ratio * max_segments), 0), max_segments - 1)
            groups[index].append(sentence)
        return [group for group in groups if group]

    @staticmethod
    def _valid_sentences(sentences: list[AsrSentence]) -> list[AsrSentence]:
        return [
            sentence
            for sentence in sentences
            if sentence.text.strip() and sentence.end_sec > sentence.start_sec
        ]

    @classmethod
    def _structure_boundaries(cls, duration_sec: float, scene_cuts: list[float]) -> tuple[list[float], str]:
        scene_boundaries = cls._normalized_boundaries(duration_sec, scene_cuts)
        scene_count = len(scene_boundaries) - 1
        if scene_count >= 3:
            return cls._limit_boundaries(scene_boundaries, 7), "scene_detected_position_heuristic"
        return cls._adaptive_boundaries(duration_sec), "duration_adaptive_position_heuristic"

    @staticmethod
    def _normalized_boundaries(duration_sec: float, scene_cuts: list[float]) -> list[float]:
        boundaries = [0.0, *scene_cuts, duration_sec]
        return [round(value, 3) for value in boundaries]

    @staticmethod
    def _limit_boundaries(boundaries: list[float], max_segments: int) -> list[float]:
        if len(boundaries) - 1 <= max_segments:
            return boundaries
        duration_sec = boundaries[-1]
        selected = [boundaries[0]]
        inner_boundaries = boundaries[1:-1]
        for index in range(1, max_segments):
            target_time = duration_sec * index / max_segments
            nearest = min(inner_boundaries, key=lambda value: abs(value - target_time))
            if nearest > selected[-1] and nearest not in selected:
                selected.append(nearest)
        selected.append(duration_sec)
        return sorted(selected)

    @staticmethod
    def _adaptive_boundaries(duration_sec: float) -> list[float]:
        target_count = min(max(round(duration_sec / 6), 3), 7)
        return [round(duration_sec * index / target_count, 3) for index in range(target_count + 1)]

    @staticmethod
    def _functions_for_count(count: int) -> list[str]:
        plans = {
            1: ["hook"],
            2: ["hook", "cta"],
            3: ["hook", "solution", "cta"],
            4: ["hook", "pain_point", "solution", "cta"],
            5: ["hook", "pain_point", "solution", "proof", "cta"],
            6: ["hook", "pain_point", "setup", "solution", "proof", "cta"],
            7: ["hook", "pain_point", "setup", "solution", "proof", "transition", "cta"],
        }
        return plans.get(count, plans[7])

    @staticmethod
    def _function_label(function: str) -> str:
        labels = {
            "hook": "开头钩子",
            "pain_point": "痛点",
            "setup": "铺垫",
            "solution": "解决方案",
            "proof": "效果证明",
            "transition": "过渡",
            "cta": "转化 CTA",
        }
        return labels.get(function, function)

    @staticmethod
    def _required_tags(function: str) -> list[str]:
        tags = {
            "hook": ["opening", "high_energy", "attention"],
            "pain_point": ["pain_point", "problem_context"],
            "setup": ["context", "setup", "product_context"],
            "solution": ["solution", "process", "demo"],
            "proof": ["proof", "comparison", "result"],
            "transition": ["transition", "bridge"],
            "cta": ["cta", "product", "clear_voice"],
        }
        return tags.get(function, [function])

    @staticmethod
    def _shot_type(function: str, media_info: MediaInfo) -> str:
        orientation = "vertical" if media_info.height >= media_info.width else "landscape"
        if function in {"hook", "pain_point", "cta"} and media_info.has_audio:
            return f"{orientation}_talking_or_narration"
        if function == "solution":
            return f"{orientation}_process_or_demo"
        if function == "proof":
            return f"{orientation}_result_or_comparison"
        return f"{orientation}_context"

    @staticmethod
    def _emotion_score(function: str, index: int, total: int) -> float:
        defaults = {
            "hook": 8.0,
            "pain_point": 6.4,
            "setup": 5.8,
            "solution": 7.0,
            "proof": 7.4,
            "transition": 6.0,
            "cta": 8.1,
        }
        if index == total:
            return max(defaults.get(function, 6.5), 7.5)
        return defaults.get(function, 6.5)

    @staticmethod
    def _pacing(duration_sec: float) -> str:
        if duration_sec <= 4:
            return "fast"
        if duration_sec <= 8:
            return "medium"
        return "slow"

    @staticmethod
    def _transcript_chunks(text: str, count: int) -> list[str]:
        clean_text = " ".join(text.split())
        if not clean_text:
            return [""] * count

        sentences = [
            sentence.strip()
            for sentence in re.split(r"(?<=[。！？!?])\s*", clean_text)
            if sentence.strip()
        ]
        if len(sentences) >= count:
            chunks = sentences[: count - 1]
            chunks.append("".join(sentences[count - 1:]))
            return chunks

        chunk_size = max(len(clean_text) // count, 1)
        chunks = [clean_text[index:index + chunk_size] for index in range(0, len(clean_text), chunk_size)]
        if len(chunks) > count:
            chunks = chunks[: count - 1] + ["".join(chunks[count - 1:])]
        return chunks + [""] * (count - len(chunks))

    @staticmethod
    def _transcript(
        label: str,
        start: float,
        end: float,
        has_audio: bool,
        asr_text: str,
        asr_provider: str,
    ) -> str:
        if asr_text:
            return asr_text
        time_range = f"{start:.1f}-{end:.1f}s"
        if has_audio and asr_provider not in {"", "mock", "none"}:
            return f"ASR 已调用但未识别到可用语音：自动捕获到 {time_range} 的{label}候选段"
        if has_audio:
            return f"待 ASR 识别：自动捕获到 {time_range} 的{label}候选段"
        return f"无音轨：按视觉节奏捕获到 {time_range} 的{label}候选段"

    @staticmethod
    def _text_pattern(function: str, asr_text: str, asr_provider: str) -> str:
        if asr_provider not in {"", "mock", "none"} and asr_text:
            return f"asr_{function}_text: {asr_text[:28]}"
        if asr_provider not in {"", "mock", "none"}:
            return f"asr_empty_{function}_pattern"
        return f"pending_asr_{function}_pattern"

    @staticmethod
    def _audio_cue(has_audio: bool, transcription: AsrTranscript) -> str:
        if not has_audio:
            return "no_audio_track"
        if transcription.provider in {"", "mock"}:
            return "audio_track_present_pending_asr"
        parts = [f"asr_provider={transcription.provider}", f"language={transcription.language}"]
        if transcription.emotion != "unknown":
            parts.append(f"emotion={transcription.emotion}")
        if transcription.events:
            parts.append(f"events={','.join(transcription.events[:3])}")
        return "; ".join(parts)

    @staticmethod
    def _visual_cue(capture_mode: str, scene_cuts: list[float], index: int) -> str:
        if capture_mode.startswith("asr"):
            return f"asr_timestamp_segment_{index}; total_scene_cuts={len(scene_cuts)}"
        if capture_mode.startswith("scene"):
            return f"scene_detected_segment_{index}; total_scene_cuts={len(scene_cuts)}"
        return f"adaptive_duration_segment_{index}; total_scene_cuts={len(scene_cuts)}"

    @staticmethod
    def _transition_style(capture_mode: str) -> str:
        if capture_mode.startswith("asr"):
            return "asr_timed_cut"
        if capture_mode.startswith("scene"):
            return "scene_cut"
        return "adaptive_cut"

    @staticmethod
    def _infer_category(media_info: MediaInfo) -> str:
        if media_info.height >= media_info.width and media_info.has_audio:
            return "product_talk"
        if media_info.has_audio:
            return "mixed_talk"
        return "mixed_talk"

    @staticmethod
    def _pacing_pattern(scene_cuts: list[float], segment_count: int) -> str:
        if scene_cuts:
            return f"scene_detected_{len(scene_cuts) + 1}_shots_to_{segment_count}_structure_segments"
        return f"adaptive_duration_split_to_{segment_count}_structure_segments"
