from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"

CREAM_TOP = (247, 242, 234, 255)
CREAM_BOTTOM = (241, 236, 229, 255)
INK = (13, 27, 42, 255)
INK_SOFT = (22, 42, 63, 255)
BRONZE = (180, 106, 60, 255)
BEIGE = (217, 198, 179, 255)
WHITE = (255, 255, 255, 255)
SAND = (246, 239, 231, 255)
MUTED = (122, 101, 84, 255)
PALE_BLUE = (220, 231, 245, 255)

FONT = {
    " ": ["00000"] * 7,
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
}


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def blend(base: tuple[int, int, int, int], overlay: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    alpha = overlay[3] / 255.0
    inverse = 1.0 - alpha
    return (
        round(overlay[0] * alpha + base[0] * inverse),
        round(overlay[1] * alpha + base[1] * inverse),
        round(overlay[2] * alpha + base[2] * inverse),
        255,
    )


class Canvas:
    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self.pixels = bytearray(width * height * 4)

    def set_pixel(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return
        offset = (y * self.width + x) * 4
        base = tuple(self.pixels[offset:offset + 4])  # type: ignore[arg-type]
        r, g, b, a = blend(base, color)
        self.pixels[offset:offset + 4] = bytes((r, g, b, a))

    def fill(self, color: tuple[int, int, int, int]) -> None:
        for y in range(self.height):
            for x in range(self.width):
                self.set_pixel(x, y, color)

    def vertical_gradient(self, top: tuple[int, int, int, int], bottom: tuple[int, int, int, int]) -> None:
        for y in range(self.height):
            t = y / max(1, self.height - 1)
            color = (
                lerp(top[0], bottom[0], t),
                lerp(top[1], bottom[1], t),
                lerp(top[2], bottom[2], t),
                255,
            )
            for x in range(self.width):
                offset = (y * self.width + x) * 4
                self.pixels[offset:offset + 4] = bytes(color)

    def rounded_rect(self, x: int, y: int, w: int, h: int, radius: int, color: tuple[int, int, int, int]) -> None:
        right = x + w
        bottom = y + h
        radius_sq = radius * radius

        for py in range(y, bottom):
            for px in range(x, right):
                inside = False

                if x + radius <= px < right - radius or y + radius <= py < bottom - radius:
                    inside = True
                else:
                    cx = x + radius if px < x + radius else right - radius - 1
                    cy = y + radius if py < y + radius else bottom - radius - 1
                    dx = px - cx
                    dy = py - cy
                    inside = dx * dx + dy * dy <= radius_sq

                if inside:
                    self.set_pixel(px, py, color)

    def border_rounded_rect(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        radius: int,
        thickness: int,
        color: tuple[int, int, int, int],
    ) -> None:
        self.rounded_rect(x, y, w, h, radius, color)
        self.rounded_rect(
            x + thickness,
            y + thickness,
            w - thickness * 2,
            h - thickness * 2,
            max(0, radius - thickness),
            (0, 0, 0, 0),
        )

    def circle(self, cx: int, cy: int, radius: int, color: tuple[int, int, int, int]) -> None:
        radius_sq = radius * radius
        for py in range(cy - radius, cy + radius + 1):
            for px in range(cx - radius, cx + radius + 1):
                dx = px - cx
                dy = py - cy
                if dx * dx + dy * dy <= radius_sq:
                    self.set_pixel(px, py, color)

    def radial_glow(
        self,
        cx: float,
        cy: float,
        radius: float,
        color: tuple[int, int, int, int],
        max_alpha: int,
    ) -> None:
        min_x = max(0, int(cx - radius))
        max_x = min(self.width, int(cx + radius) + 1)
        min_y = max(0, int(cy - radius))
        max_y = min(self.height, int(cy + radius) + 1)

        for py in range(min_y, max_y):
            for px in range(min_x, max_x):
                dx = px - cx
                dy = py - cy
                distance = math.sqrt(dx * dx + dy * dy)
                if distance > radius:
                    continue
                alpha = round(max_alpha * (1 - distance / radius))
                self.set_pixel(px, py, (color[0], color[1], color[2], alpha))

    def grid_overlay(self, step: int, color: tuple[int, int, int, int]) -> None:
        for x in range(0, self.width, step):
            for y in range(self.height):
                self.set_pixel(x, y, color)
        for y in range(0, self.height, step):
            for x in range(self.width):
                self.set_pixel(x, y, color)

    def write_png(self, path: Path) -> None:
        def chunk(tag: bytes, data: bytes) -> bytes:
            return (
                struct.pack("!I", len(data))
                + tag
                + data
                + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
            )

        raw = bytearray()
        row_length = self.width * 4
        for y in range(self.height):
            raw.append(0)
            start = y * row_length
            raw.extend(self.pixels[start:start + row_length])

        data = zlib.compress(bytes(raw), 9)
        png = bytearray()
        png.extend(b"\x89PNG\r\n\x1a\n")
        png.extend(chunk(b"IHDR", struct.pack("!2I5B", self.width, self.height, 8, 6, 0, 0, 0)))
        png.extend(chunk(b"IDAT", data))
        png.extend(chunk(b"IEND", b""))
        path.write_bytes(png)


def measure_text(text: str, scale: int, spacing: int) -> int:
    width = 0
    for index, char in enumerate(text):
        glyph = FONT[char]
        width += len(glyph[0]) * scale
        if index < len(text) - 1:
            width += spacing * scale
    return width


def draw_text(canvas: Canvas, x: int, y: int, text: str, scale: int, color: tuple[int, int, int, int], spacing: int = 1) -> None:
    cursor = x
    for char in text.upper():
        glyph = FONT[char]
        for row, line in enumerate(glyph):
            for col, bit in enumerate(line):
                if bit != "1":
                    continue
                for sy in range(scale):
                    for sx in range(scale):
                        canvas.set_pixel(cursor + col * scale + sx, y + row * scale + sy, color)
        cursor += len(glyph[0]) * scale + spacing * scale


def write_favicon_svg(path: Path) -> None:
    glyph = FONT["G"]
    scale = 18
    glyph_width = len(glyph[0]) * scale
    glyph_height = len(glyph) * scale
    start_x = 256 - glyph_width // 2
    start_y = 256 - glyph_height // 2
    rects: list[str] = []

    for row, line in enumerate(glyph):
        for col, bit in enumerate(line):
            if bit != "1":
                continue
            rects.append(
                f'<rect x="{start_x + col * scale}" y="{start_y + row * scale}" width="{scale}" height="{scale}" rx="5" fill="#F7FAFC" />'
            )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Get On A Pod icon">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#F7F2EA" />
      <stop offset="100%" stop-color="#F1ECE5" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#bg)" />
  <circle cx="412" cy="116" r="46" fill="#D9C6B3" opacity="0.72" />
  <rect x="84" y="84" width="344" height="344" rx="104" fill="#0D1B2A" />
  <rect x="108" y="108" width="296" height="296" rx="88" fill="none" stroke="#B46A3C" stroke-width="16" />
  <rect x="308" y="120" width="84" height="40" rx="20" fill="#B46A3C" />
  {''.join(rects)}
</svg>
"""
    path.write_text(svg, encoding="utf-8")


def render_icon(size: int) -> Canvas:
    canvas = Canvas(size, size)
    canvas.vertical_gradient(CREAM_TOP, CREAM_BOTTOM)
    canvas.radial_glow(size * 0.78, size * 0.22, size * 0.20, BEIGE, 90)

    outer_margin = round(size * 0.16)
    outer_size = size - outer_margin * 2
    canvas.rounded_rect(outer_margin, outer_margin, outer_size, outer_size, round(size * 0.19), INK)

    bronze_inset = round(size * 0.028)
    canvas.rounded_rect(
        outer_margin + bronze_inset,
        outer_margin + bronze_inset,
        outer_size - bronze_inset * 2,
        outer_size - bronze_inset * 2,
        round(size * 0.17),
        BRONZE,
    )

    inset = round(size * 0.06)
    canvas.rounded_rect(
        outer_margin + inset,
        outer_margin + inset,
        outer_size - inset * 2,
        outer_size - inset * 2,
        round(size * 0.16),
        INK_SOFT,
    )
    canvas.rounded_rect(outer_margin + round(size * 0.62), outer_margin + round(size * 0.06), round(size * 0.16), round(size * 0.08), round(size * 0.04), BRONZE)

    glyph_scale = max(2, size // 28)
    glyph_width = measure_text("G", glyph_scale, 0)
    glyph_height = 7 * glyph_scale
    start_x = size // 2 - glyph_width // 2
    start_y = size // 2 - glyph_height // 2 + glyph_scale
    draw_text(canvas, start_x, start_y, "G", glyph_scale, WHITE, spacing=0)

    return canvas


def render_og_image() -> Canvas:
    canvas = Canvas(1200, 630)
    canvas.vertical_gradient(CREAM_TOP, CREAM_BOTTOM)
    canvas.radial_glow(200, 90, 240, BRONZE, 36)
    canvas.radial_glow(1030, 120, 180, PALE_BLUE, 48)
    canvas.radial_glow(840, 540, 240, BEIGE, 40)
    canvas.grid_overlay(84, (13, 27, 42, 6))

    canvas.rounded_rect(74, 78, 620, 474, 42, INK)
    canvas.rounded_rect(108, 108, 124, 34, 17, BRONZE)
    draw_text(canvas, 128, 116, "GOAP", 4, WHITE)

    draw_text(canvas, 116, 182, "GET ON", 15, WHITE, spacing=2)
    draw_text(canvas, 116, 304, "A POD", 15, WHITE, spacing=2)
    draw_text(canvas, 120, 430, "PODCAST BOOKINGS", 7, (212, 176, 143, 255), spacing=2)

    canvas.rounded_rect(760, 84, 364, 462, 36, (255, 253, 249, 244))
    canvas.rounded_rect(792, 116, 156, 26, 13, (246, 239, 231, 255))
    canvas.rounded_rect(972, 116, 114, 26, 13, (255, 243, 232, 255))
    canvas.rounded_rect(792, 168, 300, 52, 18, WHITE)
    canvas.rounded_rect(792, 248, 300, 52, 18, WHITE)
    canvas.rounded_rect(792, 328, 300, 52, 18, WHITE)

    for y in (168, 248, 328):
        canvas.rounded_rect(818, y + 12, 132, 10, 5, (13, 27, 42, 255))
        canvas.rounded_rect(818, y + 30, 88, 8, 4, (122, 101, 84, 255))
        canvas.rounded_rect(972, y + 12, 48, 28, 14, (255, 243, 232, 255))
        canvas.rounded_rect(1036, y + 12, 28, 28, 14, BRONZE)

    canvas.rounded_rect(792, 420, 138, 88, 24, INK)
    canvas.rounded_rect(954, 420, 138, 88, 24, (19, 36, 54, 255))
    draw_text(canvas, 828, 452, "GOAP", 5, WHITE)
    draw_text(canvas, 990, 452, "GOAP", 5, (240, 221, 200, 255))

    return canvas


def write_manifest(path: Path) -> None:
    manifest = {
        "name": "Get On A Pod",
        "short_name": "GOAP",
        "description": "Podcast booking for experts with shortlist approvals, outreach visibility, and booking tracking.",
        "theme_color": "#0d1b2a",
        "background_color": "#f7f2ea",
        "display": "standalone",
        "start_url": "/",
        "icons": [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
        ],
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    write_favicon_svg(PUBLIC_DIR / "favicon.svg")
    write_manifest(PUBLIC_DIR / "site.webmanifest")

    for name, size in (
        ("favicon-16x16.png", 16),
        ("favicon-32x32.png", 32),
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
    ):
        render_icon(size).write_png(PUBLIC_DIR / name)

    render_og_image().write_png(PUBLIC_DIR / "og-image.png")


if __name__ == "__main__":
    main()
