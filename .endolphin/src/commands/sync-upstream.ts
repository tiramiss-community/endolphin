/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { CommandModule } from "yargs";
import { loadUpstreamConfig } from "../utils/config";
import { ensureRemote, git, lsRemote, rev } from "../utils/git";
import { log } from "../utils/log";

const ORIGIN = "origin";

interface SyncUpstreamArgs {
	upstreamUrl: string | undefined;
	upstreamRemote: string | undefined;
	upstreamBranch: string | undefined;
	targetBranch: string;
	push: boolean;
}

/**
 * upstream の develop を取得し、origin の `upstream/develop` ブランチ(ミラー)へ反映する。
 *
 * upstream は readonly。fetch のみで push は一切しない。書き込みは origin だけ。
 */
export const syncUpstreamCommand: CommandModule<object, SyncUpstreamArgs> = {
	command: "sync-upstream",
	describe:
		"upstream の develop を取得し origin の upstream/develop ブランチ(ミラー)に反映する",
	builder: (y) =>
		y
			.option("upstreamUrl", {
				type: "string",
				describe: "upstream リポジトリ URL (既定: endolphin.json)",
			})
			.option("upstreamRemote", {
				type: "string",
				describe: "upstream remote 名 (既定: endolphin.json / upstream)",
			})
			.option("upstreamBranch", {
				type: "string",
				describe: "取得する upstream ブランチ (既定: endolphin.json / develop)",
			})
			.option("targetBranch", {
				type: "string",
				default: process.env.TARGET_BRANCH ?? "upstream/develop",
				describe: "origin 側のミラーブランチ名",
			})
			.option("push", {
				type: "boolean",
				default: (process.env.PUSH ?? "true").toLowerCase() === "true",
				describe: "origin へ push するか (--no-push で dry-run)",
			}),
	handler: async (argv) => {
		const cfg = await loadUpstreamConfig();
		const upstreamUrl = argv.upstreamUrl ?? process.env.UPSTREAM_URL ?? cfg.upstreamUrl;
		const upstreamRemote =
			argv.upstreamRemote ?? process.env.UPSTREAM_REMOTE ?? cfg.upstreamRemote;
		const upstreamBranch =
			argv.upstreamBranch ?? process.env.UPSTREAM_BRANCH ?? cfg.upstreamBranch;
		const targetBranch = argv.targetBranch;
		const push = argv.push;

		log.step(`ensure remote ${upstreamRemote} (${upstreamUrl})`);
		await ensureRemote(upstreamRemote, upstreamUrl);

		log.step(`fetch --prune --no-tags ${upstreamRemote} ${upstreamBranch}`);
		await git(["fetch", "--prune", "--no-tags", upstreamRemote, upstreamBranch]);

		const sha = await rev(`${upstreamRemote}/${upstreamBranch}`);
		log.info(`upstream ${upstreamRemote}/${upstreamBranch} @ ${sha.slice(0, 9)}`);

		const targetRef = `refs/heads/${targetBranch}`;
		const remoteRefs = await lsRemote(ORIGIN, targetRef);
		const current = remoteRefs.get(targetRef);
		if (current === sha) {
			log.info(`origin/${targetBranch} は既に最新 (${sha.slice(0, 9)}) — 反映不要`);
			log.ok("sync-upstream done");
			return;
		}

		const fromLabel = current ? current.slice(0, 9) : "(new)";
		if (!push) {
			log.info(
				`[--no-push] origin/${targetBranch} を ${fromLabel} → ${sha.slice(0, 9)} に更新予定`,
			);
			log.ok("sync-upstream dry-run done");
			return;
		}

		// upstream/develop は誰もコミットしない専用ミラーブランチ。
		// AGENTS.md 規約 #4 の force-push 禁止対象 (main/develop/master) には該当しない。
		// upstream 側の rebase/force にも追従できるよう force ミラーが正しい意味論。
		log.step(`push --force ${ORIGIN} ${sha.slice(0, 9)}:${targetRef}`);
		await git(["push", "--force", ORIGIN, `${sha}:${targetRef}`]);
		log.ok(`origin/${targetBranch} を ${fromLabel} → ${sha.slice(0, 9)} に反映しました`);
	},
};
