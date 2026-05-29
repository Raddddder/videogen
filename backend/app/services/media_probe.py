import json
import re
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class MediaInfo:
    duration_sec: float
    width: int
    height: int
    fps: float
    has_audio: bool


class MediaProbeError(RuntimeError):
    """Raised when FFmpeg cannot inspect or process a media file."""


class MediaProbeDependencyError(MediaProbeError):
    """Raised when ffmpeg or ffprobe is unavailable in the runtime."""


class MediaProbe:
    """FFmpeg-backed video metadata and cover extraction."""

    def __init__(
        self,
        ffmpeg_bin: str = "ffmpeg",
        ffprobe_bin: str = "ffprobe",
        probe_timeout_sec: int = 20,
        cover_timeout_sec: int = 30,
        scene_threshold: float = 0.32,
        min_scene_gap_sec: float = 0.7,
        max_scene_cuts: int = 24,
    ) -> None:
        self.ffmpeg_bin = ffmpeg_bin
        self.ffprobe_bin = ffprobe_bin
        self.probe_timeout_sec = probe_timeout_sec
        self.cover_timeout_sec = cover_timeout_sec
        self.scene_threshold = scene_threshold
        self.min_scene_gap_sec = min_scene_gap_sec
        self.max_scene_cuts = max_scene_cuts

    def inspect(self, source_path: Path) -> MediaInfo:
        payload = self._run_json(
            [
                self.ffprobe_bin,
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(source_path),
            ]
        )
        streams = payload.get("streams", [])
        video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
        if not video_stream:
            raise MediaProbeError(f"No video stream found in {source_path.name}")

        audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
        duration = self._first_float(
            video_stream.get("duration"),
            payload.get("format", {}).get("duration"),
        )
        if duration <= 0:
            raise MediaProbeError(f"Invalid duration for {source_path.name}")

        return MediaInfo(
            duration_sec=round(duration, 3),
            width=int(video_stream.get("width", 0)),
            height=int(video_stream.get("height", 0)),
            fps=self._parse_fps(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate")),
            has_audio=audio_stream is not None,
        )

    def probe_dimensions(self, source_path: Path) -> tuple[int, int]:
        """Return (width, height) for an image or video without requiring duration."""
        payload = self._run_json(
            [
                self.ffprobe_bin,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-print_format",
                "json",
                "-show_streams",
                str(source_path),
            ]
        )
        streams = payload.get("streams", [])
        video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
        if not video_stream:
            raise MediaProbeError(f"No image/video stream found in {source_path.name}")
        return int(video_stream.get("width", 0)), int(video_stream.get("height", 0))

    def extract_cover(self, source_path: Path, output_path: Path, duration_sec: float) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        seek_at = min(max(duration_sec * 0.12, 0.1), 1.5)
        self._run_command(
            [
                self.ffmpeg_bin,
                "-nostdin",
                "-y",
                "-ss",
                f"{seek_at:.3f}",
                "-i",
                str(source_path),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                str(output_path),
            ],
            timeout_sec=self.cover_timeout_sec,
        )
        return output_path

    def extract_audio(self, source_path: Path, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        codec_args = self._audio_codec_args(output_path)
        self._run_command(
            [
                self.ffmpeg_bin,
                "-nostdin",
                "-y",
                "-i",
                str(source_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                *codec_args,
                str(output_path),
            ],
            timeout_sec=self.cover_timeout_sec,
        )
        return output_path

    @staticmethod
    def _audio_codec_args(output_path: Path) -> list[str]:
        suffix = output_path.suffix.lower()
        if suffix == ".wav":
            return ["-c:a", "pcm_s16le"]
        return ["-b:a", "64k"]

    def detect_scene_cuts(self, source_path: Path, duration_sec: float) -> list[float]:
        result = self._run_command(
            [
                self.ffmpeg_bin,
                "-hide_banner",
                "-nostdin",
                "-i",
                str(source_path),
                "-vf",
                f"select='gt(scene,{self.scene_threshold})',metadata=print:file=-",
                "-an",
                "-f",
                "null",
                "-",
            ],
            timeout_sec=max(self.probe_timeout_sec, int(duration_sec / 2) + 10),
        )
        raw_output = f"{result.stdout}\n{result.stderr}"
        candidates = [
            float(match.group(1))
            for match in re.finditer(r"pts_time:(\d+(?:\.\d+)?)", raw_output)
        ]
        return self._filter_scene_cuts(candidates, duration_sec)

    def _run_json(self, command: list[str]) -> dict[str, Any]:
        result = self._run_command(command, timeout_sec=self.probe_timeout_sec)
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise MediaProbeError("ffprobe returned invalid JSON") from error

    @staticmethod
    def _run_command(command: list[str], timeout_sec: int) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
            )
        except FileNotFoundError as error:
            raise MediaProbeDependencyError(
                f"{command[0]} is not installed or not found in PATH"
            ) from error
        except subprocess.TimeoutExpired as error:
            raise MediaProbeError(f"{command[0]} timed out after {timeout_sec}s") from error
        except subprocess.CalledProcessError as error:
            stderr = (error.stderr or "").strip()
            detail = stderr[-500:] if stderr else f"{command[0]} exited with {error.returncode}"
            raise MediaProbeError(detail) from error

    def _filter_scene_cuts(self, candidates: list[float], duration_sec: float) -> list[float]:
        cuts: list[float] = []
        for timestamp in sorted(set(round(value, 3) for value in candidates)):
            if timestamp <= self.min_scene_gap_sec or timestamp >= duration_sec - self.min_scene_gap_sec:
                continue
            if cuts and timestamp - cuts[-1] < self.min_scene_gap_sec:
                continue
            cuts.append(timestamp)
            if len(cuts) >= self.max_scene_cuts:
                break
        return cuts

    @staticmethod
    def _first_float(*values: Any) -> float:
        for value in values:
            if value is not None:
                return float(value)
        return 0.0

    @staticmethod
    def _parse_fps(value: Any) -> float:
        if not value or value == "0/0":
            return 0.0
        try:
            return round(float(Fraction(str(value))), 3)
        except (ValueError, ZeroDivisionError):
            return 0.0
