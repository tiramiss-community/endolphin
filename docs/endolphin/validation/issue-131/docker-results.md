# Docker 検証結果

環境は [environment.md](./environment.md)、再実行方法は [reproduce.md](./reproduce.md) を参照。

## 正常復元

PASS。A/B の2世代を取得し、public schema のテーブル数0件、web 未起動の別 VM へ A を復元。latest は B を指していたが BACKUP_SET=A を明示した。実体パスの解決後に latest を欠落先へ変更しても A を使用した。

A の投稿・画像・設定が戻り、B 固有の投稿・ファイル ID が存在しないこと、A の画像を HTTP 取得した digest が一致することを確認した。パスワードでのログイン、復元後の新規投稿・アップロードとその画像取得も成功。配布 image の digest はホストとゲストで一致した。

## 失敗経路

通常の失敗後は、操作前後の投稿 ID/本文、Compose 定義・設定とファイルの SHA256、宣言 image 版、latest を比較し、Nginx 経由の health 応答を確認した。切り戻し失敗は web の停止と退避データの保持を確認し、手動復旧後に同じ比較を実施した。

| ケース | 終了コード | 結果 |
| --- | --- | --- |
| docker-restore-files-old | 41 | PASS |
| docker-restore-db-old | 41 | PASS |
| docker-restore-db-new | 41 | PASS |
| docker-restore-pull | 41 | PASS |
| docker-restore-start | 41 | PASS |
| docker-clean-select-A-latest-B | 0 | PASS |
| docker-restore-rollback-config | 41 | PASS |
| docker-restore-rollback-db | 41 | PASS |
| docker-restore-rollback-start | 41 | PASS |
| docker-recovery-log | 41 | PASS |
| docker-backup-dump | 41 | PASS |
| docker-backup-archive | 41 | PASS |
| docker-backup-validation | 41 | PASS |
| docker-backup-int-after-stop | 130 | PASS |
| docker-backup-int-during-dump | 130 | PASS |
| docker-backup-term-after-stop | 143 | PASS |
| docker-backup-term-during-dump | 143 | PASS |
| docker-backup-restart-failure | 41 | PASS |
| docker-backup-lock | 1 | PASS |
| docker-restore-lock | 1 | PASS |
| docker-restore-corrupt-dump | 1 | PASS |
| docker-restore-corrupt-config | 2 | PASS |
| docker-restore-corrupt-files | 2 | PASS |
| docker-restore-corrupt-missing | 2 | PASS |
| docker-restore-compose-old | 41 | PASS |
| docker-restore-config-old | 41 | PASS |

DB の切り戻し失敗では、稼働名 DB がなく、旧 DB と一時 DB が保持され、web が停止していた。旧 DB を稼働名へ戻し、元の Compose project 名で web を起動して B の状態を確認した。設定の切り戻し失敗では、旧設定が .restore-before-* に保持され、web は停止していた。旧設定を戻して起動し、B の状態を確認した。切り戻し後の起動失敗では、元の exit41 を維持し、旧データが戻った状態から手動起動できた。

## 確認した問題と対処

- 既存手順は BACKUP_SET を指定しても latest を使用し、有効な A があっても latest が欠落していると exit1 になった。明示したセットの実体パスを固定するよう修正し、クリーン VM への復元で成功した。
- ゲストで Docker を導入した直後に SSH が切断された。転送元は 172.17.0.1 と見えるため、Docker の既定 bridge との経路重複が疑われた。ゲストの bridge/pool を別アドレス帯へ変更すると SSH が復旧し、転送元への経路が ens3 経由であることを確認した。導入手順は再実行した。ホスト Docker は変更していない。
- 最初のディレクトリ切り戻し失敗注入は共通関数を変更したため、設定と Compose の両方に作用した。手動検証側が設定だけを戻したので起動できなかった。退避 Compose も戻して復旧を確認し、注入を設定だけに限定してケースを再実行した。ガイドの補償処理の不具合ではなく、注入範囲と確認手順の不一致。
- 切り戻し失敗時の復旧情報を明確にするため、project 名・DB 名・退避先を事前に表示する診断ログを追加した。

SIGINT/SIGTERM はバックアップ shell 自身に送る制御された注入だけを検証した。復元 shell への信号注入は未実施。SIGKILL・電源断、TLS 証明書発行、arm64 は対象外。
