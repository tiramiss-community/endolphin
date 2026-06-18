/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['pages'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:page-likes',

	// endolphin: ページ機能は削除済み。登録・型は互換のため維持し、呼び出されたらエラーを返す。
	errors: {
		featureRemoved: {
			message: 'This feature has been removed.',
			code: 'FEATURE_REMOVED',
			id: '47db5e93-3d61-4ebd-8b62-2ab4d3c42126',
			httpStatusCode: 410,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		pageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['pageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		super(meta, paramDef, async () => {
			throw new ApiError(meta.errors.featureRemoved);
		});
	}
}
