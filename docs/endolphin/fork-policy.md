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

- Phase 0 ではブランディングを**深く適用しない**（"Misskey" 文字列は高 churn かつ広範で、深い置換は追従コストを跳ね上げる）。
- 方針: ブランディングは**隔離された設定/限定箇所**で上書きし、適用は Phase 3（クライアント厳選）で行う。Phase 0 は名称（endolphin）とこの方針の確定までとする。

## 連合ゲート（本家完全準拠）

- ActivityPub は本家完全準拠を維持する。diverge させない。
- 受け入れゲート: `pnpm --filter backend test:fed`（実行前に `.config/test.yml` が必要）。
- 削除対象 8 機能はいずれも連合オブジェクトではないため、削除は連合に影響しない（spec 付録A）。
