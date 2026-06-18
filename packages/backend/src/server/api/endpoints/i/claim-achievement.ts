/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';
import { ApiError } from '../../error.js';

export const meta = {
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',

	// endolphin: 実績機能は削除済み。登録・型は互換のため維持し、呼び出されたらエラーを返す。
	errors: {
		featureRemoved: {
			message: 'This feature has been removed.',
			code: 'FEATURE_REMOVED',
			id: 'e2713479-d76b-4f59-97cd-f8a230a920a5',
			httpStatusCode: 410,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', enum: ACHIEVEMENT_TYPES },
	},
	required: ['name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		super(meta, paramDef, async () => {
			throw new ApiError(meta.errors.featureRemoved);
		});
	}
}
