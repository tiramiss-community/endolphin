# systemd 検証結果

環境は [environment.md](./environment.md)、再実行方法は [reproduce.md](./reproduce.md) を参照。

## 正常復元

PASS。A/B の2世代を取得し、ユーザー0件の別 VM に A を復元。復元中に latest を変更しても解決済みの A を使用した。さらに latest が B を指す状態で BACKUP_SET=A を明示し、A の投稿・画像・設定が戻り、B 固有の投稿・ファイル ID が存在しないことを確認した。HTTP で取得した A の画像 digest も一致した。パスワードでのログイン、新規投稿・アップロードも成功。

## 失敗経路

各失敗後に、操作前後の DB の投稿 ID/本文、設定とファイルの SHA256、Git commit、latest を比較し、Nginx 経由の health 応答を確認した。切り戻し失敗ケースは停止と退避データの存在を確認してから手動復旧し、同じ比較を実施した。

| ケース | 終了コード | 結果 |
| --- | --- | --- |
| systemd-backup-dump | 41 | PASS |
| systemd-backup-archive | 41 | PASS |
| systemd-backup-validation | 41 | PASS |
| systemd-backup-term-after-stop | 143 | PASS |
| systemd-backup-int-during-dump | 130 | PASS |
| systemd-backup-restart-failure | 41 | PASS |
| systemd-backup-lock | 1 | PASS |
| systemd-restore-corrupt-dump | 1 | PASS |
| systemd-restore-corrupt-config | 2 | PASS |
| systemd-restore-corrupt-files | 2 | PASS |
| systemd-restore-corrupt-missing | 1 | PASS |
| systemd-restore-checkout | 41 | PASS |
| systemd-explicit-selection-green | 0 | PASS |
| systemd-restore-install | 41 | PASS |
| systemd-restore-build | 41 | PASS |
| systemd-restore-config-old | 41 | PASS |
| systemd-restore-files-old | 41 | PASS |
| systemd-restore-db-old | 41 | PASS |
| systemd-restore-db-new | 41 | PASS |
| systemd-restore-start-failure | 41 | PASS |
| systemd-select-A-latest-B | 0 | PASS |
| systemd-restore-rollback-db | 41 | PASS |
| systemd-restore-rollback-config | 41 | PASS |
| systemd-restore-rollback-start | 41 | PASS |
| systemd-backup-int-after-stop | 130 | PASS |
| systemd-backup-term-during-dump | 143 | PASS |
| systemd-restore-lock | 1 | PASS |
| systemd-recovery-log | 41 | PASS |

DB 切り戻し失敗では、稼働名 DB がなく、旧 DB と一時 DB が保持され、サービスが停止していた。旧 DB を稼働名へ戻した後に起動して B の状態を確認した。設定の切り戻し失敗では config.previous/default.yml が保持され、サービスが停止していた。旧設定を元のパスへ戻して B の状態を確認した。再起動失敗では元の exit41 が維持され、旧データは戻っており、手動起動で復旧した。

正常な失敗補償で未完成セットと一時 latest リンクが残らないこと、手動復旧後に今回の staging を片付けられることを確認した。

## 確認した問題と対処

- 既存手順は BACKUP_SET を指定しても latest を使用した。latest が欠落した状態で、有効な A を明示しても exit1 になった。実体パスを `BACKUP_SET`（未指定なら latest）から解決するよう修正し、同じケースと latest=B の正常復元が成功した。
- A/B の画像を同一内容にするとアプリが重複をまとめ、B のファイル ID が A と同じになった。検証用 B を別内容の PNG にして混入検査をやり直した。ガイドの不具合ではなく検証データの問題。
- ログインを繰り返すと API の rate limit に達した。パスワードログインの成功確認後は既存 token でデータを照合し、アプリの設定・実装は変更しなかった。

切り戻し失敗時のログに DB 名・退避ディレクトリ・元 commit がなかったため、非秘密の復旧情報を事前に表示するよう追加した。変更後の旧 DB rename 後の失敗注入で、識別情報と B への復帰を再確認した。

SIGKILL・電源断の自動補償、TLS 証明書発行、arm64 は対象外。今回の信号検証は shell 自身に SIGINT/SIGTERM を送る制御された注入であり、ホスト障害全般を保証するものではない。
