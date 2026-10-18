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
TEMPLATE_VER = "ogp-v2"

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


def star_logo(size: int = 64) -> Image.Image:
    """Green circle + rounded white 5-point star — same geometry as favicon.svg."""
    VB = 32
    CIRCLE_R = 15.2
    STAR_OUTER = CIRCLE_R * 0.58
    STAR_INNER = STAR_OUTER * 0.42
    ROUNDNESS = 0.28
    hi = max(size * 8, 512)
    himg = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    hd = ImageDraw.Draw(himg)
    s = hi / VB
    pad = (VB / 2 - CIRCLE_R) * s
    hd.ellipse((pad, pad, hi - pad, hi - pad), fill=GREEN + (255,))
    cx = cy = VB / 2 * s
    outer, inner = STAR_OUTER * s, STAR_INNER * s
    verts = []
    for i in range(10):
        ang = math.radians(-90 + i * 36)  # 10 vertices, 36° apart
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
        for k in range(17):
            u = k / 16
            pts.append(((1 - u) ** 2 * ax + 2 * (1 - u) * u * cur[0] + u ** 2 * bx,
                        (1 - u) ** 2 * ay + 2 * (1 - u) * u * cur[1] + u ** 2 * by))
    hd.polygon(pts, fill=WHITE + (255,))
    return himg.resize((size, size), Image.Resampling.LANCZOS)


CARD = (56, 56, W - 56, H - 56)
PADX = 104  # left text x inside card
RIGHT = W - 104


def put(d, x, y, text, fnt, fill):
    """Draw text with its visual top at y; return visual bottom."""
    bb = d.textbbox((x, y), text, font=fnt)
    off = bb[1] - y
    d.text((x, y - off), text, font=fnt, fill=fill)
    return y + (bb[3] - bb[1])


def pill(d, x, y, text, fnt, bg, fg, padx=20, pady=12, radius=None):
    bb = d.textbbox((0, 0), text, font=fnt)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    w, h = tw + padx * 2, th + pady * 2
    r = radius if radius is not None else h // 2
    d.rounded_rectangle((x, y, x + w, y + h), radius=r, fill=bg)
    d.text((x + padx - bb[0], y + pady - bb[1]), text, font=fnt, fill=fg)
    return x + w, y + h


def base_canvas(accent):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 14, H), fill=accent)
    d.rounded_rectangle(CARD, radius=28, fill=PAPER, outline=LINE, width=2)
    return img, d


