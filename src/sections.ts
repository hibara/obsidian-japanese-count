/**
 * ノート全体の解析。
 *
 * 見出しごとのセクション範囲、段落の範囲、本文の終端（「# 完」など）を求め、
 * それぞれの文字数を数える。行番号はすべて0始まり。
 */

import { countCharacters, type CountOptions } from "./counter";
import { FenceTracker, frontmatterEndLine, parseHeadingLine } from "./markdown";

export interface SectionInfo {
	level: number;
	title: string;
	/** 見出しの行 */
	headingLine: number;
	/** 本文の開始行 */
	contentStartLine: number;
	/** 本文の終了行（この行は含まない） */
	contentEndLine: number;
	/**
	 * 本文の最後の、空行でない行。本文が空（見出しだけ）なら -1。
	 * セクション末尾に文字数を表示するかどうかの判定に使う。
	 */
	contentLastLine: number;
	charCount: number;
}

export interface ParagraphInfo {
	startLine: number;
	/** 段落の最終行（この行を含む） */
	endLine: number;
	charCount: number;
}

export interface DocumentAnalysis {
	/** 本文全体の文字数 */
	totalCount: number;
	/** 本文の終了行（この行は含まない）。「# 完」があればその行。 */
	bodyEndLine: number;
	/**
	 * 本文の終わりを示す「完」の見出しの行。無ければ -1。
	 * この行末に、そこまでの総文字数を表示する。
	 */
	completionLine: number;
	sections: SectionInfo[];
	paragraphs: ParagraphInfo[];
}

export interface AnalyzeOptions {
	count: CountOptions;
	stopAtCompletionHeading: boolean;
	completionKeywords: string[];
	includeSubheadingsInParent: boolean;
	/** 段落の解析は表示する場合のみ行う（長文での無駄を避けるため） */
	countParagraphs: boolean;
}

interface RawHeading {
	level: number;
	title: string;
	line: number;
}

/** 段落の区切りとして扱う行（見出し・水平線・テーブル区切りなど）。 */
const BLOCK_BOUNDARY_RE = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;

export function analyzeDocument(
	text: string,
	options: AnalyzeOptions
): DocumentAnalysis {
	const lines = text.split("\n");
	const fmEnd = frontmatterEndLine(lines);
	const bodyStartLine = fmEnd >= 0 ? fmEnd + 1 : 0;

	const headings = collectHeadings(lines, bodyStartLine);
	const completion = findCompletionHeading(headings, options);
	const completionLine = completion ? completion.line : -1;
	const bodyEndLine = completion ? completion.line : lines.length;

	// セクション内の文字数を数えるときは frontmatter 判定を無効にする
	// （本文が --- で始まるだけの行を frontmatter と誤認しないため）
	const partOptions: CountOptions = {
		...options.count,
		excludeFrontmatter: false,
	};

	const countLines = (from: number, to: number): number => {
		if (to <= from) return 0;
		return countCharacters(lines.slice(from, to).join("\n"), partOptions);
	};

	const totalCount = countCharacters(
		lines.slice(0, bodyEndLine).join("\n"),
		options.count
	);

	const sections: SectionInfo[] = [];
	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		if (heading.line >= bodyEndLine) break;

		const contentStartLine = heading.line + 1;
		let contentEndLine = bodyEndLine;
		for (let j = i + 1; j < headings.length; j++) {
			const next = headings[j];
			const isBoundary = options.includeSubheadingsInParent
				? next.level <= heading.level
				: true;
			if (isBoundary) {
				contentEndLine = Math.min(next.line, bodyEndLine);
				break;
			}
		}
		if (contentEndLine < contentStartLine) contentEndLine = contentStartLine;

		sections.push({
			level: heading.level,
			title: heading.title,
			headingLine: heading.line,
			contentStartLine,
			contentEndLine,
			contentLastLine: findLastContentLine(
				lines,
				contentStartLine,
				contentEndLine
			),
			charCount: countLines(contentStartLine, contentEndLine),
		});
	}

	const paragraphs = options.countParagraphs
		? collectParagraphs(lines, bodyStartLine, bodyEndLine, countLines)
		: [];

	return { totalCount, bodyEndLine, completionLine, sections, paragraphs };
}

/** frontmatterとコードブロックを除いた範囲から見出しを集める。 */
function collectHeadings(lines: string[], bodyStartLine: number): RawHeading[] {
	const headings: RawHeading[] = [];
	const fence = new FenceTracker();
	for (let i = bodyStartLine; i < lines.length; i++) {
		const line = lines[i];
		if (fence.feed(line) || fence.inside) continue;
		const heading = parseHeadingLine(line);
		if (heading && heading.text.length > 0) {
			headings.push({ level: heading.level, title: heading.text, line: i });
		}
	}
	return headings;
}

/** 範囲内の最後の、空行でない行を返す。無ければ -1。 */
function findLastContentLine(
	lines: string[],
	from: number,
	toExclusive: number
): number {
	for (let i = Math.min(toExclusive, lines.length) - 1; i >= from; i--) {
		if (lines[i].trim().length > 0) return i;
	}
	return -1;
}

/**
 * 本文の終端となる見出しを探す。
 * 「# 完」「# 了」のような見出しがあれば、その直前までを本文とする。
 * 見出しでない行の「完」は対象にしない。
 * 「完」も「了」も、先に現れたほうの1つだけが終端になる。
 */
function findCompletionHeading(
	headings: RawHeading[],
	options: AnalyzeOptions
): RawHeading | null {
	if (!options.stopAtCompletionHeading) return null;
	const keywords = options.completionKeywords;
	if (keywords.length === 0) return null;
	for (const heading of headings) {
		if (keywords.includes(heading.title)) return heading;
	}
	return null;
}

/** 空行で区切られた本文ブロックを集める。 */
function collectParagraphs(
	lines: string[],
	bodyStartLine: number,
	bodyEndLine: number,
	countLines: (from: number, to: number) => number
): ParagraphInfo[] {
	const paragraphs: ParagraphInfo[] = [];
	const fence = new FenceTracker();
	let start = -1;

	const flush = (endExclusive: number) => {
		if (start < 0) return;
		const charCount = countLines(start, endExclusive);
		if (charCount > 0) {
			paragraphs.push({ startLine: start, endLine: endExclusive - 1, charCount });
		}
		start = -1;
	};

	for (let i = bodyStartLine; i < bodyEndLine; i++) {
		const line = lines[i];
		const isFenceLine = fence.feed(line);
		if (isFenceLine || fence.inside) {
			// コードブロックは段落として扱わない
			flush(i);
			continue;
		}
		const isBlank = line.trim().length === 0;
		const isHeading = parseHeadingLine(line) !== null;
		const isBoundary = isBlank || isHeading || BLOCK_BOUNDARY_RE.test(line);
		if (isBoundary) {
			flush(i);
			continue;
		}
		if (start < 0) start = i;
	}
	flush(bodyEndLine);

	return paragraphs;
}
