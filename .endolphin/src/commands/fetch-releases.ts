/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Octokit } from "octokit";
import type { CommandModule } from "yargs";
import { loadUpstreamConfig } from "../utils/config";
import { ensureRemote, git, lsRemote } from "../utils/git";
import { log } from "../utils/log";
import {
	buildUpstreamTagRef,
	normalizeUpstreamTagNamespace,
} from "../utils/upstream-tags";

const ORIGIN = "origin";

/**
 * GitHub releases API の「先頭1000件まで」上限による 422 エラーかを判定する。
 * これに達した場合はエラーではなく、走査済みの新しい1000件で打ち切る。
 */
function isReleasesCapError(e: unknown): boolean {
	return (
		typeof e === "object" &&
		e !== null &&
		"status" in e &&
		(e as { status?: unknown }).status === 422
	);
}

interface FetchReleasesArgs {
	owner: string | undefined;
	repo: string | undefined;
	upstreamUrl: string | undefined;
	upstreamRemote: string | undefined;
	tagNamespace: string | undefined;
	push: boolean;
}

/**
 * upstream の「正式リリース」に紐づくタグを取得し、`upstream/` プレフィクスを付けて
 * origin にタグ作成する(例: upstream/2026.6.0)。
 *
 * - draft / prerelease(alpha/beta/rc) は除外。
 * - prefix により fork 独自タグ(例: refs/tags/2026.6.0)とは別 namespace で衝突しない。
 * - 既に origin に存在する namespaced タグは上書きせずスキップ(force しない)。
 * - upstream は readonly。fetch のみ。書き込みは origin だけ。
 */
export const fetchReleasesCommand: CommandModule<object, FetchReleasesArgs> = {
	command: "fetch-releases",
	describe:
		"upstream の正式リリースのタグを upstream/<tag> として origin に作成する",
	builder: (y) =>
		y
			.option("owner", {
				type: "string",
				describe: "GitHub owner (既定: endolphin.json の upstream URL から導出)",
			})
			.option("repo", {
				type: "string",
				describe: "GitHub repo (既定: endolphin.json の upstream URL から導出)",
			})
			.option("upstreamUrl", {
				type: "string",
				describe: "upstream リポジトリ URL (既定: endolphin.json)",
			})
			.option("upstreamRemote", {
				type: "string",
				describe: "upstream remote 名 (既定: endolphin.json / upstream)",
			})
			.option("tagNamespace", {
				type: "string",
				describe: "タグ namespace (既定: refs/tags/<remote> = refs/tags/upstream)",
			})
			.option("push", {
				type: "boolean",
				default: (process.env.PUSH ?? "true").toLowerCase() === "true",
				describe: "origin へ push するか (--no-push で dry-run)",
			}),
	handler: async (argv) => {
		const cfg = await loadUpstreamConfig();
		const owner = argv.owner ?? process.env.UPSTREAM_OWNER ?? cfg.owner;
		const repo = argv.repo ?? process.env.UPSTREAM_REPO ?? cfg.repo;
		const upstreamUrl = argv.upstreamUrl ?? process.env.UPSTREAM_URL ?? cfg.upstreamUrl;
		const upstreamRemote =
			argv.upstreamRemote ?? process.env.UPSTREAM_REMOTE ?? cfg.upstreamRemote;
		const namespace = normalizeUpstreamTagNamespace(
			upstreamRemote,
			argv.tagNamespace ?? process.env.UPSTREAM_TAG_NAMESPACE,
		);
		const push = argv.push;

		// 1. 正式リリースのタグ名集合を GitHub API から取得。
		//    releases API は先頭 1000 件までしか返さず、超過ページは 422 になる。
		//    新しい順に走査し、上限に達したら打ち切る(古いリリースは対象外)。
		const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
		const octokit = new Octokit(token ? { auth: token } : {});
		log.step(`GitHub API: list releases ${owner}/${repo}`);
		const tagSet = new Set<string>();
		let scanned = 0;
		let capped = false;
		try {
			for await (const { data: page } of octokit.paginate.iterator(
				octokit.rest.repos.listReleases,
				{ owner, repo, per_page: 100 },
			)) {
				for (const r of page) {
					scanned++;
					if (!r.draft && !r.prerelease && r.tag_name) {
						tagSet.add(r.tag_name);
					}
				}
			}
		} catch (e) {
			if (isReleasesCapError(e)) {
				capped = true;
				log.info(
					"GitHub releases API の上限(先頭1000件)に達したため打ち切りました(古いリリースは対象外)",
				);
			} else {
				throw e;
			}
		}
		const tagNames = [...tagSet];
		log.info(
			`走査リリース ${scanned} 件 / 正式リリースタグ ${tagNames.length} 件 (draft/prerelease 除外${capped ? ", 1000件上限" : ""})`,
		);
		if (tagNames.length === 0) {
			log.ok("fetch-releases done (対象なし)");
			return;
		}

		// 2. upstream remote を確保
		log.step(`ensure remote ${upstreamRemote} (${upstreamUrl})`);
		await ensureRemote(upstreamRemote, upstreamUrl);

		// 3. origin に既存の namespaced タグ集合を取得し、未作成のものだけに絞る
		const existingRefs = await lsRemote(ORIGIN, `${namespace}/*`);
		const existing = new Set(existingRefs.keys());
		const missing = tagNames.filter(
			(t) => !existing.has(buildUpstreamTagRef(t, namespace)),
		);
		const skipped = tagNames.length - missing.length;
		if (missing.length === 0) {
			log.ok(`fetch-releases done (全 ${tagNames.length} 件作成済み, skip ${skipped})`);
			return;
		}
		log.info(`新規 ${missing.length} 件 / skip ${skipped} 件`);

		const pushRefs = missing.map((t) => buildUpstreamTagRef(t, namespace));
		if (!push) {
			// dry-run ではローカル ref を作らず、作成予定のみ報告する。
			log.info(
				`[--no-push] origin に以下を作成予定 (fetch/push はスキップ):\n  ${pushRefs.join("\n  ")}`,
			);
			log.ok("fetch-releases dry-run done");
			return;
		}

		// 4. upstream から refspec で取得し namespaced ref に格納(タグ object + commit を取り込む)
		const refspecs = missing.map(
			(t) => `refs/tags/${t}:${buildUpstreamTagRef(t, namespace)}`,
		);
		log.step(`fetch --no-tags ${upstreamRemote} (${refspecs.length} refspecs)`);
		await git(["fetch", "--no-tags", upstreamRemote, ...refspecs]);

		// 5. 新規 namespaced タグのみ push(force しない = 既存を上書きしない)
		log.step(`push ${ORIGIN} (${pushRefs.length} tags)`);
		await git(["push", ORIGIN, ...pushRefs]);
		log.ok(`origin に ${missing.length} 件の upstream タグを作成しました (skip ${skipped})`);
	},
};
