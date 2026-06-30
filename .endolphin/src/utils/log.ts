/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 運用スクリプト共通のロガー。記号で状態を視覚化する。
 * ▶ = 実行中の手順, ℹ = 情報/スキップ, ✔ = 成功, ✖ = 失敗。
 */
export const log = {
	step: (msg: string): void => console.log(`▶ ${msg}`),
	info: (msg: string): void => console.log(`ℹ ${msg}`),
	ok: (msg: string): void => console.log(`✔ ${msg}`),
	error: (msg: string): void => console.error(`✖ ${msg}`),
};