def brand_row(img, d, site, logo_size, fnt, y):
    logo = star_logo(logo_size)
    img.paste(logo, (PADX, y), logo)
    bb = d.textbbox((0, 0), site["name"], font=fnt)
    th = bb[3] - bb[1]
    put(d, PADX + logo_size + 16, y + (logo_size - th) // 2, site["name"], fnt, GREEN)
    return y + logo_size


def footer_url(d, site, fnt):
    url = site.get("url", "").replace("https://", "")
    bb = d.textbbox((0, 0), url, font=fnt)
    th = bb[3] - bb[1]
    y = CARD[3] - 36 - th
    put(d, PADX, y, url, fnt, SUB)
    return y


def fit_font(d, text, path, idx, sizes, max_w):
    for s in sizes:
        f = font(path, s, idx)
        if d.textlength(text, font=f) <= max_w:
            return f, False
    return font(path, sizes[-1], idx), True


def ellipsize(d, text, fnt, max_w):
    if d.textlength(text, font=fnt) <= max_w:
        return text
    while text and d.textlength(text + "…", font=fnt) > max_w:
        text = text[:-1]
    return text + "…"


def draw_default(site: dict, count: int, fonts: dict) -> Image.Image:
    img, d = base_canvas(GREEN)
    y = brand_row(img, d, site, 56, fonts["site"], 96)
    y = put(d, PADX, y + 40, "OPEN SOURCE USE CASES", fonts["eyebrow"], SUB)
    title = fonts["title"]
    y = put(d, PADX, y + 30, "OSSの実際の使われ方が", title, INK)
    # line 2 with pale marker band under lower 40% (drawn before text)
    line2 = "一目でわかる事例集"
    y2 = y + 22
    bb = d.textbbox((PADX, y2), line2, font=title)
    gh = bb[3] - bb[1]
    over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(over).rectangle((bb[0] - 4, y2 + int(gh * 0.62), bb[2] + 4, y2 + gh + 6), fill=GREEN + (48,))
    img = Image.alpha_composite(img.convert("RGBA"), over).convert("RGB")
    d = ImageDraw.Draw(img)
    put(d, PADX, y2, line2, title, INK)
    url_y = footer_url(d, site, fonts["meta"])
    chip = f"掲載 {count} プロジェクト"
    bbc = d.textbbox((0, 0), chip, font=fonts["chip"])
    ch = (bbc[3] - bbc[1]) + 28
    pill(d, PADX, url_y - 24 - ch, chip, fonts["chip"], GREEN, WHITE, padx=24, pady=14, radius=14)
    return img


def parse_color(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore


def draw_project(site: dict, p: dict, cat: dict, fonts: dict) -> Image.Image:
    accent = parse_color(cat.get("color") or "#0b7a5a")
    img, d = base_canvas(accent)
    maxw = RIGHT - PADX
    top = brand_row(img, d, site, 44, fonts["meta"], 88)
    # category badge
    _, y = pill(d, PADX, top + 26, ellipsize(d, cat.get("name") or "", fonts["chip"], maxw - 40), fonts["chip"], accent, WHITE, padx=16, pady=9, radius=10)
    # name: shrink then ellipsize, one line
    name = str(p["name"])
    nf, over = fit_font(d, name, SERIF_BOLD, SERIF_IDX, [76, 68, 60, 52, 46] if len(name) <= 12 else [60, 54, 48, 44], maxw)
    if over:
        name = ellipsize(d, name, nf, maxw)
    y = put(d, PADX, y + 30, name, nf, INK)
    y = put(d, PADX, y + 16, ellipsize(d, f"github.com/{p['repo']}", fonts["repo"], maxw), fonts["repo"], SUB)
    # footer stack from bottom
    url_y = footer_url(d, site, fonts["meta"])
    gh = p.get("github") or {}
    fetched = gh.get("fetchedAt")
    if hasattr(fetched, "isoformat"):
        fetched = fetched.isoformat()
    fetched = str(fetched)[:10] if fetched else ""
    star_line = f"★ {fmt_num(gh.get('stars', 0))}" + (f"   取得 {fetched}" if fetched else "")
    bbs = d.textbbox((0, 0), star_line, font=fonts["body_sm"])
    star_y = url_y - 16 - (bbs[3] - bbs[1])
    put(d, PADX, star_y, star_line, fonts["body_sm"], GREEN)
    # tagline between repo and star row: 2 lines body -> 2 lines small -> 1 line with ellipsis
    tag = p.get("tagline") or ""
    ty0, limit = y + 22, star_y - 22
    def block(fnt, n, gap):
        ls = wrap_jp(d, tag, fnt, maxw, max_lines=n)
        hs = [d.textbbox((0, 0), ln, font=fnt)[3] - d.textbbox((0, 0), ln, font=fnt)[1] for ln in ls]
        return ls, sum(hs) + gap * (len(ls) - 1)
    chosen = None
    for fnt, gap in ((fonts["body"], 14), (fonts["body_sm"], 10)):
        ls, h = block(fnt, 2, gap)
        if ty0 + h <= limit:
            chosen = (ls, fnt, gap)
            break
    if chosen is None:
        chosen = ([ellipsize(d, re.sub(r"\s+", " ", tag), fonts["body"], maxw)], fonts["body"], 0)
    ls, fnt, gap = chosen
    ty = ty0
    for ln in ls:
        ty = put(d, PADX, ty, ln, fnt, INK) + gap
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
