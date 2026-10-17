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

const CSS = `
:root{--fg:#1d2433;--sub:#5b6476;--bg:#fafaf7;--card:#fff;--line:#e3e1d9;--accent:#0b6e4f;--accent2:#e8f3ee;--warn:#8a5a00;--warnbg:#fff6e0}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--fg);background:var(--bg);line-height:1.75}
a{color:var(--accent)}a:hover{text-decoration:none}
.wrap{max-width:980px;margin:0 auto;padding:0 18px}
header.site{background:#fff;border-bottom:1px solid var(--line)}header.site .wrap{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:12px 18px}
header.site .logo{font-weight:800;font-size:1.15rem;color:var(--fg);text-decoration:none}header.site nav a{margin-right:14px;font-size:.92rem;color:var(--sub);text-decoration:none}header.site nav a:hover{color:var(--accent)}
main{padding:24px 0 40px}h1{font-size:1.7rem;line-height:1.4;margin:.2em 0 .4em}h2{font-size:1.25rem;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:2px solid var(--line)}h3{font-size:1.05rem;margin:1.2em 0 .3em}
.lead{color:var(--sub);font-size:1.02rem}.crumb{font-size:.85rem;color:var(--sub)}.crumb a{color:var(--sub)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.card h3{margin:0;font-size:1.08rem}.card h3 a{color:var(--fg);text-decoration:none}.card h3 a:hover{color:var(--accent)}
.card p{margin:0;font-size:.92rem;color:var(--sub)}.meta{font-size:.8rem;color:var(--sub);display:flex;gap:10px;flex-wrap:wrap}
.tag{display:inline-block;background:var(--accent2);color:var(--accent);border-radius:999px;padding:1px 10px;font-size:.78rem;text-decoration:none;margin:2px 4px 2px 0}
.facts{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:.93rem}.facts th,.facts td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.facts th{width:30%;background:#f4f3ee;font-weight:600}
.case{background:#fff;border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:12px 14px;margin:10px 0}.case h3{margin:0 0 4px}.case p{margin:0 0 6px}.case .src{font-size:.85rem}
.note{background:var(--warnbg);color:var(--warn);border-radius:8px;padding:10px 14px;font-size:.9rem}
code,pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.86rem}pre{background:#1f2430;color:#e6e6e6;padding:10px 12px;border-radius:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.sponsor{border:1px dashed #b9b6aa;border-radius:10px;padding:12px 16px;text-align:center;color:var(--sub);font-size:.9rem;margin:22px 0}
.list{padding-left:1.2em}.small{font-size:.85rem;color:var(--sub)}
table.idx{width:100%;border-collapse:collapse;font-size:.92rem;background:#fff}table.idx th,table.idx td{border-bottom:1px solid var(--line);padding:8px;text-align:left}table.idx td.num{text-align:right;white-space:nowrap}
footer.site{border-top:1px solid var(--line);background:#fff;padding:22px 0;font-size:.86rem;color:var(--sub)}footer.site a{color:var(--sub)}
`;

function layout({ title, description, pathName, body, jsonld = [], crumbs = null }) {
  pageList.push(pathName);
  const fullTitle = pathName === '/' ? `${site.name}｜${site.tagline}` : `${title}｜${site.name}`;
  const ld = jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n');
  const crumbHtml = crumbs ? `<div class="crumb">${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${c.path}">${esc(c.name)}</a> › ` : esc(c.name))).join('')}</div>` : '';
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(pathName)}"><meta property="og:type" content="${pathName === '/' ? 'website' : 'article'}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${abs(pathName)}"><meta property="og:site_name" content="${esc(site.name)}"><meta property="og:locale" content="ja_JP"><meta name="twitter:card" content="summary">
<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">
<style>${CSS}</style>
${ld}
</head><body>
<header class="site"><div class="wrap"><a class="logo" href="/">${esc(site.name)}</a><nav><a href="/projects/">すべてのOSS</a><a href="/categories/">カテゴリ別</a><a href="/uses/">用途別</a><a href="/about/">このサイトについて</a></nav></div></header>
<main><div class="wrap">${crumbHtml}${body}</div></main>
<footer class="site"><div class="wrap">
<div class="sponsor" style="margin-top:0">スポンサー募集中 — <a href="/sponsor/">掲載のご相談</a></div>
<p><strong>${esc(site.name)}</strong>：${esc(site.tagline)}。GitHubスター数・最終更新日はGitHub APIから取得（取得日を各ページに記載）。事例の数値は出典元の発表・報告によるものです。</p>
<p>姉妹サイト：${(site.sister || []).map((s) => `<a href="${esc(s.url)}">${esc(s.name)}</a>`).join(' / ')}</p>
<p><a href="/about/">このサイトについて・編集方針</a> / <a href="/sponsor/">掲載のご相談</a> / <a href="/sitemap.xml">サイトマップ</a> / <a href="/llms.txt">llms.txt</a></p>
</div></footer>
</body></html>`;
}

