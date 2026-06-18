/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metaPath = resolve(root, 'endolphin.json');

function sh(cmd) {
	return execSync(cmd, { cwd: root, encoding: 'utf-8' }).trim();
}

const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
const { remote, branch } = meta.upstream;
const mode = process.argv[2] ?? '--check';

sh(`git fetch ${remote} ${branch}`);
const behind = sh(`git rev-list --count HEAD..${remote}/${branch}`);
const ahead = sh(`git rev-list --count ${remote}/${branch}..HEAD`);
const upstreamHead = sh(`git rev-parse --short ${remote}/${branch}`);

console.log(`endolphin basedOn: ${meta.upstream.basedOn}`);
console.log(`upstream ${remote}/${branch} @ ${upstreamHead}`);
console.log(`upstream より遅れ: ${behind} commit`);
console.log(`upstream より進み (endolphin の commit): ${ahead} commit`);

if (mode === '--check') {
	if (Number(behind) > 0) {
		console.log('');
		console.log('同期するには新しいブランチで:');
		console.log(`  git switch -c sync/upstream-<yyyymmdd>`);
		console.log(`  git merge ${remote}/${branch}`);
		console.log('競合を解消したら:');
		console.log('  node scripts/sync-upstream.mjs --set-base');
		console.log('  pnpm lint && pnpm --filter backend test:fed');
		console.log('を実行して PR を作成する。');
	} else {
		console.log('upstream と同期済み。');
	}
} else if (mode === '--set-base') {
	const upstreamVersion = JSON.parse(sh(`git show ${remote}/${branch}:package.json`)).version;
	meta.upstream.basedOn = upstreamVersion;
	writeFileSync(metaPath, JSON.stringify(meta, null, '\t') + '\n');
	console.log(`endolphin.json の basedOn を更新 -> ${upstreamVersion}`);
} else {
	console.error(`不明なモード: ${mode}. --check か --set-base を使う。`);
	process.exit(1);
}
