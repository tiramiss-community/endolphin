# 2026-10-01 バックアップ・復元検証記録

このディレクトリは Ubuntu 26.04.1 LTS / amd64、Endolphin `2026.9.1-endolphin.0` で実施した検証の履歴。現在のガイドや別リリースの合格を保証しない。

- [環境・対象版・資料復元の経緯](./environment.md)
- [systemd の結果](./systemd-results.md)
- [Docker の結果](./docker-results.md)
- [既存証拠の採否と検証範囲](./evidence.md)
- [現在の再検証手順](../../validation/backup-restore.md)

## 当時の手順

実行時のガイドは開始 commit `ea2e1392cab1b64e9003813efd6122f511a81689` に environment.md 記載の修正を加えたもの。作業ツリー消失後に資料を復元したため、以下は実行時の作業ツリーそのものではなく、修正と記録を公開した固定版である。

- [公開した再実行手順](https://github.com/tiramiss-community/endolphin/blob/e9c0773ab14850ee82e9050c2abe57d41f84a231/docs/endolphin/validation/issue-131/reproduce.md)
- [公開した systemd ガイド](https://github.com/tiramiss-community/endolphin/blob/e9c0773ab14850ee82e9050c2abe57d41f84a231/docs/site/setup/systemd.md)
- [公開した Docker ガイド](https://github.com/tiramiss-community/endolphin/blob/e9c0773ab14850ee82e9050c2abe57d41f84a231/docs/site/setup/docker.md)

## 関連 Issue の完了条件と結果

関連: [#131](https://github.com/tiramiss-community/endolphin/issues/131)。以下は検証結果との対応であり、Issue の close や報告投稿の実施記録ではない。

| 完了条件 | 根拠 |
| --- | --- |
| systemd のバックアップ・復旧を実環境で検証し記録 | systemd-results.md の正常復元と28ケースの結果 |
| Docker のバックアップ・復旧を実環境で検証し記録 | docker-results.md の正常復元と26ケースの結果 |
| DB・ファイル・設定・版の整合したセット | アプリ停止中の取得、識別データを変えた A/B の2世代、A の復元後のデータ・設定・版・画像 digest の照合 |
| 復元セットの選定基準と確認方法 | 両ガイドの世代一覧・選定基準・BACKUP_SET 明示指定。latest=B から A を選ぶ検証 |
| 中断・失敗の補償とサービス再開 | INT/TERM、取得失敗、復元途中失敗、切り戻し・再起動失敗と手動復旧の確認 |
| 新規環境への復元と動作確認 | アプリデータのない別 VM への復元、パスワードログイン、既存投稿・画像、新規投稿・アップロード |
| 正常系・主要な失敗経路の再実行方法 | backup-restore.md の shell 抽出、注入箇所、前後比較と合格条件 |
| 失敗・原因・対処の文書反映 | 結果表の世代指定不足、検証データの重複、ゲストの経路問題、注入範囲の修正と再検証 |
| 両方式の手順・前提の同期 | 共通運用メモと両ガイドの世代選定、新規環境、保持・削除条件、手動復旧 |

必須ケースに未解決の FAIL/SKIPPED はありません。SIGKILL・電源断では終了処理を保証しないことを明記しました。電源断実験、TLS 証明書発行、arm64、別リリース、全失敗分岐の網羅、汎用 runner/CI は今回の対象外です。