const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })) });
const itemListLd = (name, list) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: list.length, itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/projects/${p.slug}/`), name: p.name })) });

function card(p) {
  const cat = catMap[p.category];
  return `<div class="card"><h3><a href="/projects/${p.slug}/">${esc(p.name)}</a></h3><p>${esc(p.tagline)}</p>
<div class="meta"><span>★ ${fmtNum(p.github.stars)}</span><span>導入: ${EASE[p.ease.level]}</span><span>事例 ${p.cases.length ? p.cases.length + '件' : '未収集'}</span></div>
<div><a class="tag" href="/categories/${cat.slug}/">${esc(cat.name)}</a></div></div>`;
}

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
  const casesHtml = p.cases.length
    ? p.cases.map((c) => `<div class="case"><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><div class="src">出典：<a href="${esc(c.source.url)}" rel="noopener" target="_blank">${esc(c.source.name || c.source.url)}</a></div></div>`).join('')
    : `<p class="note">事例未収集：出典を確認できる活用事例をまだ集められていません。見つかり次第追加します。</p>`;
  const refsHtml = (p.refs || []).length ? `<h3>参考（紹介記事・投稿。活用事例ではありません）</h3><ul class="list">${p.refs.map((r) => `<li><a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.name)}</a></li>`).join('')}</ul>` : '';
  const desc = `${p.name}（${p.repo}）の日本語解説：${p.tagline}。向いている用途、出典つきの活用事例、導入の手軽さ、ライセンス、GitHubスター数をまとめています。`;
  const fetched = fmtDate(p.github.fetchedAt);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: p.name, description: p.tagline, codeRepository: `https://github.com/${p.repo}`, url: abs(`/projects/${p.slug}/`), ...(p.homepage ? { sameAs: p.homepage } : {}), license: p.license.spdx && !['NOASSERTION', 'none'].includes(p.license.spdx) ? `https://spdx.org/licenses/${p.license.spdx}.html` : undefined, inLanguage: 'ja', dateModified: fmtDate(p.checked || p.added), interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.github.stars, description: `GitHub stars (${fetched} 取得)` } },
    breadcrumbLd(crumbs),
  ];
  const body = `<h1>${esc(p.name)}：${esc(p.tagline)}</h1>
<p class="small">リポジトリ：<a href="https://github.com/${esc(p.repo)}" rel="noopener">github.com/${esc(p.repo)}</a>${p.homepage && !p.homepage.includes('github.com/' + p.repo) ? ` ／ 公式サイト：<a href="${esc(p.homepage)}" rel="noopener">${esc(p.homepage.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : ''}</p>
<table class="facts">
<tr><th>カテゴリ</th><td><a href="/categories/${cat.slug}/">${esc(cat.name)}</a></td></tr>
<tr><th>用途</th><td>${p.uses.map((u) => `<a class="tag" href="/uses/${u}/">${esc(useMap[u].name)}</a>`).join('')}</td></tr>
<tr><th>GitHubスター数</th><td>★ ${fmtNum(p.github.stars)}<span class="small">（${fetched} 取得）</span></td></tr>
<tr><th>最終更新日（最終push・日本時間）</th><td>${fmtDate(p.github.pushedAt)}<span class="small">（${fetched} 取得）</span></td></tr>
<tr><th>ライセンス</th><td>${esc(p.license.name)}</td></tr>
<tr><th>導入の手軽さ</th><td>${'●'.repeat(p.ease.level)}${'○'.repeat(5 - p.ease.level)} ${EASE[p.ease.level]}</td></tr>
</table>
<h2>何ができるか</h2><p>${esc(p.what)}</p>
<h2>向いている用途</h2><ul class="list">${p.goodFor.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
${p.notFor?.length ? `<h3>向いていない場面</h3><ul class="list">${p.notFor.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
<h2>実際の使われ方（活用事例）</h2>${casesHtml}
${p.cases.length ? '<p class="small">※ 事例の数値は、出典元（提供元の導入事例や利用者の記事）による発表・報告です。当サイトでの検証はしていません。</p>' : ''}${refsHtml}
<h2>導入の手軽さ</h2><p>${'●'.repeat(p.ease.level)}${'○'.repeat(5 - p.ease.level)} <strong>${EASE[p.ease.level]}</strong> — ${esc(p.ease.text)}</p>
${p.ease.install ? `<pre><code>${esc(p.ease.install)}</code></pre><p class="small">※ 代表的な導入コマンドの例です。最新の手順は公式ドキュメントを確認してください。</p>` : ''}
<h2>ライセンス</h2><p><strong>${esc(p.license.name)}</strong>${p.license.spdx && p.license.spdx !== 'NOASSERTION' ? `（SPDX: ${esc(p.license.spdx)}）` : ''}。${esc(p.license.note || '')}</p>
<p class="small">ライセンスの説明は要点のみです。利用前にリポジトリのLICENSEファイル原文を確認してください。</p>
<h2>リポジトリ情報</h2>
<ul class="list"><li>GitHub：<a href="https://github.com/${esc(p.repo)}" rel="noopener">https://github.com/${esc(p.repo)}</a></li><li>スター数：${fmtNum(p.github.stars)}（${fetched} 取得）</li><li>最終push：${fmtDate(p.github.pushedAt)}（${fetched} 取得）</li><li>掲載日：${fmtDate(p.added)} ／ 内容確認日：${fmtDate(p.checked || p.added)}</li></ul>
<div class="sponsor">スポンサー募集中 — <a href="/sponsor/">掲載のご相談</a></div>
<h2>同じカテゴリのOSS</h2><div class="grid">${projects.filter((q) => q.category === p.category && q.slug !== p.slug).map(card).join('') || '<p class="small">まだありません。</p>'}</div>`;
  write(`projects/${p.slug}/index.html`, layout({ title: `${p.name}とは？使い方と活用事例`, description: desc, pathName: `/projects/${p.slug}/`, body, jsonld: ld, crumbs }));
}

// all projects
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: 'すべてのOSS', path: '/projects/' }];
  const rows = projects.map((p) => `<tr><td><a href="/projects/${p.slug}/">${esc(p.name)}</a><div class="small">${esc(p.tagline)}</div></td><td><a href="/categories/${p.category}/">${esc(catMap[p.category].name)}</a></td><td class="num">★ ${fmtNum(p.github.stars)}</td><td>${EASE[p.ease.level]}</td><td>${p.cases.length ? p.cases.length + '件' : '未収集'}</td></tr>`).join('');
  const body = `<h1>すべてのOSS（${projects.length}件）</h1><p class="lead">掲載中のオープンソースをGitHubスター数の多い順に並べています（スター数は ${latestFetch} 時点）。</p>
<table class="idx"><thead><tr><th>プロジェクト</th><th>カテゴリ</th><th>スター</th><th>導入</th><th>事例</th></tr></thead><tbody>${rows}</tbody></table>`;
  write('projects/index.html', layout({ title: 'すべてのOSS一覧', description: `${site.name}に掲載中のオープンソース${projects.length}件の一覧。カテゴリ・導入の手軽さ・事例の有無を比較できます。`, pathName: '/projects/', body, jsonld: [itemListLd('すべてのOSS', projects), breadcrumbLd(crumbs)], crumbs }));
}

