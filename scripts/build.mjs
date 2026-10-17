// OSS活用事例集 ビルドスクリプト: projects/*.yaml + data/*.yaml -> dist/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const load = (p) => yaml.load(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const site = load('data/site.yaml');
if (process.env.SITE_URL) site.url = process.env.SITE_URL.replace(/\/$/, '');
const categories = load('data/categories.yaml');
const uses = load('data/uses.yaml');
const catMap = Object.fromEntries(categories.map((c) => [c.slug, c]));
const useMap = Object.fromEntries(uses.map((u) => [u.slug, u]));
const EASE = { 1: '手間がかかる', 2: 'やや手間', 3: 'ふつう', 4: '手軽', 5: 'とても手軽' };

// ---------- load & validate ----------
const errors = [];
const projects = fs.readdirSync(path.join(ROOT, 'projects')).filter((f) => f.endsWith('.yaml')).sort().map((f) => {
  const p = yaml.load(fs.readFileSync(path.join(ROOT, 'projects', f), 'utf8'));
  const where = `projects/${f}`;
  for (const k of ['slug', 'name', 'repo', 'category', 'uses', 'tagline', 'what', 'goodFor', 'ease', 'license', 'added']) {
    if (p[k] === undefined || p[k] === null || p[k] === '') errors.push(`${where}: ${k} がありません`);
  }
  if (p.slug && `${p.slug}.yaml` !== f) errors.push(`${where}: slug とファイル名が一致しません`);
  if (p.slug && !/^[a-z0-9-]+$/.test(p.slug)) errors.push(`${where}: slug は英小文字・数字・ハイフンのみ`);
  if (p.category && !catMap[p.category]) errors.push(`${where}: 未定義のカテゴリ ${p.category}`);
  for (const u of p.uses || []) if (!useMap[u]) errors.push(`${where}: 未定義の用途 ${u}`);
  if (p.repo && !/^[\w.-]+\/[\w.-]+$/.test(p.repo)) errors.push(`${where}: repo は owner/name 形式`);
  p.cases = p.cases || [];
  for (const c of p.cases) {
    if (!c.title || !c.summary) errors.push(`${where}: 事例に title/summary がありません`);
    if (!c.source || !/^https?:\/\//.test(c.source.url || '')) errors.push(`${where}: 事例「${c.title}」に出典URLがありません`);
  }
  if (p.ease && !EASE[p.ease.level]) errors.push(`${where}: ease.level は1〜5`);
  if (!p.github || p.github.stars === undefined) errors.push(`${where}: github（スター数）が未取得です。npm run stars を実行してください`);
  return p;
});
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
projects.sort((a, b) => (b.github?.stars || 0) - (a.github?.stars || 0));

// ---------- helpers ----------
// YAMLの折り返し（>-）で日本語の間に入る半角スペースを除去してからエスケープ
const esc = (s) => String(s ?? '').replace(/([^\x00-\x7F])[ ]+(?=[^\x00-\x7F])/g, '$1').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (p) => site.url + p;
const fmtNum = (n) => Number(n).toLocaleString('en-US');
const fmtDate = (d) => { const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d); return s.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$1-$2-$3'); };
const buildDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const fetchedDates = projects.map((p) => fmtDate(p.github.fetchedAt)).sort();
const latestFetch = fetchedDates[fetchedDates.length - 1];
const pageList = []; // for sitemap

// ---------- design（姉妹サイト「AI社員名鑑」と同系統。アクセントはグリーン系で区別） ----------
const CSS = `
:root{--bg:#f6f7f3;--paper:#fff;--ink:#1c1f26;--sub:#5b6170;--line:#e1e4da;--brand:#123b30;--accent:#0b7a5a;--warn-bg:#fff6e0;--warn-ink:#8a5300;--shadow:0 1px 2px rgba(20,32,28,.05),0 6px 20px -10px rgba(20,32,28,.2);--r:16px;
--sans:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic UI","Yu Gothic",Meiryo,system-ui,sans-serif;--serif:"Hiragino Mincho ProN","Noto Serif JP","Noto Serif CJK JP","Yu Mincho",serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#111613;--paper:#19201c;--ink:#e8ece9;--sub:#a2aca6;--line:#2a332e;--brand:#e8ece9;--accent:#5fd4a8;--warn-bg:#3a2c10;--warn-ink:#ffd28a;--shadow:0 1px 2px rgba(0,0,0,.4)}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.85;letter-spacing:.02em;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:6px}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;background:var(--paper);padding:8px 12px;z-index:9}
.site-h{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.site-h .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px}
.brand{display:flex;align-items:center;gap:10px;color:var(--brand);text-decoration:none;font-weight:800;font-size:1.12rem;letter-spacing:.08em}
.brand span{white-space:nowrap}.brand svg{color:var(--accent);flex:none}.brand small{display:none;font-weight:500;font-size:.72rem;color:var(--sub);letter-spacing:.04em}
.nav{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.nav a{white-space:nowrap;color:var(--ink);text-decoration:none;font-size:.86rem;padding:6px 10px;border-radius:99px}.nav a:hover,.nav a[aria-current]{background:var(--paper);box-shadow:inset 0 0 0 1px var(--line)}
.nav .cta{background:var(--brand);color:var(--bg)}.nav .cta:hover{background:var(--brand);opacity:.9}
@media (max-width:640px){.nav a:not(.keep){display:none}.brand{font-size:1rem;letter-spacing:.04em}}@media (min-width:900px){.brand small{display:inline}}
h1,h2,h3{line-height:1.45;letter-spacing:.03em;margin:0;word-break:auto-phrase}.av{flex:none;display:block}
.eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.22em;color:var(--sub);text-transform:uppercase}
.sec{margin:64px 0}.sec-h{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:20px;border-bottom:1px solid var(--line);padding-bottom:12px}
.sec-h h2{font-size:clamp(1.15rem,3.6vw,1.35rem)}.sec-h a{font-size:.88rem;white-space:nowrap}
.muted{color:var(--sub);font-size:.88rem}
.hero{padding:48px 0 16px;display:grid;gap:40px;align-items:center}@media (min-width:960px){.hero{grid-template-columns:1.25fr .9fr;padding:72px 0 32px}}
.hero-card{position:relative;max-width:380px;justify-self:center;width:100%}.hero-card ul{list-style:none;padding:0;margin:0;position:relative}.hero-card .card{transform:rotate(1.5deg);box-shadow:var(--shadow)}.hero-card::before{content:"";position:absolute;inset:14px -14px -14px 14px;border-radius:var(--r);background:color-mix(in srgb,var(--ink) 6%,transparent);transform:rotate(-2deg)}.hero-card .tagline{position:absolute;top:-30px;right:8px;z-index:2;font-size:.7rem;font-weight:800;letter-spacing:.14em;background:var(--ink);color:var(--bg);padding:3px 10px;border-radius:99px}@media (max-width:959px){.hero-card{display:none}}
.hero h1{font-family:var(--serif);font-weight:700;font-size:clamp(1.3rem,7.2vw,2.7rem);line-height:1.35;letter-spacing:.04em;margin:14px 0 18px}
.hero h1 em{font-style:normal;background:linear-gradient(transparent 62%,color-mix(in srgb,var(--accent) 24%,transparent) 0)}
.hero p.lead{font-size:1.02rem;color:var(--sub);max-width:40em;margin:0}
.stats{display:flex;flex-wrap:wrap;gap:10px 28px;margin:26px 0 0;padding:0;list-style:none}
.stats li{display:flex;align-items:baseline;gap:6px;font-size:.86rem;color:var(--sub)}.stats b{font-size:1.7rem;color:var(--ink);font-family:var(--serif);letter-spacing:0}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:99px;font-weight:700;font-size:.92rem;text-decoration:none;border:1px solid var(--line);background:var(--paper);color:var(--ink)}
.btn.pri{background:var(--brand);border-color:var(--brand);color:var(--bg)}
.depts{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;list-style:none;margin:0;padding:0}
.dept{position:relative;display:flex;gap:14px;align-items:flex-start;padding:16px;border-radius:var(--r);background:var(--paper);border:1px solid var(--line);transition:transform .15s,box-shadow .15s}
.dept:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.dept h3{font-size:1rem}.dept h3 a{color:var(--ink);text-decoration:none}.dept h3 a::after{content:"";position:absolute;inset:0;border-radius:var(--r)}
.dept p{margin:4px 0 0;font-size:.8rem;line-height:1.7;color:var(--sub);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.count{display:inline-block;margin-left:8px;font-size:.74rem;font-weight:700;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);padding:1px 8px;border-radius:99px;vertical-align:2px}
.dept.empty{opacity:.55}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;list-style:none;margin:0;padding:0}
.card{position:relative;display:flex;flex-direction:column;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;transition:transform .15s,box-shadow .15s}
.card:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.card-top{display:flex;justify-content:space-between;align-items:center;padding:8px 16px;font-size:.74rem;font-weight:700;letter-spacing:.08em;color:#fff;background:var(--c)}
.card-top .no{font-family:var(--mono);letter-spacing:.04em;opacity:.95}
.card-body{display:flex;flex-direction:column;gap:12px;padding:16px 16px 14px;flex:1}
.who{display:flex;gap:12px;align-items:center}.who .role{font-weight:800;font-size:1.05rem;line-height:1.45}.who .lbl{display:block;font-size:.68rem;letter-spacing:.14em;color:var(--sub);font-weight:700;font-family:var(--mono)}
.card h3{font-size:.92rem;font-weight:600;line-height:1.65}.card h3 a{color:var(--ink);text-decoration:none}.card h3 a::after{content:"";position:absolute;inset:0}
.card:hover h3 a{text-decoration:underline;text-decoration-color:var(--c)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.chip{font-size:.72rem;line-height:1.5;padding:2px 9px;border-radius:6px;background:color-mix(in srgb,var(--ink) 6%,transparent);color:var(--ink);text-decoration:none}a.chip:hover{background:color-mix(in srgb,var(--accent) 14%,transparent)}
.perf{display:flex;gap:8px;align-items:flex-start;font-size:.82rem;line-height:1.6;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--c) 7%,var(--paper))}
.perf .k{flex:none;font-size:.68rem;font-weight:800;letter-spacing:.1em;color:var(--c);padding-top:2px}.perf.none{background:var(--warn-bg);color:var(--warn-ink)}.perf.none .k{color:var(--warn-ink)}
.card-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;padding-top:10px;border-top:1px dashed var(--line);font-size:.76rem;color:var(--sub)}
.dots{letter-spacing:1px;color:var(--c,var(--accent))}
.fetched{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.06em;padding:1px 7px;border-radius:4px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);vertical-align:2px}
.slot{display:grid;gap:14px;grid-template-columns:1fr;align-items:center;padding:24px;border-radius:var(--r);border:1.5px dashed color-mix(in srgb,var(--sub) 45%,transparent);background:repeating-linear-gradient(135deg,transparent 0 12px,color-mix(in srgb,var(--ink) 2.5%,transparent) 12px 24px);margin:48px 0}
.slot h2,.slot h3{font-size:1.05rem}.slot p{margin:4px 0 0;color:var(--sub);font-size:.88rem}@media (min-width:720px){.slot{grid-template-columns:1fr auto}}
.crumb{font-size:.8rem;color:var(--sub);margin:22px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}.crumb li+li::before{content:"›";margin-right:6px;opacity:.6}.crumb a{color:var(--sub)}
.dept-hero{margin:18px 0 8px;padding:28px;border-radius:calc(var(--r) + 4px);background:linear-gradient(135deg,color-mix(in srgb,var(--c) 14%,var(--paper)),var(--paper) 70%);border:1px solid color-mix(in srgb,var(--c) 25%,var(--line));display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.dept-hero h1{font-size:clamp(1.5rem,4vw,2.1rem);font-family:var(--serif)}.dept-hero p{margin:6px 0 0;color:var(--sub);max-width:44em}
.page-h{margin:18px 0 26px}.page-h h1{font-family:var(--serif);font-size:clamp(1.5rem,4vw,2.1rem)}
.page{max-width:760px;margin:0 auto}.prose h1{font-size:1.7rem;font-family:var(--serif);margin:24px 0 16px}.prose h2{font-size:1.15rem;margin:32px 0 8px}.prose li{margin:.4em 0}
.profile{margin:18px 0 0;background:var(--paper);border:1px solid var(--line);border-radius:calc(var(--r) + 4px);overflow:hidden;box-shadow:var(--shadow)}
.profile .card-top{padding:10px 22px;font-size:.8rem}
.p-main{display:grid;grid-template-columns:auto 1fr;gap:18px 20px;padding:24px 22px 22px;align-items:center}
.p-main h1{grid-column:1/-1;font-family:var(--serif);font-size:clamp(1.35rem,3.6vw,1.9rem);line-height:1.5}
.p-role{font-size:1.25rem;font-weight:800;line-height:1.4}.p-role .lbl{display:block;font-size:.7rem;letter-spacing:.16em;color:var(--sub);font-family:var(--mono)}.p-role .muted{font-weight:500;font-size:.85rem;margin-top:4px}
dl.meta{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;margin:0;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
dl.meta div{background:var(--paper);padding:10px 14px}dl.meta dt{font-size:.68rem;font-weight:800;letter-spacing:.14em;color:var(--sub)}dl.meta dd{margin:2px 0 0;font-size:.9rem;overflow-wrap:anywhere}dl.meta dd small{color:var(--sub);font-size:.72rem}
.summary{grid-column:1/-1;margin:0;font-size:1rem;padding-left:14px;border-left:3px solid var(--c)}
.block{margin:44px 0}.block h2{font-size:1.15rem;display:flex;align-items:center;gap:10px;margin-bottom:12px}
.block h2::before{content:"";width:10px;height:10px;border-radius:3px;background:var(--c)}.block p{margin:0 0 10px}
.ticks{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ticks li{position:relative;padding:12px 14px 12px 46px;background:var(--paper);border:1px solid var(--line);border-radius:12px}
.ticks li::before{content:"✓";position:absolute;left:14px;top:12px;width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-size:.75rem;font-weight:800;color:#fff;background:var(--c);line-height:1}
.ticks.ng li::before{content:"–";background:var(--sub)}
.case{padding:16px 18px;background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;margin:0 0 12px}.case h3{font-size:1rem;margin-bottom:4px}.case p{margin:0 0 8px;font-size:.94rem}
.case .src{font-size:.8rem;display:inline-flex;gap:6px;align-items:center}.case .src b{font-size:.66rem;letter-spacing:.12em;color:var(--sub)}
.callout{padding:14px 16px;border-radius:12px;background:var(--warn-bg);color:var(--warn-ink);font-size:.92rem}
.note{margin-top:10px;font-size:.8rem;color:var(--sub)}
pre{font-family:var(--mono);font-size:.84rem;background:#16201c;color:#e4ece8;padding:12px 14px;border-radius:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:10px 0 0}
.source{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;padding:20px 22px;border-radius:var(--r);background:var(--brand);color:var(--bg)}
.source .s-l{font-size:.7rem;letter-spacing:.16em;font-weight:800;opacity:.75}.source .s-h{font-size:1.05rem;font-weight:800;overflow-wrap:anywhere}.source .s-m{font-size:.8rem;opacity:.8}
.source a.btn{background:var(--bg);color:var(--brand);border-color:transparent}
table.idx{width:100%;border-collapse:separate;border-spacing:0;font-size:.9rem;background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden}table.idx th{font-size:.7rem;letter-spacing:.12em;color:var(--sub);text-align:left;background:color-mix(in srgb,var(--ink) 3%,var(--paper))}table.idx th,table.idx td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}table.idx tr:last-child td{border-bottom:0}table.idx td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}table.idx a{font-weight:700}
@media (max-width:640px){table.idx .hide-sp{display:none}}
.tags{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}.tags a{display:inline-block;padding:6px 14px;border-radius:99px;border:1px solid var(--line);background:var(--paper);color:var(--ink);text-decoration:none;font-size:.86rem}.tags a:hover{border-color:var(--accent);color:var(--accent)}.tags small{color:var(--sub);margin-left:4px}
.foot{margin-top:80px;border-top:1px solid var(--line);padding:36px 0 48px;font-size:.82rem;color:var(--sub)}
.foot .wrap{display:grid;gap:18px}@media (min-width:800px){.foot .wrap{grid-template-columns:1.4fr 1fr}}
.foot nav{display:flex;flex-wrap:wrap;gap:6px 16px;align-content:start}.foot a{color:var(--sub)}.foot .sis{margin-top:10px}
`;
// ロゴ: OSS＝コードの山かっこ＋スター（姉妹サイトの社員証ロゴとは別物）
const LOGO = `<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor"/><path d="M11 11l-5 5 5 5M21 11l5 5-5 5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 11.2l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="#fff"/></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent(LOGO.replace('currentColor', '#0b7a5a').replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"'))}`;
const avatar = (cat, size = 56) => `<svg class="av" width="${size}" height="${size}" viewBox="0 0 56 56" aria-hidden="true"><rect x="1" y="1" width="54" height="54" rx="14" fill="${esc(cat.color)}"/><path d="M14 20l-5 8 5 8M42 20l5 8-5 8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><text x="28" y="35.5" text-anchor="middle" font-size="20" font-weight="700" fill="#fff" font-family="'Hiragino Sans','Noto Sans JP','Noto Sans CJK JP',sans-serif">${esc(cat.mark)}</text></svg>`;
const dots = (n) => `<span class="dots" aria-label="5段階中${n}">${'●'.repeat(n)}${'○'.repeat(5 - n)}</span>`;
const short = (s, n = 48) => { const t = String(s).replace(/\s+/g, ''); return t.length > n ? t.slice(0, n) + '…' : t; };
const shortLicense = (p) => (p.license.spdx && !['NOASSERTION', 'none'].includes(p.license.spdx) ? p.license.spdx : p.license.name.replace(/（.*$/, ''));

function layout({ title, description, pathName, body, jsonld = [], nav = '' }) {
  pageList.push(pathName);
  const fullTitle = pathName === '/' ? `${site.name}｜${site.tagline}` : `${title}｜${site.name}`;
  const ld = jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n');
  const item = (href, label, key, cls = '') => `<a href="${href}"${nav === key ? ' aria-current="page"' : ''}${cls ? ` class="${cls}"` : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(pathName)}"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#f6f7f3" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#111613" media="(prefers-color-scheme: dark)"><link rel="icon" href="${FAVICON}">
<meta property="og:type" content="${pathName.startsWith('/projects/') && pathName !== '/projects/' ? 'article' : 'website'}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${abs(pathName)}"><meta property="og:site_name" content="${esc(site.name)}"><meta property="og:locale" content="ja_JP"><meta name="twitter:card" content="summary">
<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">
<style>${CSS.replace(/\n/g, '')}</style>
${ld}
</head><body><a class="skip" href="#main">本文へスキップ</a>
<header class="site-h"><div class="wrap"><a class="brand" href="/">${LOGO}<span>${esc(site.name)}</span><small>AI・開発・自動化のOSSを日本語で</small></a>
<nav class="nav" aria-label="メイン">${item('/categories/', 'カテゴリ', 'cats', 'keep')}${item('/uses/', '用途別', 'uses')}${item('/projects/', 'OSS一覧', 'all', 'keep')}${item('/about/', '編集方針', 'about')}${item('/sponsor/', '掲載のご相談', 'sponsor', 'cta')}</nav></div></header>
<main id="main" class="wrap">${body}</main>
<footer class="foot"><div class="wrap"><div><strong style="color:var(--ink)">${esc(site.name)}</strong><p style="margin:6px 0 0">${esc(site.tagline)}。紹介文は当サイトが独自に要約したものです。GitHubスター数・最終更新日はGitHub APIから取得し、取得日を併記しています。事例の数値は出典元の発表・報告です。</p>
<p class="sis">姉妹サイト：${(site.sister || []).map((s) => `<a href="${esc(s.url)}">${esc(s.name)}</a>`).join(' / ')}</p></div>
<nav aria-label="フッター">${categories.filter((c) => projects.some((p) => p.category === c.slug)).map((c) => `<a href="/categories/${c.slug}/">${esc(c.name)}</a>`).join('')}<a href="/projects/">すべてのOSS</a><a href="/uses/">用途別</a><a href="/about/">編集方針</a><a href="/sponsor/">掲載のご相談</a><a href="/sitemap.xml">sitemap</a><a href="/llms.txt">llms.txt</a><span>最終更新 ${buildDate}</span></nav></div></footer>
</body></html>`;
}

const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })) });
const itemListLd = (name, list) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: list.length, itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/projects/${p.slug}/`), name: p.name })) });
const crumbHtml = (items) => `<ol class="crumb">${items.map((c, i) => (i === items.length - 1 ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.path}">${esc(c.name)}</a></li>`)).join('')}</ol>`;

function card(p) {
  const cat = catMap[p.category];
  const chips = p.uses.slice(0, 3).map((u) => `<li class="chip">${esc(useMap[u].name)}</li>`).join('') + (p.uses.length > 3 ? `<li class="chip">+${p.uses.length - 3}</li>` : '');
  const perf = p.cases.length ? `<div class="perf"><span class="k">事例</span><span>${esc(short(p.cases[0].title, 46))}${p.cases.length > 1 ? `（ほか${p.cases.length - 1}件）` : ''}</span></div>` : `<div class="perf none"><span class="k">事例</span><span>事例未収集</span></div>`;
  return `<li class="card" style="--c:${esc(cat.color)}"><div class="card-top"><span>${esc(cat.name)}</span><span class="no">★ ${fmtNum(p.github.stars)}</span></div>
<div class="card-body"><div class="who">${avatar(cat, 48)}<div><span class="lbl">${esc(p.repo)}</span><span class="role">${esc(p.name)}</span></div></div>
<h3><a href="/projects/${p.slug}/">${esc(p.tagline)}</a></h3><ul class="chips" aria-label="用途">${chips}</ul>${perf}
<div class="card-foot"><span>導入 ${dots(p.ease.level)} ${EASE[p.ease.level]}</span><span>${esc(shortLicense(p))}</span></div></div></li>`;
}
const catTile = (c) => { const n = projects.filter((p) => p.category === c.slug).length; return `<li class="dept${n ? '' : ' empty'}" style="--c:${esc(c.color)}">${avatar(c, 44)}<div><h3>${n ? `<a href="/categories/${c.slug}/">${esc(c.name)}</a>` : esc(c.name)}<span class="count">${n}件</span></h3><p>${esc(c.description)}</p></div></li>`; };
const sponsorSlot = (h = 'h2') => `<aside class="slot" aria-label="スポンサー枠"><div><span class="eyebrow">Sponsored slot</span><${h}>スポンサー募集中</${h}><p>AI・開発・自動化に役立つサービスやOSSの紹介枠を準備中です。通常の紹介とは区別し、広告であることを明記して掲載します。</p></div><a class="btn" href="/sponsor/">掲載のご相談 →</a></aside>`;
const usedUses = uses.filter((u) => projects.some((p) => p.uses.includes(u.slug)));

function write(rel, content) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// ---------- build ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const publicDir = path.join(ROOT, 'public');
if (fs.existsSync(publicDir)) fs.cpSync(publicDir, DIST, { recursive: true });

// project pages
for (const p of projects) {
  const cat = catMap[p.category];
  const crumbs = [{ name: 'トップ', path: '/' }, { name: cat.name, path: `/categories/${cat.slug}/` }, { name: p.name, path: `/projects/${p.slug}/` }];
  const fetched = fmtDate(p.github.fetchedAt);
  const casesHtml = p.cases.length
    ? p.cases.map((c) => `<div class="case"><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><span class="src"><b>出典</b><a href="${esc(c.source.url)}" rel="noopener" target="_blank">${esc(c.source.name || c.source.url)}</a></span></div>`).join('') + '<p class="note">※ 事例の数値は、出典元（提供元の導入事例や利用者の記事）による発表・報告です。当サイトでの検証はしていません。</p>'
    : `<p class="callout">事例未収集：出典を確認できる活用事例をまだ集められていません。見つかり次第追加します。</p>`;
  const desc = `${p.name}（${p.repo}）の日本語解説：${p.tagline}。向いている用途、出典つきの活用事例、導入の手軽さ、ライセンス、GitHubスター数をまとめています。`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: p.name, description: p.tagline, codeRepository: `https://github.com/${p.repo}`, url: abs(`/projects/${p.slug}/`), ...(p.homepage ? { sameAs: p.homepage } : {}), license: p.license.spdx && !['NOASSERTION', 'none'].includes(p.license.spdx) ? `https://spdx.org/licenses/${p.license.spdx}.html` : undefined, inLanguage: 'ja', dateModified: fmtDate(p.checked || p.added), interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.github.stars, description: `GitHub stars (${fetched} 取得)` } },
    breadcrumbLd(crumbs),
  ];
  const others = projects.filter((q) => q.category === p.category && q.slug !== p.slug);
  const related = others.length ? others : projects.filter((q) => q.slug !== p.slug && q.uses.some((u) => p.uses.includes(u))).slice(0, 3);
  const body = `${crumbHtml(crumbs)}
<article style="--c:${esc(cat.color)}"><header class="profile"><div class="card-top"><span>OSS ・ ${esc(cat.name)}</span><span class="no">★ ${fmtNum(p.github.stars)}</span></div>
<div class="p-main">${avatar(cat, 72)}<div class="p-role"><span class="lbl">${esc(p.repo)}</span>${esc(p.name)}<div class="muted">カテゴリ <a href="/categories/${cat.slug}/">${esc(cat.name)}</a></div></div>
<h1>${esc(p.name)}：${esc(p.tagline)}</h1>
<dl class="meta"><div><dt>GitHubスター</dt><dd>★ ${fmtNum(p.github.stars)} <small>${fetched} 取得</small></dd></div><div><dt>最終更新（最終push・日本時間）</dt><dd>${fmtDate(p.github.pushedAt)} <small>${fetched} 取得</small></dd></div><div><dt>ライセンス</dt><dd>${esc(p.license.name)}</dd></div><div><dt>導入の手軽さ</dt><dd>${dots(p.ease.level)} ${EASE[p.ease.level]}</dd></div></dl>
</div></header>
<section class="block"><h2>用途</h2><ul class="chips">${p.uses.map((u) => `<li><a class="chip" href="/uses/${u}/">${esc(useMap[u].name)}</a></li>`).join('')}</ul></section>
<section class="block"><h2>何ができるか</h2><p>${esc(p.what)}</p></section>
<section class="block"><h2>向いている用途</h2><ul class="ticks">${p.goodFor.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
${p.notFor?.length ? `<h3 style="font-size:.95rem;margin:18px 0 8px">向いていない場面</h3><ul class="ticks ng">${p.notFor.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</section>
<section class="block"><h2>実際の使われ方（活用事例）</h2>${casesHtml}</section>
<section class="block"><h2>導入の手軽さ</h2><p>${dots(p.ease.level)} <strong>${EASE[p.ease.level]}</strong> — ${esc(p.ease.text)}</p>
${p.ease.install ? `<pre><code>${esc(p.ease.install)}</code></pre><p class="note">※ 代表的な導入コマンドの例です。最新の手順は公式ドキュメントを確認してください。</p>` : ''}</section>
<section class="block"><h2>ライセンス</h2><p><strong>${esc(p.license.name)}</strong>${p.license.spdx && p.license.spdx !== 'NOASSERTION' ? `（SPDX: ${esc(p.license.spdx)}）` : ''}。${esc(p.license.note || '')}</p><p class="note">ライセンスの説明は要点のみです。利用前にリポジトリのLICENSEファイル原文を確認してください。</p></section>
<section class="block"><h2>リポジトリ情報</h2>
<div class="source"><div><div class="s-l">REPOSITORY</div><div class="s-h">github.com/${esc(p.repo)}</div><div class="s-m">★ ${fmtNum(p.github.stars)}・最終push ${fmtDate(p.github.pushedAt)}（${fetched} 取得）・掲載 ${fmtDate(p.added)}・内容確認 ${fmtDate(p.checked || p.added)}</div>${p.homepage && !p.homepage.includes('github.com/' + p.repo) ? `<div class="s-m">公式サイト：<a href="${esc(p.homepage)}" rel="noopener" style="color:inherit">${esc(p.homepage.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></div>` : ''}</div><a class="btn" href="https://github.com/${esc(p.repo)}" rel="noopener">GitHubで見る ↗</a></div></section>
</article>
${sponsorSlot('h2')}
<section class="sec"><div class="sec-h"><h2>${others.length ? `${esc(cat.name)}のほかのOSS` : '関連するOSS'}</h2><a href="${others.length ? `/categories/${cat.slug}/` : '/projects/'}">一覧へ →</a></div><ul class="cards">${related.map(card).join('') || '<li class="muted">まだありません。</li>'}</ul></section>`;
  write(`projects/${p.slug}/index.html`, layout({ title: `${p.name}とは？使い方と活用事例`, description: desc, pathName: `/projects/${p.slug}/`, body, jsonld: ld }));
}

// all projects
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: 'すべてのOSS', path: '/projects/' }];
  const rows = projects.map((p) => `<tr><td><a href="/projects/${p.slug}/">${esc(p.name)}</a><div class="muted" style="font-size:.8rem">${esc(p.tagline)}</div></td><td class="hide-sp"><a href="/categories/${p.category}/" style="font-weight:400">${esc(catMap[p.category].name)}</a></td><td class="num">★ ${fmtNum(p.github.stars)}</td><td class="hide-sp">${EASE[p.ease.level]}</td><td class="hide-sp">${p.cases.length ? p.cases.length + '件' : '未収集'}</td></tr>`).join('');
  const body = `${crumbHtml(crumbs)}<div class="page-h"><span class="eyebrow">All projects</span><h1>すべてのOSS（${projects.length}件）</h1><p class="muted">GitHubスター数の多い順（${latestFetch} 取得）。</p></div>
<ul class="cards">${projects.map(card).join('')}</ul>
<section class="sec"><div class="sec-h"><h2>一覧表で比べる</h2></div><table class="idx"><thead><tr><th>プロジェクト</th><th class="hide-sp">カテゴリ</th><th>スター</th><th class="hide-sp">導入</th><th class="hide-sp">事例</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  write('projects/index.html', layout({ title: 'すべてのOSS一覧', description: `${site.name}に掲載中のオープンソース${projects.length}件の一覧。カテゴリ・導入の手軽さ・事例の有無を比較できます。`, pathName: '/projects/', body, nav: 'all', jsonld: [itemListLd('すべてのOSS', projects), breadcrumbLd(crumbs)] }));
}

