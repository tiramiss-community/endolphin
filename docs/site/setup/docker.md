# 配布 Docker イメージで構築する

Docker で Endolphin サーバーを始める方へ、Ubuntu 26.04 LTS での準備から公開までをご案内します。この手順は **Endolphin `2026.9.1-endolphin.0`** に固定し、amd64 / arm64 の配布イメージを使います。最新の正式リリースは[GitHub Releases](https://github.com/tiramiss-community/endolphin/releases/latest)でご確認ください。別版ではイメージと設定サンプルのタグを同じリリースに揃えてください。

```text
ghcr.io/tiramiss-community/endolphin:2026.9.1-endolphin.0
```

Docker Engine から HTTPS 公開まで、順を追って設定できます。公開後のチューニングは[インフラガイド (#102)](https://github.com/tiramiss-community/endolphin/issues/102)と[DB/Redis 運用ガイド (#95)](https://github.com/tiramiss-community/endolphin/issues/95)をご覧ください。

## 1. Docker Engine をインストール

Docker の公式 apt リポジトリを追加します。Docker は Ubuntu Resolute 26.04 LTS の amd64 / arm64 をサポートしています（[公式手順](https://docs.docker.com/engine/install/ubuntu/)）。

```sh
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<DOCKER_REPO
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
DOCKER_REPO
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run hello-world
sudo docker compose version
```

以降の Docker Compose コマンドは `sudo` 付きで実行します。`docker` グループへの追加は root 相当の権限を与えるため、この手順では行いません。

## 2. データ用ディレクトリ

```sh
sudo mkdir -p /srv/endolphin/.config /srv/endolphin/files /srv/endolphin/db /srv/endolphin/redis
sudo chown -R "$USER":"$(id -gn)" /srv/endolphin
cd /srv/endolphin
curl -fsSL https://raw.githubusercontent.com/tiramiss-community/endolphin/2026.9.1-endolphin.0/.config/example.yml -o .config/default.yml
```

取得した設定ファイルを編集します。次のキーを設定し、`<DB_PASSWORD>` と `<SETUP_PASSWORD>` を強い値へ置き換えてください。その他の設定は例のままにします。

```yaml
url: https://example.tld/
port: 3000
setupPassword: <SETUP_PASSWORD>
db:
  host: db
  port: 5432
  db: endolphin
  user: endolphin
  pass: <DB_PASSWORD>
redis:
  host: redis
  port: 6379
```

初回管理者作成後は `setupPassword` を削除または変更します。

```sh
cat > .config/docker.env <<'ENV_END'
POSTGRES_USER=endolphin
POSTGRES_PASSWORD=ここに十分に長いランダムなパスワード
POSTGRES_DB=endolphin
ENV_END
chmod 600 .config/docker.env
sudo chown 991:991 .config/default.yml
sudo chmod 600 .config/default.yml
sudo chmod 755 .config
```

`.config/default.yml` の DB パスワードと `POSTGRES_PASSWORD` は同じ値にします。`default.yml` はコンテナの UID 991 が読むため、以降の編集には `sudoedit /srv/endolphin/.config/default.yml` を使い、編集後に `sudo chown 991:991 /srv/endolphin/.config/default.yml && sudo chmod 600 /srv/endolphin/.config/default.yml` を実行します。`setupPassword` を変更・削除した後は `sudo docker compose restart web` で設定を読み直します。実際の値を公開 Issue やログへ貼らないでください。

## 3. Compose 定義

`compose.yml` を作成します。

```yaml
services:
  web:
    image: ghcr.io/tiramiss-community/endolphin:2026.9.1-endolphin.0
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./files:/misskey/files
      - ./.config:/misskey/.config:ro
    networks:
      - internal
      - external

  db:
    image: postgres:18-alpine
    restart: unless-stopped
    env_file:
      - .config/docker.env
    volumes:
      - ./db:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      retries: 20
    networks:
      - internal

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - ./redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 20
    networks:
      - internal

networks:
  internal:
    internal: true
  external: {}
```

DB と Redis は内部ネットワークに置き、ホストへポート公開しません。アプリの 3000 番ポートもホストの loopback のみへ公開し、リバースプロキシから接続します。`compose_example.yml` が採用している PostgreSQL 18 と Redis 7 の構成を基にしています。公式イメージの実行ユーザーは UID 991 なので、アップロード用ディレクトリも所有者を合わせてください。

```sh
sudo chown 991:991 /srv/endolphin/files
sudo chown 999:999 /srv/endolphin/redis
```

## 4. 起動と初回管理者

```sh
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 web
```

配布イメージの起動処理は設定コンパイル、DB migration、サーバー起動を行います。初回は DB の初期化に時間がかかる場合があるので、`sudo docker compose logs -f web` で完了とエラーの有無を確認します。

動作確認は次のコマンドで行えます。

```sh
curl -fsS http://127.0.0.1:3000/healthz
```

## 5. Nginx と HTTPS を設定する

公開ドメインの DNS A / AAAA レコードをこのサーバーへ向け（AAAA を登録する場合は IPv6 でも到達できることを確認し）、ファイアウォールとホスティング側の設定で TCP 80 番と 443 番への接続を許可してください。Certbot が Let’s Encrypt から HTTP-01 認証で証明書を取得し、Nginx を HTTPS 用に設定します。Nginx は公式の stable apt リポジトリから、Certbot と Nginx plugin は Ubuntu 26.04 LTS の apt リポジトリから導入します（[NGINX 公式パッケージ](https://nginx.org/en/linux_packages.html)、[WebSocket proxy](https://nginx.org/en/docs/http/websocket.html)、[Ubuntu 26.04 の Certbot Nginx plugin](https://packages.ubuntu.com/resolute/python3-certbot-nginx)、[Certbot の Nginx 利用方法](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx)）。

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

`example.tld` は `.config/default.yml` の `url` と同じホスト名へ置き換えてください。例では、Endolphin の `maxFileSize` 初期値 `262144000` byte に余裕を持たせて `300m` を指定しています。アプリ側で上限を変えた場合は Nginx 側も調整してください。

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

Certbot は Nginx の設定を更新し、更新用の systemd timer も設定します。公開 URL から接続できたら、初回セットアップ画面で `setupPassword` を使って管理者アカウントを作成し、管理画面の「サーバー設定」で Repository URL に `https://github.com/tiramiss-community/endolphin` を設定します。完了後は「データ用ディレクトリ」に記載した方法で `setupPassword` を削除または変更し、`sudo docker compose restart web` で反映します。

Nginx はホストの `127.0.0.1:3000` へ転送し、WebSocket upgrade を通します。proxy 推奨設定やサイジングは[インフラガイド (#102)](https://github.com/tiramiss-community/endolphin/issues/102)をご覧ください。

## 6. 更新

先にバックアップを取得します。タグを更新し、イメージを pull して再作成します。

```sh
# compose.yml の image タグを新しい正式リリースへ変更
sudo docker compose pull web
sudo docker compose up -d --no-deps web
sudo docker compose ps
sudo docker compose logs --tail=100 web
```

本体起動時に DB migration が実行されます。ログ、公開 URL、ログイン、アップロード済みファイル、`/healthz` を確認します。DB やファイル形式を変更するリリースでは、リリースノートの移行案内も確認してください。問題が起きた場合、バックアップした compose.yml に記録されたイメージタグと、同じ時点の DB・設定・ファイルを復元します。

## 7. バックアップと復元

バックアップは DB、`.config`、`files/` と、実行イメージタグを含む `compose.yml` を同じ時点で保存します。DB の一貫性を保つため、バックアップ時はアプリを停止します。各バックアップは `/var/backups/endolphin/backup-<UTC時刻>-<識別子>/` に保存し、DB ダンプと両アーカイブを検査した後で `latest` シンボリックリンクを原子的に切り替えます。作成や検査に失敗した場合は新しい一時ディレクトリを削除し、以前の `latest` は維持します。バックアップ先は別ホストまたは別ディスクにし、アクセス権を制限してください。途中で失敗しても `web` の再起動を試み、バックアップと再起動の両方に失敗した場合は元のバックアップ失敗を終了ステータスとして返します。

```sh
(
  BACKUP_ROOT=/var/backups/endolphin
  BACKUP_SET=
  BACKUP_NAME=
  LATEST_TMP=
  BACKUP_PUBLISHED=0
  restart_web() {
    backup_status=$?
    trap - EXIT
    cleanup_status=0
    if [ "$BACKUP_PUBLISHED" -eq 0 ] && [ -n "$BACKUP_NAME" ] && [ "$(readlink "$BACKUP_ROOT/latest" 2>/dev/null || true)" = "$BACKUP_NAME" ]; then
      BACKUP_PUBLISHED=1
    fi
    if [ "$BACKUP_PUBLISHED" -eq 0 ]; then
      if [ -n "$LATEST_TMP" ]; then rm -f -- "$LATEST_TMP" || cleanup_status=$?; fi
      if [ -n "$BACKUP_SET" ] && [ -d "$BACKUP_SET" ]; then rm -rf -- "$BACKUP_SET" || cleanup_status=$?; fi
      if [ "$cleanup_status" -ne 0 ]; then
        echo "未公開バックアップの一時ファイルを削除できませんでした" >&2
      fi
    fi
    if sudo docker compose start web; then
      :
    else
      restart_status=$?
      echo "Endolphin web コンテナの再起動に失敗しました" >&2
      if [ "$backup_status" -eq 0 ]; then
        backup_status=$restart_status
      fi
    fi
    if [ "$backup_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then
      backup_status=$cleanup_status
    fi
    exit "$backup_status"
  }
  set -e
  cd /srv/endolphin
  trap restart_web EXIT
  sudo docker compose stop web

  sudo install -d -o "$USER" -g "$(id -gn)" -m 700 "$BACKUP_ROOT"
  BACKUP_SET=$(mktemp -d "$BACKUP_ROOT/backup-$(date -u +%Y%m%d%H%M%S)-XXXXXXXX")
  BACKUP_NAME=${BACKUP_SET##*/}
  LATEST_TMP="$BACKUP_ROOT/.latest-$BACKUP_NAME"

  sudo docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$BACKUP_SET/db.dump"
  sudo tar -czf - compose.yml .config/default.yml .config/docker.env > "$BACKUP_SET/config.tgz"
  sudo tar -czf - files/ > "$BACKUP_SET/files.tgz"
  chmod 600 "$BACKUP_SET"/*
  sudo docker compose exec -T db pg_restore --list < "$BACKUP_SET/db.dump" > /dev/null
  tar -tzf "$BACKUP_SET/config.tgz" > /dev/null
  tar -tzf "$BACKUP_SET/files.tgz" > /dev/null

  ln -s "$BACKUP_NAME" "$LATEST_TMP"
  mv -Tf "$LATEST_TMP" "$BACKUP_ROOT/latest"
  BACKUP_PUBLISHED=1
)
```

復元前に DB ダンプと設定・ファイルのアーカイブを検査し、DB は一時 DB に、設定とファイルは同じファイルシステム上の一時領域に準備してから切り替えます。切り替え前の DB、設定、ファイルは確認が終わるまで `endolphin_before_restore_<UTC時刻>` と `.restore-before-<UTC時刻>` に保持します。復元には一時 DB と旧 DB の分、および一時ファイルの分だけ追加のディスク容量が必要です。DB 名は Compose の `POSTGRES_DB` を使います。事前検査またはステージングで失敗した場合は `web` を停止しません。停止後に失敗した場合は元に戻す処理を試み、復元と切り戻しの両方に失敗した場合は両方のエラーを表示して、元の失敗ステータスを返します。成功後に問題があれば `web` を停止し、保持した旧 DB と `.restore-before-*` 内の設定・ファイルを使って切り戻せます。

```sh
(
  set -Eeuo pipefail
  cd /srv/endolphin
  BACKUP_DIR=/var/backups/endolphin/latest
  RESTORE_ID=$(date -u +%Y%m%d%H%M%S)
  STAGE_DB="endolphin_restore_$RESTORE_ID"
  OLD_DB="endolphin_before_restore_$RESTORE_ID"
  OLD_ROOT=".restore-before-$RESTORE_ID"
  DB_CONTAINER=$(sudo docker compose ps -q db)
  WEB_CONTAINER=$(sudo docker compose ps -q web)
  test -n "$DB_CONTAINER"
  test -n "$WEB_CONTAINER"
  POSTGRES_DB=$(sudo docker exec "$DB_CONTAINER" sh -c 'printf %s "$POSTGRES_DB"')
  test ! -e "$OLD_ROOT"
  STAGE_ROOT=$(mktemp -d ./.restore-stage.XXXXXXXX)
  DB_STAGE_CREATED=0
  DB_ORIGINAL_RESTORED=0
  LIVE_COMPOSE_SAVED=0
  STAGED_COMPOSE_INSTALLED=0
  LIVE_CONFIG_SAVED=0
  STAGED_CONFIG_INSTALLED=0
  LIVE_FILES_SAVED=0
  STAGED_FILES_INSTALLED=0
  RESTORE_OK=0
  WEB_STOPPED=0

  db_rename() {
    sudo docker exec -i "$DB_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -v from_db="$1" -v to_db="$2" -f -' sh "$1" "$2" <<'SQL'
ALTER DATABASE :"from_db" RENAME TO :"to_db";
SQL
  }

  rollback() {
    restore_status=$?
    trap - EXIT
    [ "$RESTORE_OK" -eq 1 ] && return "$restore_status"
    set +e
    ROLLBACK_FAILED=0
    rollback_error() { echo "切り戻しに失敗しました: $*" >&2; ROLLBACK_FAILED=1; }
    if [ "$WEB_STOPPED" -eq 1 ] && ! sudo docker compose stop web >/dev/null 2>&1; then
      rollback_error "web を停止できませんでした。稼働中のデータを保護するため DB と設定・ファイルは変更しません"
      echo "退避データとステージング領域は $STAGE_ROOT および $OLD_ROOT に残しています。web を停止して手動で切り戻してください" >&2
      return "$restore_status"
    fi

    restore_path() {
      live_path=$1
      saved_path=$2
      installed=$3
      saved=$4
      label=$5
      if [ "$installed" -eq 1 ]; then
        if ! sudo rm -rf -- "$live_path" || [ -e "$live_path" ] || [ -L "$live_path" ]; then
          rollback_error "$label の復元版を安全に取り除けませんでした。旧版は $saved_path に保持しています"
          return 1
        fi
      fi
      if [ "$saved" -eq 1 ]; then
        if [ -e "$live_path" ] || [ -L "$live_path" ]; then
          rollback_error "$label の復元先が残っているため旧版を移動しません。旧版は $saved_path に保持しています"
          return 1
        fi
        if ! sudo mv -- "$saved_path" "$live_path"; then
          rollback_error "$label の旧版を戻せませんでした。旧版は $saved_path に保持しています"
          return 1
        fi
      fi
      return 0
    }

    db_catalog() {
      sudo docker exec "$DB_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atqc "SELECT datname FROM pg_database"'
    }
    catalog_has() {
      printf '%s\n' "$DB_CATALOG" | grep -Fxq -- "$1"
    }
    reconcile_original_db() {
      DB_ORIGINAL_RESTORED=0
      DB_CATALOG=$(db_catalog) || { rollback_error "DB カタログを読み取れませんでした"; return 1; }
      if catalog_has "$OLD_DB"; then
        if catalog_has "$POSTGRES_DB"; then
          if catalog_has "$STAGE_DB"; then
            rollback_error "稼働名・一時名・退避名の DB が同時に存在します。DB は変更せず保持します"
            return 1
          fi
          db_rename "$POSTGRES_DB" "$STAGE_DB" || true
          DB_CATALOG=$(db_catalog) || { rollback_error "DB rename 後のカタログを読み取れませんでした"; return 1; }
        fi
        if ! catalog_has "$POSTGRES_DB" && catalog_has "$OLD_DB"; then
          db_rename "$OLD_DB" "$POSTGRES_DB" || true
          DB_CATALOG=$(db_catalog) || { rollback_error "旧 DB rename 後のカタログを読み取れませんでした"; return 1; }
        fi
      fi
      if catalog_has "$POSTGRES_DB" && ! catalog_has "$OLD_DB"; then
        DB_ORIGINAL_RESTORED=1
      else
        rollback_error "カタログ上で旧 DB が稼働名に戻ったことを確認できません。DB を保持します"
        return 1
      fi
    }
    if [ "$DB_STAGE_CREATED" -eq 1 ]; then
      reconcile_original_db || true
    else
      DB_ORIGINAL_RESTORED=1
    fi

    restore_path files "$OLD_ROOT/files" "$STAGED_FILES_INSTALLED" "$LIVE_FILES_SAVED" "files/" || true
    restore_path .config "$OLD_ROOT/config" "$STAGED_CONFIG_INSTALLED" "$LIVE_CONFIG_SAVED" ".config/" || true
    restore_path compose.yml "$OLD_ROOT/compose.yml" "$STAGED_COMPOSE_INSTALLED" "$LIVE_COMPOSE_SAVED" "compose.yml" || true
    if [ "$ROLLBACK_FAILED" -eq 0 ] && [ "$DB_ORIGINAL_RESTORED" -eq 1 ] && [ "$DB_STAGE_CREATED" -eq 1 ]; then
      DB_CATALOG=$(db_catalog) || rollback_error "一時 DB の削除前にカタログを読み取れませんでした"
      if [ "$ROLLBACK_FAILED" -eq 0 ] && catalog_has "$STAGE_DB"; then
        sudo docker exec "$DB_CONTAINER" sh -c 'dropdb -U "$POSTGRES_USER" "$1"' sh "$STAGE_DB" || rollback_error "一時 DB を削除できませんでした"
      fi
    fi
    if [ "$ROLLBACK_FAILED" -eq 0 ]; then
      sudo rm -rf "$STAGE_ROOT" || rollback_error "ステージングファイルを削除できませんでした"
      sudo rmdir "$OLD_ROOT" 2>/dev/null || true
    else
      echo "一時ファイルと退避データは $STAGE_ROOT および $OLD_ROOT に残しています" >&2
    fi
    return "$restore_status"
  }
  trap rollback EXIT

  sudo docker exec -i "$DB_CONTAINER" pg_restore --list < "$BACKUP_DIR/db.dump" > /dev/null
  sudo tar -tzf "$BACKUP_DIR/config.tgz" > /dev/null
  sudo tar -tzf "$BACKUP_DIR/files.tgz" > /dev/null
  sudo mkdir -p "$STAGE_ROOT/.config"
  sudo tar --no-same-owner -xzf "$BACKUP_DIR/config.tgz" -C "$STAGE_ROOT" compose.yml .config/default.yml .config/docker.env
  sudo tar --no-same-owner -xzf "$BACKUP_DIR/files.tgz" -C "$STAGE_ROOT" files/
  test -f "$STAGE_ROOT/compose.yml"
  test -f "$STAGE_ROOT/.config/default.yml"
  test -f "$STAGE_ROOT/.config/docker.env"
  test -d "$STAGE_ROOT/files"
  sudo chown "$USER":"$(id -gn)" "$STAGE_ROOT/compose.yml"
  sudo chmod 600 "$STAGE_ROOT/.config/docker.env"
  sudo chown 991:991 "$STAGE_ROOT/.config/default.yml"
  sudo chown -R 991:991 "$STAGE_ROOT/files"

  OLD_EXISTS=$(sudo docker exec "$DB_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atqc "$1"' sh "SELECT 1 FROM pg_database WHERE datname = '$OLD_DB' OR datname = '$STAGE_DB'")
  if [ -n "$OLD_EXISTS" ]; then
    echo "一時 DB または退避先 DB が既に存在します。時刻名を変更して再実行してください" >&2
    exit 1
  fi
  sudo docker exec "$DB_CONTAINER" sh -c 'createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$1"' sh "$STAGE_DB"
  DB_STAGE_CREATED=1
  sudo docker exec -i "$DB_CONTAINER" sh -c 'pg_restore -U "$POSTGRES_USER" --exit-on-error --no-owner --role="$POSTGRES_USER" --dbname="$1"' sh "$STAGE_DB" < "$BACKUP_DIR/db.dump"

  sudo docker compose stop web
  WEB_STOPPED=1
  sudo mkdir -p "$OLD_ROOT"
  if [ -e compose.yml ]; then sudo mv compose.yml "$OLD_ROOT/compose.yml"; LIVE_COMPOSE_SAVED=1; fi
  sudo mv "$STAGE_ROOT/compose.yml" compose.yml; STAGED_COMPOSE_INSTALLED=1
  if [ -e .config ]; then sudo mv .config "$OLD_ROOT/config"; LIVE_CONFIG_SAVED=1; fi
  sudo mv "$STAGE_ROOT/.config" .config; STAGED_CONFIG_INSTALLED=1
  if [ -e files ]; then sudo mv files "$OLD_ROOT/files"; LIVE_FILES_SAVED=1; fi
  sudo mv "$STAGE_ROOT/files" files; STAGED_FILES_INSTALLED=1
  sudo chown "$USER":"$(id -gn)" compose.yml
  sudo chmod 600 .config/docker.env
  sudo chown 991:991 .config/default.yml
  sudo chown -R 991:991 files

  db_rename "$POSTGRES_DB" "$OLD_DB"
  db_rename "$STAGE_DB" "$POSTGRES_DB"

  sudo docker compose pull --policy missing web
  sudo docker compose up -d --no-deps web
  sudo docker compose logs --tail=100 web
  RESTORE_OK=1
  sudo rm -rf "$STAGE_ROOT"
  echo "旧 DB は $OLD_DB、旧設定・ファイルは $OLD_ROOT に保持しました。確認後に手動で削除してください。"
)
```

復元した compose.yml が指定するイメージ版と DB をそろえて起動してください。別のイメージ版で運用する場合は、DB migration やデータ形式の互換性を事前に確認します。DB ユーザーや DB 名をバックアップ後に変更した場合は、復元先の Compose 環境と設定ファイルを先に整合させてください。復元後にトップページ、ログイン、過去のアップロードを確認します。定期的に復元訓練を行い、実際に戻せるバックアップであることを確かめてください。

## 8. ログと確認

```sh
sudo docker compose ps
sudo docker compose logs -f web
sudo docker compose logs --tail=100 db redis
curl -fsS http://127.0.0.1:3000/healthz
```

`web` が起動しない場合は、設定値、DB / Redis の healthcheck、migration エラーの順にログを確認します。外部から接続できない場合は、プロキシの転送先、WebSocket 設定、DNS、TLS 証明書を確認してください。
