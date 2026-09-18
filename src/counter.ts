/**
 * 文字数カウントの中核。
 *
 * Obsidian API に依存しないため、そのまま単体テストできる。
 */

import {
	stripFrontmatter,
	stripHeadingLines,
	stripKakuyomuNotation,
	stripMarkdown,
} from "./markdown";

export type CountMode = "manuscript" | "raw" | "vscode" | "kakuyomu";

export interface CountOptions {
	mode: CountMode;
	excludeMarkdownSyntax: boolean;
	excludeNewlines: boolean;
	excludeHalfWidthSpace: boolean;
	excludeFullWidthSpace: boolean;
	excludeFrontmatter: boolean;
	/** カクヨム記法のルビの読み・傍点記号を数えないか（Manuscriptモードのみ） */
	excludeRubyReading: boolean;
	useGraphemeClusters: boolean;
}

export const DEFAULT_COUNT_OPTIONS: CountOptions = {
	mode: "manuscript",
	excludeMarkdownSyntax: true,
	excludeNewlines: true,
	excludeHalfWidthSpace: true,
	excludeFullWidthSpace: false,
	excludeFrontmatter: true,
	excludeRubyReading: true,
	useGraphemeClusters: true,
};

/**
 * VSCodeの文字数表示との比較用の固定設定。
 * VSCodeのステータスバーが表示する選択文字数に合わせる。
 *
 * - Markdown記法は解釈せず、ファイルの文字列をそのまま数える
 * - 改行は数えない（VSCodeの表示は改行を含まない。実測で確認済み）
 * - 半角・全角スペースは数える
 * - サロゲートペアは1文字（＝コードポイント単位。書記素クラスタは使わない）
 */
const VSCODE_OPTIONS: CountOptions = {
	mode: "vscode",
	excludeMarkdownSyntax: false,
	excludeNewlines: true,
	excludeHalfWidthSpace: false,
	excludeFullWidthSpace: false,
	excludeFrontmatter: false,
	excludeRubyReading: false,
	useGraphemeClusters: false,
};

/**
 * カクヨムの文字数表示に合わせた固定設定。
 *
 * カクヨムは「改行・半角スペース・全角スペース・ルビの読み」を数えない。
 * 話のタイトルは本文とは別に入力するため、見出し行も数えない。
 *
 * カクヨムはMarkdownを解釈しないので、Markdown記号は除去しない。
 * たとえばシーン区切りの `***` は、カクヨムでは水平線にならず
 * アスタリスク3文字としてそのまま表示され、文字数にも入る。
 */
const KAKUYOMU_OPTIONS: CountOptions = {
	mode: "kakuyomu",
	excludeMarkdownSyntax: false,
	excludeNewlines: true,
	excludeHalfWidthSpace: true,
	excludeFullWidthSpace: true,
	excludeFrontmatter: true,
	excludeRubyReading: true,
	useGraphemeClusters: true,
};

/** モードごとの固定設定があればそれを、なければ渡された設定を使う。 */
function resolveOptions(options: CountOptions): CountOptions {
	if (options.mode === "vscode") return VSCODE_OPTIONS;
	if (options.mode === "kakuyomu") return KAKUYOMU_OPTIONS;
	return options;
}

let cachedSegmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
	if (cachedSegmenter !== undefined) return cachedSegmenter;
	try {
		if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
			cachedSegmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
		} else {
			cachedSegmenter = null;
		}
	} catch {
		cachedSegmenter = null;
	}
	return cachedSegmenter;
}

/**
 * 書記素クラスタ（見た目の1文字）単位で数える。
 * Intl.Segmenter が使えない環境ではコードポイント単位にフォールバックする。
 */
export function countGraphemes(text: string): number {
	const segmenter = getSegmenter();
	if (!segmenter) return countCodePoints(text);
	let count = 0;
	for (const _segment of segmenter.segment(text)) count++;
	return count;
}

/** コードポイント単位で数える（サロゲートペアを1文字として扱う）。 */
export function countCodePoints(text: string): number {
	let count = 0;
	for (const _ch of text) count++;
	return count;
}

/**
 * 設定に従ってテキストを「数える対象の文字列」へ変換する。
 * デバッグや、VSCodeとの差分調査に使えるよう公開している。
 */
export function toCountableText(text: string, options: CountOptions): string {
	const opts = resolveOptions(options);

	let s = text.replace(/\r\n?/g, "\n");

	if (opts.mode === "manuscript") {
		if (opts.excludeFrontmatter) s = stripFrontmatter(s);
		// ルビは Markdown の処理より先に外す（| をテーブル記号と誤認させないため）
		if (opts.excludeRubyReading) s = stripKakuyomuNotation(s);
		if (opts.excludeMarkdownSyntax) s = stripMarkdown(s);
	} else if (opts.mode === "kakuyomu") {
		// カクヨムへ貼る本文だけを残す。Markdown記法はそのまま数える。
		s = stripFrontmatter(s);
		s = stripHeadingLines(s);
		s = stripKakuyomuNotation(s);
	} else if (opts.mode === "raw") {
		// Raw Text: ファイルの文字列をそのまま扱う。
		// frontmatterの扱いだけは設定に従う。
		if (opts.excludeFrontmatter) s = stripFrontmatter(s);
	}

	if (opts.excludeNewlines) s = s.replace(/\n/g, "");
	if (opts.excludeHalfWidthSpace) s = s.replace(/[ \t]/g, "");
	if (opts.excludeFullWidthSpace) s = s.replace(/　/g, "");

	return s;
}

/** 設定に従ってテキストの文字数を数える。 */
export function countCharacters(text: string, options: CountOptions): number {
	const opts = resolveOptions(options);
	const target = toCountableText(text, options);
	return opts.useGraphemeClusters
		? countGraphemes(target)
		: countCodePoints(target);
}