// categories
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: 'カテゴリ', path: '/categories/' }];
  const body = `${crumbHtml(crumbs)}<div class="page-h"><span class="eyebrow">Categories</span><h1>カテゴリ別に探す</h1><p class="muted">OSSを分野ごとに分類しています。</p></div><ul class="depts">${categories.map(catTile).join('')}</ul>`;
  write('categories/index.html', layout({ title: 'カテゴリ別一覧', description: 'AIアプリ基盤、ローカルLLM、業務自動化、ブラウザ自動化など、カテゴリ別にオープンソースを探せます。', pathName: '/categories/', body, nav: 'cats', jsonld: [breadcrumbLd(crumbs)] }));
  for (const c of categories) {
    const list = projects.filter((p) => p.category === c.slug);
    const cc = [...crumbs, { name: c.name, path: `/categories/${c.slug}/` }];
    const b = `${crumbHtml(cc)}<div class="dept-hero" style="--c:${esc(c.color)}">${avatar(c, 64)}<div><span class="eyebrow">Category</span><h1>${esc(c.name)}のOSS</h1><p>${esc(c.description)}（掲載${list.length}件）</p></div></div>
<section class="sec" style="margin-top:32px"><ul class="cards">${list.map(card).join('') || '<li class="muted">まだ掲載がありません。</li>'}</ul></section>
<section class="sec"><div class="sec-h"><h2>ほかのカテゴリ</h2></div><ul class="depts">${categories.filter((x) => x.slug !== c.slug).map(catTile).join('')}</ul></section>`;
    write(`categories/${c.slug}/index.html`, layout({ title: `${c.name}のオープンソース一覧`, description: `${c.name}：${c.description} 掲載${list.length}件。`, pathName: `/categories/${c.slug}/`, body: b, nav: 'cats', jsonld: [itemListLd(c.name, list), breadcrumbLd(cc)] }));
  }
}

