import { MarkdownView, Notice, Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";

import { countCharacters } from "./counter";
import {
	createCountDecorationExtension,
	refreshCountsEffect,
} from "./decorations";
import { formatCount } from "./format";
import { analyzeDocument, type AnalyzeOptions } from "./sections";
import { createWhitespaceDecorationExtension } from "./whitespace";
import {
	DEFAULT_SETTINGS,
	JapaneseCharacterCountSettingTab,
	parseCompletionKeywords,
	toCountOptions,
	type JapaneseCharacterCountSettings,
} from "./settings";

/** obsidian の Editor から CodeMirror の EditorView を取り出すための型。 */
interface EditorWithCm {
	cm?: EditorView;
}

export default class JapaneseCharacterCountPlugin extends Plugin {
	settings: JapaneseCharacterCountSettings = { ...DEFAULT_SETTINGS };

	private statusBarEl: HTMLElement | null = null;
	private statusBarTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new JapaneseCharacterCountSettingTab(this.app, this));

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("jcc-status-bar");

		this.registerEditorExtension([
			// 空白の可視化を先に登録し、行末では「↵」→ 文字数の順に並ぶようにする
			createWhitespaceDecorationExtension({
				getSettings: () => this.settings,
			}),
			createCountDecorationExtension({
				getSettings: () => this.settings,
				getAnalyzeOptions: (countParagraphs) =>
					this.getAnalyzeOptions(countParagraphs),
			}),
			EditorView.updateListener.of((update) => {
				if (update.docChanged || update.selectionSet) {
					this.scheduleStatusBarUpdate();
				}
			}),
		]);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.updateStatusBar())
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.updateStatusBar())
		);

		this.addCommand({
			id: "show-count-details",
			name: "文字数の内訳を表示",
			callback: () => this.showCountDetails(),
		});

		this.addCommand({
			id: "toggle-paragraph-counts",
			name: "段落ごとの文字数表示を切り替え",
			callback: async () => {
				this.settings.showParagraphCounts = !this.settings.showParagraphCounts;
				await this.saveSettings();
				new Notice(
					this.settings.showParagraphCounts
						? "段落ごとの文字数を表示します"
						: "段落ごとの文字数を非表示にしました"
				);
			},
		});

		this.app.workspace.onLayoutReady(() => this.updateStatusBar());
	}

	onunload(): void {
		this.clearStatusBarTimer();
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
		// 旧設定「空白と改行を表示」（1つのトグル）は、3つのトグルに引き継ぐ
		if (data.showWhitespace === true) {
			data.showFullWidthSpaceMarks ??= true;
			data.showHalfWidthSpaceMarks ??= true;
			data.showNewlineMarks ??= true;
		}
		delete data.showWhitespace;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshEditors();
		this.updateStatusBar();
	}

	getAnalyzeOptions(countParagraphs: boolean): AnalyzeOptions {
		return {
			count: toCountOptions(this.settings),
			stopAtCompletionHeading: this.settings.stopAtCompletionHeading,
			completionKeywords: parseCompletionKeywords(
				this.settings.completionKeywords
			),
			includeSubheadingsInParent: this.settings.includeSubheadingsInParent,
			countParagraphs,
		};
	}

	/** 開いているすべてのエディタに、表示の作り直しを指示する。 */
	private refreshEditors(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			const cm = (view.editor as unknown as EditorWithCm).cm;
			if (!cm) return;
			cm.dispatch({ effects: refreshCountsEffect.of(null) });
		});
	}

	private scheduleStatusBarUpdate(): void {
		this.clearStatusBarTimer();
		this.statusBarTimer = window.setTimeout(() => {
			this.statusBarTimer = null;
			this.updateStatusBar();
		}, Math.max(0, this.settings.updateDelayMs));
	}

	private clearStatusBarTimer(): void {
		if (this.statusBarTimer !== null) {
			window.clearTimeout(this.statusBarTimer);
			this.statusBarTimer = null;
		}
	}

	private updateStatusBar(): void {
		const el = this.statusBarEl;
		if (!el) return;

		if (!this.settings.showStatusBar) {
			el.setText("");
			el.hide();
			return;
		}
		el.show();

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			el.setText("");
			return;
		}

		const editor = view.editor;
		const analysis = analyzeDocument(
			editor.getValue(),
			this.getAnalyzeOptions(false)
		);
		const approximate = this.settings.approximateCounts;
		const parts = [`本文 ${formatCount(analysis.totalCount, approximate)}`];

		const selection = editor.getSelection();
		if (selection.length > 0) {
			const selectionCount = countCharacters(
				selection,
				toCountOptions(this.settings)
			);
			parts.push(`選択 ${formatCount(selectionCount, approximate)}`);
		}

		el.setText(parts.join(" ｜ "));
	}

	private showCountDetails(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("Markdownノートを開いてください");
			return;
		}
		const analysis = analyzeDocument(
			view.editor.getValue(),
			this.getAnalyzeOptions(true)
		);
		const lines = [
			`本文 ${formatCount(analysis.totalCount, this.settings.approximateCounts)}`,
			`見出し ${analysis.sections.length}個`,
			`段落 ${analysis.paragraphs.length}個`,
		];
		new Notice(lines.join("\n"));
	}
}
