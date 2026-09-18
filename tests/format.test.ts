import { describe, expect, it } from "vitest";

import { formatCount, formatNumber, roundToApproximate } from "../src/format";

describe("通常の表示", () => {
	it("3桁ごとに区切って「字」を付ける", () => {
		expect(formatCount(1284)).toBe("1,284字");
	});

	it("0字もそのまま表示する", () => {
		expect(formatCount(0)).toBe("0字");
	});

	it("formatNumber は単位を付けない", () => {
		expect(formatNumber(12843)).toBe("12,843");
	});
});

describe("概数の表示", () => {
	it("100字単位に四捨五入して「約」を付ける", () => {
		expect(formatCount(2720, true)).toBe("約2,700字");
	});

	it("切り上がる場合", () => {
		expect(formatCount(4888, true)).toBe("約4,900字");
	});

	it("ちょうど100の倍数でも「約」を付ける", () => {
		expect(formatCount(4700, true)).toBe("約4,700字");
	});

	it("端数50は切り上げる", () => {
		expect(formatCount(150, true)).toBe("約200字");
	});

	it("100字未満で丸めると0になる場合は、そのままの数値を表示する", () => {
		expect(formatCount(49, true)).toBe("49字");
		expect(formatCount(0, true)).toBe("0字");
	});

	it("100字未満でも100に丸まるなら概数にする", () => {
		expect(formatCount(50, true)).toBe("約100字");
		expect(formatCount(99, true)).toBe("約100字");
	});

	it("roundToApproximate は100字単位の数値を返す", () => {
		expect(roundToApproximate(2720)).toBe(2700);
		expect(roundToApproximate(2750)).toBe(2800);
		expect(roundToApproximate(49)).toBe(0);
	});
});
