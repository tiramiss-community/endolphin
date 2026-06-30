/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { run } from "./proc";

/**
 * git コマンドを実行し、標準出力(前後の空白を除去)を返します。
 * 終了コードが 0 以外の場合は Error を投げます。
 *
 * @param args 先頭の `git` を除いた Git の引数配列。
 * @param quiet 実行中の標準出力/標準エラーのライブ出力を抑制するかどうか。
 * @returns git プロセスの標準出力（trim 済み）。
 */
export async function git(args: string[], quiet = false): Promise<string> {
	const result = await run("git", args, null, quiet);
	if (result.code !== 0) {
		throw new Error(`git ${args.join(" ")} failed:\n${result.err}`);
	}
	return result.out.trim();
}

/**
 * git コマンドが成功するか(終了コード 0 か)を確認します。
 * 例外は投げず、真偽値を返します。
 *
 * @param args Git の引数配列。
 * @returns 成功した場合は true、失敗した場合は false。
 */
export async function gitOk(args: string[]): Promise<boolean> {
	const result = await run("git", args, null, true);
	return result.code === 0;
}

/**
 * 指定した ref(ブランチ/タグ/コミット)をコミットハッシュに解決します。
 *
 * @param ref 例: HEAD, upstream/develop, タグ名など。
 * @returns コミット SHA 文字列。
 */
export async function rev(ref: string): Promise<string> {
	return git(["rev-parse", "--verify", `${ref}^{commit}`], true);
}

/**
 * upstream remote が無ければ追加します。
 * CI の fresh checkout には origin しか無いため、fetch 前に呼びます。
 * 既存 remote の URL 上書きは行いません(手動調整に委ねる)。
 *
 * @param remote remote 名(例: upstream)。
 * @param url remote URL。
 */
export async function ensureRemote(remote: string, url: string): Promise<void> {
	if (await gitOk(["remote", "get-url", remote])) {
		return;
	}
	await git(["remote", "add", remote, url]);
}

/**
 * リモートの ref を `git ls-remote` で取得し、ref -> SHA の Map で返します。
 *
 * @param remote 対象 remote(例: origin)。
 * @param patterns 取得する ref パターン(例: "refs/heads/upstream/develop", "refs/tags/upstream/*")。
 * @returns ref 名をキー、SHA を値とした Map。
 */
export async function lsRemote(
	remote: string,
	...patterns: string[]
): Promise<Map<string, string>> {
	const out = await git(["ls-remote", remote, ...patterns], true);
	const map = new Map<string, string>();
	for (const line of out.split("\n")) {
		if (!line) continue;
		const [sha, ref] = line.split("\t");
		if (sha && ref) {
			map.set(ref, sha);
		}
	}
	return map;
}
