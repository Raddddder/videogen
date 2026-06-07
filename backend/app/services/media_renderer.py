import subprocess
import tempfile
import struct
import zlib
from pathlib import Path
from typing import Optional

from app.core.paths import PROJECT_ROOT
from app.models.contracts import EditPlan, Material, MaterialLibrary, TimelineItem

try:
    from PIL import Image, ImageDraw, ImageFont
    _PIL_OK = True
except ImportError:  # pragma: no cover
    _PIL_OK = False


_FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/PingFang.ttc",
]

_FUNCTION_LABELS = {
    "hook": "开头钩子",
    "pain_point": "痛点",
    "setup": "铺垫",
    "solution": "解决方案",
    "proof": "效果证明",
    "transition": "转场",
    "cta": "转化 CTA",
}


class MediaRenderError(RuntimeError):
    """Raised when ffmpeg cannot compose the preview video."""


class MediaRenderer:
    """Compose an Edit Plan timeline into a real 9:16 preview.mp4 with ffmpeg.

    Each timeline segment becomes a normalized clip (matched video trimmed,
    image held, or a placeholder card for gaps); Chinese subtitles are rendered
    with Pillow into a transparent PNG and overlaid (this ffmpeg build has no
    drawtext), then all segments are concatenated.
    """

    BG = "0x0b1020"

    def __init__(
        self,
        ffmpeg_bin: str = "ffmpeg",
        width: int = 1080,
        height: int = 1920,
        fps: int = 30,
        timeout_sec: int = 300,
        burn_subtitles: bool = True,
    ) -> None:
        self.ffmpeg_bin = ffmpeg_bin
        self.width = width
        self.height = height
        self.fps = fps
        self.timeout_sec = timeout_sec
        self.font_path = next((f for f in _FONT_CANDIDATES if Path(f).exists()), None)
        bundled_remotion = "compositor-win32" in str(ffmpeg_bin).replace("\\", "/")
        self.burn_subtitles = burn_subtitles and _PIL_OK and self.font_path is not None and not bundled_remotion

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
                clips.append(self._render_segment(index, item, material, duration, tmp_dir))

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

        if material and material.type == "video_clip" and source_file:
            start = item.source_range[0] if item.source_range else 0.0
            src_input = ["-ss", f"{start:.2f}", "-i", str(source_file)]
        elif material and material.type == "image" and source_file:
            src_input = ["-loop", "1", "-i", str(source_file)]
        else:
            src_input = ["-loop", "1", "-i", str(self._placeholder_image(tmp_dir))]

        sub_png: Optional[Path] = None
        if self.burn_subtitles:
            sub_text = (item.script or "").strip() or _FUNCTION_LABELS.get(item.function, item.function)
            title = item.packaging.title_bar_text if item.packaging else None
            sub_png = tmp_dir / f"sub_{index:03d}.png"
            self._subtitle_png(sub_text, title, sub_png)

        if sub_png is not None:
            filter_complex = f"[0:v]{self._scale_pad()}[bg];[bg][1:v]overlay=0:0,format=yuv420p[v]"
            self._run([
                self.ffmpeg_bin, "-nostdin", "-y", *src_input, "-i", str(sub_png),
                "-filter_complex", filter_complex,
                "-map", "[v]", "-an",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", str(self.fps),
                "-t", f"{duration:.2f}", str(out),
            ])
        else:
            self._run([
                self.ffmpeg_bin, "-nostdin", "-y", *src_input,
                "-vf", self._scale_pad(),
                "-map", "0:v:0", "-an",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", str(self.fps),
                "-t", f"{duration:.2f}", str(out),
            ])
        return out

    def _subtitle_png(self, text: str, title: Optional[str], out_path: Path) -> None:
        width, height = self.width, self.height
        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        font = ImageFont.truetype(self.font_path, 54)
        lines = self._wrap_text(draw, text, font, width - 180)
        ascent, descent = font.getmetrics()
        line_h = ascent + descent + 18
        block_h = line_h * len(lines)
        y0 = height - block_h - 180
        draw.rectangle([50, y0 - 28, width - 50, y0 + block_h + 18], fill=(0, 0, 0, 140))
        for i, line in enumerate(lines):
            w = draw.textlength(line, font=font)
            draw.text(((width - w) / 2, y0 + i * line_h), line, font=font, fill=(255, 255, 255, 255))

        if title and title not in {"none", ""}:
            title_font = ImageFont.truetype(self.font_path, 40)
            tw = draw.textlength(title, font=title_font)
            draw.rounded_rectangle(
                [(width - tw) / 2 - 26, 120, (width + tw) / 2 + 26, 188],
                radius=34, fill=(15, 118, 110, 220),
            )
            draw.text(((width - tw) / 2, 132), title, font=title_font, fill=(255, 255, 255, 255))

        img.save(out_path)

    @staticmethod
    def _wrap_text(draw, text: str, font, max_w: float, max_lines: int = 3) -> list[str]:
        lines: list[str] = []
        cur = ""
        for ch in text:
            if ch == "\n":
                lines.append(cur)
                cur = ""
            elif draw.textlength(cur + ch, font=font) <= max_w:
                cur += ch
            else:
                lines.append(cur)
                cur = ch
            if len(lines) >= max_lines:
                break
        if cur and len(lines) < max_lines:
            lines.append(cur)
        return lines[:max_lines] or [text[:12]]

    def _scale_pad(self) -> str:
        return f"scale={self.width}:{self.height},format=yuv420p"

    def _placeholder_image(self, tmp_dir: Path) -> Path:
        path = tmp_dir / "placeholder.png"
        if path.exists():
            return path

        rgb = bytes.fromhex(self.BG.removeprefix("0x"))
        raw_row = b"\x00" + (rgb * self.width)
        raw = raw_row * self.height

        def chunk(name: bytes, data: bytes) -> bytes:
            return (
                struct.pack(">I", len(data))
                + name
                + data
                + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
            )

        payload = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", self.width, self.height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, level=1))
            + chunk(b"IEND", b"")
        )
        path.write_bytes(payload)
        return path

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
