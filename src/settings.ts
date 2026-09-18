/**
 * プラグイン設定の型定義とデフォルト値、および設定タブのUI。
 *
 * カウント処理そのものは counter.ts / markdown.ts / sections.ts が担当し、
 * ここでは「どう数えるか」のパラメータだけを保持する。
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type JapaneseCharacterCountPlugin from "./main";
import type { CountMode, CountOptions } from "./counter";

export interface JapaneseCharacterCountSettings {
	/* 表示 */
	showStatusBar: boolean;
	showHeadingCounts: boolean;
	/** 見出しだけでなく、セクションの末尾にも同じ文字数を表示する */
	showSectionEndCounts: boolean;
	showParagraphCounts: boolean;
	/** 「完」の見出しの行末に、そこまでの本文全体の総文字数を表示する */
	showCompletionTotal: boolean;
	approximateCounts: boolean;

	/* カウント方式 */
	countMode: CountMode;
	excludeMarkdownSyntax: boolean;
	excludeNewlines: boolean;
	excludeHalfWidthSpace: boolean;
	excludeFullWidthSpace: boolean;
	excludeFrontmatter: boolean;
	excludeRubyReading: boolean;
	useGraphemeClusters: boolean;

	/* 本文の範囲 */
	stopAtCompletionHeading: boolean;
	completionKeywords: string;

	/* 見出しの集計範囲 */
	includeSubheadingsInParent: boolean;

	/* 内部 */
	updateDelayMs: number;
}

export const DEFAULT_SETTINGS: JapaneseCharacterCountSettings = {
	showStatusBar: true,
	showHeadingCounts: true,
	showSectionEndCounts: true,
	showParagraphCounts: false,
	showCompletionTotal: true,
	approximateCounts: false,

	countMode: "manuscript",
	excludeMarkdownSyntax: true,
	excludeNewlines: true,
	excludeHalfWidthSpace: true,
	excludeFullWidthSpace: false,
	excludeFrontmatter: true,
	excludeRubyReading: true,
	useGraphemeClusters: true,

	stopAtCompletionHeading: true,
	completionKeywords: "完, 了",

	includeSubheadingsInParent: false,

	updateDelayMs: 200,
};

/** 設定からカウント処理用のオプションを取り出す。 */
export function toCountOptions(
	settings: JapaneseCharacterCountSettings
): CountOptions {
	return {
		mode: settings.countMode,
		excludeMarkdownSyntax: settings.excludeMarkdownSyntax,
		excludeNewlines: settings.excludeNewlines,
		excludeHalfWidthSpace: settings.excludeHalfWidthSpace,
		excludeFullWidthSpace: settings.excludeFullWidthSpace,
		excludeFrontmatter: settings.excludeFrontmatter,
		excludeRubyReading: settings.excludeRubyReading,
		useGraphemeClusters: settings.useGraphemeClusters,
	};
}