// categories
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: 'カテゴリ別', path: '/categories/' }];
  const body = `<h1>カテゴリ別に探す</h1><div class="grid">${categories.map((c) => { const n = projects.filter((p) => p.category === c.slug).length; return `<div class="card"><h3><a href="/categories/${c.slug}/">${esc(c.name)}</a></h3><p>${esc(c.description)}</p><div class="meta">${n}件</div></div>`; }).join('')}</div>`;
  write('categories/index.html', layout({ title: 'カテゴリ別一覧', description: 'AIアプリ基盤、ローカルLLM、業務自動化、ブラウザ自動化など、カテゴリ別にオープンソースを探せます。', pathName: '/categories/', body, jsonld: [breadcrumbLd(crumbs)], crumbs }));
  for (const c of categories) {
    const list = projects.filter((p) => p.category === c.slug);
    const cc = [...crumbs, { name: c.name, path: `/categories/${c.slug}/` }];
    const b = `<h1>${esc(c.name)}のOSS（${list.length}件）</h1><p class="lead">${esc(c.description)}</p><div class="grid">${list.map(card).join('') || '<p class="small">まだ掲載がありません。</p>'}</div>`;
    write(`categories/${c.slug}/index.html`, layout({ title: `${c.name}のオープンソース一覧`, description: `${c.name}：${c.description} 掲載${list.length}件。`, pathName: `/categories/${c.slug}/`, body: b, jsonld: [itemListLd(c.name, list), breadcrumbLd(cc)], crumbs: cc }));
  }
}

