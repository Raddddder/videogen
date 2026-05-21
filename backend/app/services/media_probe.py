import json
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


class MediaProbe:
    """FFmpeg-backed video metadata and cover extraction."""

    def inspect(self, source_path: Path) -> MediaInfo:
        payload = self._run_json(
            [
                "ffprobe",
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
            raise ValueError(f"No video stream found in {source_path}")

        audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
        duration = self._first_float(
            video_stream.get("duration"),
            payload.get("format", {}).get("duration"),
        )
        if duration <= 0:
            raise ValueError(f"Invalid duration for {source_path}")

        return MediaInfo(
            duration_sec=round(duration, 3),
            width=int(video_stream.get("width", 0)),
            height=int(video_stream.get("height", 0)),
            fps=self._parse_fps(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate")),
            has_audio=audio_stream is not None,
        )

    def extract_cover(self, source_path: Path, output_path: Path, duration_sec: float) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        seek_at = min(max(duration_sec * 0.12, 0.1), 1.5)
        subprocess.run(
            [
                "ffmpeg",
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
            check=True,
            capture_output=True,
            text=True,
        )
        return output_path

    @staticmethod
    def _run_json(command: list[str]) -> dict[str, Any]:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        return json.loads(result.stdout)

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
