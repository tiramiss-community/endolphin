/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '../../error.js';

export const meta = {
	requireCredential: true,

	kind: 'write:account',

	// endolphin: Games 機能は削除済み。登録・型は互換のため維持し、呼び出されたらエラーを返す。
	errors: {
		featureRemoved: {
			message: 'This feature has been removed.',
			code: 'FEATURE_REMOVED',
			id: '33ea7c4c-0348-4eb9-9e3d-e55fcd99c536',
			httpStatusCode: 410,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		score: { type: 'integer', minimum: 0 },
		seed: { type: 'string', minLength: 1, maxLength: 1024 },
		logs: {
			type: 'array',
			items: {
				type: 'array',
				items: {
					type: 'number',
				},
			},
		},
		gameMode: { type: 'string' },
		gameVersion: { type: 'integer' },
	},
	required: ['score', 'seed', 'logs', 'gameMode', 'gameVersion'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		super(meta, paramDef, async () => {
			throw new ApiError(meta.errors.featureRemoved);
		});
	}
}
