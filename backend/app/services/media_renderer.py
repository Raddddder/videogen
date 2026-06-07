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
        # 精简版(Remotion 自带 win32)ffmpeg 缺 lavfi/复杂 filter，走简化路径(直接缩放、无字幕、无音轨)；
        # 完整 ffmpeg(Mac/Linux/标准安装)走高质量路径：等比缩放+黑边、烧字幕、补静音轨。
        self.simple_mode = "compositor-win32" in str(ffmpeg_bin).replace("\\", "/")
        self.burn_subtitles = burn_subtitles and _PIL_OK and self.font_path is not None and not self.simple_mode

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
            src_input = ["-loop", "1", "-i", str(self._placeholder_image(tmp_dir, item, material))]

        sub_png: Optional[Path] = None
        if self.burn_subtitles:
            sub_text = (item.script or "").strip() or _FUNCTION_LABELS.get(item.function, item.function)
            title = item.packaging.title_bar_text if item.packaging else None
            sub_png = tmp_dir / f"sub_{index:03d}.png"
            self._subtitle_png(sub_text, title, sub_png)

        inputs = list(src_input)
        if sub_png is not None:
            inputs += ["-i", str(sub_png)]
            video_filter = f"{self._base_video_filter()};[base][1:v]overlay=0:0,format=yuv420p[v]"
        else:
            video_filter = f"{self._base_video_filter()};[base]format=yuv420p[v]"

        # 完整 ffmpeg 补一条静音轨，保证成片有标准音频轨且各段一致；精简 ffmpeg 无 lavfi，省略音轨。
        if self.simple_mode:
            audio_maps = ["-an"]
            audio_codec: list[str] = []
        else:
            inputs += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            audio_index = 2 if sub_png is not None else 1
            audio_maps = ["-map", f"{audio_index}:a"]
            audio_codec = ["-c:a", "aac", "-ar", "44100", "-ac", "2"]

        self._run([
            self.ffmpeg_bin, "-nostdin", "-y", *inputs,
            "-filter_complex", video_filter,
            "-map", "[v]", *audio_maps,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", str(self.fps),
            *audio_codec,
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
        draw.rounded_rectangle([50, y0 - 28, width - 50, y0 + block_h + 18], radius=28, fill=(0, 0, 0, 150))
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

    def _base_video_filter(self) -> str:
        # 简化模式直接拉伸(兼容精简 ffmpeg)；
        # 完整模式使用“虚化铺满背景 + 前景等比显示”，避免横屏素材出现生硬黑边。
        if self.simple_mode:
            return f"[0:v]scale={self.width}:{self.height},setsar=1[base]"
        return (
            f"[0:v]split=2[bgsrc][fgsrc];"
            f"[bgsrc]scale={self.width}:{self.height}:force_original_aspect_ratio=increase,"
            f"crop={self.width}:{self.height},boxblur=24:2[bg];"
            f"[fgsrc]scale={self.width}:{self.height}:force_original_aspect_ratio=decrease[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[base]"
        )

    def _placeholder_image(
        self,
        tmp_dir: Path,
        item: TimelineItem,
        material: Optional[Material],
    ) -> Path:
        path = tmp_dir / f"placeholder_{item.target_segment_id}.png"
        if path.exists():
            return path

        if _PIL_OK and self.font_path is not None:
            generated = self._render_placeholder_card(path, item, material)
            if generated is not None:
                return generated

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

    def _render_placeholder_card(
        self,
        out_path: Path,
        item: TimelineItem,
        material: Optional[Material],
    ) -> Optional[Path]:
        if not _PIL_OK or self.font_path is None:
            return None

        width, height = self.width, self.height
        img = Image.new("RGB", (width, height), "#f5f7fb")
        draw = ImageDraw.Draw(img)
        title_font = ImageFont.truetype(self.font_path, 72)
        body_font = ImageFont.truetype(self.font_path, 46)
        chip_font = ImageFont.truetype(self.font_path, 32)
        note_font = ImageFont.truetype(self.font_path, 30)

        top = (12, 18, 36)
        bottom = (23, 47, 92)
        for y in range(height):
            blend = y / max(height - 1, 1)
            row_color = tuple(
                int(top[index] + (bottom[index] - top[index]) * blend)
                for index in range(3)
            )
            draw.line([(0, y), (width, y)], fill=row_color)

        panel = [82, 116, width - 82, height - 148]
        draw.rounded_rectangle(panel, radius=46, fill="#f8fbff", outline="#c7d2fe", width=3)

        label = _FUNCTION_LABELS.get(item.function, item.function)
        chip_text = "AIGC 补全卡" if item.completion_strategy == "aigc" else "结构占位卡"
        chip_width = draw.textlength(chip_text, font=chip_font)
        draw.rounded_rectangle(
            [126, 166, 126 + chip_width + 54, 226],
            radius=30,
            fill="#dbeafe",
        )
        draw.text((154, 178), chip_text, font=chip_font, fill="#1d4ed8")
        draw.text((126, 300), label, font=title_font, fill="#0f172a")

        script = (item.script or item.supplement_instruction or "").strip()
        if not script:
            script = "当前槽位暂无可直接使用的素材，先用这张画面卡保持结构完整。"
        lines = self._wrap_text(draw, script, body_font, width - 252, max_lines=6)
        y = 436
        for line in lines:
            draw.text((126, y), line, font=body_font, fill="#172033")
            ascent, descent = body_font.getmetrics()
            y += ascent + descent + 20

        status_text = f"状态：{item.slot_status}"
        source_text = (
            f"补全方式：{item.completion_strategy}"
            if material is None
            else f"来源：{material.file_name}"
        )
        draw.rounded_rectangle([126, height - 370, width - 126, height - 214], radius=30, fill="#e2e8f0")
        draw.text((158, height - 342), status_text, font=note_font, fill="#0f172a")
        draw.text((158, height - 290), source_text[:40], font=note_font, fill="#334155")
        img.save(out_path)
        return out_path

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
