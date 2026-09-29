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

## 対象リリースの更新

サイトの対象版は `.vitepress/config.ts` の `targetVersion` に固定しています。本文の機能・構築手順を新しい正式リリースに照らしてレビューした後、本文中の対象版表記と合わせてこの値を更新してください。表示だけが先行しないよう、リリースごとに手動で確認します。

## GitHub Pages 公開

`.github/workflows/docs.yml` は Pull Request でインストールとビルドを行い、`develop` への push で Pages artifact を作成して公開します。GitHub リポジトリの Pages source は **GitHub Actions** に設定してください。公開 URL は `https://tiramiss-community.github.io/endolphin/` です。
