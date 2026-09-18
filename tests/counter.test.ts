import { describe, expect, it } from "vitest";

import {
	DEFAULT_COUNT_OPTIONS,
	countCharacters,
	countCodePoints,
	countGraphemes,
	toCountableText,
	type CountOptions,
} from "../src/counter";

/** Manuscript Mode（既定設定）を基準に、必要な項目だけ差し替える。 */
function options(overrides: Partial<CountOptions> = {}): CountOptions {
	return { ...DEFAULT_COUNT_OPTIONS, ...overrides };
}

function count(text: string, overrides: Partial<CountOptions> = {}): number {
	return countCharacters(text, options(overrides));
}

describe("Manuscript Mode：基本の日本語", () => {
	it("句読点を含む一文を数える", () => {
		// 私 は 今 日 、 学 校 に 行 っ た 。
		expect(count("私は今日、学校に行った。")).toBe(12);
	});

	it("鉤括弧も1文字として数える", () => {
		// 「 お は よ う 」 と 、 彼 は 言 っ た 。
		expect(count("「おはよう」と、彼は言った。")).toBe(14);
	});

	it("英数字は1文字ずつ数える", () => {
		expect(count("ABC123")).toBe(6);
	});

	it("改行は数えない", () => {
		expect(count("あい\nうえ\nお")).toBe(5);
	});

	it("改行を数える設定にもできる", () => {
		expect(count("あい\nうえ\nお", { excludeNewlines: false })).toBe(7);
	});
});

describe("Manuscript Mode：スペースの扱い", () => {
	it("半角スペースは既定では数えない", () => {
		expect(count("あ い う")).toBe(3);
	});

	it("半角スペースを数える設定にできる", () => {
		expect(count("あ い う", { excludeHalfWidthSpace: false })).toBe(5);
	});

	it("全角スペースは既定では数える（字下げを本文として扱う）", () => {
		expect(count("　あいう")).toBe(4);
	});

	it("全角スペースを除外する設定にできる", () => {
		expect(count("　あいう", { excludeFullWidthSpace: true })).toBe(3);
	});
});

describe("Manuscript Mode：Markdown記号", () => {
	it("強調記号は数えない", () => {
		expect(count("**重要**")).toBe(2);
		expect(count("**重要**な文章")).toBe(5);
		expect(count("*強調*")).toBe(2);
		expect(count("***強い強調***")).toBe(4);
		expect(count("~~取り消し~~")).toBe(4);
		expect(count("==強調表示==")).toBe(4);
	});

	it("見出し記号は数えず、見出しの文字は数える", () => {
		expect(count("## 病理室")).toBe(3);
		expect(count("### 見出し ###")).toBe(3);
	});

	it("引用・リストのマーカーは数えない", () => {
		expect(count("> 引用文です")).toBe(5);
		expect(count("- 項目一\n- 項目二")).toBe(6);
		expect(count("1. 項目一")).toBe(3);
		expect(count("- [ ] やること")).toBe(4);
	});

	it("リンクは表示名だけを数える", () => {
		expect(count("[Obsidian](https://obsidian.md)")).toBe(8);
		expect(count("[[ページ名|表示名]]")).toBe(3);
		expect(count("[[ページ名]]")).toBe(4);
	});

	it("埋め込みは数えない", () => {
		expect(count("![[画像.png]]")).toBe(0);
		expect(count("![説明](image.png)")).toBe(0);
	});

	it("コメントは数えない", () => {
		expect(count("本文%%コメント%%です")).toBe(4);
		expect(count("本文<!-- メモ -->です")).toBe(4);
	});

	it("脚注の参照記号は数えず、脚注の本文は数える", () => {
		expect(count("本文[^1]です")).toBe(4);
		expect(count("[^1]: 注釈です")).toBe(4);
	});

	it("エスケープした記号は1文字として数える", () => {
		// エスケープを解いた「*星*」の3文字
		expect(count("\\*星\\*")).toBe(3);
	});

	it("インラインコードは中身だけを数える", () => {
		expect(count("`code`")).toBe(4);
	});

	it("HTMLタグは数えない", () => {
		expect(count("本文<br>続き")).toBe(4);
	});

	it("Calloutのラベルは数えず、本文は数える", () => {
		expect(count("> [!note] 補足")).toBe(2);
		expect(count("> [!warning]+ 注意\n> 本文です。")).toBe(7);
	});

	it("表は記号を除いてセルの中身だけを数える", () => {
		const table = ["| 名前 | 年齢 |", "| --- | --- |", "| 長浜 | 42 |"].join(
			"\n"
		);
		// 名前(2) + 年齢(2) + 長浜(2) + 42(2)
		expect(count(table)).toBe(8);
	});

	it("コードブロックは中身を数え、``` の行は数えない", () => {
		const doc = ["```js", "const a = 1;", "```"].join("\n");
		// consta=1; （半角スペースは既定で除外）
		expect(count(doc)).toBe(9);
	});

	it("水平線は数えない", () => {
		expect(count("あ\n\n---\n\nい")).toBe(2);
	});

	it("Markdown記号を除外しない設定にもできる", () => {
		expect(count("**重要**", { excludeMarkdownSyntax: false })).toBe(6);
	});
});

