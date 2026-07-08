/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type VitestJsonResult = {
	success: boolean;
	numTotalTests: number;
	numPassedTests: number;
	numFailedTests: number;
	numPendingTests: number;
	numUnhandledErrors: number;
};

type VitestProgress = {
	lastEvent: string;
	expectedModules: number;
	queuedModules: number;
	collectedModules: number;
	endedModules: number;
	lastModuleId?: string;
	lastTestName?: string;
	nextUncollectedModuleId?: string;
};

const resultPath = resolve('/tmp', `misskey-fed-vitest-${process.pid}.json`);
const progressPath = `${resultPath}.progress.json`;
const resultProbePath = `${resultPath}.probe`;
const testArgs = process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);
const expectedTestFiles = testArgs.filter(arg => arg.endsWith('.test.ts'));
const waitLogIntervalMs = 30_000;

// 内側 Vitest は federation daemon などの open handle を残すことがあり、テスト完了後も process が終了しない場合がある。
// そのため Vitest の終了コードだけを待たず、custom reporter が全 test module 終了時に書き出す結果を監視して compose run を確実に終わらせる。
function sleep(ms: number): Promise<void> {
	return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

// 結果ファイルは /tmp に置く。workspace 側は bind mount の read_only が多く、runner 固有の一時ファイルを混ぜたくないため。
async function readResult(): Promise<VitestJsonResult | undefined> {
	if (!existsSync(resultPath)) {
		return undefined;
	}

	return JSON.parse(await readFile(resultPath, 'utf8')) as VitestJsonResult;
}

async function readProgress(): Promise<VitestProgress | undefined> {
	if (!existsSync(progressPath)) {
		return undefined;
	}

	return JSON.parse(await readFile(progressPath, 'utf8')) as VitestProgress;
}

function formatProgress(progress: VitestProgress | undefined): string {
	if (progress == null) {
		return 'progress is not written yet';
	}

	return [
		`last=${progress.lastEvent}`,
		`modules=${progress.endedModules}/${progress.expectedModules} ended`,
		`collected=${progress.collectedModules}`,
		`queued=${progress.queuedModules}`,
		progress.lastModuleId == null ? undefined : `module=${progress.lastModuleId}`,
		progress.lastTestName == null ? undefined : `test=${progress.lastTestName}`,
		progress.nextUncollectedModuleId == null ? undefined : `next=${progress.nextUncollectedModuleId}`,
	].filter(value => value != null).join(', ');
}

// custom reporter が全 test module の結果を書いた時点で、テストとしては合否が確定している。
// Vitest 本体が open handle で残っている場合は SIGTERM して、外側 runner の cleanup に処理を戻す。
async function waitForResult(child: ReturnType<typeof spawn>): Promise<{ result?: VitestJsonResult; exitCode?: number | null }> {
	let exitCode: number | null | undefined;
	let lastWaitLogAt = Date.now();
	child.on('exit', code => {
		exitCode = code;
	});

	while (exitCode === undefined) {
		const result = await readResult();
		if (result != null) {
			await sleep(500);
			if (exitCode === undefined) {
				child.kill('SIGTERM');
			}
			return { result, exitCode };
		}
		if (Date.now() - lastWaitLogAt >= waitLogIntervalMs) {
			console.error(`[test-federation] Vitest result is not written yet. Waiting for ${resultPath}. ${formatProgress(await readProgress())}`);
			lastWaitLogAt = Date.now();
		}
		await sleep(500);
	}

	return { result: await readResult(), exitCode };
}

// 前回の異常終了で同名ファイルが残った場合に、古い結果を読み込まないよう起動前に消しておく。
await rm(resultPath, { force: true });
await rm(progressPath, { force: true });
await writeFile(resultProbePath, 'ok\n', 'utf8');
await rm(resultProbePath, { force: true });

if (expectedTestFiles.length === 0) {
	console.error('[test-federation] Running all federation test files. The wrapper will wait until the whole suite finishes.');
} else {
	console.error(`[test-federation] Running selected federation test file(s): ${expectedTestFiles.join(', ')}`);
}

// verbose reporter は人間が読むログ用、custom reporter は wrapper が機械的に終了判定するためのもの。
// JSON reporter は process exit まで出力されないため、open handle で終了しない今回の用途には向かない。
const child = spawn('vitest', [
	'--run',
	'--config',
	'vitest.config.fed.ts',
	'--reporter=verbose',
	'--reporter=./test-federation/vitest-result-reporter.ts',
	'--',
	...testArgs,
], {
	stdio: 'inherit',
	env: {
		...process.env,
		NODE_ENV: 'test',
		MISSKEY_TEST_FEDERATION_VITEST_RESULT_PATH: resultPath,
		MISSKEY_TEST_FEDERATION_VITEST_PROGRESS_PATH: progressPath,
		MISSKEY_TEST_FEDERATION_EXPECTED_TEST_FILES: JSON.stringify(expectedTestFiles),
	},
});

child.on('error', err => {
	throw err;
});

const { result, exitCode } = await waitForResult(child);
await rm(resultPath, { force: true });
await rm(progressPath, { force: true });

// custom reporter が動く前に Vitest が落ちた場合は、Vitest の exit code をそのまま外側 runner に返す。
// reporter 結果がある場合は、open handle による終了遅延ではなくテスト結果そのもので成否を決める。
if (result == null) {
	process.exitCode = exitCode ?? 1;
} else if (!result.success) {
	console.error(`Federation tests failed: ${result.numFailedTests}/${result.numTotalTests} failed, ${result.numPendingTests} skipped, ${result.numUnhandledErrors} unhandled errors.`);
	process.exitCode = 1;
} else {
	console.log(`Federation tests passed: ${result.numPassedTests}/${result.numTotalTests} passed, ${result.numPendingTests} skipped.`);
	process.exitCode = 0;
}