// uses
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: '用途別', path: '/uses/' }];
  const body = `${crumbHtml(crumbs)}<div class="page-h"><span class="eyebrow">Use cases</span><h1>用途別に探す</h1><p class="muted">やりたいことからOSSを探せます。</p></div><ul class="tags">${usedUses.map((u) => `<li><a href="/uses/${u.slug}/">${esc(u.name)}<small>${projects.filter((p) => p.uses.includes(u.slug)).length}</small></a></li>`).join('')}</ul>`;
  write('uses/index.html', layout({ title: '用途別一覧', description: '社内AI活用、RAG、業務自動化、ブラウザ自動化、SNS運用など、用途別にオープンソースを探せます。', pathName: '/uses/', body, nav: 'uses', jsonld: [breadcrumbLd(crumbs)] }));
  for (const u of usedUses) {
    const list = projects.filter((p) => p.uses.includes(u.slug));
    const cc = [...crumbs, { name: u.name, path: `/uses/${u.slug}/` }];
    const b = `${crumbHtml(cc)}<div class="page-h"><span class="eyebrow">Use case</span><h1>「${esc(u.name)}」に使えるOSS（${list.length}件）</h1></div><ul class="cards">${list.map(card).join('')}</ul>
<section class="sec"><div class="sec-h"><h2>ほかの用途</h2></div><ul class="tags">${usedUses.filter((x) => x.slug !== u.slug).map((x) => `<li><a href="/uses/${x.slug}/">${esc(x.name)}</a></li>`).join('')}</ul></section>`;
    write(`uses/${u.slug}/index.html`, layout({ title: `${u.name}に使えるオープンソース`, description: `${u.name}に使えるオープンソース${list.length}件を、活用事例・導入の手軽さ・ライセンスつきで紹介。`, pathName: `/uses/${u.slug}/`, body: b, nav: 'uses', jsonld: [itemListLd(u.name, list), breadcrumbLd(cc)] }));
  }
}