describe("Manuscript Mode：ルビ", () => {
	it("既定ではルビの読みを数えず、親文字だけを数える", () => {
		expect(count("|時任《ときとう》")).toBe(2);
		expect(count("時任《ときとう》先生")).toBe(4);
	});

	it("傍点は親文字だけを数える", () => {
		expect(count("《《通訳》》")).toBe(2);
	});

	it("ルビを数える設定にもできる", () => {
		expect(count("|時任《ときとう》", { excludeRubyReading: false })).toBe(9);
	});

	it("表のパイプ記号をルビと誤認しない", () => {
		const table = ["| 名前 | 年齢 |", "| --- | --- |", "| 長浜 | 42 |"].join("\n");
		expect(count(table)).toBe(8);
	});
});

describe("Manuscript Mode：YAML frontmatter", () => {
	const note = [
		"---",
		"title: テスト",
		"tags:",
		"  - 小説",
		"---",
		"",
		"本文です。",
	].join("\n");

	it("frontmatterは数えない", () => {
		expect(count(note)).toBe(5);
	});

	it("frontmatterを数える設定にもできる", () => {
		// title:テスト(9) + tags:(5) + 小説(2) + 本文です。(5)
		// 区切りの --- は水平線として、リストの - は記号として除外される
		expect(count(note, { excludeFrontmatter: false })).toBe(21);
	});

	it("本文中の --- はfrontmatterとみなさない", () => {
		expect(count("本文\n\n---\n\n続き")).toBe(4);
	});
});

describe("Raw Text Mode", () => {
	it("Markdown記号もそのまま数える", () => {
		expect(count("**重要**", { mode: "raw" })).toBe(6);
	});

	it("改行・スペースの扱いは設定に従う", () => {
		expect(
			count("あ い\nう", {
				mode: "raw",
				excludeNewlines: false,
				excludeHalfWidthSpace: false,
			})
		).toBe(5);
		expect(count("あ い\nう", { mode: "raw" })).toBe(3);
	});
});

describe("VSCode Compatible Mode", () => {
	it("Markdown記号もそのまま数える", () => {
		expect(count("**重要**", { mode: "vscode" })).toBe(6);
	});

	it("改行は数えない（VSCodeの選択文字数の表示に合わせる）", () => {
		expect(count("あ\nい", { mode: "vscode" })).toBe(2);
		expect(count("あ\n\nい", { mode: "vscode" })).toBe(2);
	});

	it("半角スペースも全角スペースも数える", () => {
		expect(count("あ い", { mode: "vscode" })).toBe(3);
		expect(count("あ　い", { mode: "vscode" })).toBe(3);
	});

	it("除外設定の影響を受けない", () => {
		expect(
			count("あ\nい う", {
				mode: "vscode",
				excludeNewlines: false,
				excludeHalfWidthSpace: true,
				excludeMarkdownSyntax: true,
			})
		).toBe(4);
	});

	it("CRLFも改行として数えない", () => {
		expect(count("あ\r\nい", { mode: "vscode" })).toBe(2);
	});
});

