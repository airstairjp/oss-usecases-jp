// GitHubスター数・最終push日を GitHub API で取得し、projects/*.yaml の github: ブロックを書き換える。
// 認証: 環境変数 GITHUB_TOKEN / GH_TOKEN、なければ `gh auth token`（無くても未認証で動くが60回/時の制限あり）。
// 使い方: node scripts/update-stars.mjs [slug ...]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'projects');
let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!token) { try { token = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {} }
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const only = process.argv.slice(2);
let failed = 0;

for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.yaml')).sort()) {
  const file = path.join(DIR, f);
  const text = fs.readFileSync(file, 'utf8');
  const p = yaml.load(text);
  if (only.length && !only.includes(p.slug)) continue;
  const res = await fetch(`https://api.github.com/repos/${p.repo}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'oss-usecases-jp', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) { console.error(`NG ${p.slug} (${p.repo}): HTTP ${res.status}`); failed++; continue; }
  const j = await res.json();
  if (j.full_name && j.full_name.toLowerCase() !== p.repo.toLowerCase()) console.warn(`注意 ${p.slug}: リポジトリ名が ${j.full_name} に変わっています（repo の更新を検討）`);
  const pushed = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(j.pushed_at));
  const block = `github:\n  stars: ${j.stargazers_count}\n  pushedAt: ${pushed}\n  fetchedAt: ${today}\n`;
  const next = /^github:\n(?:[ \t]+.*\n?)*/m.test(text) ? text.replace(/^github:\n(?:[ \t]+.*\n?)*/m, block) : text.replace(/\n*$/, '\n') + block;
  fs.writeFileSync(file, next);
  console.log(`OK ${p.slug}: ★${j.stargazers_count} push ${pushed}${p.github ? ` (前回 ★${p.github.stars})` : ''}`);
}
if (failed) process.exit(1);
