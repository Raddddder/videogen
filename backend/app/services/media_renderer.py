import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from app.core.paths import PROJECT_ROOT
from app.models.contracts import EditPlan, Material, MaterialLibrary, TimelineItem


class MediaRenderError(RuntimeError):
    """Raised when ffmpeg cannot compose the preview video."""


class MediaRenderer:
    """Compose an Edit Plan timeline into a real 9:16 preview.mp4 with ffmpeg.

    Each timeline segment becomes a normalized clip (matched video trimmed,
    image held, or a placeholder card for gaps), then all are concatenated.
    """

    BG = "0x0b1020"

    def __init__(
        self,
        ffmpeg_bin: str = "ffmpeg",
        width: int = 1080,
        height: int = 1920,
        fps: int = 30,
        timeout_sec: int = 300,
    ) -> None:
        self.ffmpeg_bin = ffmpeg_bin
        self.width = width
        self.height = height
        self.fps = fps
        self.timeout_sec = timeout_sec

    def render_preview(
        self,
        edit_plan: EditPlan,
        material_library: MaterialLibrary,
        output_path: Path,
    ) -> Path:
        if not edit_plan.timeline:
            raise MediaRenderError("Edit plan has no timeline to render")

        materials = {material.material_id: material for material in material_library.materials}
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            clips: list[Path] = []
            for index, item in enumerate(edit_plan.timeline):
                duration = max(round(item.target_time_range[1] - item.target_time_range[0], 2), 0.8)
                material = materials.get(item.selected_material_id) if item.selected_material_id else None
                clip = self._render_segment(index, item, material, duration, tmp_dir)
                clips.append(clip)

            list_file = tmp_dir / "concat.txt"
            list_file.write_text("".join(f"file '{clip.as_posix()}'\n" for clip in clips), encoding="utf-8")
            self._run([
                self.ffmpeg_bin, "-nostdin", "-y",
                "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c", "copy", str(output_path),
            ])
        return output_path

    def _render_segment(
        self,
        index: int,
        item: TimelineItem,
        material: Optional[Material],
        duration: float,
        tmp_dir: Path,
    ) -> Path:
        out = tmp_dir / f"seg_{index:03d}.mp4"
        source_file = self._resolve_file(material)
        silent_audio = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
        common_out = [
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-r", str(self.fps),
            "-c:a", "aac", "-ar", "44100", "-ac", "2",
            "-t", f"{duration:.2f}", str(out),
        ]

        if material and material.type == "video_clip" and source_file:
            start = item.source_range[0] if item.source_range else 0.0
            self._run([
                self.ffmpeg_bin, "-nostdin", "-y",
                "-ss", f"{start:.2f}", "-i", str(source_file),
                *silent_audio,
                "-vf", self._scale_pad(), *common_out,
            ])
        elif material and material.type == "image" and source_file:
            self._run([
                self.ffmpeg_bin, "-nostdin", "-y",
                "-loop", "1", "-i", str(source_file),
                *silent_audio,
                "-vf", self._scale_pad(), *common_out,
            ])
        else:
            self._run([
                self.ffmpeg_bin, "-nostdin", "-y",
                "-f", "lavfi", "-i", f"color=c={self.BG}:s={self.width}x{self.height}:r={self.fps}",
                *silent_audio,
                "-vf", "format=yuv420p", *common_out,
            ])
        return out

    def _scale_pad(self) -> str:
        return (
            f"scale={self.width}:{self.height}:force_original_aspect_ratio=decrease,"
            f"pad={self.width}:{self.height}:(ow-iw)/2:(oh-ih)/2:color={self.BG},"
            "setsar=1,format=yuv420p"
        )

    @staticmethod
    def _resolve_file(material: Optional[Material]) -> Optional[Path]:
        if material is None or not material.preview_url:
            return None
        candidate = (PROJECT_ROOT / material.preview_url.lstrip("/")).resolve()
        try:
            if not candidate.is_relative_to(PROJECT_ROOT.resolve()):
                return None
        except ValueError:
            return None
        return candidate if candidate.exists() else None

    def _run(self, command: list[str]) -> None:
        try:
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=self.timeout_sec)
        except FileNotFoundError as error:
            raise MediaRenderError(f"{command[0]} is not installed or not found in PATH") from error
        except subprocess.TimeoutExpired as error:
            raise MediaRenderError(f"ffmpeg timed out after {self.timeout_sec}s") from error
        except subprocess.CalledProcessError as error:
            detail = (error.stderr or "")[-400:]
            raise MediaRenderError(f"ffmpeg failed: {detail}") from error
