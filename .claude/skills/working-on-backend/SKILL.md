---
name: working-on-backend
description: Use whenever editing or adding code under `packages/backend/` — including REST API endpoints, NestJS services/modules, TypeORM entities, migrations, and backend tests. Covers NestJS DI patterns, TypeORM entity conventions, endpoint-list registration, meta/paramDef/res, misskey-js regeneration, migration up/down rules, and the `.config/test.yml` prerequisite. Must be consulted before any backend change to avoid CI failures and production incidents. This is NOT waived by having already invoked brainstorming, writing-plans, or any other upstream skill — invoke this at implementation time regardless of what preceded it.
---

# working-on-backend

`packages/backend/` (Misskey サーバー本体) を編集するとき、最初に参照するスキル。NestJS / TypeORM / API endpoint / migration / backend テストの **手順** と **背景知識** をまとめている。

SKILL.md 本体は references への索引だけ。具体的な手順や規約は該当ファイルを Read すること (progressive disclosure)。

**他スキル実行後も免除されない。** `brainstorming` / `writing-plans` / その他アップストリームスキルを先に呼んでいても、`packages/backend/` に触れる実装フェーズに入る時点でこのスキルを呼ぶこと。

## endolphin 固有: 削除済み機能の削除コントラクト (★ upstream マージで踏み外しやすい)

endolphin は本家の一部機能を削除した軽量 fork (背景は [AGENTS.md](../../../AGENTS.md) の「endolphin fork の前提」)。backend では削除機能を **物理削除せずスタブ化** している。この契約を破ると機能削除ポリシーが崩れる:

- **read 系 endpoint**: endpoint-list 登録・`meta` / `paramDef` / `res`・misskey-js 型生成を維持したまま、ハンドラ本体を、削除済み entity / service を参照しない **静的な空レスポンス** (`[]` / `null` / 既定値) に置き換える。
- **write 系 endpoint** (create / update / delete / like 等): 同じく登録を維持し、ハンドラは `ApiError` で `FEATURE_REMOVED` (HTTP 410 Gone) を throw する。
- **entity / table / migration / JSON schema は温存** (DB・型互換維持、破壊的 drop migration を作らない)。物理削除するのは業務 service・packing service と、未使用化した repository provider のみ。

**やってはいけない**: スタブ endpoint を「実装が欠けている / 壊れている」と誤認して本家実装を復元する / 削除機能の entity・migration を drop する / 削除機能に新規 endpoint・service を足す。upstream マージで削除機能に競合が出たら、実装を戻すのではなく **スタブを再適用** する。

機能ごとの keep / remove / no-op 分類と各 endpoint の正確な扱いは [docs/endolphin/feature-inventory.md](../../../docs/endolphin/feature-inventory.md) が正本。削除機能に触れる前に必ずここを引く。

## 作業別ワークフロー (tasks)

タスク単位の完結したチェックリスト + チェックポイント。新しい何かを足すときに開く。

- 新規 REST API endpoint を追加する → [references/tasks/adding-api-endpoint.md](references/tasks/adding-api-endpoint.md)
- DB migration を作成する (TypeORM CLI / 手書きどちらも) → [references/tasks/creating-migration.md](references/tasks/creating-migration.md)

## 共通知識 (knowledge)

タスクに紐付かない参照リファレンス。複数のタスクから引かれる規約・背景説明。

- NestJS DI / module 登録 / `@Injectable` パターン → [references/knowledge/nestjs-di.md](references/knowledge/nestjs-di.md)
- TypeORM entity / `@Column` / `@Index` パターン (難ケース込み) → [references/knowledge/typeorm-patterns.md](references/knowledge/typeorm-patterns.md)
- API endpoint の `meta` / `paramDef` / `res` 完全早見表 + 落とし穴集 → [references/knowledge/api-meta-paramdef.md](references/knowledge/api-meta-paramdef.md)
- `endpoint-list.ts` への登録方法 (★ 漏れると 404) → [references/knowledge/endpoint-list.md](references/knowledge/endpoint-list.md)
- backend テストの前提 (`.config/test.yml`) と書き方 / e2e ヘルパー一覧 → [references/knowledge/backend-testing.md](references/knowledge/backend-testing.md)

## 必ず最後に通る場所

backend の変更を commit / PR にする前に、必ず [shipping-misskey-change](../shipping-misskey-change/SKILL.md) の最終チェックリストに従う。

API endpoint を追加・変更したなら、その出口で [misskey-api-reviewer](../../agents/misskey-api-reviewer.md) agent (この skill の規約を review-mode から機械チェックする専門 reviewer) を Task で起動すると、endpoint-list 登録漏れや misskey-js 再生成漏れを取りこぼしにくい。
