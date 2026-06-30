/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { fetchReleasesCommand } from "./commands/fetch-releases";
import { syncUpstreamCommand } from "./commands/sync-upstream";
import { log } from "./utils/log";

/**
 * endolphin fork の運用 CLI。
 * upstream(misskey-dev/misskey) は readonly。書き込みは常に origin のみ。
 */
async function main(): Promise<void> {
	await yargs(hideBin(process.argv))
		.scriptName("ops")
		.usage("$0 <command> [options]")
		.command(syncUpstreamCommand)
		.command(fetchReleasesCommand)
		.demandCommand(1, "サブコマンドを指定してください (sync-upstream / fetch-releases)")
		.strict()
		.help()
		.alias("h", "help")
		.parseAsync();
}

main().catch((e: unknown) => {
	log.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
