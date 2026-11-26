"""Build the marketing pages' social cards (1200x630 PNGs in public/).

Each card is an HTML page in the homepage's system: warm paper, near-black
ink, Familjen Grotesk over Figtree, the Unbounded wordmark, one orange accent
on the headline's last words, and warm-grey ordered-dither art drawn on a
canvas by the same scene the homepage uses (src/components/landing/Dither.tsx).
Headless Chrome renders each page and screenshots it.

    python3 scripts/build-social-cards.py

Needs a Chrome or Chromium binary: set CHROME=/path/to/chrome, or let it find
google-chrome, chromium or Playwright's. Fonts come from Google Fonts, so it
needs the network.
"""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
W, H = 1200, 630

FONTS = (
    "https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600"
    "&family=Figtree:wght@400;500;600&family=Unbounded:wght@800"
    "&family=JetBrains+Mono:wght@400;500&display=block"
)

BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#f3f0ed;color:#121212;font-family:Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased;position:relative}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(18,18,18,.09) 1px,transparent 1.2px);background-size:24px 24px;
  -webkit-mask-image:linear-gradient(180deg,#000,transparent 70%);mask-image:linear-gradient(180deg,#000,transparent 70%)}
.brand{position:absolute;left:72px;top:56px;display:flex;align-items:center;gap:14px;font:800 26px Unbounded,sans-serif;letter-spacing:-.03em}
.mark{width:40px;height:40px;border-radius:12px;background:#121212;position:relative;overflow:hidden}
.mark::after{content:"";position:absolute;inset:11px 9px;border-radius:50%;border:4px solid #f3f0ed;border-left-color:transparent;border-right-color:transparent}
.url{position:absolute;right:72px;top:66px;font:500 17px "JetBrains Mono",monospace;color:#6b6560}
h1{position:absolute;left:72px;top:136px;font:500 74px/0.98 "Familjen Grotesk",sans-serif;letter-spacing:-.045em}
h1 em{font-style:normal;color:#e2522c;font-family:Unbounded,sans-serif;font-weight:800;letter-spacing:-.05em;font-size:.88em}
.facts{position:absolute;left:72px;display:flex;gap:10px;flex-wrap:wrap}
.facts span{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:10px;background:rgba(18,18,18,.05);
  border:1px solid #e6e1dc;font:500 18px Figtree,sans-serif;color:#333}
.facts span::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.facts span.ink{background:#121212;color:#f3f0ed;border-color:transparent}
canvas{position:absolute;left:0;right:0;bottom:0;width:1200px;image-rendering:pixelated}
.bub{position:absolute;z-index:2;padding:12px 18px;border-radius:20px 20px 20px 7px;background:#f3f0ed;border:1px solid #d9d3cd;
  font:500 19px Figtree,sans-serif;white-space:nowrap;box-shadow:0 12px 30px -12px rgba(18,18,18,.3)}
.bub.done{background:#121212;color:#f3f0ed;border-color:transparent;border-radius:20px 20px 7px 20px}
"""

# The homepage's hero scene, in its warm greys (homepage.css --art-* tokens).
DITHER_JS = """
const BAYER=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21].map(v=>(v+.5)/64);
const hx=h=>{const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]};
const P={ground:hx('#f3f0ed'),violet:hx('#8a837c'),orange:hx('#9d968f'),gold:hx('#b3aca5'),pink:hx('#c9c2bb'),lavender:hx('#e0dad4')};
const ss=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
const hash=(x,y)=>((Math.sin(x*12.9898+y*78.233)*43758.5453)%1+1)%1;
function hero(u,v){const fade=ss(.05,.62,v)*(1-.75*ss(.8,1,v));
 const r1=.42+.1*Math.sin(u*5.2+.6)+.05*Math.sin(u*13.1),r2=.6+.08*Math.sin(u*3.4+2.1)+.04*Math.sin(u*9.7+1),r3=.76+.06*Math.sin(u*6.3+4.2);
 const sun=Math.hypot((u-.8)*2.6,(v-.3)*1.3);
 if(sun<.2&&v<r1)return[P.ground,P.gold,ss(.2,.02,sun)*.7];
 if(v>r3)return[P.ground,P.violet,fade*.55];
 const n2=hash(u*700,v*600);
 if(v>r2)return[P.ground,(u+(n2-.5)*.5)<.5?P.orange:P.gold,fade*.62];
 if(v>r1)return[P.ground,P.pink,fade*.62];
 return[P.ground,P.lavender,fade*.55]}
for(const c of document.querySelectorAll('canvas')){const r=c.getBoundingClientRect(),w=Math.round(r.width/3),h=Math.round(r.height/3);
 c.width=w;c.height=h;const ctx=c.getContext('2d'),img=ctx.createImageData(w,h),d=img.data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const[a,b,t]=hero(x/w,y/h);const tt=Math.max(0,Math.min(1,t+(hash(x,y)-.5)*.22));
  const col=tt>BAYER[(y&7)*8+(x&7)]?b:a,i=(y*w+x)*4;d[i]=col[0];d[i+1]=col[1];d[i+2]=col[2];d[i+3]=255}
 ctx.putImageData(img,0,0)}
"""

CARDS = {
    "og-image.png": f"""
<div class="dots"></div>
<div class="brand"><span class="mark"></span>Get On A Pod</div>
<div class="url">getonapod.com</div>
<h1 style="max-width:1000px">Get booked on the podcasts<br>your buyers already <em>listen to.</em></h1>
<div class="facts" style="top:322px"><span>Done-for-you podcast guesting</span><span>You approve every show</span><span class="ink">5 clips from every episode</span></div>
<canvas style="height:220px"></canvas>
<span class="bub" style="left:96px;bottom:92px">Find the shows my buyers hear</span>
<span class="bub done" style="left:560px;bottom:128px">Recording booked ✓</span>
<span class="bub done" style="right:84px;bottom:58px">Prep brief sent ✓</span>
""",
    "platform-og.png": f"""
<div class="dots"></div>
<div class="brand"><span class="mark"></span>Get On A Pod</div>
<div class="url">getonapod.com/platform</div>
<h1 style="max-width:1000px">Book your clients on more<br>podcasts, <em>in less time.</em></h1>
<div class="facts" style="top:322px"><span>For podcast agencies</span><span>A client portal on your domain</span><span class="ink">Invite only</span></div>
<canvas style="height:220px"></canvas>
<span class="bub" style="left:96px;bottom:96px">Shortlist sent to the client</span>
<span class="bub done" style="left:540px;bottom:130px">Client approved 6 shows ✓</span>
<span class="bub done" style="right:84px;bottom:60px">Booked ✓</span>
""",
    "clips-og.png": """
<div class="dots"></div>
<div class="brand"><span class="mark"></span>Get On A Pod</div>
<div class="url">getonapod.com/clips</div>
<h1 style="top:146px;font-size:64px">Five clips from<br>your last episode.<br><em>Free. In 72 hours.</em></h1>
<div class="facts" style="top:388px"><span>AI-enabled human editors</span></div>
<div class="facts" style="top:436px"><span class="ink">5 clips · 2 thumbnails</span><span>$0 to try</span></div>
<div class="clips">
  <div class="clip" style="--r:-8deg;--y:34px"><i></i><b>NOBODY TELLS YOU THIS PART</b><small>The hook</small></div>
  <div class="clip" style="--r:-4deg;--y:10px"><i></i><b>THE ONE NUMBER THAT CHANGED OUR PRICING</b><small>The number</small></div>
  <div class="clip paper" style="--r:0deg;--y:0px"><i></i><b>WE ALMOST LOST THE WHOLE DEAL</b><small>The story</small></div>
  <div class="clip" style="--r:4deg;--y:10px"><i></i><b>STOP LISTING. START OWNING.</b><small>The take</small></div>
  <div class="clip" style="--r:8deg;--y:34px"><i></i><b>LINK IN BIO. GO.</b><small>The ask</small></div>
</div>
<style>
.clips{position:absolute;right:52px;top:172px;display:flex}
.clip{position:relative;width:104px;height:216px;margin-left:-4px;border-radius:18px;background:#151517;color:#f4f4f2;border:1px solid rgba(18,18,18,.2);
  transform:translateY(var(--y)) rotate(var(--r));box-shadow:0 24px 40px -18px rgba(18,18,18,.5);padding:14px 11px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px}
.clip:first-child{margin-left:0}
.clip.paper{background:#f3f0ed;color:#121212;z-index:2;border-color:#d9d3cd}
.clip i{position:absolute;left:50%;top:36%;transform:translate(-40%,-50%);border-left:16px solid currentColor;border-block:10px solid transparent;opacity:.85}
.clip b{font:600 12.5px/1.05 "Familjen Grotesk",sans-serif;letter-spacing:-.01em}
.clip small{font:500 10.5px "JetBrains Mono",monospace;opacity:.6;text-transform:uppercase}
</style>
<canvas style="height:120px"></canvas>
""",
}


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


def main() -> None:
    chrome = find_chrome()
    with tempfile.TemporaryDirectory() as tmp:
        for name, body in CARDS.items():
            page = Path(tmp) / f"{name}.html"
            page.write_text(
                f'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="{FONTS}">'
                f"<style>{BASE_CSS}</style></head><body>{body}"
                f"<script>document.fonts.ready.then(()=>{{{DITHER_JS}}})</script></body></html>"
            )
            subprocess.run(
                [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                 "--force-device-scale-factor=1", f"--window-size={W},{H}", "--virtual-time-budget=8000",
                 f"--screenshot={PUBLIC / name}", page.resolve().as_uri()],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            print("wrote", PUBLIC / name)


if __name__ == "__main__":
    main()
