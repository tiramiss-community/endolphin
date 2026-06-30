# endolphin Fork Policy

endolphin は本家 Misskey の軽量 fork（小規模コミュニティ向け）。本ドキュメントは fork の**プロダクト定義と運用規約の正本**。設計判断の根拠が必要なときは「設計原則」節を参照する。

> 本ドキュメントは旧 `docs/superpowers/specs/2026-06-18-endolphin-product-definition-design.md`（プロダクト定義 spec, writing-plans 作業領域）の恒久的内容を統合したもの。spec は役目を終えて削除済。具体的な機能分類・削除コントラクトは [feature-inventory.md](feature-inventory.md) が正本。

## プロダクト定義（コンセプト / ターゲット）

かつての **dolphin** に着想を得た軽量 Misskey fork。ブランド名 **endolphin**（dolphin + endorphin のもじり）。機能を厳選し「これだけあればいい」体験に絞るが、本家の ActivityPub 連合と REST API 互換は維持し、Fediverse / 既存エコシステムから孤立しない。

- **対象**: 知人・趣味でつながる 〜数百人規模のサーバ。リスト / アンテナ / 最小限のモデレーションは必要。
- **非対象**: 数千〜数万人の大規模公開インスタンス、企業運用、本家のフル機能を求める層。

「小規模コミュニティ向け」であることが、すべての「削るか残すか」判断の物差しになる。

## 設計原則（全判断の上位ルール）

機能の keep / remove、upstream マージ衝突時の流用 / 改変、リブランディングの境界 ―― すべてこの 3 原則で判断する。

### P1. 厳選 UX ファースト
削るのは**機能単位**（画面・サブシステムを丸ごと落とす）。パワーユーザーが愛する UI アフォーダンス（デッキの多カラム等）は剥がさない。厳選は「機能の数」を絞ることであって「UI の自由度」を削ることではない。

### P2. 追従コスト ∝ 本家更新頻度
高 churn 部（タイムライン / ノート / 投稿 / ドライブ / 連合）は**流用し続ける**。低 churn 部（オンボーディング / About / 一部設定画面、削除対象機能）のみ自作・削除・改変してよい。アーキテクチャを本家から離すほど cherry-pick が「翻訳」になり追従コストが跳ね上がるため、Hono 移行・脱 NestJS 等の高 churn コア改変は後回し（「フェーズ記録」Phase 4+）。

### P3. 互換維持
- **連合**: ActivityPub は本家完全準拠。連合挙動を一切 diverge させない（詳細は「連合ゲート」節）。
- **API 互換**: 削除分を除いた Misskey REST API 互換を保ち、misskey-js と既存サードパーティアプリが動く状態を壊さない。削除機能も endpoint-list 登録と misskey-js の型生成を維持し、read 系は空（`[]` / `null` / 既定値）、write 系は `FEATURE_REMOVED`(HTTP 410) を返す。entity / table / migration / JSON schema は温存する（DB・型互換維持、破壊的 drop migration なし）。具体的な削除コントラクトは [feature-inventory.md](feature-inventory.md) を参照。

## 機能セット / 削除実行方式

確定した keep / remove 機能の一覧、各 endpoint・画面の分類、削除コントラクトは [feature-inventory.md](feature-inventory.md) が正本。要点のみ:

- **削除済**: お気に入り / ページ / ギャラリー / 実績 / Games / 埋め込み（Phase 1）、チャート（Phase 2）、管理DB統計 / リテンション分析 / 広告・プロモ（Phase 4a）、チャット（Phase 4b）。
- **残す**: チャンネルを含むコア機能群。チャンネルは当初削除候補だったが、ノート生成 / ストリーミング / TL の最ホットコアに深く結合し削除が P2 と衝突する／可逆性に劣るため**残す**へ変更（2026-06-19）。
- **削除実行方式（方式 C: churn 駆動ハイブリッド）**: 葉機能は「アプリ層削除 + endpoint スタブ化」、ホットコア絡みは依存を切ってから段階的に、別パッケージ完結機能（埋め込み）はパッケージ・配信ルート・ビルド機構ごと撤去。いずれも entity・migration は温存する。
- 削除機能はいずれも ActivityPub 連合オブジェクトではないため（ローカル専用）、全削除と連合完全準拠は両立する。

