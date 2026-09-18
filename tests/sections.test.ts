import { describe, expect, it } from "vitest";

import { DEFAULT_COUNT_OPTIONS, type CountOptions } from "../src/counter";
import { analyzeDocument, type AnalyzeOptions } from "../src/sections";

function analyzeOptions(
	overrides: Partial<AnalyzeOptions> = {},
	countOverrides: Partial<CountOptions> = {}
): AnalyzeOptions {
	return {
		count: { ...DEFAULT_COUNT_OPTIONS, ...countOverrides },
		stopAtCompletionHeading: true,
		completionKeywords: ["完", "了"],
		includeSubheadingsInParent: false,
		countParagraphs: true,
		...overrides,
	};
}

describe("見出し単位の文字数", () => {
	const note = ["## 見出し", "", "本文その1。", "", "本文その2。"].join("\n");

	it("ノート全体の文字数（見出しの文字も含む）", () => {
		// 見出し(3) + 本文その1。(6) + 本文その2。(6)
		expect(analyzeDocument(note, analyzeOptions()).totalCount).toBe(15);
	});

	it("セクションの文字数は見出し自身を含まない", () => {
		const result = analyzeDocument(note, analyzeOptions());
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0].title).toBe("見出し");
		expect(result.sections[0].level).toBe(2);
		expect(result.sections[0].headingLine).toBe(0);
		expect(result.sections[0].charCount).toBe(12);
	});

	it("セクションは次の見出しの直前までを範囲とする", () => {
		const doc = [
			"# 親", // 0
			"", // 1
			"親の本文。", // 2
			"", // 3
			"## 子", // 4
			"", // 5
			"子の本文。", // 6
		].join("\n");
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.sections.map((s) => s.charCount)).toEqual([5, 5]);
		expect(result.sections[0].contentEndLine).toBe(4);
	});

	it("親見出しに子見出しを含める設定にできる", () => {
		const doc = ["# 親", "", "親の本文。", "", "## 子", "", "子の本文。"].join(
			"\n"
		);
		const result = analyzeDocument(
			doc,
			analyzeOptions({ includeSubheadingsInParent: true })
		);
		// 親: 親の本文。(5) + 子(1) + 子の本文。(5)
		expect(result.sections[0].charCount).toBe(11);
		expect(result.sections[1].charCount).toBe(5);
	});

	it("コードブロック内の # は見出しとみなさない", () => {
		const doc = ["# 見出し", "", "```", "# コメント", "```", "", "本文。"].join(
			"\n"
		);
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0].title).toBe("見出し");
	});

	it("frontmatter内の行は見出しとみなさない", () => {
		const doc = ["---", "title: # テスト", "---", "", "# 見出し", "", "本文。"].join(
			"\n"
		);
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0].headingLine).toBe(4);
	});
});

describe("セクション末尾の行（末尾にも文字数を表示するための位置）", () => {
	it("末尾の空行ではなく、最後に書かれた行を指す", () => {
		const doc = [
			"# 第一章", // 0
			"", // 1
			"本文その1。", // 2
			"", // 3
			"本文その2。", // 4
			"", // 5
			"", // 6
			"# 第二章", // 7
			"", // 8
			"本文その3。", // 9
		].join("\n");
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.sections.map((s) => s.contentLastLine)).toEqual([4, 9]);
	});

	it("本文が空のセクションは -1", () => {
		const doc = ["# 見出しだけ", "", "", "# 次の見出し", "", "本文。"].join("\n");
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.sections[0].contentLastLine).toBe(-1);
	});

	it("「完」で打ち切られた場合、その手前までを範囲とする", () => {
		const doc = ["# 第一章", "", "本文。", "", "# 完", "", "あとがき。"].join("\n");
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.sections).toHaveLength(1);
		expect(result.sections[0].contentLastLine).toBe(2);
	});
});

