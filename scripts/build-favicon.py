"""Build the favicon set from the brand's monogram plate.

The mark is option 1c of the design project's Logo Options: a gold-ruled
square on the warm ground with an italic Cormorant Garamond G in the deep
accent — the same plate the homepage mats its images in.

The G is read straight out of the font's glyf table, so public/favicon.svg
carries the outline itself and renders identically with no font installed.
The PNGs are rasterised from that one SVG by headless Chromium, and the .ico
is an ICO container around the 16, 32 and 48 px PNGs.

    python3 scripts/build-favicon.py

Needs curl (to fetch the font from google/fonts the first time) and a
Chromium binary: set CHROME=/path/to/chrome, or let it find Playwright's.
"""
from __future__ import annotations

import glob
import os
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
FONT_URL = (
    "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/"
    "CormorantGaramond-Italic%5Bwght%5D.ttf"
)
GROUND, RULE, INK = "#f3f2f2", "#b68235", "#7d5411"
SIZE = 512


def find_chrome() -> str:
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    found = sorted(glob.glob(str(Path.home() / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
    if not found:
        sys.exit("No Chromium found: set CHROME=/path/to/chrome")
    return found[-1]


def fetch_font(into: Path) -> Path:
    font = into / "CormorantGaramond-Italic.ttf"
    if not font.exists():
        subprocess.run(["curl", "-sL", "--max-time", "60", "-o", str(font), FONT_URL], check=True)
    return font


def glyph_path(font: Path, char: str) -> tuple[str, int, int, int, int]:
    """The character's outline as an SVG path in font units (y up), and its bbox."""
    data = font.read_bytes()

    def u16(o: int) -> int:
        return struct.unpack(">H", data[o:o + 2])[0]

    def i16(o: int) -> int:
        return struct.unpack(">h", data[o:o + 2])[0]

    def u32(o: int) -> int:
        return struct.unpack(">I", data[o:o + 4])[0]

    tables: dict[str, tuple[int, int]] = {}
    for i in range(u16(4)):
        rec = 12 + 16 * i
        tables[data[rec:rec + 4].decode("latin1")] = (u32(rec + 8), u32(rec + 12))

    index_to_loc = i16(tables["head"][0] + 50)

    # cmap format 4 → glyph id
    cmap = tables["cmap"][0]
    code = ord(char)
    gid = 0
    for i in range(u16(cmap + 2)):
        rec = cmap + 4 + 8 * i
        plat, enc, off = u16(rec), u16(rec + 2), u32(rec + 4)
        sub = cmap + off
        if u16(sub) != 4 or not (plat == 3 and enc == 1 or plat == 0):
            continue
        seg2 = u16(sub + 6)
        end, start = sub + 14, sub + 16 + seg2
        delta, rng = start + seg2, start + 2 * seg2
        for s in range(seg2 // 2):
            if u16(start + 2 * s) <= code <= u16(end + 2 * s):
                d, ro = i16(delta + 2 * s), u16(rng + 2 * s)
                if ro == 0:
                    gid = (code + d) & 0xFFFF
                else:
                    g = u16(rng + 2 * s + ro + 2 * (code - u16(start + 2 * s)))
                    gid = (g + d) & 0xFFFF if g else 0
                break
        if gid:
            break
    if not gid:
        sys.exit(f"no glyph for {char!r}")

    loca = tables["loca"][0]
    if index_to_loc == 0:
        g_off = u16(loca + 2 * gid) * 2
    else:
        g_off = u32(loca + 4 * gid)
    glyf = tables["glyf"][0] + g_off
    n_contours = i16(glyf)
    if n_contours <= 0:
        sys.exit(f"{char!r} is a composite glyph; this reader only handles simple outlines")
    p = glyf + 10
    ends = [u16(p + 2 * i) for i in range(n_contours)]
    p += 2 * n_contours
    n_pts = ends[-1] + 1
    p += 2 + u16(p)  # instructions
    flags: list[int] = []
    while len(flags) < n_pts:
        f = data[p]
        p += 1
        flags.append(f)
        if f & 8:
            flags.extend([f] * data[p])
            p += 1
    xs: list[int] = []
    ys: list[int] = []
    v = 0
    for f in flags:
        if f & 2:
            v += data[p] if f & 16 else -data[p]
            p += 1
        elif not f & 16:
            v += i16(p)
            p += 2
        xs.append(v)
    v = 0
    for f in flags:
        if f & 4:
            v += data[p] if f & 32 else -data[p]
            p += 1
        elif not f & 32:
            v += i16(p)
            p += 2
        ys.append(v)
    pts = list(zip(xs, ys, [bool(f & 1) for f in flags]))

    def contour(c: list[tuple[int, int, bool]]) -> str:
        # Start on an on-curve point; TrueType implies one between two off-curve points.
        if not any(on for _, _, on in c):
            c = [((c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2, True)] + c[1:] + [c[0]]
        else:
            k = next(i for i, (_, _, on) in enumerate(c) if on)
            c = c[k:] + c[:k]
        out = [f"M{c[0][0]} {c[0][1]}"]
        ctrl = None
        for x, y, on in c[1:] + [c[0]]:
            if on:
                out.append(f"Q{ctrl[0]} {ctrl[1]} {x} {y}" if ctrl else f"L{x} {y}")
                ctrl = None
            else:
                if ctrl:
                    out.append(f"Q{ctrl[0]} {ctrl[1]} {(ctrl[0] + x) / 2} {(ctrl[1] + y) / 2}")
                ctrl = (x, y)
        out.append("Z")
        return "".join(out)

    contours, start = [], 0
    for e in ends:
        contours.append(pts[start:e + 1])
        start = e + 1
    return "".join(contour(c) for c in contours), min(xs), min(ys), max(xs), max(ys)


def write_svg(font: Path, out: Path) -> None:
    d, xmin, ymin, xmax, ymax = glyph_path(font, "G")
    gw, gh = xmax - xmin, ymax - ymin
    # The G fills 56% of the plate, centred, nudged up a hair like the design.
    scale = 0.56 * SIZE / gh
    tx = (SIZE - gw * scale) / 2 - xmin * scale
    ty = (SIZE + gh * scale) / 2 - 8 + ymin * scale
    out.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="Get On A Pod">\n'
        "  <!-- The monogram plate from the brand's Logo Options: a gold-ruled square on\n"
        "       the warm ground, with an italic Cormorant Garamond G. The G is the font's\n"
        "       own outline, so this renders the same with no font installed. -->\n"
        f'  <rect width="{SIZE}" height="{SIZE}" fill="{GROUND}"/>\n'
        f'  <rect x="44" y="44" width="{SIZE - 88}" height="{SIZE - 88}" fill="none" stroke="{RULE}" stroke-width="24"/>\n'
        f'  <path fill="{INK}" transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f} {-scale:.5f})" d="{d}"/>\n'
        "</svg>\n"
    )


def rasterise(chrome: str, svg: Path, size: int, out: Path, work: Path) -> None:
    page = work / f"r{size}.html"
    page.write_text(
        f'<!doctype html><html><body style="margin:0;background:{GROUND}">'
        f'<img src="{svg.resolve().as_uri()}" style="display:block;width:{size}px;height:{size}px"></body></html>'
    )
    subprocess.run(
        [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=1", f"--window-size={size},{size}",
         f"--screenshot={out}", page.resolve().as_uri()],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def write_ico(pngs: list[tuple[int, Path]], out: Path) -> None:
    blobs = [(s, p.read_bytes()) for s, p in pngs]
    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    entries = b""
    for s, b in blobs:
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(b), offset)
        offset += len(b)
    out.write_bytes(header + entries + b"".join(b for _, b in blobs))


def main() -> None:
    chrome = find_chrome()
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        font = fetch_font(work)
        svg = PUBLIC / "favicon.svg"
        write_svg(font, svg)
        targets = {
            16: PUBLIC / "favicon-16x16.png",
            32: PUBLIC / "favicon-32x32.png",
            48: work / "favicon-48x48.png",
            180: PUBLIC / "apple-touch-icon.png",
            192: PUBLIC / "icon-192.png",
            512: PUBLIC / "icon-512.png",
        }
        for size, out in targets.items():
            rasterise(chrome, svg, size, out, work)
        write_ico([(s, targets[s]) for s in (16, 32, 48)], PUBLIC / "favicon.ico")
    print("favicon set written to", PUBLIC)


if __name__ == "__main__":
    main()
