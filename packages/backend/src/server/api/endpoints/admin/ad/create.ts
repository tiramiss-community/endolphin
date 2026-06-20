/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:ad',
	res: {
		type: 'object',
		optional: false,
		nullable: false,
		ref: 'Ad',
	},

	// endolphin: 広告機能は削除済み。登録・型は互換のため維持し、呼び出されたらエラーを返す。
	errors: {
		featureRemoved: {
			message: 'This feature has been removed.',
			code: 'FEATURE_REMOVED',
			id: 'c90445e6-01db-46d9-82ea-6bedc99fd59c',
			httpStatusCode: 410,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string', minLength: 1 },
		memo: { type: 'string' },
		place: { type: 'string' },
		priority: { type: 'string' },
		ratio: { type: 'integer' },
		expiresAt: { type: 'integer' },
		startsAt: { type: 'integer' },
		imageUrl: { type: 'string', minLength: 1 },
		dayOfWeek: { type: 'integer' },
		isSensitive: { type: 'boolean' },
	},
	required: ['url', 'memo', 'place', 'priority', 'ratio', 'expiresAt', 'startsAt', 'imageUrl', 'dayOfWeek'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		super(meta, paramDef, async () => {
			throw new ApiError(meta.errors.featureRemoved);
		});
	}
}