## フェーズ記録

プロダクト定義のスコープは Phase 0–3（機能厳選とクライアント厳選）。基盤刷新（Phase 4+）は別サブプロジェクト。

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 0 | fork 基盤（upstream remote / 追従フロー / CHANGELOG / ブランディング方針） | 済 |
| Phase 1 | 機能インベントリ作成 + 葉機能削除（ギャラリー / ページ / 実績 / Games / お気に入り / 埋め込み） | 済（PR #2） |
| Phase 2 | チャート削除（チャンネルは残す） | 済（PR #4） |
| Phase 3 | クライアント厳選（削除機能の画面除去・低 churn ページ自作・高 churn 部は流用維持） | — |
| Phase 4a | Tier A 削減（管理DB統計 / リテンション分析 / 広告・プロモ） | 済（PR #6） |
| Phase 4b | チャット削除 | 済 |
| Phase 4+ | 基盤刷新（Fastify→Hono / 脱 NestJS・自作軽量 DI / ボトルネック改良 / 循環参照解消）。**Phase 4a/4b の機能削減とは別物。** P2 のゲート（追従コストに見合うか）を満たす範囲で、別 spec → plan → 実装サイクルで着手 | 未着手 |

## 成功基準 / 非目標

- **成功基準**: 削除機能の endpoint は登録・型を維持し read=空・write=410 で既存サードパーティアプリが落ちない（misskey-js の endpoint / entity 型が消えない）／ entity・migration 温存で DB 互換を保つ（破壊的 migration なし、`check-migrations` green）／ 本家追従マージが現実的コストで回る／ ActivityPub 連合が本家完全準拠（`test:fed` green）。
- **非目標（v1）**: 性能改善の数値目標達成（軽量化は Phase 4+ の主題）／ 基盤刷新（Hono / 脱 NestJS）／ 新規 UI 体験の刷新（reuse-minus が原則）。

## アイデンティティ

- 名称: **endolphin**（dolphin + endorphin）。
- ライセンス: AGPL-3.0-only（本家を継承。SPDX ヘッダー規約も継承）。
- fork メタデータ: `endolphin.json`（名称 / fork version / 追従先 upstream / `basedOn` upstream version）。

## remote / ブランチ運用

- `origin` = fork (`tiramiss-community/endolphin`、別途作成)。`upstream` = 本家 (`misskey-dev/misskey`)。
- fork の主開発ラインは `origin/develop`（upstream 由来 + endolphin の変更を統合）。
- `upstream/develop` は読み取り専用の追従元。fork から push しない。

## upstream 追従フロー

endolphin は `upstream/develop` を直接取り込むのではなく、**本家の新バージョンタグが出るたびにそのタグを基点にマージする**運用を基本とする。タグを使うことで「どの upstream バージョンを取り込んだか」が PR タイトルと `basedOn` で一目でわかり、変更範囲のレビューもしやすい。

### タグベース追従手順（通常運用）

```
# 1. upstream のタグ一覧を確認
git fetch upstream --tags
git tag -l | grep '^[0-9]' | sort -V | tail -20   # 最新タグを確認

# 2. 同期ブランチを作成（タグ名をそのままブランチ名に含める）
git switch -c sync/upstream-<x.y.z>               # 例: sync/upstream-2026.6.1

# 3. タグを指定してマージ（rebase ではなく merge で履歴を保つ）
git merge <x.y.z>                                  # 例: git merge 2026.6.1

# 4. 競合解消
#    削除済み機能に upstream が触れている場合は本 fork の削除方針に従って drop する
#    → 「機能セット / 削除実行方式」節・feature-inventory.md を参照

# 5. basedOn 更新（endolphin.json の basedOn を、取り込んだ upstream version に手動で書き換える）

# 6. 検証
pnpm lint
pnpm --filter backend test:fed

# 7. PR を作成して origin/develop へマージ
#    PR タイトル例: "sync: upstream 2026.6.1"
```