// uses
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: '用途別', path: '/uses/' }];
  const used = uses.filter((u) => projects.some((p) => p.uses.includes(u.slug)));
  const body = `<h1>用途別に探す</h1><p class="lead">やりたいことからOSSを探せます。</p><p>${used.map((u) => `<a class="tag" href="/uses/${u.slug}/">${esc(u.name)}（${projects.filter((p) => p.uses.includes(u.slug)).length}）</a>`).join('')}</p>`;
  write('uses/index.html', layout({ title: '用途別一覧', description: '社内AI活用、RAG、業務自動化、ブラウザ自動化、SNS運用など、用途別にオープンソースを探せます。', pathName: '/uses/', body, jsonld: [breadcrumbLd(crumbs)], crumbs }));
  for (const u of used) {
    const list = projects.filter((p) => p.uses.includes(u.slug));
    const cc = [...crumbs, { name: u.name, path: `/uses/${u.slug}/` }];
    const b = `<h1>「${esc(u.name)}」に使えるOSS（${list.length}件）</h1><div class="grid">${list.map(card).join('')}</div>`;
    write(`uses/${u.slug}/index.html`, layout({ title: `${u.name}に使えるオープンソース`, description: `${u.name}に使えるオープンソース${list.length}件を、活用事例・導入の手軽さ・ライセンスつきで紹介。`, pathName: `/uses/${u.slug}/`, body: b, jsonld: [itemListLd(u.name, list), breadcrumbLd(cc)], crumbs: cc }));
  }
}