describe("カクヨムモード", () => {
	it("改行・半角スペース・全角スペースを数えない", () => {
		expect(count("　あい\nう え", { mode: "kakuyomu" })).toBe(4);
	});

	it("|付きのルビは親文字だけを数える", () => {
		expect(count("|時任《ときとう》", { mode: "kakuyomu" })).toBe(2);
		expect(count("｜景子《けいこ》", { mode: "kakuyomu" })).toBe(2);
	});

	it("|のない漢字ルビも親文字だけを数える", () => {
		expect(count("時任《ときとう》先生", { mode: "kakuyomu" })).toBe(4);
	});

	it("傍点は親文字だけを数える", () => {
		expect(count("《《通訳》》", { mode: "kakuyomu" })).toBe(2);
		// 傍点を外すと「それは濃いのだ」の7文字
		expect(count("それは《《濃い》》のだ", { mode: "kakuyomu" })).toBe(7);
	});

	it("ルビにならない《》はそのまま数える", () => {
		// ひらがなの直後は | が無いとルビにならず、そのまま表示される
		expect(count("あれ《これ》", { mode: "kakuyomu" })).toBe(6);
	});

	it("見出し行は数えない（タイトルは本文とは別に入力するため）", () => {
		expect(count("### 第49話「時間を読む女」\n本文です。", { mode: "kakuyomu" })).toBe(5);
	});

	it("Markdown記号はそのまま数える（カクヨムはMarkdownを解釈しない）", () => {
		expect(count("***", { mode: "kakuyomu" })).toBe(3);
		expect(count("**重要**", { mode: "kakuyomu" })).toBe(6);
	});

	it("除外設定の影響を受けない", () => {
		expect(
			count("　あいう", {
				mode: "kakuyomu",
				excludeFullWidthSpace: false,
				excludeMarkdownSyntax: false,
			})
		).toBe(3);
	});

	// 以下は、実際にカクヨムの執筆画面へ貼り付けて表示を確かめた結果に基づく。
	// カクヨムの表示は100字単位の概数（「約4,900字」のような形）。
	it("中身のない《《》》は記法として無効で、記号4文字として数える", () => {
		// 25個貼ると表示がちょうど100字ぶん増えることを実機で確認
		expect(count("《《》》", { mode: "kakuyomu" })).toBe(4);
		expect(count("《《》》".repeat(25), { mode: "kakuyomu" })).toBe(100);
	});

	it("傍点100個は親文字ぶんの200字として数える", () => {
		// 実機の表示は 約4,700字 → 約4,900字（記号込みなら約5,400字のはず）
		expect(count("《《通訳》》".repeat(100), { mode: "kakuyomu" })).toBe(200);
	});

	it("ルビ100個は親文字ぶんの200字として数える", () => {
		// 実機の表示は 約4,700字 → 約4,900字（読み込みなら約5,700字のはず）
		expect(count("|時任《ときとう》".repeat(100), { mode: "kakuyomu" })).toBe(200);
	});
});

describe("Unicode", () => {
	it("サロゲートペアを1文字として数える", () => {
		// 寿司の絵文字は string.length では2
		expect("🍣".length).toBe(2);
		expect(count("🍣")).toBe(1);
	});

	it("結合文字を1文字として数える", () => {
		const decomposed = "が".normalize("NFD"); // か + 濁点
		expect(decomposed.length).toBe(2);
		expect(count(decomposed)).toBe(1);
	});

	it("ZWJで連結した絵文字を1文字として数える", () => {
		const family = "👨‍👩‍👧‍👦";
		expect(countGraphemes(family)).toBe(1);
		expect(countCodePoints(family)).toBe(7);
	});

	it("書記素クラスタを使わない設定ではコードポイント単位になる", () => {
		expect(count("👨‍👩‍👧‍👦", { useGraphemeClusters: false })).toBe(7);
	});

	it("異体字セレクタ付きの漢字を1文字として数える", () => {
		expect(count("葛󠄁")).toBe(1);
	});
});

describe("toCountableText", () => {
	it("数える対象の文字列を確認できる", () => {
		expect(toCountableText("**重要**な文章", options())).toBe("重要な文章");
	});
});
