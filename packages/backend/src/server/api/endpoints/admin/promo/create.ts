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
	kind: 'write:admin:promo',

	// endolphin: プロモ機能は削除済み。登録・型は互換のため維持し、呼び出されたらエラーを返す。
	errors: {
		featureRemoved: {
			message: 'This feature has been removed.',
			code: 'FEATURE_REMOVED',
			id: '90f5f63a-3e42-4341-96e6-07790409c33e',
			httpStatusCode: 410,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		expiresAt: { type: 'integer' },
	},
	required: ['noteId', 'expiresAt'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		super(meta, paramDef, async () => {
			throw new ApiError(meta.errors.featureRemoved);
		});
	}
}
