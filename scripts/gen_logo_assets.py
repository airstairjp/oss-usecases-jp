#!/usr/bin/env python3
"""Generate OSS活用事例集 logo/favicon assets from concept 17 (green circle + rounded white star)."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

ROOT = Path("/root/oss-usecases-jp")
PUBLIC = ROOT / "public"
PUBLIC.mkdir(exist_ok=True)

GREEN = (11, 122, 90)  # #0b7a5a
WHITE = (255, 255, 255)

VB = 32
CX = CY = 16
CIRCLE_R = 15.2
STAR_OUTER = CIRCLE_R * 0.58
STAR_INNER = STAR_OUTER * 0.42
ROUNDNESS = 0.28


def star_points(cx, cy, outer, inner, n=5, rot_deg=-90):
    pts = []
    for i in range(n * 2):
        ang = math.radians(rot_deg + i * 180 / n)
        r = outer if i % 2 == 0 else inner
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return pts


def rounded_star_path(cx, cy, outer, inner, roundness=0.22, n=5, rot_deg=-90):
    verts = star_points(cx, cy, outer, inner, n, rot_deg)
    m = len(verts)
    cmds = []
    for i in range(m):
        prev = verts[(i - 1) % m]
        cur = verts[i]
        nxt = verts[(i + 1) % m]
        d0 = math.hypot(cur[0] - prev[0], cur[1] - prev[1]) or 1
        d1 = math.hypot(nxt[0] - cur[0], nxt[1] - cur[1]) or 1
        rfrac = roundness if i % 2 == 0 else roundness * 0.85
        t0 = min(rfrac, 0.45) * d0
        t1 = min(rfrac, 0.45) * d1
        ax = cur[0] - (cur[0] - prev[0]) / d0 * t0
        ay = cur[1] - (cur[1] - prev[1]) / d0 * t0
        bx = cur[0] + (nxt[0] - cur[0]) / d1 * t1
        by = cur[1] + (nxt[1] - cur[1]) / d1 * t1
        if i == 0:
            cmds.append(f"M {ax:.4f} {ay:.4f}")
        else:
            cmds.append(f"L {ax:.4f} {ay:.4f}")
        cmds.append(f"Q {cur[0]:.4f} {cur[1]:.4f} {bx:.4f} {by:.4f}")
    cmds.append("Z")
    return " ".join(cmds)


def sample_rounded_star(cx, cy, outer, inner, roundness, scale=1.0):
    verts = star_points(cx * scale, cy * scale, outer * scale, inner * scale)
    m = len(verts)
    pts = []
    for i in range(m):
        prev = verts[(i - 1) % m]
        cur = verts[i]
        nxt = verts[(i + 1) % m]
        d0 = math.hypot(cur[0] - prev[0], cur[1] - prev[1]) or 1
        d1 = math.hypot(nxt[0] - cur[0], nxt[1] - cur[1]) or 1
        rfrac = roundness if i % 2 == 0 else roundness * 0.85
        t0 = min(rfrac, 0.45) * d0
        t1 = min(rfrac, 0.45) * d1
        ax = cur[0] - (cur[0] - prev[0]) / d0 * t0
        ay = cur[1] - (cur[1] - prev[1]) / d0 * t0
        bx = cur[0] + (nxt[0] - cur[0]) / d1 * t1
        by = cur[1] + (nxt[1] - cur[1]) / d1 * t1
        for t in range(0, 16):
            u = t / 16
            x = (1 - u) ** 2 * ax + 2 * (1 - u) * u * cur[0] + u ** 2 * bx
            y = (1 - u) ** 2 * ay + 2 * (1 - u) * u * cur[1] + u ** 2 * by
            pts.append((x, y))
    return pts


path_d = rounded_star_path(CX, CY, STAR_OUTER, STAR_INNER, ROUNDNESS)
svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB} {VB}" role="img" aria-label="OSS活用事例集">
  <circle cx="{CX}" cy="{CY}" r="{CIRCLE_R}" fill="#0b7a5a"/>
  <path fill="#ffffff" d="{path_d}"/>
</svg>
"""
(PUBLIC / "favicon.svg").write_text(svg, encoding="utf-8")
print("wrote favicon.svg")


def render(size: int) -> Image.Image:
    hi = max(size * 4, 256)
    himg = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    hd = ImageDraw.Draw(himg)
    s = hi / VB
    pad_h = (VB / 2 - CIRCLE_R) * s
    hd.ellipse((pad_h, pad_h, hi - pad_h, hi - pad_h), fill=GREEN + (255,))
    pts = sample_rounded_star(CX, CY, STAR_OUTER, STAR_INNER, ROUNDNESS, scale=s)
    hd.polygon(pts, fill=WHITE + (255,))
    return himg.resize((size, size), Image.Resampling.LANCZOS)


for name, sz in {
    "favicon-16.png": 16,
    "favicon-32.png": 32,
    "favicon-48.png": 48,
    "apple-touch-icon.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "logo.png": 512,
}.items():
    im = render(sz)
    if name == "apple-touch-icon.png":
        bg = Image.new("RGBA", im.size, GREEN + (255,))
        bg.alpha_composite(im)
        im = bg
    im.save(PUBLIC / name, "PNG")
    print("wrote", name)

ico_imgs = [render(s) for s in (16, 32, 48)]
# Pillow ICO: save largest with sizes= list by writing via append
ico_imgs[2].save(
    PUBLIC / "favicon.ico",
    format="ICO",
    sizes=[(48, 48), (32, 32), (16, 16)],
    append_images=[ico_imgs[1], ico_imgs[0]],
)
print("wrote favicon.ico")

px16 = render(16)
whiteish = sum(1 for p in px16.getdata() if p[0] > 200 and p[1] > 200 and p[2] > 200 and p[3] > 200)
greenish = sum(1 for p in px16.getdata() if p[1] > p[0] + 30 and p[3] > 200)
print(f"16px check: whiteish={whiteish} greenish={greenish}")
assert whiteish >= 8, "star too small at 16px"
print("ok")
