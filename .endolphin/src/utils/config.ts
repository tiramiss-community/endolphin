/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git";

/**
 * 各コマンドが利用する upstream 設定。
 * 正本はリポジトリルートの endolphin.json (`upstream` セクション)。
 */
export interface UpstreamConfig {
	/** upstream リポジトリの clone URL。 */
	upstreamUrl: string;
	/** upstream remote 名(例: upstream)。 */
	upstreamRemote: string;
	/** 取得する upstream ブランチ(例: develop)。 */
	upstreamBranch: string;
	/** GitHub API 用の owner(例: misskey-dev)。 */
	owner: string;
	/** GitHub API 用の repo(例: misskey)。 */
	repo: string;
}

interface EndolphinMeta {
	upstream?: {
		repository?: string;
		remote?: string;
		branch?: string;
	};
}

const DEFAULT_UPSTREAM_URL = "https://github.com/misskey-dev/misskey.git";

/**
 * リポジトリルートの endolphin.json から upstream 設定を読み出します。
 * remote 名や URL をハードコードせず、fork のメタ情報を単一ソースとして再利用します。
 *
 * @returns upstream 設定。
 */
export async function loadUpstreamConfig(): Promise<UpstreamConfig> {
	const root = await git(["rev-parse", "--show-toplevel"], true);
	const meta = JSON.parse(
		readFileSync(join(root, "endolphin.json"), "utf8"),
	) as EndolphinMeta;
	const upstream = meta.upstream ?? {};
	const upstreamUrl = upstream.repository ?? DEFAULT_UPSTREAM_URL;
	const upstreamRemote = upstream.remote ?? "upstream";
	const upstreamBranch = upstream.branch ?? "develop";
	const { owner, repo } = parseOwnerRepo(upstreamUrl);
	return { upstreamUrl, upstreamRemote, upstreamBranch, owner, repo };
}

/**
 * GitHub の clone URL(https / ssh いずれも) から owner / repo を取り出します。
 *
 * @param url 例: https://github.com/misskey-dev/misskey.git
 * @returns { owner, repo }。
 */
export function parseOwnerRepo(url: string): { owner: string; repo: string } {
	const cleaned = url
		.replace(/^git@github\.com:/, "")
		.replace(/^https?:\/\/github\.com\//, "")
		.replace(/\.git$/, "")
		.replace(/\/+$/, "");
	const parts = cleaned.split("/").filter(Boolean);
	if (parts.length < 2) {
		throw new Error(`upstream URL から owner/repo を判定できません: ${url}`);
	}
	return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
}
