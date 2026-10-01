## Summary

#131 の子作業として、systemd / Docker の検証結果を共通運用メモへ反映し、世代選定・新規環境の準備・手動復旧・確認後の削除条件を同期する。

- [ ] 各方式の必須ケースに具体的な検証結果を対応付ける
- [ ] 両ガイドと共通運用メモの前提・保存対象・復旧条件を同期する
- [ ] 正常系と主要な失敗経路の再実行方法を掲載する
- [ ] 検証中の失敗、原因、対処、再検証結果を記録する
- [ ] 文書ビルド、shell 構文、SPDX、locale safety を確認する
- [ ] 関連文書の公開後に親 #131 の完了条件を再確認する

## Purpose

方式別の検証・修正をまとめ、運用者が公開文書からバックアップ世代を選び、復元と失敗時の復旧を再現できるようにする。方式別の実環境検証が前提。必須ケースの FAIL/SKIPPED は完了扱いにしない。

## Do you want to implement this feature yourself?

- [ ] Yes, I will implement this by myself and send a pull request
