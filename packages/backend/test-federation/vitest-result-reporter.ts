/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { writeFile } from 'node:fs/promises';
import type { Reporter } from 'vitest/reporters';

type FederationVitestResult = {
	success: boolean;
	numTotalTests: number;
	numPassedTests: number;
	numFailedTests: number;
	numPendingTests: number;
	numUnhandledErrors: number;
};

type FederationVitestProgress = {
	lastEvent: string;
	expectedModules: number;
	queuedModules: number;
	collectedModules: number;
	endedModules: number;
	lastModuleId?: string;
	lastTestName?: string;
	nextUncollectedModuleId?: string;
};

type TestSpecifications = Parameters<NonNullable<Reporter['onTestRunStart']>>[0];
type TestModule = Parameters<NonNullable<Reporter['onTestModuleEnd']>>[0];
type TestCase = Parameters<NonNullable<Reporter['onTestCaseResult']>>[0];
type TestModules = ReadonlyArray<TestModule>;
type UnhandledErrors = Parameters<NonNullable<Reporter['onTestRunEnd']>>[1];

function parseExpectedTestFiles(): string[] {
	const raw = process.env.MISSKEY_TEST_FEDERATION_EXPECTED_TEST_FILES;
	if (raw == null || raw === '') {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return [];
	}

	if (!Array.isArray(parsed)) {
		return [];
	}

	return parsed
		.filter((value): value is string => typeof value === 'string' && value !== '')
		.map(value => value.replaceAll('\\', '/'));
}

function isFinished(testCase: TestCase): boolean {
	return testCase.result().state !== 'pending';
}

// Vitest v4 の TestModule 型は reporters entrypoint から直接 export されていない。
// Reporter の callback 型から派生させることで、Vitest 側の型変更に追従しやすくしている。
function summarize(testModules: TestModules, numUnhandledErrors: number): FederationVitestResult {
	let numTotalTests = 0;
	let numPassedTests = 0;
	let numFailedTests = 0;
	let numPendingTests = 0;

	for (const testModule of testModules) {
		for (const testCase of testModule.children.allTests()) {
			numTotalTests++;
			const result = testCase.result();
			if (result.state === 'passed') {
				numPassedTests++;
			} else if (result.state === 'failed') {
				numFailedTests++;
			} else {
				numPendingTests++;
			}
		}
	}

	return {
		success: numFailedTests === 0 && numUnhandledErrors === 0,
		numTotalTests,
		numPassedTests,
		numFailedTests,
		numPendingTests,
		numUnhandledErrors,
	};
}

export default class FederationVitestResultReporter implements Reporter {
	private readonly expectedTestFiles = parseExpectedTestFiles();
	private expectedModuleCount = 0;
	private readonly expectedModuleIds: string[] = [];
	private readonly queuedModuleIds = new Set<string>();
	private readonly collectedModules = new Map<string, TestModule>();
	private readonly endedModules = new Map<string, TestModule>();
	private readonly finishedTestCaseIds = new Set<string>();
	private lastEvent = 'init';
	private lastModuleId: string | undefined;
	private lastTestName: string | undefined;
	private wroteResult = false;

	// onTestModuleEnd は「そのファイルの全テストが終わった」時点で呼ばれる。
	// federation test は daemon 由来の open handle で run 全体の終了が遅れることがあるため、
	// onTestRunEnd だけに依存せず、全 module の終了を確認した段階で wrapper 用の結果を書き出す。
	async onTestRunStart(specifications: TestSpecifications): Promise<void> {
		this.expectedModuleCount = specifications.length;
		this.expectedModuleIds.splice(0, this.expectedModuleIds.length, ...specifications.map(specification => specification.moduleId));
		this.lastEvent = 'run-start';
		await this.writeProgress();
	}

	async onTestModuleQueued(testModule: TestModule): Promise<void> {
		this.queuedModuleIds.add(testModule.moduleId);
		this.lastEvent = 'module-queued';
		this.lastModuleId = testModule.moduleId;
		await this.writeProgress();
	}

	async onTestModuleCollected(testModule: TestModule): Promise<void> {
		this.collectedModules.set(testModule.moduleId, testModule);
		this.lastEvent = 'module-collected';
		this.lastModuleId = testModule.moduleId;
		await this.writeProgress();
	}

	// skipped を含む各 test case の結果が全てそろった時点でも結果を書けるようにする。
	// これにより module/run の終了処理だけが open handle で詰まるケースでも、合否を外側 wrapper に返せる。
	async onTestCaseResult(testCase: TestCase): Promise<void> {
		this.finishedTestCaseIds.add(testCase.id);
		this.lastEvent = `test-${testCase.result().state}`;
		this.lastModuleId = testCase.module.moduleId;
		this.lastTestName = testCase.fullName;
		await this.writeProgress();
		await this.writeResultIfExpectedTestFilesFinished(0);
		await this.writeResultIfAllTestCasesFinished(0);
	}

