import { describe, expect, it } from "vitest";

import { collectWhitespaceRanges, newlineMarkRect } from "../src/whitespace";

describe("collectWhitespaceRanges", () => {
	it("半角と全角のスペースを1文字ずつ区別して拾う", () => {
		expect(collectWhitespaceRanges("a b　c")).toEqual([
			{ from: 1, to: 2, kind: "half" },
			{ from: 3, to: 4, kind: "full" },
		]);
	});

	it("連続したスペースは1文字ごとに別の範囲になる", () => {
		expect(collectWhitespaceRanges("　　x  ")).toEqual([
			{ from: 0, to: 1, kind: "full" },
			{ from: 1, to: 2, kind: "full" },
			{ from: 3, to: 4, kind: "half" },
			{ from: 4, to: 5, kind: "half" },
		]);
	});

	it("行の先頭オフセットを足した位置で返す", () => {
		expect(collectWhitespaceRanges("　字", 100)).toEqual([
			{ from: 100, to: 101, kind: "full" },
		]);
	});

	it("タブや改行、NBSP は対象にしない", () => {
		expect(collectWhitespaceRanges("a\tb\nc d")).toEqual([]);
	});

	it("空白が無ければ空の配列", () => {
		expect(collectWhitespaceRanges("吾輩は猫である")).toEqual([]);
	});
});

describe("newlineMarkRect", () => {
	// 印の要素は幅も高さもゼロで、ベースライン上の点として測られる
	const own = { left: 100, right: 100, top: 56, bottom: 56 };

	it("同じ段の矩形から行の高さを借り、横位置は印の左端（幅ゼロ）にする", () => {
		const row = { left: 0, right: 500, top: 40, bottom: 60 };
		expect(newlineMarkRect(own, row)).toEqual({
			left: 100,
			right: 100,
			top: 40,
			bottom: 60,
		});
	});

	it("印が段の矩形からはみ出していても、両方を含む縦幅にする", () => {
		const row = { left: 0, right: 500, top: 40, bottom: 50 };
		expect(newlineMarkRect(own, row)).toEqual({
			left: 100,
			right: 100,
			top: 40,
			bottom: 56,
		});
	});

	it("段の矩形が無ければ印の矩形をそのまま使う", () => {
		expect(newlineMarkRect(own, null)).toEqual({
			left: 100,
			right: 100,
			top: 56,
			bottom: 56,
		});
	});
});
