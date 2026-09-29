# Endolphin ドキュメントサイト

## 技術選定

VitePress を使い、Markdown を静的サイトとして GitHub Pages に公開します。リポジトリが Node.js / pnpm を使っているため、文書用ツールも同じ環境で扱えます。標準テーマにローカル全文検索があり、独立 pnpm workspace によってアプリ本体の依存関係と分離できます。

MkDocs は Python とテーマの別管理が必要です。Jekyll は GitHub Pages との連携が簡単ですが、標準環境のプラグイン制約があり、検索には追加実装が必要です。文書サイトで必要な日本語ナビゲーション、検索、Pages 用ビルドを少ない構成で満たせるため VitePress を選びました。

## 編集とローカル確認

```sh
cd docs/site
pnpm install --frozen-lockfile
pnpm dev
```

本番相当のビルドとプレビューは次のコマンドで確認します。

```sh
pnpm build
pnpm preview
```

Markdown は `guide/` と `setup/` に配置します。ページを追加・移動したら `.vitepress/config.ts` のナビゲーションとサイドバーも更新してください。内部リンクは `/guide/...` のようなサイトルート基準で記述します。

## リリースごとの更新

一般向けページはサイト全体の対象版を固定表示せず、最新リリースへのリンクを案内します。新しい正式リリースのたびに、機能と本家との差分を確認してください。構築手順のタグ・イメージは再現性のため具体的な版に固定しています。新しい版で構築と復元手順を確かめてから、各コマンドとページの版表記を更新してください。表示だけを先に新しくしないでください。

## GitHub Pages 公開

`.github/workflows/docs.yml` は Pull Request でインストールとビルドを行い、`develop` への push で Pages artifact を作成して公開します。GitHub リポジトリの Pages source は **GitHub Actions** に設定してください。公開 URL は `https://tiramiss-community.github.io/endolphin/` です。