/** 「完」「了」など、本文の終わりを示す見出しキーワードの一覧。 */
export function parseCompletionKeywords(raw: string): string[] {
	return raw
		.split(/[,、\s]+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export class JapaneseCharacterCountSettingTab extends PluginSettingTab {
	plugin: JapaneseCharacterCountPlugin;

	constructor(app: App, plugin: JapaneseCharacterCountPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("表示").setHeading();

		new Setting(containerEl)
			.setName("ステータスバーに総文字数を表示")
			.setDesc("現在のノートの本文文字数と、選択範囲の文字数を表示します。")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("見出しごとの文字数を表示")
			.setDesc("エディタ上の各見出しの行末に、そのセクションの文字数を表示します。")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHeadingCounts)
					.onChange(async (value) => {
						this.plugin.settings.showHeadingCounts = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("セクションの末尾にも文字数を表示")
			.setDesc(
				"長い章では見出しが画面の外に出てしまうため、セクションの最後の行末にも同じ文字数を表示します。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSectionEndCounts)
					.onChange(async (value) => {
						this.plugin.settings.showSectionEndCounts = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("段落ごとの文字数を表示")
			.setDesc(
				"空行で区切られた本文ブロックごとに文字数を表示します。文章量が多いと画面が賑やかになります。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showParagraphCounts)
					.onChange(async (value) => {
						this.plugin.settings.showParagraphCounts = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("「完」の行に総文字数を表示")
			.setDesc(
				"「# 完」のような見出しの行の右端に、そこまでの本文全体の総文字数を表示します。「本文の範囲」の打ち切り設定がオンのときだけ働きます。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCompletionTotal)
					.onChange(async (value) => {
						this.plugin.settings.showCompletionTotal = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("概数で表示（カクヨム式）")
			.setDesc(
				"カクヨムの文字数表示に合わせ、100字単位に丸めて「約2,700字」のように表示します。100字未満はそのままの数値を表示します。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.approximateCounts)
					.onChange(async (value) => {
						this.plugin.settings.approximateCounts = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("カウント方式").setHeading();

		new Setting(containerEl)
			.setName("カウントモード")
			.setDesc(
				"Manuscript: 執筆用（Markdown記号を除いた本文の文字数）／ Raw Text: ファイルの文字列をそのまま／ VSCode Compatible: VSCodeの文字数表示に合わせる／ カクヨム: カクヨムの文字数表示に合わせる。"
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("manuscript", "Manuscript（執筆用）")
					.addOption("raw", "Raw Text（そのまま）")
					.addOption("vscode", "VSCode Compatible（比較用）")
					.addOption("kakuyomu", "カクヨム（投稿サイト準拠）")
					.setValue(this.plugin.settings.countMode)
					.onChange(async (value) => {
						this.plugin.settings.countMode = value as CountMode;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		const mode = this.plugin.settings.countMode;
		// 数え方が決まっているモードでは、除外設定を触っても結果は変わらない
		const isFixedMode = mode === "vscode" || mode === "kakuyomu";

		if (mode === "vscode") {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text: "VSCode Compatible モードでは、以下の除外設定は使用されません（Markdown記号はそのまま数え、改行は数えません）。",
			});
		}

		if (mode === "kakuyomu") {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text: "カクヨムモードでは、以下の除外設定は使用されません。改行・半角スペース・全角スペース・ルビの読み（|親文字《ルビ》、漢字《ルビ》）を数えず、傍点（《《…》》）は親文字だけを数えます。話のタイトルは本文とは別に入力するため、見出し行も数えません。カクヨムはMarkdownを解釈しないので、Markdown記号はそのまま数えます。",
			});
		}

		const detailSettings: Setting[] = [];

		detailSettings.push(
			new Setting(containerEl)
				.setName("Markdown記号を除外")
				.setDesc(
					"**強調** や見出しの # 、リンク記法などを除いて数えます（Manuscriptモードのみ）。"
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.excludeMarkdownSyntax)
						.setDisabled(mode !== "manuscript")
						.onChange(async (value) => {
							this.plugin.settings.excludeMarkdownSyntax = value;
							await this.plugin.saveSettings();
						})
				)
		);

		detailSettings.push(
			new Setting(containerEl)
				.setName("改行を除外")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.excludeNewlines)
						.setDisabled(isFixedMode)
						.onChange(async (value) => {
							this.plugin.settings.excludeNewlines = value;
							await this.plugin.saveSettings();
						})
				)
		);

		detailSettings.push(
			new Setting(containerEl)
				.setName("半角スペースを除外")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.excludeHalfWidthSpace)
						.setDisabled(isFixedMode)
						.onChange(async (value) => {
							this.plugin.settings.excludeHalfWidthSpace = value;
							await this.plugin.saveSettings();
						})
				)
		);

		detailSettings.push(
			new Setting(containerEl)
				.setName("全角スペースを除外")
				.setDesc("オフの場合、字下げなどの全角スペースも1文字として数えます。")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.excludeFullWidthSpace)
						.setDisabled(isFixedMode)
						.onChange(async (value) => {
							this.plugin.settings.excludeFullWidthSpace = value;
							await this.plugin.saveSettings();
						})
				)
		);

		detailSettings.push(
			new Setting(containerEl)
				.setName("YAML frontmatterを除外")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.excludeFrontmatter)
						.setDisabled(isFixedMode)
						.onChange(async (value) => {
							this.plugin.settings.excludeFrontmatter = value;
							await this.plugin.saveSettings();
						})
				)
		);

		detailSettings.push(
			new Setting(containerEl)
				.setName("ルビの読みを除外")
				.setDesc(
					"カクヨム記法のルビ（|時任《ときとう》、時任《ときとう》）を親文字だけ数え、傍点（《《…》》）の記号も数えません（Manuscriptモードのみ）。"
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.excludeRubyReading)
						.setDisabled(mode !== "manuscript")
						.onChange(async (value) => {
							this.plugin.settings.excludeRubyReading = value;
							await this.plugin.saveSettings();
						})
				)
		);

		new Setting(containerEl)
			.setName("書記素クラスタ単位で数える")
			.setDesc(
				"絵文字や結合文字を、画面上の見た目どおり1文字として数えます（Intl.Segmenter を使用）。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useGraphemeClusters)
					.onChange(async (value) => {
						this.plugin.settings.useGraphemeClusters = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("本文の範囲").setHeading();

		new Setting(containerEl)
			.setName("「完」「了」の見出しで本文を打ち切る")
			.setDesc(
				"「# 完」のような見出しが現れたら、その直前までを本文として数えます。見出しでない行の「完」は無視されます。最初に見つかった1つだけが本文の終わりになります。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stopAtCompletionHeading)
					.onChange(async (value) => {
						this.plugin.settings.stopAtCompletionHeading = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("本文終了とみなす見出し語")
			.setDesc("カンマ区切りで指定します。見出しの文字列と完全一致した場合のみ対象になります。")
			.addText((text) =>
				text
					.setPlaceholder("完, 了")
					.setValue(this.plugin.settings.completionKeywords)
					.onChange(async (value) => {
						this.plugin.settings.completionKeywords = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("見出しの集計範囲").setHeading();

		new Setting(containerEl)
			.setName("親見出しに子見出しの文字数を含める")
			.setDesc(
				"オフの場合、次の見出しが現れるまでの本文だけを数えます。オンの場合、配下の子セクションもまとめて数えます。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSubheadingsInParent)
					.onChange(async (value) => {
						this.plugin.settings.includeSubheadingsInParent = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("詳細").setHeading();

		new Setting(containerEl)
			.setName("再計算の遅延（ミリ秒）")
			.setDesc(
				"入力が止まってから文字数を数え直すまでの待ち時間です。長文で動作が重い場合は大きくしてください。"
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 1000, 50)
					.setValue(this.plugin.settings.updateDelayMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.updateDelayMs = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
