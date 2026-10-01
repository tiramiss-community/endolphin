## Summary

#131 の子作業として、systemd のバックアップと復元を Ubuntu 26.04 LTS / amd64、Endolphin `2026.9.1-endolphin.0` の隔離 VM で検証し、ガイドへ結果を反映する。

- [ ] データの異なる2世代を取得し、古い世代をクリーンな別 VM へ復元する
- [ ] ログイン、投稿、アップロード、過去画像と設定・アプリ版を確認する
- [ ] バックアップ失敗、中断、事前検査失敗、復元途中の失敗を検証する
- [ ] 切り戻しと再起動の失敗、排他、復元対象の固定を検証する
- [ ] 実行方法、注入箇所、合否、原因、修正後の再検証結果を記録する
- [ ] ガイドの世代選定と手動復旧の説明を整える

## Purpose

運用者が公開ガイドで整合したバックアップを選び、安全に復元できることを確認する。既存証拠の採否は evidence.md に従う。必須ケースの FAIL/SKIPPED は完了扱いにしない。TLS、arm64、電源断実験、汎用 runner/CI は対象外。

## Do you want to implement this feature yourself?

- [ ] Yes, I will implement this by myself and send a pull request
