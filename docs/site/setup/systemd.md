# Ubuntu 26.04 LTS で systemd を使う

Endolphin をご自身のサーバーで運営する方向けに、Ubuntu 26.04 LTS での構築手順をご案内します。このページは **Endolphin `2026.9.1-endolphin.0`** をソースからビルドする内容です。手順を再現しやすいようリリースを固定しています。最新の正式リリースは[GitHub Releases](https://github.com/tiramiss-community/endolphin/releases/latest)でご確認ください。別の版を使う場合は、タグとその版が必要とする Node.js の要件をあわせて切り替えてください。配布 tarball を使う手順は前提にしていません。

まずはこのページに沿って基本構成を整え、公開後のチューニングは[インフラガイド (#102)](https://github.com/tiramiss-community/endolphin/issues/102)と[DB/Redis 運用ガイド (#95)](https://github.com/tiramiss-community/endolphin/issues/95)でご確認いただけます。

## 構成

この手順では PostgreSQL と Redis を同じホストで動かし、Endolphin を専用の `endolphin` ユーザーで systemd 管理します。Nginx は同じホストの TCP 3000 番へ接続します。Endolphin は全インターフェースで待ち受けるため、起動前にファイアウォールで外部からの 3000 番を遮断します。

## 1. OS と依存サービス

Ubuntu 26.04 LTS の amd64 / arm64 を想定しています。Node.js はプロジェクト要件を満たす **26.4.0** を使います（backend の `engines` は `^22.22.2 || ^24.17.0 || ^26.4.0`）。ビルドには Git、C/C++ ビルドツールも必要です。

```sh
sudo apt update
sudo apt install -y ca-certificates curl xz-utils git build-essential ffmpeg libatomic1 postgresql redis-server ufw
```

Node.js 公式配布物を検証して `/usr/local` に展開します。

```sh
case "$(dpkg --print-architecture)" in
  amd64) NODE_ARCH=x64 ;;
  arm64) NODE_ARCH=arm64 ;;
  *) echo "この手順は amd64 / arm64 向けです" >&2; exit 1 ;;
esac
NODE_VERSION=26.4.0
cd /tmp
curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
grep " node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz$" SHASUMS256.txt | sha256sum -c -
sudo tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner
sudo npm install --global pnpm@11.25.0
node --version
pnpm --version
```

最後の2行がそれぞれ `v26.4.0` と `11.25.0` になることを確認します。PostgreSQL と Redis が起動していることも確認してください。

```sh
sudo systemctl enable --now postgresql redis-server
sudo systemctl status postgresql redis-server --no-pager
```

## 2. DB と実行ユーザー

PostgreSQL に専用ロールとデータベースを作ります。ここでは DB 名とロール名を `endolphin` とします。パスワードは任意の強い値に置き換え、コマンド履歴に残る点に注意してください。

```sh
sudo -u postgres createuser --pwprompt endolphin
sudo -u postgres createdb --owner=endolphin endolphin
sudo adduser --system --group --home /var/lib/endolphin endolphin
```

## 3. リリースのビルド

```sh
sudo install -d -o endolphin -g endolphin /opt/endolphin
sudo -u endolphin git clone --branch 2026.9.1-endolphin.0 --depth 1 \
  https://github.com/tiramiss-community/endolphin.git /opt/endolphin
sudo -u endolphin mkdir -p /var/lib/endolphin/files
sudo -u endolphin ln -s /var/lib/endolphin/files /opt/endolphin/files
cd /opt/endolphin
sudo -u endolphin /usr/local/bin/pnpm install --frozen-lockfile
sudo -u endolphin /usr/local/bin/pnpm build
```

ビルドが完了したら、設定ファイルとアップロードファイル用ディレクトリを用意します。

```sh
sudo -u endolphin install -d /opt/endolphin/.config
sudo -u endolphin cp /opt/endolphin/.config/example.yml /opt/endolphin/.config/default.yml
sudo chmod 600 /opt/endolphin/.config/default.yml
```

`.config/default.yml` を編集します。次のキーを設定し、`<DB_PASSWORD>` と `<SETUP_PASSWORD>` を強い値へ置き換えてください。その他の設定は例のままにします。

```yaml
url: https://example.tld/
port: 3000
setupPassword: <SETUP_PASSWORD>
db:
  host: 127.0.0.1
  port: 5432
  db: endolphin
  user: endolphin
  pass: <DB_PASSWORD>
redis:
  host: 127.0.0.1
  port: 6379
```

初回セットアップ完了後は `setupPassword` を削除または変更します。

`url` はインスタンスの公開 URL です。起動後に変更しないでください。このリリースは `port: 3000` で全インターフェースに待ち受けるため、次のファイアウォール設定を完了するまでサービスを起動しないでください。

初回の設定コンパイルと DB migration は、次の systemd ユニット起動時に行われます。

## 4. systemd ユニット

`/etc/systemd/system/endolphin.service` を作成します。

```ini
[Unit]
Description=Endolphin server
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=endolphin
Group=endolphin
WorkingDirectory=/opt/endolphin
Environment=NODE_ENV=production
ExecStartPre=/usr/local/bin/pnpm migrate
ExecStart=/usr/local/bin/node packages/backend/built/entry.js
Restart=on-failure
RestartSec=5
UMask=0027

[Install]
WantedBy=multi-user.target
```

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw insert 1 deny 3000/tcp
sudo ufw enable
sudo ufw status numbered
sudo ufw status verbose
```

SSH が標準の 22 番以外なら、`ufw enable` の前に実際の SSH ポートも許可してください。既存のファイアウォールを使う場合は、同等のルールを設定します。ホスティング側のファイアウォールでも 3000 番を公開しないでください。`ufw status numbered` で IPv4 と IPv6 の両方について 3000/tcp の `DENY` が先行する許可ルールより上にあることを確認してから、サービスを起動します。

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now endolphin
sudo systemctl status endolphin --no-pager
sudo journalctl -u endolphin -n 100 --no-pager
```

`ExecStartPre` は設定をコンパイルして保留中の DB migration を適用します。

## 5. Nginx と HTTPS を設定する

公開ドメインの DNS A / AAAA レコードをこのサーバーへ向け（AAAA を登録する場合は IPv6 でも到達できることを確認し）、ホスティング側の設定でも TCP 80 番と 443 番への接続を許可してください。Certbot が Let’s Encrypt から HTTP-01 認証で証明書を取得し、Nginx を HTTPS 用に設定します。Nginx は公式の stable apt リポジトリから、Certbot と Nginx plugin は Ubuntu 26.04 LTS の apt リポジトリから導入します（[NGINX 公式パッケージ](https://nginx.org/en/linux_packages.html)、[WebSocket proxy](https://nginx.org/en/docs/http/websocket.html)、[Ubuntu 26.04 の Certbot Nginx plugin](https://packages.ubuntu.com/resolute/python3-certbot-nginx)、[Certbot の Nginx 利用方法](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx)）。

```sh
sudo apt update
sudo apt install -y gnupg2 lsb-release ubuntu-keyring
curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor | sudo tee /usr/share/keyrings/nginx-archive-keyring.gpg > /dev/null
gpg --show-keys --with-colons /usr/share/keyrings/nginx-archive-keyring.gpg | awk -F: '$1 == "fpr" { print $10 }' | grep -Fxq 573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62 || { echo "Nginx signing key fingerprint mismatch" >&2; exit 1; }
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://nginx.org/packages/ubuntu $(lsb_release -cs) nginx" | sudo tee /etc/apt/sources.list.d/nginx.list > /dev/null
sudo tee /etc/apt/preferences.d/99nginx > /dev/null <<'NGINX_PIN'
Package: *
Pin: origin nginx.org
Pin: release o=nginx
Pin-Priority: 900
NGINX_PIN
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx certbot.timer
```

Nginx 公式パッケージは `/etc/nginx/conf.d/*.conf` を `http` 内で読み込みます。初期設定の `default.conf` がある場合は削除してから、WebSocket 用の map を追加します。

```sh
sudo rm -f /etc/nginx/conf.d/default.conf
sudo tee /etc/nginx/conf.d/endolphin-websocket-map.conf > /dev/null <<'NGINX_MAP'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
NGINX_MAP
```

`example.tld` は `.config/default.yml` の `url` と同じホスト名へ置き換え、サイト設定を作成します。デフォルトのアップロード上限 `maxFileSize: 262144000` に余裕を持たせて `300m` としています。アプリ側の値を変更する場合は Nginx 側も合わせてください。

```sh
sudo tee /etc/nginx/conf.d/endolphin.conf > /dev/null <<'NGINX_SITE'
server {
    listen 80;
    listen [::]:80;
    server_name example.tld;
    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
NGINX_SITE
sudo nginx -t
sudo systemctl reload nginx
```

HTTP でサイトが応答することを確認したら、Certbot に証明書取得と HTTPS 設定を任せます。メールアドレスとドメインを実際の値に置き換えてください。

```sh
sudo certbot --nginx --redirect --agree-tos --no-eff-email \
  --email admin@example.tld -d example.tld
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Nginx 公式リポジトリから更新を受け取るには、定期的にパッケージ更新を確認してください。Ubuntu の `unattended-upgrades` が nginx.org の更新を自動適用するとは限らないため、更新前に候補版を確認し、設定テストに成功したら reload します。

```sh
sudo apt update
apt-cache policy nginx
sudo apt install --only-upgrade nginx
sudo nginx -t
sudo systemctl reload nginx
```

Certbot は Nginx の設定を更新し、更新用の systemd timer も設定します。公開 URL から接続できたら、初回セットアップ画面で `setupPassword` を使って管理者アカウントを作成し、管理画面の「サーバー設定」で Repository URL に `https://github.com/tiramiss-community/endolphin` を設定します。作成後は `.config/default.yml` の `setupPassword` を削除または変更し、`sudo systemctl restart endolphin` で反映してください。

ローカルでの health check は次のとおりです。

```sh
curl -fsS http://127.0.0.1:3000/healthz
```

細かな proxy header やサイジングは[インフラガイド (#102)](https://github.com/tiramiss-community/endolphin/issues/102)をご覧ください。

## 6. 更新

更新前に「バックアップと復元」の手順で DB、設定、`files/` と現在のリリースタグを退避します。新しい正式リリースのタグに置き換えてビルドし、サービスを再開します。ユニットの `ExecStartPre` が `pnpm migrate` を実行してから本体を起動します。

```sh
(
  set -e
  BACKUP_ROOT=/var/backups/endolphin
  sudo install -d -o "$USER" -g "$(id -gn)" -m 700 "$BACKUP_ROOT"
  exec 9>"$BACKUP_ROOT/.maintenance.lock"
  flock -n 9 || { echo "別のバックアップまたは復元が実行中です" >&2; exit 1; }
  sudo systemctl stop endolphin
  cd /opt/endolphin
  sudo -u endolphin git fetch --tags origin
  sudo -u endolphin git checkout --detach <新しいリリースタグ>
  sudo -u endolphin /usr/local/bin/pnpm install --frozen-lockfile
  sudo -u endolphin /usr/local/bin/pnpm build
  sudo systemctl start endolphin
  sudo systemctl status endolphin --no-pager
  sudo journalctl -u endolphin -n 100 --no-pager
)
```

起動時の migration が完了し、ログにエラーがなく、ブラウザーと `/healthz` で動作することを確認します。失敗した場合はサービスを停止し、バックアップに記録したリリースタグと DB、設定、ファイルを同じ時点の組み合わせで復元します。

## 7. バックアップと復元

この例ではサービス停止中にバックアップし、DB の一貫性を保ちます。バックアップ先はアクセスを制限した別ディスクまたは別ホストにしてください。DB dump、設定、アップロードファイル、実行中のリリースタグを backup-<UTC時刻> ディレクトリに書き込み、各ファイルの検査が通った後で /var/backups/endolphin/latest シンボリックリンクを原子的に切り替えます。途中で失敗した場合は作成中のセットを削除し、前回の latest を維持します。サービスの再起動にも失敗した場合は、元のバックアップ失敗を終了ステータスとして返します。

```sh
(
  set -e
  BACKUP_ROOT=/var/backups/endolphin
  sudo install -d -o "$USER" -g "$(id -gn)" -m 700 "$BACKUP_ROOT"
  exec 9>"$BACKUP_ROOT/.maintenance.lock"
  flock -n 9 || { echo "別のバックアップまたは復元が実行中です" >&2; exit 1; }
  BACKUP_DIR=
  LATEST_TMP=
  BACKUP_ID=
  BACKUP_PUBLISHED=0
  BACKUP_DIR_CREATED=0
  LATEST_TMP_CREATED=0
  restart_service() {
    backup_status=$?
    trap - EXIT
    cleanup_status=0
    if [ "$BACKUP_PUBLISHED" -eq 0 ] && [ -n "$BACKUP_ID" ]; then
      current_latest=$(sudo readlink "$BACKUP_ROOT/latest" 2>/dev/null || true)
      if [ "$current_latest" = "backup-$BACKUP_ID" ]; then
        BACKUP_PUBLISHED=1
      fi
    fi
    if [ "$BACKUP_PUBLISHED" -eq 0 ]; then
      if [ "$LATEST_TMP_CREATED" -eq 1 ]; then
        if sudo rm -f -- "$LATEST_TMP"; then
          :
        else
          cleanup_status=$?
          echo "一時 latest リンクの削除に失敗しました: $LATEST_TMP" >&2
        fi
      fi
      if [ "$BACKUP_DIR_CREATED" -eq 1 ]; then
        if sudo rm -rf -- "$BACKUP_DIR"; then
          :
        else
          cleanup_status=$?
          echo "未完成のバックアップの削除に失敗しました: $BACKUP_DIR" >&2
        fi
      fi
    fi
    if [ "$backup_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then
      backup_status=$cleanup_status
    fi
    if sudo systemctl start endolphin; then
      :
    else
      restart_status=$?
      echo "Endolphin の再起動に失敗しました" >&2
      if [ "$backup_status" -eq 0 ]; then
        backup_status=$restart_status
      fi
    fi
    exit "$backup_status"
  }
  trap restart_service EXIT
  sudo systemctl stop endolphin
  BACKUP_ID=$(date -u +%Y%m%d%H%M%S)
  BACKUP_DIR="$BACKUP_ROOT/backup-$BACKUP_ID"
  LATEST_TMP="$BACKUP_ROOT/.latest-$BACKUP_ID"
  if sudo test -e "$BACKUP_DIR" || sudo test -L "$BACKUP_DIR" || sudo test -L "$LATEST_TMP"; then
    echo "バックアップ先 $BACKUP_DIR が既に存在します。時刻名を変更して再実行してください" >&2
    exit 1
  fi
  sudo install -d -o "$USER" -g "$(id -gn)" -m 700 "$BACKUP_DIR"
  BACKUP_DIR_CREATED=1
  sudo -u endolphin git -C /opt/endolphin describe --tags --exact-match > "$BACKUP_DIR/release.txt"
  sudo -u postgres pg_dump -Fc endolphin > "$BACKUP_DIR/db.dump"
  sudo tar -C /opt/endolphin -czf - .config/default.yml > "$BACKUP_DIR/config.tgz"
  sudo tar -C /var/lib/endolphin -czf - files > "$BACKUP_DIR/files.tgz"
  chmod 600 "$BACKUP_DIR"/*
  sudo test -s "$BACKUP_DIR/release.txt"
  sudo -u postgres pg_restore --list < "$BACKUP_DIR/db.dump" > /dev/null
  sudo tar -tzf "$BACKUP_DIR/config.tgz" > /dev/null
  sudo tar -tzf "$BACKUP_DIR/files.tgz" > /dev/null
  sudo ln -s "backup-$BACKUP_ID" "$LATEST_TMP"
  LATEST_TMP_CREATED=1
  sudo mv -Tf "$LATEST_TMP" "$BACKUP_ROOT/latest"
  LATEST_TMP_CREATED=0
  BACKUP_PUBLISHED=1
)
```
復元は /var/backups/endolphin/latest が指すバックアップセットを固定して行います。DB ダンプと設定・ファイルのアーカイブを検査し、DB を一時名の DB へ復元してから稼働 DB と切り替えます。バックアップ版へ checkout する前に現行 commit を保存し、途中で失敗した場合は元の commit へ戻して依存関係とビルド成果物を再生成します。元のアプリ版を復元できない場合はサービスを停止したままにして手動復旧を促します。設定と `files/` はそれぞれ実データと同じファイルシステム上の一時ディレクトリに展開し、現行ディレクトリを同じファイルシステム内で退避してから差し替えます。アーカイブに含まれない現行ファイルは新しい `files/` からなくなります。稼働 DB は確認が終わるまで `endolphin_before_restore_<UTC時刻>` という名前で保持し、旧設定と旧ファイルも一時ディレクトリ内に保持します。復元には一時 DB と旧 DB、設定、ファイルの分だけ追加のディスク容量が必要です。事前検査で失敗した場合はサービスを停止しません。停止後の切り替えに失敗した場合は、可能な範囲で DB、設定、ファイル、コードを元に戻します。ロールバックがすべて完了した場合だけサービスを再開し、切り戻しまたは再起動に失敗した場合は一時データを残して、表示されたエラーを確認し手動で復旧してください。

```sh
(
  set -e
  BACKUP_ROOT=/var/backups/endolphin
  sudo install -d -o "$USER" -g "$(id -gn)" -m 700 "$BACKUP_ROOT"
  exec 9>"$BACKUP_ROOT/.maintenance.lock"
  flock -n 9 || { echo "別のバックアップまたは復元が実行中です" >&2; exit 1; }
  STAGE_DB_CREATED=0
  RELEASE_CHECKOUT_ATTEMPTED=0
  DB_RENAME_ATTEMPTED=0
  OLD_DB_RENAMED=0
  STAGE_DB_RENAMED=0
  CONFIG_OLD_MOVED=0
  CONFIG_NEW_MOVED=0
  FILES_OLD_MOVED=0
  FILES_NEW_MOVED=0
  RESTORE_ROOT=
  FILES_ROOT=
  SERVICE_STOPPED=0

  rollback_restore() {
    original_status=$?
    trap - EXIT
    [ "$original_status" -eq 0 ] && exit 0
    set +e
    rollback_failed=0
    echo "復元に失敗しました (終了ステータス: $original_status)。ロールバックします" >&2

    db_state_ok=1
    LIVE_DB_EXISTS=
    OLD_DB_EXISTS=
    STAGE_DB_EXISTS=
    if [ "$DB_RENAME_ATTEMPTED" -eq 1 ]; then
      LIVE_DB_EXISTS=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = 'endolphin'") || db_state_ok=0
      OLD_DB_EXISTS=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = '$OLD_DB'") || db_state_ok=0
      STAGE_DB_EXISTS=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = '$STAGE_DB'") || db_state_ok=0
    fi
    restore_may_have_swapped=0
    if [ "$RELEASE_CHECKOUT_ATTEMPTED" -eq 1 ] || [ "$DB_RENAME_ATTEMPTED" -eq 1 ] || [ "$CONFIG_OLD_MOVED" -eq 1 ] || [ "$FILES_OLD_MOVED" -eq 1 ]; then
      restore_may_have_swapped=1
    fi
    if [ -n "$RESTORE_ROOT" ] && sudo test -e "$RESTORE_ROOT/config.previous"; then
      restore_may_have_swapped=1
    fi
    if [ -n "$FILES_ROOT" ] && sudo test -e "$FILES_ROOT/files.previous"; then
      restore_may_have_swapped=1
    fi
    if [ "$restore_may_have_swapped" -eq 1 ] && ! sudo systemctl stop endolphin; then
      echo "ロールバック: Endolphin の停止に失敗しました。DB、設定、ファイル、一時データを保持しています" >&2
      exit "$original_status"
    fi

    if [ "$RELEASE_CHECKOUT_ATTEMPTED" -eq 1 ]; then
      if ! sudo -u endolphin git -C /opt/endolphin checkout --detach "$ORIGINAL_COMMIT"; then
        echo "ロールバック: 元の Git commit $ORIGINAL_COMMIT に戻せませんでした。サービスを停止したまま手動で復旧してください" >&2
        rollback_failed=1
      elif ! sudo -u endolphin /usr/local/bin/pnpm --dir /opt/endolphin install --frozen-lockfile || ! sudo -u endolphin /usr/local/bin/pnpm --dir /opt/endolphin build; then
        echo "ロールバック: 元の commit の依存関係またはビルド成果物を復元できませんでした。サービスを停止したまま手動で復旧してください" >&2
        rollback_failed=1
      fi
    fi

    if [ "$DB_RENAME_ATTEMPTED" -eq 1 ]; then
      if [ "$db_state_ok" -ne 1 ]; then
        echo "ロールバック: DB 名の状態を確認できませんでした。DB と staging を保持します" >&2
        rollback_failed=1
      else
        if [ -n "$OLD_DB_EXISTS" ] && [ -n "$LIVE_DB_EXISTS" ] && [ -z "$STAGE_DB_EXISTS" ]; then
          sudo -u postgres psql -v ON_ERROR_STOP=1 -v stage_db="$STAGE_DB" -f - <<'SQL'
ALTER DATABASE endolphin RENAME TO :"stage_db";
SQL
          if [ "$?" -eq 0 ]; then
            LIVE_DB_EXISTS=
            STAGE_DB_EXISTS=1
          else
            echo "ロールバック: 復元 DB を一時名へ戻せませんでした" >&2
            rollback_failed=1
          fi
        fi
        if [ -n "$OLD_DB_EXISTS" ] && [ -z "$LIVE_DB_EXISTS" ]; then
          sudo -u postgres psql -v ON_ERROR_STOP=1 -v old_db="$OLD_DB" -f - <<'SQL'
ALTER DATABASE :"old_db" RENAME TO endolphin;
SQL
          if [ "$?" -eq 0 ]; then
            LIVE_DB_EXISTS=1
            OLD_DB_EXISTS=
          else
            echo "ロールバック: 旧 DB を endolphin に戻せませんでした" >&2
            rollback_failed=1
          fi
        fi
        if [ -n "$OLD_DB_EXISTS" ] || [ -z "$LIVE_DB_EXISTS" ]; then
          echo "ロールバック: 旧 DB の復元を確認できませんでした" >&2
          rollback_failed=1
        else
          OLD_DB_RENAMED=0
          STAGE_DB_RENAMED=0
        fi
      fi
    fi

    restore_previous_directory() {
      live_path=$1
      saved_path=$2
      failed_path=$3
      old_moved=$4
      label=$5
      saved_exists=0
      if sudo test -e "$saved_path" || sudo test -L "$saved_path"; then
        saved_exists=1
      fi
      if [ "$saved_exists" -eq 1 ]; then
        if sudo test -e "$live_path" || sudo test -L "$live_path"; then
          if ! sudo mv "$live_path" "$failed_path"; then
            echo "ロールバック: 復元した $label を退避できませんでした。旧版は $saved_path に保持しています" >&2
            rollback_failed=1
            return 1
          fi
        fi
        if sudo test -e "$live_path" || sudo test -L "$live_path" || ! sudo mv "$saved_path" "$live_path"; then
          echo "ロールバック: 旧 $label を元の場所へ戻せませんでした。旧版は $saved_path に保持しています" >&2
          rollback_failed=1
          return 1
        fi
        if sudo test -e "$saved_path" || sudo test -L "$saved_path" || ! sudo test -e "$live_path"; then
          echo "ロールバック: 旧 $label が元の場所へ戻ったことを確認できません。退避先は $saved_path です" >&2
          rollback_failed=1
          return 1
        fi
      elif [ "$old_moved" -eq 1 ]; then
        echo "ロールバック: 旧 $label が退避先 $saved_path にありません" >&2
        rollback_failed=1
        return 1
      fi
      return 0
    }
    if [ -n "$FILES_ROOT" ]; then
      restore_previous_directory /var/lib/endolphin/files "$FILES_ROOT/files.previous" "$FILES_ROOT/files.failed" "$FILES_OLD_MOVED" "files/" || true
    fi
    if [ -n "$RESTORE_ROOT" ]; then
      restore_previous_directory /opt/endolphin/.config "$RESTORE_ROOT/config.previous" "$RESTORE_ROOT/config.failed" "$CONFIG_OLD_MOVED" "設定" || true
    fi
    if [ "$rollback_failed" -eq 0 ]; then
      if [ "$STAGE_DB_CREATED" -eq 1 ] && { [ "$DB_RENAME_ATTEMPTED" -eq 0 ] || { [ "$db_state_ok" -eq 1 ] && [ -n "$LIVE_DB_EXISTS" ] && [ -z "$OLD_DB_EXISTS" ]; }; }; then
        sudo -u postgres dropdb --if-exists "$STAGE_DB" || { echo "ロールバック: 一時 DB $STAGE_DB の削除に失敗しました" >&2; rollback_failed=1; }
      fi
      if [ "$rollback_failed" -eq 0 ] && [ "$SERVICE_STOPPED" -eq 1 ]; then
        if ! sudo systemctl start endolphin; then
          echo "ロールバック: 元の状態へ戻した後の Endolphin 起動に失敗しました" >&2
          rollback_failed=1
        fi
      fi
      if [ "$rollback_failed" -eq 0 ]; then
        [ -z "$RESTORE_ROOT" ] || sudo rm -rf -- "$RESTORE_ROOT"
        [ -z "$FILES_ROOT" ] || sudo rm -rf -- "$FILES_ROOT"
      fi
    fi
    if [ "$rollback_failed" -ne 0 ]; then
      echo "ロールバックに失敗しました。一時データを保持しています。手動で状態を確認してください" >&2
    fi
    exit "$original_status"
  }
  trap rollback_restore EXIT

  BACKUP_DIR=$(sudo readlink -f /var/backups/endolphin/latest)
  RELEASE_TAG=$(cat "$BACKUP_DIR/release.txt")
  sudo -u postgres pg_restore --list < "$BACKUP_DIR/db.dump" > /dev/null
  sudo tar -tzf "$BACKUP_DIR/config.tgz" > /dev/null
  sudo tar -tzf "$BACKUP_DIR/files.tgz" > /dev/null
  ORIGINAL_COMMIT=$(sudo -u endolphin git -C /opt/endolphin rev-parse HEAD)
  sudo systemctl stop endolphin
  SERVICE_STOPPED=1
  if ! sudo -u endolphin git -C /opt/endolphin show-ref --verify --quiet "refs/tags/$RELEASE_TAG"; then
    sudo -u endolphin git -C /opt/endolphin fetch --tags origin "$RELEASE_TAG"
  fi
  RELEASE_CHECKOUT_ATTEMPTED=1
  sudo -u endolphin git -C /opt/endolphin checkout --detach "$RELEASE_TAG"
  sudo -u endolphin /usr/local/bin/pnpm --dir /opt/endolphin install --frozen-lockfile
  sudo -u endolphin /usr/local/bin/pnpm --dir /opt/endolphin build

  RESTORE_ID=$(date -u +%Y%m%d%H%M%S)
  STAGE_DB="endolphin_restore_$RESTORE_ID"
  OLD_DB="endolphin_before_restore_$RESTORE_ID"
  OLD_EXISTS=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = '$OLD_DB'")
  STAGE_EXISTS=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = '$STAGE_DB'")
  if [ -n "$OLD_EXISTS" ] || [ -n "$STAGE_EXISTS" ]; then
    echo "退避先または一時 DB が既に存在します。時刻名を変更して再実行してください" >&2
    exit 1
  fi

  RESTORE_ROOT=$(sudo mktemp -d /opt/endolphin/.restore.XXXXXX)
  FILES_ROOT=$(sudo mktemp -d /var/lib/endolphin/.restore.XXXXXX)
  sudo cp -a /opt/endolphin/.config "$RESTORE_ROOT/config"
  sudo tar --no-same-owner --strip-components=1 -C "$RESTORE_ROOT/config" -xzf "$BACKUP_DIR/config.tgz" .config/default.yml
  sudo mkdir "$FILES_ROOT/files"
  sudo tar --no-same-owner --strip-components=1 -C "$FILES_ROOT/files" -xzf "$BACKUP_DIR/files.tgz" files
  sudo chown -R endolphin:endolphin "$RESTORE_ROOT/config" "$FILES_ROOT/files"

  sudo -u postgres createdb --owner=endolphin "$STAGE_DB"
  STAGE_DB_CREATED=1
  sudo -u postgres pg_restore --exit-on-error --no-owner --role=endolphin --dbname="$STAGE_DB" < "$BACKUP_DIR/db.dump"

  sudo mv /opt/endolphin/.config "$RESTORE_ROOT/config.previous"
  CONFIG_OLD_MOVED=1
  sudo mv "$RESTORE_ROOT/config" /opt/endolphin/.config
  CONFIG_NEW_MOVED=1
  sudo mv /var/lib/endolphin/files "$FILES_ROOT/files.previous"
  FILES_OLD_MOVED=1
  sudo mv "$FILES_ROOT/files" /var/lib/endolphin/files
  FILES_NEW_MOVED=1

  DB_RENAME_ATTEMPTED=1
  sudo -u postgres psql -v ON_ERROR_STOP=1 -v old_db="$OLD_DB" -f - <<'SQL'
ALTER DATABASE endolphin RENAME TO :"old_db";
SQL
  OLD_DB_RENAMED=1
  OLD_DB_IS_PRESENT=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = '$OLD_DB'")
  LIVE_DB_IS_PRESENT=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = 'endolphin'")
  if [ "$OLD_DB_IS_PRESENT" != 1 ] || [ -n "$LIVE_DB_IS_PRESENT" ]; then
    echo "旧 DB 名への切り替え状態を確認できません" >&2
    exit 1
  fi
  sudo -u postgres psql -v ON_ERROR_STOP=1 -v stage_db="$STAGE_DB" -f - <<'SQL'
ALTER DATABASE :"stage_db" RENAME TO endolphin;
SQL
  STAGE_DB_RENAMED=1
  STAGE_DB_IS_PRESENT=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = '$STAGE_DB'")
  LIVE_DB_IS_PRESENT=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM pg_database WHERE datname = 'endolphin'")
  if [ -n "$STAGE_DB_IS_PRESENT" ] || [ "$LIVE_DB_IS_PRESENT" != 1 ]; then
    echo "復元 DB の endolphin 名への切り替え状態を確認できません" >&2
    exit 1
  fi
  sudo chown endolphin:endolphin /opt/endolphin/.config/default.yml
  sudo systemctl start endolphin
  trap - EXIT
  echo "復元しました。動作確認が完了するまで旧 DB ($OLD_DB)、設定 ($RESTORE_ROOT/config.previous)、ファイル ($FILES_ROOT/files.previous) を削除しないでください" >&2
)
```

記録されたタグがサーバーにない場合は GitHub から取得するため、復元時にネットワーク接続が必要です。復元した DB と設定にはバックアップ時のアプリ版を合わせてください。別の版で起動する場合は、DB migration やデータ形式の互換性を事前に確認してください。

ロール `endolphin` がまだない新しい PostgreSQL へ復元する場合は、先に「DB と実行ユーザー」の手順で作成してください。復元後はログ、トップページ、ログイン、過去のアップロード画像を確認します。復元訓練を定期的に行い、バックアップが読めることを確かめてください。

## 8. ログと確認

```sh
sudo systemctl status endolphin --no-pager
sudo journalctl -u endolphin -f
sudo systemctl status postgresql redis-server --no-pager
curl -fsS http://127.0.0.1:3000/healthz
```

`/healthz` が応答しない場合は `journalctl` で DB 接続、設定コンパイル、migration のエラーを確認します。Nginx が接続できない場合は、Endolphin が TCP 3000 番で待ち受けていることと、Nginx の転送先が `127.0.0.1:3000` であることを確認してください。
