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

本体起動時に DB migration が実行されます。ログ、公開 URL、ログイン、アップロード済みファイル、`/healthz` を確認します。DB やファイル形式を変更するリリースでは、リリースノートの移行案内も確認してください。問題が起きた場合、同じ時点の DB・設定・ファイルのバックアップを復元してから、互換性のある旧イメージタグに戻します。

## 7. バックアップと復元

バックアップは DB、`.config`、`files/` を同じ時点で保存します。DB の一貫性を保つため、バックアップ時はアプリを停止します。バックアップ先は別ホストまたは別ディスクにし、アクセス権を制限してください。

```sh
cd /srv/endolphin
sudo docker compose stop web
BACKUP_DIR=/var/backups/endolphin
sudo install -d -o "$USER" -g "$(id -gn)" -m 700 "$BACKUP_DIR"

sudo docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$BACKUP_DIR/db.dump"
sudo tar -czf - compose.yml .config/default.yml .config/docker.env > "$BACKUP_DIR/config.tgz"
sudo tar -czf - files/ > "$BACKUP_DIR/files.tgz"
chmod 600 "$BACKUP_DIR"/*
sudo docker compose start web
```

復元は対象インスタンスを停止し、DB を作り直せることを確認してから行います。次の処理は現在の DB 内容を削除します。

```sh
cd /srv/endolphin
sudo docker compose stop web
sudo docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"'
sudo docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"'
sudo docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" --no-owner --role="$POSTGRES_USER" -d "$POSTGRES_DB"' < /var/backups/endolphin/db.dump

sudo tar --no-same-owner -xzf /var/backups/endolphin/config.tgz
sudo tar --no-same-owner -xzf /var/backups/endolphin/files.tgz
sudo chown "$USER":"$(id -gn)" compose.yml .config/docker.env
sudo chmod 600 .config/docker.env
sudo chown 991:991 .config/default.yml
sudo chown -R 991:991 files/
sudo docker compose start web
sudo docker compose logs --tail=100 web
```

DB ユーザーや DB 名をバックアップ後に変更した場合は、復元先の Compose 環境と設定ファイルを先に整合させてください。復元後にトップページ、ログイン、過去のアップロードを確認します。定期的に復元訓練を行い、実際に戻せるバックアップであることを確かめてください。

## 8. ログと確認

```sh
sudo docker compose ps
sudo docker compose logs -f web
sudo docker compose logs --tail=100 db redis
curl -fsS http://127.0.0.1:3000/healthz
```

`web` が起動しない場合は、設定値、DB / Redis の healthcheck、migration エラーの順にログを確認します。外部から接続できない場合は、プロキシの転送先、WebSocket 設定、DNS、TLS 証明書を確認してください。