describe("「完」「了」による本文の打ち切り", () => {
	const doc = ["本文A。", "", "# 完", "", "あとがき"].join("\n");

	it("見出しの「完」より前までを本文として数える", () => {
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.totalCount).toBe(4);
		expect(result.bodyEndLine).toBe(2);
		expect(result.sections).toHaveLength(0);
	});

	it("「完」の見出しの行を、総文字数を出す位置として返す", () => {
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.completionLine).toBe(2);
	});

	it("「完」が無ければ completionLine は -1", () => {
		const result = analyzeDocument("本文A。", analyzeOptions());
		expect(result.completionLine).toBe(-1);
		expect(result.totalCount).toBe(4);
	});

	it("「完」と「了」が両方あっても、先に現れたほうだけを終端にする", () => {
		const both = ["本文A。", "", "# 完", "", "本文B。", "", "# 了"].join("\n");
		const result = analyzeDocument(both, analyzeOptions());
		expect(result.completionLine).toBe(2);
		expect(result.totalCount).toBe(4);
	});

	it("階層に関係なく打ち切る", () => {
		const deep = ["本文A。", "", "### 了", "", "あとがき"].join("\n");
		expect(analyzeDocument(deep, analyzeOptions()).totalCount).toBe(4);
	});

	it("見出しでない「完」は無視する", () => {
		const plain = ["完", "", "本文。"].join("\n");
		// 完(1) + 本文。(3)
		expect(analyzeDocument(plain, analyzeOptions()).totalCount).toBe(4);
	});

	it("「完結」のように部分一致するだけの見出しでは打ち切らない", () => {
		const partial = ["本文A。", "", "# 完結編", "", "あとがき"].join("\n");
		// 本文A。(4) + 完結編(3) + あとがき(4)
		expect(analyzeDocument(partial, analyzeOptions()).totalCount).toBe(11);
	});

	it("設定でオフにできる", () => {
		const result = analyzeDocument(
			doc,
			analyzeOptions({ stopAtCompletionHeading: false })
		);
		// 本文A。(4) + 完(1) + あとがき(4)
		expect(result.totalCount).toBe(9);
		expect(result.completionLine).toBe(-1);
	});
});

describe("段落単位の文字数", () => {
	it("空行で区切られたブロックごとに数える", () => {
		const doc = [
			"長浜は顕微鏡から目を離した。",
			"",
			"「まだ分からない」",
			"と、彼は言った。",
		].join("\n");
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.paragraphs).toHaveLength(2);
		expect(result.paragraphs[0]).toMatchObject({
			startLine: 0,
			endLine: 0,
			charCount: 14,
		});
		// 「まだ分からない」(9) + と、彼は言った。(8)
		expect(result.paragraphs[1]).toMatchObject({
			startLine: 2,
			endLine: 3,
			charCount: 17,
		});
	});

	it("見出し行は段落に含めない", () => {
		const doc = ["# 見出し", "本文です。"].join("\n");
		const result = analyzeDocument(doc, analyzeOptions());
		expect(result.paragraphs).toHaveLength(1);
		expect(result.paragraphs[0].startLine).toBe(1);
	});

	it("段落を数えない設定では解析しない", () => {
		const doc = "本文です。";
		const result = analyzeDocument(
			doc,
			analyzeOptions({ countParagraphs: false })
		);
		expect(result.paragraphs).toHaveLength(0);
	});
});

describe("長文でも実用的な速度で動く", () => {
	it("約6万字のノートを解析できる", () => {
		const block = [
			"## 章タイトル",
			"",
			"　長浜は顕微鏡から目を離した。**そこ**には、何も映っていなかった。",
			"",
			"「どういうことだ」と、彼は言った。",
			"",
		].join("\n");
		const doc = block.repeat(600);

		const start = performance.now();
		const result = analyzeDocument(doc, analyzeOptions());
		const elapsed = performance.now() - start;

		expect(result.sections).toHaveLength(600);
		expect(result.totalCount).toBeGreaterThan(30000);
		expect(elapsed).toBeLessThan(3000);
	});
});
