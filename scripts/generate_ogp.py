#!/usr/bin/env python3
"""Build OGP images (1200x630) for oss-usecases-jp.

Site default + per-project. Pillow only. Skips when fingerprint unchanged.
Cache: <root>/.ogp-cache/  (gitignored). Output: <dist>/ogp/
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import sys
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (246, 247, 243)  # #f6f7f3
INK = (28, 31, 38)  # #1c1f26
SUB = (91, 97, 112)  # #5b6170
GREEN = (11, 122, 90)  # #0b7a5a
PAPER = (255, 255, 255)
LINE = (225, 228, 218)
WHITE = (255, 255, 255)
TEMPLATE_VER = "ogp-v1"

SERIF_BOLD = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"
SERIF_REG = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"
SANS_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
SANS_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
# Ubuntu Noto CJK: JP is typically index 0 for Sans; Serif TTC order varies — index 2 often JP.
# Common JP chars render on all faces; pin Sans=0, Serif=2 (fc-list JP order on Serif Bold).
SANS_IDX = 0
SERIF_IDX = 2


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size, index=index)


def load_fonts():
    return {
        "title": font(SERIF_BOLD, 64, SERIF_IDX),
        "title_sm": font(SERIF_BOLD, 52, SERIF_IDX),
        "title_xs": font(SERIF_BOLD, 42, SERIF_IDX),
        "name": font(SERIF_BOLD, 72, SERIF_IDX),
        "name_sm": font(SERIF_BOLD, 56, SERIF_IDX),
        "site": font(SANS_BOLD, 28, SANS_IDX),
        "eyebrow": font(SANS_BOLD, 22, SANS_IDX),
        "body": font(SANS_REG, 30, SANS_IDX),
        "body_sm": font(SANS_REG, 26, SANS_IDX),
        "meta": font(SANS_REG, 24, SANS_IDX),
        "chip": font(SANS_BOLD, 22, SANS_IDX),
        "repo": font(SANS_REG, 26, SANS_IDX),
    }


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_jp(draw, text: str, fnt, max_width: int, max_lines: int = 3) -> list[str]:
    text = re.sub(r"\s+", " ", str(text or "").strip())
    if not text:
        return []
    lines: list[str] = []
    buf = ""
    for ch in text:
        trial = buf + ch
        tw, _ = text_size(draw, trial, fnt)
        if tw <= max_width or not buf:
            buf = trial
            continue
        lines.append(buf)
        buf = ch
        if len(lines) >= max_lines:
            buf = ""
            break
    if buf and len(lines) < max_lines:
        lines.append(buf)
    consumed = sum(len(x) for x in lines)
    if consumed < len(text) and lines:
        last = lines[-1]
        while last and text_size(draw, last + "…", fnt)[0] > max_width:
            last = last[:-1]
        lines[-1] = (last + "…") if last else "…"
    return lines


def fmt_num(n) -> str:
    return f"{int(n):,}"


def star_logo(size: int = 64) -> Image.Image:
    """Green circle + rounded white 5-point star (concept 17)."""
    VB = 32
    CIRCLE_R = 15.2
    STAR_OUTER = CIRCLE_R * 0.58
    STAR_INNER = STAR_OUTER * 0.42
    ROUNDNESS = 0.28
    hi = max(size * 4, 256)
    himg = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    hd = ImageDraw.Draw(himg)
    s = hi / VB
    pad = (VB / 2 - CIRCLE_R) * s
    hd.ellipse((pad, pad, hi - pad, hi - pad), fill=GREEN + (255,))
    cx = cy = VB / 2 * s
    outer, inner = STAR_OUTER * s, STAR_INNER * s
    verts = []
    for i in range(10):
        ang = math.radians(-90 + i * 18)
        r = outer if i % 2 == 0 else inner
        verts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    pts = []
    m = len(verts)
    for i in range(m):
        prev, cur, nxt = verts[(i - 1) % m], verts[i], verts[(i + 1) % m]
        d0 = math.hypot(cur[0] - prev[0], cur[1] - prev[1]) or 1
        d1 = math.hypot(nxt[0] - cur[0], nxt[1] - cur[1]) or 1
        rfrac = ROUNDNESS if i % 2 == 0 else ROUNDNESS * 0.85
        t0 = min(rfrac, 0.45) * d0
        t1 = min(rfrac, 0.45) * d1
        ax = cur[0] - (cur[0] - prev[0]) / d0 * t0
        ay = cur[1] - (cur[1] - prev[1]) / d0 * t0
        bx = cur[0] + (nxt[0] - cur[0]) / d1 * t1
        by = cur[1] + (nxt[1] - cur[1]) / d1 * t1
        for t in range(16):
            u = t / 16
            x = (1 - u) ** 2 * ax + 2 * (1 - u) * u * cur[0] + u ** 2 * bx
            y = (1 - u) ** 2 * ay + 2 * (1 - u) * u * cur[1] + u ** 2 * by
            pts.append((x, y))
    hd.polygon(pts, fill=WHITE + (255,))
    return himg.resize((size, size), Image.Resampling.LANCZOS)


def fingerprint(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def save_png(img: Image.Image, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Flatten to RGB, optimize; aim ~100KB
    rgb = img.convert("RGB")
    tmp = path.with_suffix(".tmp.png")
    rgb.save(tmp, "PNG", optimize=True)
    # If still large, quantize
    if tmp.stat().st_size > 140_000:
        q = rgb.quantize(colors=64, method=Image.Quantize.MEDIANCUT)
        q.save(tmp, "PNG", optimize=True)
    tmp.replace(path)
    return path.stat().st_size


def draw_default(site: dict, count: int, fonts: dict) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # left accent bar
    d.rectangle((0, 0, 14, H), fill=GREEN)
    # soft paper card
    d.rounded_rectangle((56, 56, W - 56, H - 56), radius=28, fill=PAPER, outline=LINE, width=2)
    # logo + site name
    logo = star_logo(56)
    img.paste(logo, (96, 92), logo)
    d.text((168, 102), site["name"], font=fonts["site"], fill=GREEN)
    # eyebrow
    d.text((96, 180), "OPEN SOURCE USE CASES", font=fonts["eyebrow"], fill=SUB)
    # headline (2 lines like site hero)
    line1 = "OSSの実際の使われ方が"
    line2 = "一目でわかる事例集"
    d.text((96, 230), line1, font=fonts["title"], fill=INK)
    # underline accent on line2 like site em
    tw, th = text_size(d, line2, fonts["title"])
    y2 = 230 + 78
    d.rectangle((96, y2 + th - 8, 96 + tw, y2 + th + 4), fill=(11, 122, 90, 40))
    # emulate highlight: draw pale green rect then text
    highlight = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    hd.rectangle((96, y2 + th - 14, 96 + tw + 8, y2 + th + 2), fill=(11, 122, 90, 55))
    img = Image.alpha_composite(img.convert("RGBA"), highlight).convert("RGB")
    d = ImageDraw.Draw(img)
    d.text((96, y2), line2, font=fonts["title"], fill=INK)
    # count chip
    chip = f"掲載 {count} プロジェクト"
    cw, ch = text_size(d, chip, fonts["chip"])
    cx0, cy0 = 96, H - 140
    d.rounded_rectangle((cx0, cy0, cx0 + cw + 36, cy0 + ch + 24), radius=999, fill=GREEN)
    d.text((cx0 + 18, cy0 + 10), chip, font=fonts["chip"], fill=WHITE)
    # footer url
    d.text((96, H - 78), site.get("url", "").replace("https://", ""), font=fonts["meta"], fill=SUB)
    return img


def parse_color(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore


def draw_project(site: dict, p: dict, cat: dict, fonts: dict) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    accent = parse_color(cat.get("color") or "#0b7a5a")
    d.rectangle((0, 0, 14, H), fill=accent)
    d.rounded_rectangle((56, 56, W - 56, H - 56), radius=28, fill=PAPER, outline=LINE, width=2)
    # top brand
    logo = star_logo(44)
    img.paste(logo, (96, 84), logo)
    d.text((156, 92), site["name"], font=fonts["meta"], fill=GREEN)
    # category chip
    cat_name = cat.get("name") or ""
    cw, ch = text_size(d, cat_name, fonts["chip"])
    d.rounded_rectangle((96, 160, 96 + cw + 28, 160 + ch + 18), radius=10, fill=accent)
    d.text((110, 168), cat_name, font=fonts["chip"], fill=WHITE)
    # project name — pick font size by length
    name = str(p["name"])
    name_font = fonts["name"] if len(name) <= 18 else fonts["name_sm"]
    # wrap name if needed
    name_lines = wrap_jp(d, name, name_font, W - 200, max_lines=2)
    y = 220
    for ln in name_lines:
        d.text((96, y), ln, font=name_font, fill=INK)
        y += text_size(d, ln, name_font)[1] + 8
    # repo
    d.text((96, y + 6), f"github.com/{p['repo']}", font=fonts["repo"], fill=SUB)
    y += 48
    # tagline
    for ln in wrap_jp(d, p.get("tagline") or "", fonts["body"], W - 200, max_lines=2):
        d.text((96, y), ln, font=fonts["body"], fill=INK)
        y += 40
    # stars row
    stars = p.get("github") or {}
    star_n = stars.get("stars", 0)
    fetched = stars.get("fetchedAt")
    if hasattr(fetched, "isoformat"):
        fetched = fetched.isoformat()[:10]
    fetched = str(fetched)[:10] if fetched else ""
    star_line = f"★ {fmt_num(star_n)}"
    if fetched:
        star_line += f"　取得 {fetched}"
    d.text((96, H - 120), star_line, font=fonts["body_sm"], fill=GREEN)
    d.text((96, H - 78), site.get("url", "").replace("https://", ""), font=fonts["meta"], fill=SUB)
    return img


def load_data(root: Path):
    site = yaml.safe_load((root / "data/site.yaml").read_text(encoding="utf-8"))
    categories = yaml.safe_load((root / "data/categories.yaml").read_text(encoding="utf-8"))
    cat_map = {c["slug"]: c for c in categories}
    projects = []
    for f in sorted((root / "projects").glob("*.yaml")):
        p = yaml.safe_load(f.read_text(encoding="utf-8"))
        projects.append(p)
    return site, cat_map, projects


def ensure_cached(cache_dir: Path, key: str, fp: str, producer) -> tuple[Path, bool]:
    """Return (cached_png_path, regenerated)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    meta_path = cache_dir / f"{key}.fp"
    img_path = cache_dir / f"{key}.png"
    if img_path.exists() and meta_path.exists() and meta_path.read_text().strip() == fp:
        return img_path, False
    img = producer()
    size = save_png(img, img_path)
    meta_path.write_text(fp + "\n", encoding="utf-8")
    return img_path, True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="/root/oss-usecases-jp")
    ap.add_argument("--dist", default=None, help="dist dir (default: <root>/dist)")
    args = ap.parse_args()
    root = Path(args.root)
    dist = Path(args.dist) if args.dist else root / "dist"
    cache = root / ".ogp-cache"
    out = dist / "ogp"
    out.mkdir(parents=True, exist_ok=True)
    (out / "projects").mkdir(parents=True, exist_ok=True)

    site, cat_map, projects = load_data(root)
    fonts = load_fonts()

    # default
    def_payload = {
        "v": TEMPLATE_VER,
        "kind": "default",
        "name": site["name"],
        "url": site.get("url"),
        "count": len(projects),
        "catch": "OSSの実際の使われ方が一目でわかる事例集",
    }
    fp = fingerprint(def_payload)
    src, regen = ensure_cached(cache, "default", fp, lambda: draw_default(site, len(projects), fonts))
    shutil.copy2(src, out / "default.png")
    print(f"{'regen' if regen else 'cache '} default.png ({src.stat().st_size} bytes)")

    regen_n = 1 if regen else 0
    cache_n = 0 if regen else 1
    for p in projects:
        cat = cat_map.get(p["category"]) or {"name": p.get("category"), "color": "#0b7a5a"}
        gh = p.get("github") or {}
        fetched = gh.get("fetchedAt")
        if hasattr(fetched, "isoformat"):
            fetched = fetched.isoformat()[:10]
        payload = {
            "v": TEMPLATE_VER,
            "kind": "project",
            "slug": p["slug"],
            "name": p["name"],
            "repo": p["repo"],
            "tagline": p.get("tagline"),
            "category": cat.get("name"),
            "color": cat.get("color"),
            "stars": gh.get("stars"),
            "fetchedAt": str(fetched)[:10] if fetched else "",
            "site": site["name"],
        }
        fp = fingerprint(payload)
        key = f"project-{p['slug']}"
        src, regen = ensure_cached(
            cache, key, fp, lambda p=p, cat=cat: draw_project(site, p, cat, fonts)
        )
        shutil.copy2(src, out / "projects" / f"{p['slug']}.png")
        if regen:
            regen_n += 1
        else:
            cache_n += 1

    # prune orphan project caches? optional — skip to save time
    print(f"ogp done: {regen_n} regenerated, {cache_n} cached, {len(projects)} projects -> {out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise
