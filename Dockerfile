# syntax = docker/dockerfile:1.23

ARG NODE_VERSION=26.4.0-trixie

# build assets & compile TypeScript

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS native-builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	rm -f /etc/apt/apt.conf.d/docker-clean \
	; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
	&& apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /misskey

COPY --link ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["patches", "./patches"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-builder/package.json", "./packages/frontend-builder/"]
COPY --link ["packages/i18n/package.json", "./packages/i18n/"]
COPY --link ["packages/icons-subsetter/package.json", "./packages/icons-subsetter/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]

ARG NODE_ENV=production

RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
	pnpm i --frozen-lockfile --aggregate-output

COPY --link . ./

RUN pnpm build

# build native dependencies for target platform

FROM --platform=$TARGETPLATFORM node:${NODE_VERSION} AS target-builder

RUN apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /misskey

COPY --link ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["patches", "./patches"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/i18n/package.json", "./packages/i18n/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]

ARG NODE_ENV=production

RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

COPY --link --from=native-builder /misskey/packages/i18n/built ./packages/i18n/built
COPY --link --from=native-builder /misskey/packages/misskey-js/built ./packages/misskey-js/built

RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
	pnpm --filter backend deploy --prod --legacy /misskey-deploy

# Drop build-time-only tooling that pnpm links into the @sentry tree via @sentry/server-utils'
# optional `vite` peer (present only because the workspace ships a frontend vite). None of these
# are required by the backend runtime (`node built/entry.js`, compile_config, typeorm migrate),
# so removing them and pruning the dangling symlinks shaves ~77 MB off the image.
RUN cd /misskey-deploy/node_modules \
	&& for pkg in vite rolldown @rolldown+binding-linux-x64-gnu esbuild @esbuild+linux-x64 \
		sass sass-embedded sass-embedded-linux-x64 lightningcss lightningcss-linux-x64-gnu; do \
		rm -rf .pnpm/${pkg}@* ; \
	done \
	&& find . -xtype l -delete

# fetch a self-contained static ffmpeg instead of apt's ffmpeg, whose hard-dependency closure
# (codec libraries) pulls in ~400 MB even with --no-install-recommends. Misskey only decodes frames
# for thumbnails / sensitive-media analysis (no GPL encoders), so the lgpl build is sufficient.
# Runs on $BUILDPLATFORM and selects the target arch via $TARGETARCH so cross-builds don't emulate.
# Pinned to a retained BtbN month-end autobuild + SHA256. Daily builds are pruned after 14 releases,
# while month-end builds are kept for two years. To upgrade, pick a newer retained month-end tag and
# refresh the version, source revision, and both digests from the GitHub release API.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS ffmpeg-fetch
ARG TARGETARCH
ARG FFMPEG_VERSION=n8.1.2-21-gce3c09c101
ARG FFMPEG_SOURCE_REV=ce3c09c101c83add623774d414a9f9498caf5c25
ARG FFMPEG_BASE_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-06-30-13-34
ARG FFMPEG_SHA256_amd64=92a85718296516045e3d08a971f346f111971a2f9cba7e8191e5454eb05e4305
ARG FFMPEG_SHA256_arm64=b70a4ad2df3cb7f25524c45be4591de59a81eb737285717d91e7f611d234d406
# (1) download the tarball for the target arch and verify its pinned SHA256 (build fails on mismatch)
RUN <<EOF
set -eux
case "$TARGETARCH" in
	amd64) slug=linux64;    sha="$FFMPEG_SHA256_amd64" ;;
	arm64) slug=linuxarm64; sha="$FFMPEG_SHA256_arm64" ;;
	*) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;;
esac
curl -fsSL -o /tmp/ffmpeg.tar.xz "${FFMPEG_BASE_URL}/ffmpeg-${FFMPEG_VERSION}-${slug}-lgpl-8.1.tar.xz"
echo "${sha}  /tmp/ffmpeg.tar.xz" | sha256sum -c -
EOF

# (2) extract only the two binaries we ship plus the upstream LGPL v3 license text
RUN <<EOF
set -eux
mkdir -p /ffmpeg-out
tar -xJf /tmp/ffmpeg.tar.xz -C /ffmpeg-out --strip-components=1 --wildcards \
	'*/bin/ffmpeg' '*/bin/ffprobe' '*/LICENSE.txt'
EOF

# (3) written offer for the corresponding source (LGPL v3 distribution requirement)
RUN cat > /ffmpeg-out/SOURCE.txt <<EOF
This image bundles FFmpeg (ffmpeg, ffprobe) ${FFMPEG_VERSION}, prebuilt by BtbN/FFmpeg-Builds.
It is an LGPL v3 build (configured without --enable-gpl / --enable-nonfree), used as a
standalone program invoked via subprocess -- it is not linked into Misskey, and FFmpeg
was not modified.

License:                 see LICENSE.txt in this directory (GNU LGPL v3).
Corresponding source:    https://github.com/FFmpeg/FFmpeg/archive/${FFMPEG_SOURCE_REV}.tar.gz
Build recipe / config:   https://github.com/BtbN/FFmpeg-Builds
Upstream binary release: ${FFMPEG_BASE_URL}
EOF

FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-slim AS runner

ARG UID="991"
ARG GID="991"

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	tini libjemalloc2 ca-certificates \
	&& ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
	&& groupadd -g "${GID}" misskey \
	&& useradd -l -u "${UID}" -g "${GID}" -m -d /misskey misskey \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /u+s -ignore_readdir_race -exec chmod u-s {} \; \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /g+s -ignore_readdir_race -exec chmod g-s {} \; \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists

# static ffmpeg/ffprobe on PATH; fluent-ffmpeg discovers them there (root-owned, world-executable)
COPY --from=ffmpeg-fetch /ffmpeg-out/bin/ffmpeg /ffmpeg-out/bin/ffprobe /usr/local/bin/
# LGPL v3 license text + written offer for corresponding source (mirrors distro /usr/share/doc/<pkg>)
COPY --from=ffmpeg-fetch /ffmpeg-out/LICENSE.txt /ffmpeg-out/SOURCE.txt /usr/local/share/doc/ffmpeg/

USER misskey
WORKDIR /misskey

COPY --chown=misskey:misskey --from=target-builder /misskey-deploy/node_modules ./node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey-deploy/node_modules/@misskey-dev/emoji-assets ./packages/backend/node_modules/@misskey-dev/emoji-assets
COPY --chown=misskey:misskey --from=native-builder /misskey/built ./built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/built ./packages/backend/built
COPY --chown=misskey:misskey package.json ./package.json
COPY --chown=misskey:misskey packages/backend/package.json ./packages/backend/package.json
COPY --chown=misskey:misskey packages/backend/scripts ./packages/backend/scripts
COPY --chown=misskey:misskey packages/backend/migration ./packages/backend/migration
COPY --chown=misskey:misskey packages/backend/assets ./packages/backend/assets
COPY --chown=misskey:misskey packages/backend/src/server/assets ./packages/backend/src/server/file/assets
COPY --chown=misskey:misskey packages/frontend/assets ./packages/frontend/assets
COPY --chown=misskey:misskey packages/backend/ormconfig.js ./packages/backend/ormconfig.js
COPY --chown=misskey:misskey healthcheck.mjs ./healthcheck.mjs

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
HEALTHCHECK --interval=5s --retries=20 CMD ["node", "/misskey/healthcheck.mjs"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/sh", "-c", "cd /misskey/packages/backend && node ./scripts/compile_config.js && npm exec -- typeorm migration:run -d ormconfig.js && node ./built/entry.js"]