// home
{
  const newest = [...projects].sort((a, b) => fmtDate(b.added).localeCompare(fmtDate(a.added)) || (b.github.stars - a.github.stars));
  const withCases = projects.filter((p) => p.cases.length).length;
  const featured = projects.find((p) => p.slug === 'n8n') || projects[0];
  const body = `<section class="hero"><div><span class="eyebrow">Open Source Use Cases</span>
<h1><em>OSSの実際の使われ方</em>が<br>一目でわかる事例集</h1>
<p class="lead">${esc(site.description)}</p>
<ul class="stats"><li><b>${projects.length}</b>プロジェクト</li><li><b>${categories.filter((c) => projects.some((p) => p.category === c.slug)).length}</b>カテゴリ</li><li><b>${withCases}</b>件で出典つき事例</li></ul>
<div class="btns"><a class="btn pri" href="/projects/">すべてのOSSを見る</a><a class="btn" href="/uses/">用途から探す</a></div></div>
<div class="hero-card"><span class="tagline">掲載例</span><ul>${card(featured)}</ul></div></section>
<section class="sec"><div class="sec-h"><h2>カテゴリ</h2><a href="/categories/">すべてのカテゴリ →</a></div><ul class="depts">${categories.map(catTile).join('')}</ul></section>
<section class="sec"><div class="sec-h"><h2>用途から探す</h2><a href="/uses/">用途一覧 →</a></div><ul class="tags">${usedUses.map((u) => `<li><a href="/uses/${u.slug}/">${esc(u.name)}<small>${projects.filter((p) => p.uses.includes(u.slug)).length}</small></a></li>`).join('')}</ul></section>
<section class="sec"><div class="sec-h"><h2>掲載中のOSS</h2><a href="/projects/">全${projects.length}件を見る →</a></div><ul class="cards">${newest.map(card).join('')}</ul><p class="muted" style="margin-top:14px">スター数はGitHub APIから ${latestFetch} に取得。</p></section>
${sponsorSlot('h2')}
<section class="sec"><div class="sec-h"><h2>この事例集の読み方</h2></div><ul class="depts" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
<li class="dept" style="--c:var(--accent)"><div><h3>出典つきの事例</h3><p>活用事例には必ず出典URLを付けています。見つからないものは「事例未収集」と表示します。</p></div></li>
<li class="dept" style="--c:var(--accent)"><div><h3>取得日つきの数値</h3><p>GitHubスター数・最終更新日はGitHub APIから取得し、取得日を併記しています。</p></div></li>
<li class="dept" style="--c:var(--accent)"><div><h3>導入の手軽さ</h3><p>公式の導入手順をもとに、5段階（●の数）で目安を示しています。</p></div></li>
<li class="dept" style="--c:var(--accent)"><div><h3>ライセンスの要点</h3><p>商用利用の条件や、OSI定義外の「ソース公開型」かどうかを明記しています。</p></div></li></ul></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs('/'), description: site.description, inLanguage: 'ja' }, itemListLd('掲載中のOSS', newest)];
  write('index.html', layout({ title: site.name, description: site.description, pathName: '/', body, jsonld: ld }));
}

// about
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: '編集方針', path: '/about/' }];
  const body = `${crumbHtml(crumbs)}<div class="page prose"><h1>このサイトについて・編集方針</h1>
<p>${esc(site.name)}は、GitHubで公開されているAI・開発・業務自動化系のオープンソース（OSS）を、日本語で「何ができて、実際にどう使われているか」がわかるように紹介するサイトです。</p>
<h2>掲載内容の方針</h2><ul>
<li>1プロジェクト1ページで、何ができるか・向いている用途・活用事例・導入の手軽さ・ライセンス・GitHubの数値をまとめます。</li>
<li>活用事例は、出典（提供元の導入事例、利用者のブログ、検証記事など）のURLを必ず載せます。出典を確認できる事例がない場合は「事例未収集」と書きます。</li>
<li>事例の数値は出典元の発表・報告であり、当サイトでは検証していません。</li>
<li>本文は出典の翻訳・転載ではなく、当サイトの言葉で要約しています。</li>
<li>GitHubスター数と最終更新日（最終push日）はGitHub APIから取得し、取得日を併記します。</li>
<li>「導入の手軽さ」は、公式の導入手順をもとにした当サイトの目安（5段階）です。</li>
<li>ライセンスの説明は要点のみです。利用前に必ず原文を確認してください。なお、OSI定義のオープンソースではない「ソース公開型」のライセンスのプロジェクトも、その旨を明記して掲載しています。</li>
</ul>
<h2>AI・検索エンジン向け</h2><p><a href="/llms.txt">llms.txt</a>（サイトの要約）と <a href="/projects.json">projects.json</a>（掲載データ）を公開しています。</p>
<h2>掲載・修正のご相談</h2><p><a href="/sponsor/">掲載のご相談</a>のページをご覧ください。</p></div>`;
  write('about/index.html', layout({ title: 'このサイトについて・編集方針', description: `${site.name}の編集方針：出典つきの事例、取得日つきの数値、自分の言葉での要約。`, pathName: '/about/', body, nav: 'about', jsonld: [breadcrumbLd(crumbs)] }));
}

// sponsor
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: '掲載のご相談', path: '/sponsor/' }];
  const body = `${crumbHtml(crumbs)}<div class="page prose"><h1>掲載のご相談（スポンサー募集中）</h1>
<p>${esc(site.name)}では、AI・開発・業務自動化に関わるOSSプロジェクトや関連サービスのスポンサー掲載を募集する予定です。</p>
<h2>想定している掲載枠</h2><ul><li>トップページ・各ページのスポンサー枠（「スポンサー」と明記して表示します）</li><li>関連するカテゴリ・用途ページでの紹介枠</li></ul>
<h2>掲載の方針</h2><ul><li>スポンサー掲載は広告であることを明示し、通常の紹介ページ（事例・評価）の内容には影響させません。</li><li>出典のない事例や、検証できない数値の掲載はお受けしません。</li></ul>
<h2>お問い合わせ先</h2><p class="callout">お問い合わせ窓口は現在準備中です。窓口が決まり次第、このページでお知らせします。</p></div>`;
  write('sponsor/index.html', layout({ title: '掲載のご相談（スポンサー募集中）', description: `${site.name}のスポンサー掲載について。お問い合わせ窓口は準備中です。`, pathName: '/sponsor/', body, nav: 'sponsor', jsonld: [breadcrumbLd(crumbs)] }));
}

// 404 (not in sitemap)
write('404.html', layout({ title: 'ページが見つかりません', description: 'お探しのページは見つかりませんでした。', pathName: '/404', body: `<div class="page prose"><h1>ページが見つかりません</h1><p><a href="/">トップへ戻る</a> / <a href="/projects/">すべてのOSS</a></p></div>` }));
pageList.pop();
// projects.json
write('projects.json', JSON.stringify({ site: site.name, url: site.url, generated: buildDate, count: projects.length, projects: projects.map((p) => ({ slug: p.slug, name: p.name, url: abs(`/projects/${p.slug}/`), repo: `https://github.com/${p.repo}`, category: catMap[p.category].name, uses: p.uses.map((u) => useMap[u].name), tagline: p.tagline, license: p.license.name, stars: p.github.stars, pushedAt: fmtDate(p.github.pushedAt), fetchedAt: fmtDate(p.github.fetchedAt), ease: EASE[p.ease.level], cases: p.cases.map((c) => ({ title: c.title, source: c.source.url })) })) }, null, 2));

// sitemap / robots / llms.txt
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageList.map((p) => { const proj = projects.find((q) => p === `/projects/${q.slug}/`); return `  <url><loc>${abs(p)}</loc><lastmod>${proj ? fmtDate(proj.checked || proj.added) : buildDate}</lastmod></url>`; }).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);
write('llms.txt', `# ${site.name}\n\n> ${site.description}\n\n掲載数: ${projects.length}件 / GitHubスター数の取得日: ${latestFetch} / 最終ビルド: ${buildDate}\n事例は出典URLつき。出典のない場合は「事例未収集」と記載。数値は出典元の発表であり当サイトでは未検証。\n\n## プロジェクト\n\n${projects.map((p) => `- [${p.name}](${abs(`/projects/${p.slug}/`)}): ${p.tagline}（${catMap[p.category].name}／★${fmtNum(p.github.stars)}・${fmtDate(p.github.fetchedAt)}取得／${p.license.name}／事例${p.cases.length ? p.cases.length + '件' : '未収集'}）`).join('\n')}\n\n## カテゴリ\n\n${categories.map((c) => `- [${c.name}](${abs(`/categories/${c.slug}/`)}): ${c.description}`).join('\n')}\n\n## 用途\n\n${uses.filter((u) => projects.some((p) => p.uses.includes(u.slug))).map((u) => `- [${u.name}](${abs(`/uses/${u.slug}/`)})`).join('\n')}\n\n## その他\n\n- [すべてのOSS一覧](${abs('/projects/')})\n- [このサイトについて・編集方針](${abs('/about/')})\n- [掲載データ（JSON）](${abs('/projects.json')})\n`);

console.log(`built ${projects.length} projects, ${pageList.length} pages -> dist/`);
