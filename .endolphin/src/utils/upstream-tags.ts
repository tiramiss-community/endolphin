/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * upstream タグを格納する ref namespace を正規化します。
 * 既定は `refs/tags/<remote>`(例: refs/tags/upstream)。
 *
 * @param upstreamRemote upstream remote 名。
 * @param override 明示指定の namespace(例: refs/tags/upstream)。
 * @returns 末尾スラッシュを除去した正規化済み namespace。
 */
export function normalizeUpstreamTagNamespace(
	upstreamRemote: string,
	override?: string,
): string {
	const fallback = `refs/tags/${upstreamRemote}`;
	const trimmed = override?.trim();
	const raw = trimmed ? trimmed : fallback;
	const withPrefix = raw.startsWith("refs/") ? raw : `refs/tags/${raw}`;
	return withPrefix.replace(/\/+$/, "");
}

/**
 * タグ名の前後スラッシュを除去します。
 *
 * @param input タグ名(例: /2026.6.0/)。
 * @returns 整形済みタグ名(例: 2026.6.0)。
 */
export function sanitizeUpstreamTagSuffix(input: string): string {
	return input.trim().replace(/^\/+|\/+$/g, "");
}

/**
 * namespace とタグ名から完全な ref パスを組み立てます。
 *
 * @param suffix タグ名(例: 2026.6.0)。
 * @param namespace ref namespace(例: refs/tags/upstream)。
 * @returns 完全な ref パス(例: refs/tags/upstream/2026.6.0)。
 */
export function buildUpstreamTagRef(suffix: string, namespace: string): string {
	const base = namespace.replace(/\/+$/, "");
	const cleaned = sanitizeUpstreamTagSuffix(suffix);
	if (!cleaned) {
		throw new Error("Upstreamタグ名が空です。例: 2026.6.0");
	}
	return `${base}/${cleaned}`;
}
