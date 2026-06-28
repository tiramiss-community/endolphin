#!/usr/bin/env bash

# SPDX-FileCopyrightText: syuilo and misskey-project
# SPDX-License-Identifier: AGPL-3.0-only

# Docker ffmpeg smoke test for endolphin.
#
# The backend invokes ffmpeg/ffprobe via fluent-ffmpeg (FileInfoService.hasVideoTrackOnVideoFile,
# VideoProcessingService.generateVideoThumbnail). fluent-ffmpeg discovers the binaries on PATH
# (FFMPEG_PATH is not set in either runtime image), and a broken/missing ffmpeg does NOT fail an
# upload -- DriveService.generateAlts swallows the error and just yields a null thumbnail. So a
# binary regression is silent in production. This script catches it directly against BOTH runtime
# images, whose ffmpeg provisioning differs:
#
#   Dockerfile             debian-slim, stable default. ffmpeg/ffprobe = BtbN static LGPL build
#                          at /usr/local/bin (commit that replaced apt's ffmpeg).
#   Dockerfile.distroless  gcr.io/distroless/nodejs22, experimental. ffmpeg/ffprobe = apt's ffmpeg
#                          traced via lddtree (only the needed shared libs) into /usr/bin. No shell,
#                          no package manager -- the more fragile path (a missed dlopen'd lib or a
#                          PATH gap breaks decoding at runtime).
#
# For each image it verifies the binaries are present, runnable, resolvable on PATH (what
# fluent-ffmpeg actually does), and can decode + probe a real video the way the backend does.
#
# Usage:
#   bash scripts/docker-ffmpeg-smoke.sh            # build both images, then check
#   SKIP_BUILD=1 bash scripts/docker-ffmpeg-smoke.sh   # reuse already-built images, check only

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAMPLE="$REPO_ROOT/playwright/fixtures/media/video.mp4"
SKIP_BUILD="${SKIP_BUILD:-}"

fail=0
section() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()  { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fail=1; }

if [ ! -f "$SAMPLE" ]; then
	echo "missing sample video: $SAMPLE" >&2
	echo "generate fixtures first (see playwright/fixtures/media/)" >&2
	exit 2
fi

# is the captured stdout a PNG? (\x89 P N G == 89504e47)
is_png() {
	[ -s "$1" ] && [ "$(head -c4 "$1" | od -An -tx1 | tr -d ' \n')" = "89504e47" ]
}

check_image() {
	local label="$1" dockerfile="$2" tag="$3" ffmpeg="$4" ffprobe="$5"
	section "$label  ($dockerfile -> $tag)"

	if [ -z "$SKIP_BUILD" ]; then
		local log="/tmp/ffsmoke-build-${tag//[:\/]/_}.log"
		if docker build -f "$REPO_ROOT/$dockerfile" -t "$tag" "$REPO_ROOT" >"$log" 2>&1; then
			ok "build"
		else
			bad "build (see $log)"
			tail -25 "$log"
			return
		fi
	fi

	# 1) absolute-path binaries present + runnable
	if docker run --rm --entrypoint "$ffmpeg" "$tag" -hide_banner -version >/dev/null 2>&1; then
		ok "ffmpeg -version ($ffmpeg)"; else bad "ffmpeg -version ($ffmpeg)"; fi
	if docker run --rm --entrypoint "$ffprobe" "$tag" -hide_banner -version >/dev/null 2>&1; then
		ok "ffprobe -version ($ffprobe)"; else bad "ffprobe -version ($ffprobe)"; fi

	# 2) PATH resolution -- fluent-ffmpeg looks up bare 'ffmpeg'/'ffprobe' on PATH (FFMPEG_PATH unset)
	if docker run --rm --entrypoint ffmpeg "$tag" -hide_banner -version >/dev/null 2>&1; then
		ok "ffmpeg resolves on PATH (bare 'ffmpeg')"; else bad "ffmpeg NOT on PATH -- fluent-ffmpeg would not find it"; fi
	if docker run --rm --entrypoint ffprobe "$tag" -hide_banner -version >/dev/null 2>&1; then
		ok "ffprobe resolves on PATH (bare 'ffprobe')"; else bad "ffprobe NOT on PATH -- fluent-ffmpeg would not find it"; fi

	# 3) functional decode -- mimics VideoProcessingService.generateVideoThumbnail (one frame -> PNG)
	local out; out="$(mktemp)"
	docker run --rm -i --entrypoint "$ffmpeg" "$tag" \
		-hide_banner -v error -i pipe:0 -frames:v 1 -f image2pipe -vcodec png pipe:1 \
		<"$SAMPLE" >"$out" 2>/dev/null
	if is_png "$out"; then ok "decode 1 frame -> PNG ($(stat -c%s "$out") bytes)"; else bad "decode 1 frame -> PNG"; fi
	rm -f "$out"

	# 3b) functional probe -- mimics FileInfoService.hasVideoTrackOnVideoFile (detect a video stream)
	local codec
	codec="$(docker run --rm -i --entrypoint "$ffprobe" "$tag" \
		-hide_banner -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 pipe:0 \
		<"$SAMPLE" 2>/dev/null | tr -d '[:space:]')"
	if [ "$codec" = "video" ]; then ok "ffprobe detects video stream"; else bad "ffprobe detects video stream (got: '$codec')"; fi
}

check_image "Debian (stable, BtbN static)"          "Dockerfile"            "endolphin-ffmpeg-smoke:debian"     /usr/local/bin/ffmpeg /usr/local/bin/ffprobe
check_image "Distroless (experimental, lddtree)"    "Dockerfile.distroless" "endolphin-ffmpeg-smoke:distroless" /usr/bin/ffmpeg       /usr/bin/ffprobe

section "Summary"
if [ "$fail" -eq 0 ]; then
	printf '\033[32mALL CHECKS PASSED\033[0m\n'
else
	printf '\033[31mSOME CHECKS FAILED\033[0m\n'
fi
exit "$fail"