### upstream の取得（自動ミラー）

upstream の追従元は `.endolphin/` の運用スクリプトが自動で origin 上に用意する（`.github/workflows/endolphin-sync-upstream.yml` が 6 時間ごとに実行。実装は `.endolphin/src/`）:

- `origin/upstream/develop`: upstream develop のミラーブランチ（`sync-upstream`）。
- `upstream/<version>` タグ: upstream の正式リリースのタグを `upstream/` プレフィクス付きで作成（`fetch-releases`、例 `upstream/2026.6.0`）。fork 独自タグとは prefix で分離。

ローカルで状況確認・取得する場合:

```bash
# ミラーとリリースタグを origin から取得
git fetch origin 'refs/heads/upstream/develop' 'refs/tags/upstream/*:refs/tags/upstream/*'

# 取り込み済みの upstream リリース一覧
git tag -l 'upstream/*' | sort -V | tail

# 現在の basedOn と upstream develop ミラーの差（何コミット遅れているか）
git rev-list --count "$(node -e "process.stdout.write(require('./endolphin.json').upstream.basedOn)")"..origin/upstream/develop 2>/dev/null || true
```

### develop ブランチから直接取り込む場合

本家でホットフィックスや緊急パッチがタグ前にリリースされた場合など、特定コミットを取り込む必要があるときは `upstream/develop` を直接 merge してよい。ブランチ名は `sync/upstream-<yyyymmdd>` とし、手順 4–7 は同じ。

追従コストの原則（設計原則 P2）: 高 churn なコア（TL / ノート / 投稿 / ドライブ / 連合）は流用し続け、改変は低 churn 部に限定する。

## バージョニング

- 本家の `package.json` `version`（CalVer）は **upstream 所有**として手編集しない。upstream マージで自然に上がる。
- endolphin 自身のバージョンは `endolphin.json` の `version` で管理する。
- `endolphin.json` の `basedOn` が「現在どの upstream version をベースにしているか」を示す。

## CHANGELOG 規約

- `CHANGELOG.md` は **upstream 所有**。fork では手編集しない（→ upstream マージ時に競合しない）。
- endolphin 固有の変更は `CHANGELOG-endolphin.md` の `## Unreleased` に追記する。
- 書式は本家に倣い `### General/Client/Server` 下に `- <Feat|Enhance|Fix|Remove>: <概要>`。機能削除は `Remove:`。

## GitHub Actions / CI 方針

`.github/workflows/` は upstream 由来。fork で **動かない / 用が無い** ものは整理済（2026-06-25）。upstream マージ時の判断指針は以下:

