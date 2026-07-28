/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { defineOperationMemo, OperationContextService } from '@/core/OperationContextService.js';
import { runQueueJob } from '@/queue/queue-job-runner.js';
import { TelemetryService } from '@/core/telemetry/TelemetryService.js';

describe('runQueueJob', () => {
	const operationContextService = new OperationContextService();

	test('returns the processor result without invoking the error handler', async () => {
		let spanActive = false;
		const startSpanWithTraceContext = vi.fn(<T>(_name: string, _jobData: object, fn: () => T): T => {
			spanActive = true;
			const result = fn();
			if (result instanceof Promise) return result.finally(() => { spanActive = false; }) as T;
			spanActive = false;
			return result;
		});
		const telemetryService = {
			startSpanWithTraceContext,
		} as unknown as TelemetryService;
		const onError = vi.fn();

		await expect(runQueueJob({
			operationContext: { mode: 'none' },
			telemetryService,
			spanName: 'Queue: test',
			jobData: {},
			processJob: () => 'ok',
			onError,
		})).resolves.toBe('ok');

		expect(onError).not.toHaveBeenCalled();
		expect(spanActive).toBe(false);
	});

	test('handles failures while the processor span is active and rethrows the original error', async () => {
		let spanActive = false;
		let callbackResult: unknown;
		let callbackRejected = false;
		const startSpanWithTraceContext = vi.fn(<T>(_name: string, _jobData: object, fn: () => T): T => {
			spanActive = true;
			const result = fn();
			if (result instanceof Promise) {
				return result.then(value => {
					callbackResult = value;
					spanActive = false;
					return value;
				}, error => {
					callbackRejected = true;
					spanActive = false;
					throw error;
				}) as T;
			}
			spanActive = false;
			return result;
		});
		const telemetryService = {
			startSpanWithTraceContext,
		} as unknown as TelemetryService;
		const onError = vi.fn((error: Error) => {
			expect(spanActive).toBe(true);
			expect(error).toBeInstanceOf(Error);
		});
		const originalError = new Error('failed');

		await expect(runQueueJob({
			operationContext: { mode: 'none' },
			telemetryService,
			spanName: 'Queue: test',
			jobData: {},
			processJob: async () => {
				throw originalError;
			},
			onError,
		})).rejects.toBe(originalError);

		expect(onError).toHaveBeenCalledOnce();
		expect(callbackRejected).toBe(false);
		expect(callbackResult).toMatchObject({ outcome: 'failure' });
		expect(spanActive).toBe(false);
	});

	test('creates an isolated operation context for each job', async () => {
		const token = defineOperationMemo<string, object>('queue test', key => key);
		const loader = vi.fn(() => ({}));
		const telemetryService = {
			startSpanWithTraceContext: <T>(_name: string, _jobData: object, fn: () => T): T => fn(),
		} as unknown as TelemetryService;

		const first = await runQueueJob({
			operationContext: { mode: 'per-job', service: operationContextService },
			telemetryService,
			spanName: 'Queue: test',
			jobData: {},
			processJob: async () => {
				const [a, b] = await Promise.all([
					operationContextService.memoizeIfActive(token, 'key', loader),
					operationContextService.memoizeIfActive(token, 'key', loader),
				]);
				expect(a).toBe(b);
				return a;
			},
			onError: vi.fn(),
		});
		const second = await runQueueJob({
			operationContext: { mode: 'per-job', service: operationContextService },
			telemetryService,
			spanName: 'Queue: test',
			jobData: {},
			processJob: () => operationContextService.memoizeIfActive(token, 'key', loader),
			onError: vi.fn(),
		});

		expect(first).not.toBe(second);
		expect(loader).toHaveBeenCalledTimes(2);
	});

	test('does not create an operation context unless explicitly requested', async () => {
		const token = defineOperationMemo<string, object>('queue test', key => key);
		const loader = vi.fn(() => ({}));
		const telemetryService = {
			startSpanWithTraceContext: <T>(_name: string, _jobData: object, fn: () => T): T => fn(),
		} as unknown as TelemetryService;

		await runQueueJob({
			operationContext: { mode: 'none' },
			telemetryService,
			spanName: 'Queue: long running test',
			jobData: {},
			processJob: async () => {
				const first = await operationContextService.memoizeIfActive(token, 'key', loader);
				const second = await operationContextService.memoizeIfActive(token, 'key', loader);
				expect(first).not.toBe(second);
			},
			onError: vi.fn(),
		});

		expect(loader).toHaveBeenCalledTimes(2);
	});
});