	async onTestModuleEnd(testModule: TestModule): Promise<void> {
		this.endedModules.set(testModule.moduleId, testModule);
		this.lastEvent = 'module-end';
		this.lastModuleId = testModule.moduleId;
		await this.writeProgress();
		await this.writeResultIfAllModulesEnded(0);
	}

	// onTestRunEnd が正常に届く環境では、unhandled error 数も含む最終結果で上書きする。
	// 届かない環境でも onTestModuleEnd 側の結果が先に出るので、run-vitest.ts が cleanup へ戻れる。
	async onTestRunEnd(testModules: TestModules, unhandledErrors: UnhandledErrors): Promise<void> {
		this.lastEvent = 'run-end';
		await this.writeProgress();
		await this.writeResult(testModules, unhandledErrors.length, true);
	}

	private buildProgress(): FederationVitestProgress {
		return {
			lastEvent: this.lastEvent,
			expectedModules: this.expectedModuleCount,
			queuedModules: this.queuedModuleIds.size,
			collectedModules: this.collectedModules.size,
			endedModules: this.endedModules.size,
			lastModuleId: this.lastModuleId,
			lastTestName: this.lastTestName,
			nextUncollectedModuleId: this.expectedModuleIds.find(moduleId => !this.collectedModules.has(moduleId)),
		};
	}

	private async writeProgress(): Promise<void> {
		const progressPath = process.env.MISSKEY_TEST_FEDERATION_VITEST_PROGRESS_PATH;
		if (progressPath == null || progressPath === '') {
			return;
		}

		await writeFile(progressPath, `${JSON.stringify(this.buildProgress())}\n`, 'utf8').catch(() => undefined);
	}

	private async writeResultIfAllModulesEnded(numUnhandledErrors: number): Promise<void> {
		if (this.wroteResult) {
			return;
		}

		const expectedModules = Math.max(this.expectedModuleCount, this.queuedModuleIds.size);
		if (expectedModules === 0 || this.endedModules.size < expectedModules) {
			return;
		}

		await this.writeResult([...this.endedModules.values()], numUnhandledErrors, false);
	}

	private async writeResultIfExpectedTestFilesFinished(numUnhandledErrors: number): Promise<void> {
		if (this.wroteResult || this.expectedTestFiles.length === 0) {
			return;
		}

		const modules = this.expectedTestFiles
			.map(expectedFile => [...this.collectedModules.values()]
				.find(testModule => testModule.moduleId.replaceAll('\\', '/').endsWith(expectedFile)))
			.filter((testModule): testModule is TestModule => testModule != null);
		if (modules.length < this.expectedTestFiles.length) {
			return;
		}

		const allTestCases = modules.flatMap(testModule => [...testModule.children.allTests()]);
		if (allTestCases.length === 0 || allTestCases.some(testCase => !isFinished(testCase))) {
			return;
		}

		await this.writeResult(modules, numUnhandledErrors, false);
	}

	private async writeResultIfAllTestCasesFinished(numUnhandledErrors: number): Promise<void> {
		if (this.wroteResult || this.expectedTestFiles.length > 0) {
			return;
		}

		if (this.expectedModuleCount === 0 || this.collectedModules.size < this.expectedModuleCount) {
			return;
		}

		const modules = [...this.collectedModules.values()];
		const allTestCases = modules.flatMap(testModule => [...testModule.children.allTests()]);
		if (allTestCases.length === 0 || allTestCases.some(testCase => !this.finishedTestCaseIds.has(testCase.id))) {
			return;
		}

		await this.writeResult(modules, numUnhandledErrors, false);
	}

	private async writeResult(testModules: TestModules, numUnhandledErrors: number, overwrite: boolean): Promise<void> {
		if (this.wroteResult && !overwrite) {
			return;
		}

		const resultPath = process.env.MISSKEY_TEST_FEDERATION_VITEST_RESULT_PATH;
		if (resultPath == null || resultPath === '') {
			return;
		}

		const result = summarize(testModules, numUnhandledErrors);
		try {
			await writeFile(resultPath, `${JSON.stringify(result)}\n`, 'utf8');
		} catch (err) {
			console.error(`[test-federation] Failed to write Vitest result to ${resultPath}`);
			throw err;
		}
		this.wroteResult = true;
		console.error(`[test-federation] Vitest result written: ${result.numPassedTests}/${result.numTotalTests} passed, ${result.numPendingTests} skipped, ${result.numFailedTests} failed.`);
	}
}