// home
{
  const newest = [...projects].sort((a, b) => fmtDate(b.added).localeCompare(fmtDate(a.added)) || (b.github.stars - a.github.stars));
  const body = `<h1>${esc(site.name)}</h1><p class="lead">${esc(site.description)}</p>
<div class="sponsor">スポンサー募集中 — <a href="/sponsor/">掲載のご相談</a></div>
<h2>カテゴリから探す</h2><div class="grid">${categories.map((c) => `<div class="card"><h3><a href="/categories/${c.slug}/">${esc(c.name)}</a></h3><p>${esc(c.description)}</p><div class="meta">${projects.filter((p) => p.category === c.slug).length}件</div></div>`).join('')}</div>
<h2>用途から探す</h2><p>${uses.filter((u) => projects.some((p) => p.uses.includes(u.slug))).map((u) => `<a class="tag" href="/uses/${u.slug}/">${esc(u.name)}</a>`).join('')}</p>
<h2>掲載中のOSS（${projects.length}件）</h2><div class="grid">${newest.map(card).join('')}</div>
<p class="small">スター数はGitHub APIから ${latestFetch} に取得。最終更新：${buildDate}</p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs('/'), description: site.description, inLanguage: 'ja' }, itemListLd('掲載中のOSS', newest)];
  write('index.html', layout({ title: site.name, description: site.description, pathName: '/', body, jsonld: ld }));
}

// about
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: 'このサイトについて', path: '/about/' }];
  const body = `<h1>このサイトについて・編集方針</h1>
<p>${esc(site.name)}は、GitHubで公開されているAI・開発・業務自動化系のオープンソース（OSS）を、日本語で「何ができて、実際にどう使われているか」がわかるように紹介するサイトです。</p>
<h2>掲載内容の方針</h2><ul class="list">
<li>1プロジェクト1ページで、何ができるか・向いている用途・活用事例・導入の手軽さ・ライセンス・GitHubの数値をまとめます。</li>
<li>活用事例は、出典（提供元の導入事例、利用者のブログ、検証記事など）のURLを必ず載せます。出典を確認できる事例がない場合は「事例未収集」と書きます。</li>
<li>事例の数値は出典元の発表・報告であり、当サイトでは検証していません。</li>
<li>本文は出典の翻訳・転載ではなく、当サイトの言葉で要約しています。</li>
<li>GitHubスター数と最終更新日（最終push日）はGitHub APIから取得し、取得日を併記します。</li>
<li>「導入の手軽さ」は、公式の導入手順をもとにした当サイトの目安（5段階）です。</li>
<li>ライセンスの説明は要点のみです。利用前に必ず原文を確認してください。なお、OSI定義のオープンソースではない「ソース公開型」のライセンスのプロジェクトも、その旨を明記して掲載しています。</li>
</ul>
<h2>AI・検索エンジン向け</h2><p><a href="/llms.txt">llms.txt</a>（サイトの要約）と <a href="/projects.json">projects.json</a>（掲載データ）を公開しています。</p>
<h2>掲載・修正のご相談</h2><p><a href="/sponsor/">掲載のご相談</a>のページをご覧ください。</p>`;
  write('about/index.html', layout({ title: 'このサイトについて・編集方針', description: `${site.name}の編集方針：出典つきの事例、取得日つきの数値、自分の言葉での要約。`, pathName: '/about/', body, jsonld: [breadcrumbLd(crumbs)], crumbs }));
}

// sponsor
{
  const crumbs = [{ name: 'トップ', path: '/' }, { name: '掲載のご相談', path: '/sponsor/' }];
  const body = `<h1>掲載のご相談（スポンサー募集中）</h1>
<p>${esc(site.name)}では、AI・開発・業務自動化に関わるOSSプロジェクトや関連サービスのスポンサー掲載を募集する予定です。</p>
<h2>想定している掲載枠</h2><ul class="list"><li>トップページ・各ページのスポンサー枠（「スポンサー」と明記して表示します）</li><li>関連するカテゴリ・用途ページでの紹介枠</li></ul>
<h2>掲載の方針</h2><ul class="list"><li>スポンサー掲載は広告であることを明示し、通常の紹介ページ（事例・評価）の内容には影響させません。</li><li>出典のない事例や、検証できない数値の掲載はお受けしません。</li></ul>
<h2>お問い合わせ先</h2><p class="note">お問い合わせ窓口は現在準備中です。窓口が決まり次第、このページでお知らせします。</p>`;
  write('sponsor/index.html', layout({ title: '掲載のご相談（スポンサー募集中）', description: `${site.name}のスポンサー掲載について。お問い合わせ窓口は準備中です。`, pathName: '/sponsor/', body, jsonld: [breadcrumbLd(crumbs)], crumbs }));
}

// 404 (not in sitemap)
write('404.html', layout({ title: 'ページが見つかりません', description: 'お探しのページは見つかりませんでした。', pathName: '/404', body: `<h1>ページが見つかりません</h1><p><a href="/">トップへ戻る</a> / <a href="/projects/">すべてのOSS</a></p>` }));
pageList.pop();

// projects.json
write('projects.json', JSON.stringify({ site: site.name, url: site.url, generated: buildDate, count: projects.length, projects: projects.map((p) => ({ slug: p.slug, name: p.name, url: abs(`/projects/${p.slug}/`), repo: `https://github.com/${p.repo}`, category: catMap[p.category].name, uses: p.uses.map((u) => useMap[u].name), tagline: p.tagline, license: p.license.name, stars: p.github.stars, pushedAt: fmtDate(p.github.pushedAt), fetchedAt: fmtDate(p.github.fetchedAt), ease: EASE[p.ease.level], cases: p.cases.map((c) => ({ title: c.title, source: c.source.url })) })) }, null, 2));

// sitemap / robots / llms.txt
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageList.map((p) => { const proj = projects.find((q) => p === `/projects/${q.slug}/`); return `  <url><loc>${abs(p)}</loc><lastmod>${proj ? fmtDate(proj.checked || proj.added) : buildDate}</lastmod></url>`; }).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);
write('llms.txt', `# ${site.name}\n\n> ${site.description}\n\n掲載数: ${projects.length}件 / GitHubスター数の取得日: ${latestFetch} / 最終ビルド: ${buildDate}\n事例は出典URLつき。出典のない場合は「事例未収集」と記載。数値は出典元の発表であり当サイトでは未検証。\n\n## プロジェクト\n\n${projects.map((p) => `- [${p.name}](${abs(`/projects/${p.slug}/`)}): ${p.tagline}（${catMap[p.category].name}／★${fmtNum(p.github.stars)}・${fmtDate(p.github.fetchedAt)}取得／${p.license.name}／事例${p.cases.length ? p.cases.length + '件' : '未収集'}）`).join('\n')}\n\n## カテゴリ\n\n${categories.map((c) => `- [${c.name}](${abs(`/categories/${c.slug}/`)}): ${c.description}`).join('\n')}\n\n## 用途\n\n${uses.filter((u) => projects.some((p) => p.uses.includes(u.slug))).map((u) => `- [${u.name}](${abs(`/uses/${u.slug}/`)})`).join('\n')}\n\n## その他\n\n- [すべてのOSS一覧](${abs('/projects/')})\n- [このサイトについて・編集方針](${abs('/about/')})\n- [掲載データ（JSON）](${abs('/projects.json')})\n`);

console.log(`built ${projects.length} projects, ${pageList.length} pages -> dist/`);
