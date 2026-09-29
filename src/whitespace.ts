/**
 * 空白と改行の可視化（CodeMirror 6 の Decoration）。
 *
 * 全角スペース・半角スペースは、その文字を span で包んで CSS で印を描く。
 * 改行は行末に幅ゼロのウィジェットを置き、CSS で矢印を描く。
 * どれも Markdown ファイルそのものは書き換えない。
 */

import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type PluginValue,
	type Rect,
	type ViewUpdate,
} from "@codemirror/view";

import { refreshCountsEffect } from "./decorations";
import type { JapaneseCharacterCountSettings } from "./settings";

export interface WhitespaceDecorationHost {
	getSettings(): JapaneseCharacterCountSettings;
}

export type WhitespaceKind = "half" | "full";

export interface WhitespaceRange {
	from: number;
	to: number;
	kind: WhitespaceKind;
}

/** 半角スペース（U+0020）と全角スペース（U+3000）。1文字ずつ拾う。 */
const SPACE_PATTERN = /[ \u3000]/g;

/**
 * テキスト中の空白の位置を、ドキュメント上のオフセットで返す。
 * `from` はテキストの先頭がドキュメントのどこに当たるか。
 */
export function collectWhitespaceRanges(
	text: string,
	from = 0
): WhitespaceRange[] {
	const ranges: WhitespaceRange[] = [];
	SPACE_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = SPACE_PATTERN.exec(text)) !== null) {
		const start = from + match.index;
		ranges.push({
			from: start,
			to: start + 1,
			kind: match[0] === " " ? "half" : "full",
		});
	}
	return ranges;
}

const halfWidthMark = Decoration.mark({ class: "jcc-ws jcc-ws-half" });
const fullWidthMark = Decoration.mark({ class: "jcc-ws jcc-ws-full" });

/** 座標計算に必要な最小限の矩形。DOMRect も CodeMirror の Rect もこれを満たす。 */
export interface RectLike {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * 改行の印の座標として CodeMirror に返す矩形を作る。
 *
 * 印の要素は幅も高さもゼロ（styles.css の .jcc-ws-newline）なので、そのまま返すと
 * CodeMirror には「ベースライン上の点」として見える。新しめの CodeMirror
 * （Obsidian 1.13 以降が同梱）はカーソルの上下移動で「移動先の行頭の座標が探索点より
 * 上（下）にあるか」を確かめるため、空行の印がベースラインの点だと「探索点より下」と
 * 判定され、空行が飛ばされて本文のある行まで一気に移動してしまう。
 *
 * そこで、同じ段の高さを持つ矩形（row）を借りて、行の縦幅を持つ矩形にして返す。
 * 横位置は印そのものの左端（幅ゼロ）。row が無いときは印の矩形をそのまま使う。
 */
export function newlineMarkRect(own: RectLike, row: RectLike | null): Rect {
	return {
		left: own.left,
		right: own.left,
		top: row ? Math.min(own.top, row.top) : own.top,
		bottom: row ? Math.max(own.bottom, row.bottom) : own.bottom,
	};
}

/**
 * 印と同じ段（折り返し後の同じ行）の高さを持つ矩形を探す。
 *
 * CodeMirror は行末の要素が編集不可のとき、その後ろに <br> を足す。この <br> は
 * 印と同じ段にあり、getClientRects() で本文の高さを持つ矩形を返すので、それを使う。
 * <br> が見つからなければ、行（.cm-line）全体の矩形で代用する。折り返しがある行では
 * 上端が本来より高くなるが、上下移動の判定が緩くなる方向なので害はない。
 */
function rowRectAround(dom: HTMLElement): RectLike | null {
	for (let node = dom.nextSibling; node; node = node.nextSibling) {
		if (node.nodeName !== "BR") continue;
		const rect = (node as Element).getClientRects()[0];
		if (rect && rect.bottom > rect.top) return rect;
		break;
	}
	const line = dom.parentElement;
	if (!line) return null;
	const rect = line.getBoundingClientRect();
	return rect.bottom > rect.top ? rect : null;
}

class NewlineWidget extends WidgetType {
	eq(): boolean {
		return true;
	}

	toDOM(): HTMLElement {
		// 矢印は CSS（::before / ::after）で描く。形や大きさは --jcc-ws-newline-* で調整できる。
		const el = createSpan({ cls: "jcc-ws jcc-ws-newline" });
		el.setAttribute("aria-hidden", "true");
		return el;
	}

	coordsAt(dom: HTMLElement): Rect | null {
		// 要素の高さがゼロなので、行の高さを持つ矩形に直して返す（newlineMarkRect を参照）
		return newlineMarkRect(dom.getBoundingClientRect(), rowRectAround(dom));
	}

	ignoreEvent(): boolean {
		return true;
	}
}

const newlineWidget = Decoration.widget({
	widget: new NewlineWidget(),
	// 行末の位置で、入力した文字は印の手前に入る
	side: 1,
});

export function createWhitespaceDecorationExtension(
	host: WhitespaceDecorationHost
): Extension {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet;

			constructor(private readonly view: EditorView) {
				this.decorations = this.build();
			}

			update(update: ViewUpdate): void {
				const refreshRequested = update.transactions.some((tr) =>
					tr.effects.some((effect) => effect.is(refreshCountsEffect))
				);
				if (refreshRequested || update.docChanged || update.viewportChanged) {
					this.decorations = this.build();
				}
			}

			private build(): DecorationSet {
				const settings = host.getSettings();
				const showFull = settings.showFullWidthSpaceMarks;
				const showHalf = settings.showHalfWidthSpaceMarks;
				const showNewline = settings.showNewlineMarks;
				if (!showFull && !showHalf && !showNewline) return Decoration.none;

				const doc = this.view.state.doc;
				const builder = new RangeSetBuilder<Decoration>();

				// 画面に見えている範囲だけを対象にする（長文でも重くならないように）。
				// 隣り合う範囲が同じ行を共有することがあるので、処理済みの行は飛ばす。
				let doneLine = 0;
				for (const { from, to } of this.view.visibleRanges) {
					const firstLine = Math.max(doc.lineAt(from).number, doneLine + 1);
					const lastLine = doc.lineAt(to).number;
					for (let n = firstLine; n <= lastLine; n++) {
						doneLine = n;
						const line = doc.line(n);
						if (showFull || showHalf) {
							for (const range of collectWhitespaceRanges(line.text, line.from)) {
								if (range.kind === "half" && !showHalf) continue;
								if (range.kind === "full" && !showFull) continue;
								builder.add(
									range.from,
									range.to,
									range.kind === "half" ? halfWidthMark : fullWidthMark
								);
							}
						}
						// 最終行の後ろには改行が無いので、印も付けない
						if (showNewline && n < doc.lines) {
							builder.add(line.to, line.to, newlineWidget);
						}
					}
				}
				return builder.finish();
			}
		},
		{
			decorations: (plugin) => plugin.decorations,
		}
	);
}
