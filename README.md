# OSS活用事例集（oss-usecases-jp）

AI・開発・自動化・業務ツールのオープンソース（OSS）を、何ができるか／向いている用途／出典つきの活用事例／導入の手軽さ／ライセンス／GitHubスター数（取得日つき）と一緒に、1プロジェクト1ページで日本語紹介する静的サイト。

- 公開URL: https://oss-usecases-jp.pages.dev （Cloudflare Pages）
- 生成物: トップ / プロジェクトページ / すべてのOSS / カテゴリ別 / 用途別 / このサイトについて / 掲載のご相談 / JSON-LD / sitemap.xml / robots.txt / llms.txt / projects.json
- 依存は js-yaml のみ。`scripts/build.mjs` が `dist/` に静的HTMLを出力する。

## 構成

```
projects/<slug>.yaml   1プロジェクト = 1ファイル（ファイル名 = slug）
data/categories.yaml   カテゴリ定義
data/uses.yaml         用途タグ定義
data/site.yaml         サイト名・URL・姉妹サイト
scripts/build.mjs      ビルド（必須項目・カテゴリ・用途・出典URLを検証）
scripts/generate_ogp.py  OGP画像生成（Pillow、build から自動呼び出し）
scripts/update-stars.mjs  GitHub API でスター数・最終push日を更新（github: ブロックを書き換え）
public/                dist/ にそのままコピーするファイル
```

## プロジェクトの追加（毎日の追加作業）

1. 既存の `projects/*.yaml` をコピーして `projects/<slug>.yaml` を作る（slug は英小文字・数字・ハイフン）。
2. 必須: `slug, name, repo(owner/name), category, uses, tagline, what, goodFor, ease{level 1-5, text, install?}, license{spdx, name, note}, added`。任意: `homepage, notFor, refs, checked`。
3. `cases:` は出典URL必須（`source: {name, url}`）。出典を確認できる事例がなければ `cases: []` にする（ページに「事例未収集」と出る）。紹介投稿など事例でないものは出典管理用に `refs:` に入れられる（公開ページには表示しない）。
4. 本文は自分の言葉で要約（丸写ししない）。数値は「出典元の発表」として書く。
5. `node scripts/update-stars.mjs <slug>` で github: ブロック（スター数・最終push・取得日）を追記。
6. `npm run build` でエラーがないことを確認 → デプロイ。


## OGP画像

ビルド時に `scripts/generate_ogp.py`（Pillow）が 1200×630 のOG画像を生成する。

- サイト共通: `dist/ogp/default.png`（トップ・一覧・カテゴリ・用途・その他）
- プロジェクト別: `dist/ogp/projects/<slug>.png`（名前・repo・一言・カテゴリ・★と取得日・ロゴ）
- 指紋（内容ハッシュ）が同じなら `.ogp-cache/` から再利用（再生成しない）
- フォント: システム同梱の Noto Serif/Sans CJK（追加インストール不要）
- `.ogp-cache/` と `design/` は gitignore（画像バイナリはリポジトリに含めない）

`npm run build` の最後で自動実行される。単体実行: `python3 scripts/generate_ogp.py`

## 毎朝のルーチン（VPS 上）

```
cd /root/oss-usecases-jp
node scripts/update-stars.mjs          # 全件のスター数・最終push日を更新（gh auth token を使用）
npm run build                          # HTML + OGP画像（変更分のみ再生成、.ogp-cache 利用）
npx --yes wrangler@4 pages deploy dist --project-name oss-usecases-jp --branch main --commit-dirty=true
git add -A && git status               # design/ と .ogp-cache/ は ignore 済み
git commit -m "Update stars $(TZ=Asia/Tokyo date +%F)" && git push origin main
curl -s -o /dev/null -w "%{http_code}\n" https://oss-usecases-jp.pages.dev/sitemap.xml
curl -s -o /dev/null -w "%{http_code} ogp\n" https://oss-usecases-jp.pages.dev/ogp/default.png
```

wrangler の認証は VPS の `~/.config/.wrangler`（OAuth ログイン済み）を使う。トークンで動かす場合は `CLOUDFLARE_API_TOKEN` を設定。
独自ドメインにする場合は `SITE_URL=https://example.jp npm run build` で canonical / sitemap / llms.txt のURLを切り替える（`data/site.yaml` の url も更新）。
