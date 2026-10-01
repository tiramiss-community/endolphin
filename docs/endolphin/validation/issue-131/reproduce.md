# バックアップ・復元検証の再実行

[systemd ガイド](../../../site/setup/systemd.md) / [Docker ガイド](../../../site/setup/docker.md) が操作コマンドの正本。以下は隔離 VM 専用の検証手順であり、稼働環境では実行しない。汎用 runner は用意しない。

## 環境と記録

Ubuntu 26.04 LTS の公式 cloud image と SHA256SUMS を取得・照合し、QEMU/KVM の使い捨て VM にガイドの構成を作る。各方式の復元先は別ディスク・別 VM にする。今回の復元先は、アプリを導入した後、アカウント・投稿・画像・バックアップがまだない準備済み OS を複製した。複製前に OS を正常 shutdown し、復元先のユーザー数が0件であることを確認した。バックアップ元のアプリデータや稼働中ディスクを複製しない。

VM の SSH と Nginx だけをホストの loopback へ転送する。Docker の bridge と QEMU user network のアドレス帯は重ねない。KVM は QMP の `query-kvm` が `enabled: true` を返すことを確認する。

実行ごとにガイドの commit と変更差分、OS image URL/checksum、OS version、アプリ commit、image digest、終了コード、サービス状態、DB の識別データ、設定とファイルの SHA256、`latest` の参照先、退避データの場所を記録する。パスワード・token・dump は公開しない。

## shell の抽出

