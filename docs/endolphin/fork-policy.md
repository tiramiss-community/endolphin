# endolphin Fork Policy

endolphin は本家 Misskey の軽量 fork（小規模コミュニティ向け）。本ドキュメントは fork の運用規約を定める。
プロダクト定義は [プロダクト定義 spec](../superpowers/specs/2026-06-18-endolphin-product-definition-design.md) を参照。

## アイデンティティ

- 名称: **endolphin**（dolphin + endorphin）。
- ライセンス: AGPL-3.0-only（本家を継承。SPDX ヘッダー規約も継承）。
- fork メタデータ: `endolphin.json`（名称 / fork version / 追従先 upstream / `basedOn` upstream version）。

## remote / ブランチ運用

- `origin` = fork (`tiramiss-community/endolphin`、別途作成)。`upstream` = 本家 (`misskey-dev/misskey`)。
- fork の主開発ラインは `origin/develop`（upstream 由来 + endolphin の変更を統合）。
- `upstream/develop` は読み取り専用の追従元。fork から push しない。

## upstream 追従フロー

1. 状況確認: `node scripts/sync-upstream.mjs --check`
2. 同期ブランチを作成: `git switch -c sync/upstream-<yyyymmdd>`
3. マージ（rebase ではなく merge で履歴を保つ）: `git merge upstream/develop`
4. 競合解消。削除済み機能に upstream が触れている場合は、本 fork の削除方針（spec §5）に従って drop する。
5. `basedOn` 更新: `node scripts/sync-upstream.mjs --set-base`
6. 検証: `pnpm lint` と `pnpm --filter backend test:fed`
7. PR を作成して `origin/develop` へマージ。

追従コストの原則（spec P2）: 高 churn なコア（TL / ノート / 投稿 / ドライブ / 連合）は流用し続け、改変は低 churn 部に限定する。

## バージョニング

- 本家の `package.json` `version`（CalVer）は **upstream 所有**として手編集しない。upstream マージで自然に上がる。
- endolphin 自身のバージョンは `endolphin.json` の `version` で管理する。
- `endolphin.json` の `basedOn` が「現在どの upstream version をベースにしているか」を示す。

## CHANGELOG 規約

- `CHANGELOG.md` は **upstream 所有**。fork では手編集しない（→ upstream マージ時に競合しない）。
- endolphin 固有の変更は `CHANGELOG-endolphin.md` の `## Unreleased` に追記する。
- 書式は本家に倣い `### General/Client/Server` 下に `- <Feat|Enhance|Fix|Remove>: <概要>`。機能削除は `Remove:`。

## ブランディング

表層リブランディング（2026-06-22 確定）。連合ゲート（本家完全準拠）と追従コスト最小（spec P2・P3）を守るため、改名は**アプリ識別名に限定**し、連合・内部識別子・プラットフォーム prose・ビジュアル資産は温存する。下記 **4 境界**を方針とする:

| 領域 | 決定 |
|---|---|
| アプリ識別名（タイトル / PWA manifest / `application-name` メタ / about ページ wordmark / OpenSearch / error・CLI・BIOS view） | **Endolphin に改名** |
| 連合自己申告（nodeinfo `software.name` / 連合 User-Agent / webhook ヘッダ） | **`misskey` 維持**（feature-detection を壊さない。spec P3 完全準拠） |
| 内部識別子（`Mi*` prefix / package 名 `misskey`・`misskey-js` / DB 名 default / `misskey_app` mount div / `_misskey_*` AP 拡張） | **温存**（改名しない） |
| ビジュアル資産（ロゴ / favicon / app icon / splash / テーマ色 `#86b300`） | **差し替え口だけ整備**（資産作成は後続・当面は Misskey 由来のまま）。台帳は [branding.md](branding.md) |

- **表記ルール**: ユーザー向け表示名は**先頭大文字の `Endolphin`** で統一。小文字 `endolphin` は内部識別子・`endolphin.json` の `name`・リポジトリ名・package 名など**コード/メタ上の識別子に限り**温存する。
- **プラットフォーム説明 prose**（`introMisskey` / `poweredByMisskeyDescription` / `_aboutMisskey.*` 等）は「Misskey というソフトウェア」を指す記述で fork でも正確、かつ ja-JP 以外は Crowdin 管理で編集不可のため**温存**する。
- **ビジュアル資産の差し替え口**は [docs/endolphin/branding.md](branding.md) に台帳化。資産を用意したら同 doc のパスを実体差し替えする。
- **AGPL ソース提供**: `repositoryUrl` / `feedbackUrl` の DB カラム既定値は upstream のまま温存し（schema を upstream と一致させ migration 増を避ける）、運用者が管理画面で endolphin のソース公開先に設定する。

## 連合ゲート（本家完全準拠）

- ActivityPub は本家完全準拠を維持する。diverge させない。
- 受け入れゲート: `pnpm --filter backend test:fed`（実行前に `.config/test.yml` が必要）。
- 削除対象 8 機能はいずれも連合オブジェクトではないため、削除は連合に影響しない（spec 付録A）。
