/** 表示用の数値フォーマット。 */

/**
 * 概数表示の刻み。
 *
 * カクヨムの執筆画面の文字数表示は100字単位の概数（「約4,900字」）なので、
 * それに合わせている。
 */
const APPROXIMATE_UNIT = 100;

export function formatNumber(count: number): string {
	return count.toLocaleString("ja-JP");
}

/** 100字単位に丸めた概数。四捨五入で、2,720 なら 2,700。 */
export function roundToApproximate(count: number): number {
	return Math.round(count / APPROXIMATE_UNIT) * APPROXIMATE_UNIT;
}

/**
 * 「1,284字」の形式。
 *
 * approximate が真のときは「約1,300字」のように100字単位で丸める。
 * ただし丸めると0字になってしまう100字未満は、概数にせずそのまま表示する。
 * 「約0字」では書いた分が消えたように見えるため。
 */
export function formatCount(count: number, approximate = false): string {
	if (!approximate) return `${formatNumber(count)}字`;

	const rounded = roundToApproximate(count);
	if (rounded === 0) return `${formatNumber(count)}字`;

	return `約${formatNumber(rounded)}字`;
}
