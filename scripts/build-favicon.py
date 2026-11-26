"""Build the favicon set from the site's mark.

The mark is the one the homepage, the inner pages and the sign-in pages draw
in CSS (.hp-mark, .dfy-brand-mark, .gp-mark-dot): a near-black rounded square
with a microphone's grille, two paper arcs above and below its centre. Here
it is pure SVG geometry, so public/favicon.svg renders the same everywhere.

The PNGs are rasterised from that SVG by headless Chrome, and the .ico is an
ICO container around the 16, 32 and 48 px PNGs. The touch icons (Apple, and
the manifest's 192/512) are full-bleed squares: the platforms round them.

    python3 scripts/build-favicon.py

Then bump the ?v= query on the icon links in index.html and the manifest, so
browsers and the CDN fetch the new files.

Needs a Chrome or Chromium binary: set CHROME=/path/to/chrome, or let it find
google-chrome, chromium or Playwright's.
"""
from __future__ import annotations

import glob
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
INK, PAPER = "#121212", "#f3f0ed"
SIZE = 512


def find_chrome() -> str:
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    for name in ("google-chrome", "chromium", "chromium-browser"):
        if shutil.which(name):
            return shutil.which(name)
    found = sorted(glob.glob(str(Path.home() / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
    if not found:
        sys.exit("No Chrome found: set CHROME=/path/to/chrome")
    return found[-1]


def arc(cx: float, cy: float, rx: float, ry: float, start: float, end: float) -> str:
    """An elliptical arc as an SVG path, angles in degrees (y down: 270 is the top)."""
    a, b = math.radians(start), math.radians(end)
    x1, y1 = cx + rx * math.cos(a), cy + ry * math.sin(a)
    x2, y2 = cx + rx * math.cos(b), cy + ry * math.sin(b)
    return f"M{x1:.1f} {y1:.1f}A{rx:.1f} {ry:.1f} 0 0 1 {x2:.1f} {y2:.1f}"


def mark_svg(rounded: bool) -> str:
    # The CSS mark is a 26px square with an 8px radius and a 2.5px ring inset
    # 7px top and bottom, 6px left and right, its sides transparent. Scaled to
    # 512 and drawn as the two visible arcs of that ring's centre line.
    k = SIZE / 26
    stroke = 2.5 * k
    rx = (26 - 12) / 2 * k - stroke / 2
    ry = (26 - 14) / 2 * k - stroke / 2
    c = SIZE / 2
    radius = 8 * k if rounded else 0
    top, bottom = arc(c, c, rx, ry, 222, 318), arc(c, c, rx, ry, 42, 138)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="Get On A Pod">\n'
        "  <!-- The site's mark: an ink square with a microphone's grille. Built by\n"
        "       scripts/build-favicon.py; edit that, not this file. -->\n"
        f'  <rect width="{SIZE}" height="{SIZE}" rx="{radius:.0f}" fill="{INK}"/>\n'
        f'  <path d="{top} {bottom}" fill="none" stroke="{PAPER}" stroke-width="{stroke:.1f}"/>\n'
        "</svg>\n"
    )


def rasterise(chrome: str, svg: Path, size: int, out: Path, work: Path) -> None:
    page = work / f"r{size}-{out.stem}.html"
    page.write_text(
        '<!doctype html><html><body style="margin:0;background:transparent">'
        f'<img src="{svg.resolve().as_uri()}" style="display:block;width:{size}px;height:{size}px"></body></html>'
    )
    subprocess.run(
        [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         "--default-background-color=00000000", "--force-device-scale-factor=1",
         f"--window-size={size},{size}", f"--screenshot={out}", page.resolve().as_uri()],
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
        svg = PUBLIC / "favicon.svg"
        svg.write_text(mark_svg(rounded=True))
        square = work / "square.svg"
        square.write_text(mark_svg(rounded=False))
        tab = {16: PUBLIC / "favicon-16x16.png", 32: PUBLIC / "favicon-32x32.png", 48: work / "favicon-48x48.png"}
        touch = {180: PUBLIC / "apple-touch-icon.png", 192: PUBLIC / "icon-192.png", 512: PUBLIC / "icon-512.png"}
        for size, out in tab.items():
            rasterise(chrome, svg, size, out, work)
        for size, out in touch.items():
            rasterise(chrome, square, size, out, work)
        write_ico([(s, tab[s]) for s in (16, 32, 48)], PUBLIC / "favicon.ico")
    print("favicon set written to", PUBLIC)


if __name__ == "__main__":
    main()
