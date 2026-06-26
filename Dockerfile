# syntax = docker/dockerfile:1.23

ARG NODE_VERSION=22.22.2-bookworm

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

FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-slim AS runner

ARG UID="991"
ARG GID="991"

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	ffmpeg tini libjemalloc2 \
	&& ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
	&& groupadd -g "${GID}" misskey \
	&& useradd -l -u "${UID}" -g "${GID}" -m -d /misskey misskey \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /u+s -ignore_readdir_race -exec chmod u-s {} \; \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /g+s -ignore_readdir_race -exec chmod g-s {} \; \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists

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
