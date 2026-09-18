/**
 * エディタ上への文字数表示（CodeMirror 6 の Decoration）。
 *
 * Markdownファイルそのものは書き換えず、見出し行・段落末尾の行末に
 * ウィジェットを挿入する形で表示する。
 */

import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type PluginValue,
	type ViewUpdate,
} from "@codemirror/view";

import { formatCount } from "./format";
import { analyzeDocument, type DocumentAnalysis } from "./sections";
import type { AnalyzeOptions } from "./sections";
import type { JapaneseCharacterCountSettings } from "./settings";

/** 設定変更などで、表示を作り直させるための合図。 */
export const refreshCountsEffect = StateEffect.define<null>();

export interface CountDecorationHost {
	getSettings(): JapaneseCharacterCountSettings;
	getAnalyzeOptions(countParagraphs: boolean): AnalyzeOptions;
}

class CountWidget extends WidgetType {
	constructor(
		private readonly label: string,
		private readonly extraClass: string
	) {
		super();
	}

	eq(other: CountWidget): boolean {
		return other.label === this.label && other.extraClass === this.extraClass;
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = `jcc-count ${this.extraClass}`;
		el.textContent = this.label;
		el.setAttribute("aria-hidden", "true");
		return el;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

export function createCountDecorationExtension(
	host: CountDecorationHost
): Extension {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet = Decoration.none;

			private analysis: DocumentAnalysis | null = null;
			private timer: number | null = null;

			constructor(private readonly view: EditorView) {
				this.recompute();
			}

			update(update: ViewUpdate): void {
				const refreshRequested = update.transactions.some((tr) =>
					tr.effects.some((effect) => effect.is(refreshCountsEffect))
				);

				if (refreshRequested) {
					this.recompute();
					return;
				}

				if (update.docChanged) {
					// 再計算までの間は、既存の表示を新しい位置へずらしておく
					this.decorations = this.decorations.map(update.changes);
					this.schedule();
					return;
				}

				if (update.viewportChanged) {
					this.decorations = this.buildDecorations();
				}
			}

			destroy(): void {
				this.clearTimer();
			}

			private schedule(): void {
				this.clearTimer();
				const delay = host.getSettings().updateDelayMs;
				this.timer = window.setTimeout(() => {
					this.timer = null;
					// 再計算そのものは update() 側で行う（描画の更新を確実にするため）
					this.view.dispatch({ effects: refreshCountsEffect.of(null) });
				}, Math.max(0, delay));
			}

			private clearTimer(): void {
				if (this.timer !== null) {
					window.clearTimeout(this.timer);
					this.timer = null;
				}
			}

			private recompute(): void {
				const settings = host.getSettings();
				if (
					!settings.showHeadingCounts &&
					!settings.showSectionEndCounts &&
					!settings.showParagraphCounts &&
					!settings.showCompletionTotal
				) {
					this.analysis = null;
					this.decorations = Decoration.none;
					return;
				}
				const options = host.getAnalyzeOptions(settings.showParagraphCounts);
				this.analysis = analyzeDocument(this.view.state.doc.toString(), options);
				this.decorations = this.buildDecorations();
			}

			private buildDecorations(): DecorationSet {
				const analysis = this.analysis;
				if (!analysis) return Decoration.none;

				const settings = host.getSettings();
				const doc = this.view.state.doc;
				const visible = this.view.visibleRanges;
				const isVisible = (pos: number): boolean =>
					visible.some((range) => pos >= range.from && pos <= range.to);

				// side は同じ位置に並んだときの順序。行への装飾が先、行末の表示が後。
				// （空行では行頭と行末が同じ位置になるため、明示しておく必要がある）
				const items: { pos: number; side: number; decoration: Decoration }[] =
					[];

				const push = (
					line: number,
					count: number,
					cls: string,
					prefix = ""
				) => {
					if (line < 0 || line >= doc.lines) return;
					const pos = doc.line(line + 1).to;
					if (!isVisible(pos)) return;
					items.push({
						pos,
						side: 1,
						decoration: Decoration.widget({
							widget: new CountWidget(
								prefix + formatCount(count, settings.approximateCounts),
								cls
							),
							side: 1,
						}),
					});
				};

				/**
				 * 行の右端に寄せて表示する。
				 * 実際の位置決めはCSS（.jcc-count-right-aligned）が行うので、
				 * ここでは行そのものに位置の基準となるクラスを付ける。
				 */
				const pushRightAligned = (
					line: number,
					count: number,
					cls: string,
					prefix = ""
				) => {
					if (line < 0 || line >= doc.lines) return;
					const { from, to } = doc.line(line + 1);
					if (!isVisible(to)) return;
					items.push({
						pos: from,
						side: -1,
						decoration: Decoration.line({ class: "jcc-count-line" }),
					});
					push(line, count, `${cls} jcc-count-right-aligned`, prefix);
				};

				if (settings.showHeadingCounts) {
					for (const section of analysis.sections) {
						push(section.headingLine, section.charCount, "jcc-heading-count");
					}
				}
				if (settings.showSectionEndCounts) {
					for (const section of analysis.sections) {
						if (section.contentLastLine < 0) continue;
						// 見出しのすぐ次の行にしか本文がないなら、同じ数字が2行続くだけなので出さない
						if (
							settings.showHeadingCounts &&
							section.contentLastLine <= section.headingLine + 1
						) {
							continue;
						}
						// 本文の最終行ではなく、セクションの一番下の行（多くは次の
						// 見出しの手前の空行）に出す。本文と横に並ばないので、
						// 書いている文字と重ならない。
						pushRightAligned(
							section.contentEndLine - 1,
							section.charCount,
							"jcc-section-end-count"
						);
					}
				}
				if (settings.showParagraphCounts) {
					for (const paragraph of analysis.paragraphs) {
						push(paragraph.endLine, paragraph.charCount, "jcc-paragraph-count");
					}
				}
				// 「完」の行には、そこまでの本文すべての総文字数を出す。
				// 応募規定の字数を確かめるとき、この1か所を見れば済むように。
				if (settings.showCompletionTotal && analysis.completionLine >= 0) {
					pushRightAligned(
						analysis.completionLine,
						analysis.totalCount,
						"jcc-total-count",
						"総計 "
					);
				}

				items.sort((a, b) => a.pos - b.pos || a.side - b.side);
				const builder = new RangeSetBuilder<Decoration>();
				for (const item of items) builder.add(item.pos, item.pos, item.decoration);
				return builder.finish();
			}
		},
		{
			decorations: (plugin) => plugin.decorations,
		}
	);
}