この再実行手順は [systemd の修正 PR #136](https://github.com/tiramiss-community/endolphin/pull/136) と [Docker の修正 PR #137](https://github.com/tiramiss-community/endolphin/pull/137) を両方適用した checkout を前提とする。開始点のガイドは `BACKUP_SET` を参照しないため、そのままでは世代の明示指定を検証できない。

repo root で実行する。作業ディレクトリはリポジトリ外の専用ディレクトリにする。

```sh
set -e
VALIDATION_DIR=$(mktemp -d /tmp/endolphin-backup-validation.XXXXXXXX)
chmod 700 "$VALIDATION_DIR"
python3 - "$VALIDATION_DIR" <<'PY'
import pathlib, re, subprocess, sys
out = pathlib.Path(sys.argv[1])
for mode in ('systemd', 'docker'):
    source = pathlib.Path('docs/site/setup/' + mode + '.md').read_text()
    assert source.count('## 7. バックアップと復元') == 1
    section = source.split('## 7. バックアップと復元', 1)[1].split('\n## ', 1)[0]
    blocks = [b for b in re.findall(r'```sh\n(.*?)\n```', section, re.S)
              if b.splitlines()[0] == '(']
    assert len(blocks) == 2, (mode, len(blocks))
    for operation, block in zip(('backup', 'restore'), blocks):
        assert 'flock -n 9' in block
        assert ('trap restart_' if operation == 'backup' else 'BACKUP_DIR=') in block
        if operation == 'restore':
            assert '${BACKUP_SET:-' in block, (mode, 'apply PR #136 and #137 first')
        target = out / (mode + '-' + operation + '.sh')
        target.write_text(block + '\n')
        subprocess.run(['bash', '-n', str(target)], check=True)
PY
sha256sum "$VALIDATION_DIR"/*.sh
```

抽出ファイルを VM へ転送し、ガイドが想定する通常ユーザーで `bash <script>` を実行する。復元では `BACKUP_SET=/var/backups/endolphin/backup-... bash <restore-script>` として固定する。

## 正常系

1. 管理者を作成し、識別できる投稿 A、画像 A、設定コメント A を用意する。画像は A/B で異なる内容にする。同一内容ではアプリが重複をまとめるため、混入検査に使えない。
2. バックアップ A を取得し、実体パス、投稿・ファイル ID、画像 digest、設定、版を記録する。
3. 投稿 B と別内容の画像 B を追加し、設定コメントを B に変更してバックアップ B を取得する。
4. A/B の両セットを、データのない復元先へ転送する。`latest` は B に向け、`BACKUP_SET` で A を選ぶ。
5. A の投稿・画像・設定・アプリ版が戻り、B の投稿・ファイル ID が存在しないことを確認する。A の画像を HTTP で取得し、保存済み digest と比較する。
6. パスワードでログインし、新規投稿と新規アップロードが成功することを確認する。ログインの連続実行は rate limit の対象になるため、データ照合には取得済み token を使用する。

## 失敗注入

各ケースは正常な B の状態から開始する。バックアップ試験では、失敗後も既存 B のデータと旧 `latest` が保持されることを確認する。復元試験では A を復元対象にして、失敗後に B の DB・設定・画像・アプリ版へ戻ることを確認する。注入は抽出した検証用コピーだけに行う。

対象コマンドまたは状態フラグ行の一致件数が1件であることを確認して生成する。例えば `OLD_DB_RENAMED=1` の直後へ失敗を入れる場合は、抽出した systemd 復元 shell に次を適用する。

```sh
python3 - "$VALIDATION_DIR" <<'PY'
from pathlib import Path
import subprocess, sys
out = Path(sys.argv[1])
source = (out / 'systemd-restore.sh').read_text()
anchor = '  OLD_DB_RENAMED=1'
assert source.count(anchor) == 1
injected = source.replace(anchor, anchor + '\n  bash -c "exit 41"')
target = out / 'systemd-restore-injected.sh'
target.write_text(injected)
subprocess.run(['bash', '-n', str(target)], check=True)
PY
```

元の shell と注入済み shell の差分を記録し、生成した `systemd-restore-injected.sh` を隔離 VM へ転送する。正常な B の状態から、VM 内で `BACKUP_SET=/var/backups/endolphin/backup-<AのUTC時刻> bash systemd-restore-injected.sh` を実行する。元の `systemd-restore.sh` は実行対象にしない。

| 操作 | 注入箇所・方法 | 確認 |
| --- | --- | --- |
| backup | dump を `bash -c "exit 41"` に置換 | 旧 latest とデータを維持、未完成セットを削除、サービス再開 |
| backup | 設定 tar 作成を同様に置換 | 同上 |
| backup | dump の `pg_restore --list` 検査を同様に置換 | 同上 |
| backup | stop の直後、または dump 位置で `kill -TERM "$BASHPID"` / `kill -INT "$BASHPID"` | 信号で非ゼロ終了、補償と再開を確認 |
| backup | dump を exit41、終了処理の起動を exit42 に置換 | 元の exit41 を保持、停止状態から手動起動で復旧 |
| restore | セットのコピーで dump、config.tgz、files.tgz を個別に破損させる | 停止前の検査で拒否、現行データ維持 |
| restore | systemd は release.txt、Docker は設定アーカイブ内の必須ファイルを欠落させる | 非ゼロ終了、現行データ維持 |
| restore | 旧設定または旧 files の移動後に exit41 | 旧ディレクトリを戻して再開 |
| restore | 旧 DB rename 後、新 DB rename 後にそれぞれ exit41 | DB 名とディレクトリを旧状態に戻して再開 |
| restore | 最終起動を exit41 に置換し、切り戻しの起動は実行 | 切り戻し後の再開と旧データの応答 |
| restore | 途中失敗に加え、切り戻し側の DB rename またはディレクトリ移動も失敗させる | 不整合のまま再開せず、復旧用データとエラーを保持 |
| restore | 途中失敗に加え、切り戻し側の起動を exit42 に置換 | 元の失敗を保持、旧データを戻した状態で手動起動可能 |
| systemd restore | checkout、install、build をそれぞれ exit41 に置換 | 元の commit・依存・成果物を戻して再開 |
| Docker restore | 最終 image pull を exit41 に置換 | 元の Compose・データで再開 |
| 排他 | 別プロセスで .maintenance.lock を保持して実行 | データ変更前に拒否 |
| 対象固定 | BACKUP_DIR 解決後に latest を別セットへ変更 | 解決済みセットだけを使用 |

非ゼロ終了だけでは合格にしない。操作前後の DB 識別データ、設定・ファイル digest、版、latest を比較し、Nginx 経由の `/healthz` と既存投稿・画像を確認する。未完成セットの削除と、失敗処理が保存したデータの存在も確認する。

切り戻し失敗ケースの後はサービスを止めたまま DB 名と退避ディレクトリを確認し、ガイドの手動復旧手順で B に戻す。復旧を確認してから次のケースを始める。
