#!/usr/bin/env python3
"""OGP images (1200x630) for oss-usecases-jp — HTML template + headless Chromium (Playwright).

Same approach as the sister site agent-usecases-jp (HTML -> screenshot -> 256-color PNG).
Site default: dist/ogp/default.png / per project: dist/ogp/projects/<slug>.png
Unchanged content (fingerprint incl. TEMPLATE_VER) is reused from .ogp-cache/.
"""
from __future__ import annotations

import argparse, hashlib, html, json, re, shutil, sys
from pathlib import Path

import yaml
from PIL import Image

TEMPLATE_VER = "ogp-v3-html"
W, H = 1200, 630

STAR_D = None  # filled from public/favicon.svg

BASE_CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;color:#fff;-webkit-font-smoothing:antialiased;background:#0b7a5a;position:relative}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.13) 2px,transparent 2.5px);background-size:28px 28px}
.blob{position:absolute;right:-130px;bottom:-170px;width:640px;height:640px;border-radius:50%;background:#086b4e}
.blob2{position:absolute;left:-90px;top:-120px;width:300px;height:300px;border-radius:50%;background:#0d8964;opacity:.7}
.logo{display:block;border-radius:50%;background:#fff}
.pill{display:inline-flex;align-items:center;gap:18px;background:#123b30;color:#fff;border-radius:999px;font-weight:700}
"""


def logo_svg(px: int) -> str:
    return (f'<svg class="logo" width="{px}" height="{px}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">'
            f'<circle cx="16" cy="16" r="15.2" fill="#0b7a5a"/><path fill="#fff" d="{STAR_D}"/></svg>')


def page(body: str, css: str) -> str:
    return f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>{BASE_CSS}{css}</style></head><body><div class="dots"></div><div class="blob2"></div><div class="blob"></div>{body}</body></html>'


def html_default(site: dict, count: int) -> str:
    css = """
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.ring{border-radius:50%;background:#fff;padding:14px;box-shadow:0 22px 44px rgba(0,40,28,.35);margin-bottom:36px;line-height:0}
h1{font-size:74px;line-height:1.3;font-weight:700;letter-spacing:.01em;text-shadow:0 3px 0 rgba(0,50,35,.18)}
.pill{margin-top:34px;padding:13px 36px;font-size:32px;letter-spacing:.08em}
.pill span{font-size:21px;font-weight:400;letter-spacing:.03em;opacity:.88}
"""
    body = f"""<div class="wrap"><div class="ring">{logo_svg(136)}</div>
<h1>OSSの実際の使われ方が<br>一目でわかる事例集</h1>
<div class="pill">{html.escape(site['name'])}<span>{count}件のOSSを活用事例つきで紹介</span></div></div>"""
    return page(body, css)


def html_project(site: dict, p: dict, cat: dict, fetched: str) -> str:
    color = cat.get("color") or "#0b7a5a"
    css = f"""
.top{{position:absolute;left:72px;top:58px;display:flex;align-items:center;gap:18px}}
.top .ring{{border-radius:50%;background:#fff;padding:6px;box-shadow:0 10px 24px rgba(0,40,28,.3);line-height:0}}
.top b{{font-size:30px;letter-spacing:.06em;text-shadow:0 2px 0 rgba(0,50,35,.18)}}
.cat{{position:absolute;right:72px;top:66px;background:#fff;color:{color};border-radius:999px;padding:9px 24px;font-size:24px;font-weight:700;letter-spacing:.04em;box-shadow:0 8px 20px rgba(0,40,28,.25);display:flex;align-items:center;gap:10px}}
.cat i{{width:14px;height:14px;border-radius:50%;background:{color};display:block}}
.main{{position:absolute;left:72px;right:72px;top:168px}}
.name{{font-size:96px;line-height:1.1;font-weight:700;white-space:nowrap;letter-spacing:.005em;text-shadow:0 4px 0 rgba(0,50,35,.18)}}
.repo{{margin-top:22px;font-family:ui-monospace,"DejaVu Sans Mono",monospace;font-size:28px;opacity:.82}}
.tag{{margin-top:26px;font-size:36px;line-height:1.5;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:1010px}}
.foot{{position:absolute;left:72px;bottom:56px;display:flex;align-items:center;gap:16px}}
.pill{{padding:12px 30px;font-size:30px;letter-spacing:.04em}}
.pill span{{font-size:20px;font-weight:400;opacity:.85}}
.url{{font-size:22px;opacity:.85;letter-spacing:.03em}}
"""
    body = f"""<div class="top"><div class="ring">{logo_svg(52)}</div><b>{html.escape(site['name'])}</b></div>
<div class="cat"><i></i>{html.escape(cat.get('name') or '')}</div>
<div class="main"><div class="name" id="nm">{html.escape(str(p['name']))}</div>
<div class="repo">github.com/{html.escape(p['repo'])}</div>
<div class="tag">{html.escape(re.sub(r'\\s+', ' ', str(p.get('tagline') or '')))}</div></div>
<div class="foot"><div class="pill">★ {int((p.get('github') or {}).get('stars', 0)):,}<span>GitHubスター・{fetched} 取得</span></div>
<div class="url">{html.escape(site.get('url','').replace('https://',''))}</div></div>
<script>(()=>{{const n=document.getElementById('nm');let s=96;while(n.scrollWidth>1056&&s>44){{s-=4;n.style.fontSize=s+'px'}}
if(n.scrollWidth>1056){{let t=n.textContent;while(n.scrollWidth>1056&&t.length>1){{t=t.slice(0,-1);n.textContent=t+'…'}}}}}})()</script>"""
    return page(body, css)


def fingerprint(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def date10(v) -> str:
    if hasattr(v, "isoformat"):
        v = v.isoformat()
    return str(v)[:10] if v else ""


def main():
    global STAR_D
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--dist", default=None)
    ap.add_argument("--only", nargs="*", help="render only these keys (default / slug) to --dist, ignoring cache")
    a = ap.parse_args()
    root = Path(a.root); dist = Path(a.dist) if a.dist else root / "dist"
    cache = root / ".ogp-cache"; cache.mkdir(exist_ok=True)
    out = dist / "ogp"; (out / "projects").mkdir(parents=True, exist_ok=True)

    STAR_D = re.search(r'<path fill="#ffffff" d="([^"]+)"', (root / "public/favicon.svg").read_text()).group(1)
    site = yaml.safe_load((root / "data/site.yaml").read_text(encoding="utf-8"))
    cats = {c["slug"]: c for c in yaml.safe_load((root / "data/categories.yaml").read_text(encoding="utf-8"))}
    projects = [yaml.safe_load(f.read_text(encoding="utf-8")) for f in sorted((root / "projects").glob("*.yaml"))]

    jobs = []  # (key, fp, html, dest)
    jobs.append(("default", fingerprint({"v": TEMPLATE_VER, "k": "default", "n": site["name"], "c": len(projects), "u": site.get("url")}),
                 html_default(site, len(projects)), out / "default.png"))
    for p in projects:
        cat = cats.get(p["category"], {"name": p["category"], "color": "#0b7a5a"})
        gh = p.get("github") or {}
        fetched = date10(gh.get("fetchedAt"))
        fp = fingerprint({"v": TEMPLATE_VER, "s": p["slug"], "n": p["name"], "r": p["repo"], "t": p.get("tagline"),
                          "c": cat.get("name"), "col": cat.get("color"), "st": gh.get("stars"), "f": fetched, "site": site["name"]})
        jobs.append((f"project-{p['slug']}", fp, html_project(site, p, cat, fetched), out / "projects" / f"{p['slug']}.png"))

    if a.only:
        keys = {("default" if k == "default" else f"project-{k}") for k in a.only}
        jobs = [j for j in jobs if j[0] in keys]
    todo = [j for j in jobs if a.only or not ((cache / f"{j[0]}.png").exists() and (cache / f"{j[0]}.fp").exists()
                                              and (cache / f"{j[0]}.fp").read_text().strip() == j[1])]
    if todo:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch(args=["--no-sandbox"])
            pg = b.new_page(viewport={"width": W, "height": H})
            for key, fp, doc, _ in todo:
                pg.set_content(doc, wait_until="load"); pg.wait_for_timeout(120)
                raw = cache / f"{key}.raw.png"
                pg.screenshot(path=str(raw))
                Image.open(raw).convert("RGB").quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) \
                    .save(cache / f"{key}.png", optimize=True)
                raw.unlink()
                (cache / f"{key}.fp").write_text(fp + "\n")
            b.close()
    for key, _, _, dest in jobs:
        shutil.copy2(cache / f"{key}.png", dest)
    print(f"ogp ({TEMPLATE_VER}): {len(todo)} rendered, {len(jobs) - len(todo)} cached -> {out}")


if __name__ == "__main__":
    main()
