# pw に入れる / 入れないの採否判定

このリグに spec を足すか迷ったときの判断基準。正本は [docs/endolphin/playwright-e2e.md §継続運用](../../../../../docs/endolphin/playwright-e2e.md)。

## 判定: 次のどちらかなら入れる

1. **fork 固有**: 削除コントラクト (削除機能の導線が消えている / スタブ API が `[]`・`null`・410 を返す) か、fork 自作の低 churn 画面 (デッキ多カラム・About・fork が握る設定サブセット)。
2. **絶対死守の基幹 happy-path**: 投稿→TL反映→ノート詳細 / signup / login / drive アップロード / フォロー / 設定が開く、など endolphin が壊したら終わる導線。

## 入れない

- **upstream 全機能の網羅**。それは Cypress (upstream 所有・継承の領分) の仕事。pw に upstream 機能の総当たりテストを足さない。fork として価値が出るのは「機能を削っても基幹が壊れない」の保証 (Stage 2) と「自作画面の品質」(Stage 3)、そして「絶対死守の happy-path」(Stage 1)。

なぜこの線引きか: pw を upstream 機能網羅に広げると、upstream sync のたびに大量の data-cy ズレ修正が発生し、追従コストが跳ね上がる (fork-policy P2)。低 churn な fork 固有部と基幹に絞ることで、メンテが安価に保てる。

## Stage と置き場の対応

| Stage | 置き場 | 内容 |
|---|---|---|
| 1 | `playwright/tests/core/` | 基幹 happy-path |
| 2 | `playwright/tests/removed/` | 削除コントラクト回帰 (UI 導線 + API スタブ) |
| 3 | `playwright/tests/fork/` | fork 自作の低 churn 画面 |
| 0 | `playwright/tests/smoke.spec.ts` | rig が端から端まで通ることの確認 |

## メンテ規律 (育成を負債化させない)

- **upstream sync のたびに pw スイートを実行**する。落ちたら多くは `data-cy-*` のズレ → セレクタを現行 DOM に合わせて直す (安価)。切り分けは [tasks/triaging-flakes.md](../tasks/triaging-flakes.md)。
- flake は trace / video アーティファクトで切り分け、retry は CI のみ (`playwright.config.ts` の `retries`)。
- 削除機能 (gallery / pages / achievements / games / favorites / embed / charts / admin統計 / retention / ads / chat) を**復活させない**。スタブ spec が落ちても、本家実装に戻すのではなく**スタブ契約 (空 / 410) を正**として spec を直す。削除一覧の正本は [docs/endolphin/feature-inventory.md](../../../../../docs/endolphin/feature-inventory.md)。
