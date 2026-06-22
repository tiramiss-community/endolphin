# endolphin ブランディング（差し替え口台帳）

endolphin の表層リブランディングで「アプリ識別名」は Endolphin に改名済（[fork-policy.md §ブランディング](fork-policy.md) の 4 境界を参照）。一方で**ビジュアル資産（ロゴ / favicon / app icon / splash / テーマ色）は当面 Misskey 由来のまま温存**し、本ドキュメントを資産を用意した際の**差し替え口の一覧（台帳）**とする。

> 現状: 下表のパスはすべて upstream Misskey 由来の資産のまま。endolphin 資産を用意したら**該当パスの実体を差し替える**だけで反映される（参照側コードの変更は基本不要）。テーマ色は実体ファイルではなく値なので、必要なら一括置換する（後述）。

## ビジュアル資産

| 区分 | パス | 参照元 / 備考 |
|---|---|---|
| favicon | `packages/backend/assets/favicon.ico` / `favicon.png` | [ClientServerService.ts](../../packages/backend/src/server/web/ClientServerService.ts) `/favicon.ico` ルート。runtime は `meta.iconUrl`（admin 設定）が優先され、未設定時に静的 favicon へフォールバック |
| apple-touch icon | `packages/backend/assets/apple-touch-icon.png` | 同ルート / [base.tsx](../../packages/backend/src/server/web/views/base.tsx) `apple-touch-icon`。runtime は `meta.app512IconUrl` が優先 |
| app icon (PWA) | `packages/backend/assets/icons/192.png` / `512.png` | [manifest.json](../../packages/backend/src/server/web/manifest.json) の静的値。runtime manifest は `meta.app192IconUrl` / `app512IconUrl` が優先 |
| splash | `packages/backend/assets/splash.png` | manifest icons（`purpose: any`） |
| email ロゴ | `packages/backend/assets/mi-white.png` | EmailService（HTML メールヘッダ） |
| frontend ロゴ | `packages/frontend/assets/misskey.svg` | welcome 系 import |
| about アイコン | `packages/frontend/assets/about-icon.png` | [about-misskey.vue](../../packages/frontend/src/pages/about-misskey.vue) `/client-assets/about-icon.png`（`/client-assets/` → `packages/frontend/assets/`） |
| repo / マスコット | `assets/title_float.svg` / `assets/title.png` / `assets/ai.png`（マスコット） | README / Meta `mascotImageUrl` 既定 `/assets/ai.png` |

## カラー

| 区分 | 値 | 主な定義箇所 |
|---|---|---|
| テーマ色 | `#86b300`（緑） | [manifest.json](../../packages/backend/src/server/web/manifest.json) `theme_color` / [base.tsx](../../packages/backend/src/server/web/views/base.tsx) `theme-color` フォールバック / nodeinfo / email / Channel 既定色 ほか。runtime は `meta.themeColor`（admin 設定）が優先 |
| 背景色 | `#313a42` | [manifest.json](../../packages/backend/src/server/web/manifest.json) `background_color` / [base.tsx](../../packages/backend/src/server/web/views/base.tsx) splash 等 |

## 差し替え手順

1. **資産ファイル**: 上表の各パスに endolphin 用の同名・同形式（同寸法）の実体を配置して差し替える。参照側コードは変更不要。
2. **カラー**: endolphin カラーに変える場合、`#86b300` / `#313a42` を一括置換する（`grep -rn '#86b300' packages/` で定義箇所を洗い出してから置換）。`meta.themeColor` の DB 既定値は変更しない方針（[fork-policy.md](fork-policy.md) の保守的選択／migration を増やさないため）。運用者は管理画面でインスタンス個別に上書きできる。
3. 差し替え後は `pnpm dev` で favicon / PWA インストールアイコン / splash / about ページの目視確認を行う。

## 運用者向け注記（AGPL ソース提供義務）

ビジュアルとは別に、運用者は管理画面で次を設定すること（[fork-policy.md](fork-policy.md) / [プロダクト定義 spec](../superpowers/specs/2026-06-18-endolphin-product-definition-design.md) を参照）:

- `repositoryUrl`: endolphin のソース公開先（AGPL のソース提供義務。nodeinfo `software.repository` もこの値を読む）
- `feedbackUrl`: endolphin のフィードバック先

これらの DB カラム既定値は upstream（`misskey-dev/misskey`）のまま温存しており（schema を upstream と一致させ migration 増を避けるため）、運用者の admin 設定で endolphin を指すようにする。