- **削除済（upstream 専用 / fork 無用）**: `on-release-created.yml`（misskey-js を npm publish）/ `storybook.yml`（Chromatic publish）/ `release-with-dispatch.yml`・`release-edit-with-push.yml`（`misskey-dev/release-manager-actions` 依存）/ `request-release-review.yml`（`@misskey-dev/dev` メンション）/ `deploy-test-environment.yml`（`joinmisskey/misskey-tga` + upstream org メンバーシップ）。**upstream sync でこれらに modify/delete コンフリクトが出たら、実装を戻さず削除を維持する**（スタブ機能と同じ＝復活させない）。
- **fork 向け付け替え（Docker）**: `docker-develop.yml` / `docker.yml` は publish 先を `misskey/misskey`（upstream Docker Hub）から `ghcr.io/tiramiss-community/endolphin`（認証はビルトイン `GITHUB_TOKEN`、追加 secret 不要）へ変更し、guard を `github.repository == 'tiramiss-community/endolphin'` へ反転。`docker-develop` が develop push で `:develop` を、`docker.yml` が git タグ push でバージョンタグを publish する。upstream がこれらを更新したら、レジストリ / guard / login の付け替えだけ再適用する。
- **fork 向け付け替え（changelog-check）**: `changelog-check.yml` の検査対象を upstream 所有の `CHANGELOG.md` から fork の `CHANGELOG-endolphin.md` へ変更（checkout / copy ステップのみ。チェッカ本体 `scripts/changelog-checker/` は無改変）。fork PR の changelog 追記を**構造的に**検証する（`## Unreleased` 配下に追記されているか・カテゴリ順が崩れていないか）。なお追記の**有無**自体は強制しない（presence ゲートではない＝entry 漏れは shipping チェックリストでカバー）。
- **維持**: lint / test（backend / federation / frontend / Playwright / misskey-js / production）/ SPDX・misskey-js・api.json 整合 / locale / labeler / dockle / PR インサイト（bundle / memory / api-diff）は upstream のまま流用。`check-spdx-license-id.yml` の copyright（`syuilo and misskey-project`）は改名しない（アイデンティティ節 / SPDX 規約に従う）。

## ブランディング

表層リブランディング（2026-06-22 確定）。連合ゲート（本家完全準拠）と追従コスト最小（設計原則 P2・P3）を守るため、改名は**アプリ識別名に限定**し、連合・内部識別子・プラットフォーム prose・ビジュアル資産は温存する。下記 **4 境界**を方針とする:

| 領域 | 決定 |
|---|---|
| アプリ識別名（タイトル / PWA manifest / `application-name` メタ / about ページ wordmark / OpenSearch / error・CLI・BIOS view） | **Endolphin に改名** |
| 連合自己申告（nodeinfo `software.name` / 連合 User-Agent / webhook ヘッダ） | **`misskey` 維持**（feature-detection を壊さない。設計原則 P3 完全準拠） |
| 内部識別子（`Mi*` prefix / package 名 `misskey`・`misskey-js` / DB 名 default / `misskey_app` mount div / `_misskey_*` AP 拡張） | **温存**（改名しない） |
| ビジュアル資産（ロゴ / favicon / app icon / splash / テーマ色 `#86b300`） | **差し替え口だけ整備**（資産作成は後続・当面は Misskey 由来のまま）。台帳は [branding.md](branding.md) |

- **表記ルール**: ユーザー向け表示名は**先頭大文字の `Endolphin`** で統一。小文字 `endolphin` は内部識別子・`endolphin.json` の `name`・リポジトリ名・package 名など**コード/メタ上の識別子に限り**温存する。
- **プラットフォーム説明 prose**（`introMisskey` / `poweredByMisskeyDescription` / `_aboutMisskey.*` 等）は「Misskey というソフトウェア」を指す記述で fork でも正確、かつ ja-JP 以外は Crowdin 管理で編集不可のため**温存**する。
- **ビジュアル資産の差し替え口**は [docs/endolphin/branding.md](branding.md) に台帳化。資産を用意したら同 doc のパスを実体差し替えする。
- **AGPL ソース提供**: `repositoryUrl` / `feedbackUrl` の DB カラム既定値は upstream のまま温存し（schema を upstream と一致させ migration 増を避ける）、運用者が管理画面で endolphin のソース公開先に設定する。

## 連合ゲート（本家完全準拠）

- ActivityPub は本家完全準拠を維持する。diverge させない。
- 受け入れゲート: `pnpm --filter backend test:fed`（実行前に `.config/test.yml` が必要）。
- 削除機能はいずれも連合オブジェクトではない（ローカル専用）ため、削除は連合に影響しない（「機能セット / 削除実行方式」節）。
