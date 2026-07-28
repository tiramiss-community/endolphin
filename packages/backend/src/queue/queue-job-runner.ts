/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { OperationContextService } from '@/core/OperationContextService.js';
import type { TelemetryService } from '@/core/telemetry/TelemetryService.js';

type QueueOperationContextService = Pick<OperationContextService, 'runRoot'>;
type QueueTelemetryService = Pick<TelemetryService, 'startSpanWithTraceContext'>;

export type RunQueueJobOptions<T> = {
	operationContext:
		| { mode: 'none' }
		| { mode: 'per-job'; service: QueueOperationContextService };
	telemetryService: QueueTelemetryService;
	spanName: string;
	jobData: object;
	processJob: () => T | Promise<T>;
	onError: (error: Error) => void;
};

type QueueJobExecution<T> =
	| { readonly outcome: 'success'; readonly value: T }
	| { readonly outcome: 'failure'; readonly error: unknown };

/** QueueのprocessorをTrace Context付きで実行し、失敗処理をSpan内で行います。 */
export async function runQueueJob<T>(options: RunQueueJobOptions<T>): Promise<T> {
	const {
		operationContext,
		telemetryService,
		spanName,
		jobData,
		processJob,
		onError,
	} = options;
	const run = async (): Promise<T> => {
		const execution = await telemetryService.startSpanWithTraceContext(spanName, jobData, async (): Promise<QueueJobExecution<T>> => {
			try {
				return { outcome: 'success', value: await processJob() };
			} catch (error) {
				// 失敗イベントを待たず、processor Spanがactiveな間にログと通知を行う。
				const normalizedError = error instanceof Error ? error : new Error(String(error));
				try {
					onError(normalizedError);
				} catch {
					// 失敗ログの処理が例外を投げても、Queueへは元のエラーを返します。
				}
				// 元のErrorはSpan callbackの外で再throwし、executeSpanが例外本文やstackを記録しないようにする。
				return { outcome: 'failure', error };
			}
		});
		if (execution.outcome === 'failure') throw execution.error;
		return execution.value;
	};

	return operationContext.mode === 'none'
		? await run()
		: operationContext.service.runRoot(run);
}
