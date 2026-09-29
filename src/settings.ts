/**
 * プラグイン設定の型定義とデフォルト値、および設定タブのUI。
 *
 * カウント処理そのものは counter.ts / markdown.ts / sections.ts が担当し、
 * ここでは「どう数えるか」のパラメータだけを保持する。
 */

import { App, PluginSettingTab, Setting, requireApiVersion } from "obsidian";
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

	/* その他（エディタ上に記号で表示する） */
	showFullWidthSpaceMarks: boolean;
	showHalfWidthSpaceMarks: boolean;
	showNewlineMarks: boolean;

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

	showFullWidthSpaceMarks: false,
	showHalfWidthSpaceMarks: false,
	showNewlineMarks: false,

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

/** 値の型が V である設定のキー。 */
type SettingKeyOf<V> = {
	[K in keyof JapaneseCharacterCountSettings]: JapaneseCharacterCountSettings[K] extends V
		? K
		: never;
}[keyof JapaneseCharacterCountSettings];

/*
 * 設定項目の定義。形は Obsidian 1.13 の SettingDefinitionItem に合わせてあるが、
 * それより前の Obsidian でも同じ定義から描画するので、型はここで持つ。
 */

interface ToggleControl {
	type: "toggle";
	key: SettingKeyOf<boolean>;
	disabled?: () => boolean;
}

interface DropdownControl {
	type: "dropdown";
	key: "countMode";
	options: Record<CountMode, string>;
}

interface TextControl {
	type: "text";
	key: "completionKeywords";
	placeholder: string;
}

interface SliderControl {
	type: "slider";
	key: "updateDelayMs";
	min: number;
	max: number;
	step: number;
}

interface SettingRowBase {
	name: string;
	desc?: string;
	visible?: () => boolean;
}

interface ControlRow extends SettingRowBase {
	control: ToggleControl | DropdownControl | TextControl | SliderControl;
}

/** コントロールを持たず、説明だけを表示する行。 */
interface NoteRow extends SettingRowBase {
	control?: undefined;
}

interface SettingRowGroup {
	type: "group";
	heading: string;
	items: (ControlRow | NoteRow)[];
}

export class JapaneseCharacterCountSettingTab extends PluginSettingTab {
	plugin: JapaneseCharacterCountPlugin;

	constructor(app: App, plugin: JapaneseCharacterCountPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Obsidian 1.13 以降は、この定義から設定画面が作られ、設定の検索にも出る。
	 * それより前の Obsidian では display() が同じ定義を読んで描画する。
	 */
	getSettingDefinitions(): SettingRowGroup[] {
		const mode = (): CountMode => this.plugin.settings.countMode;
		// 数え方が決まっているモードでは、除外設定を触っても結果は変わらない
		const isFixedMode = (): boolean =>
			mode() === "vscode" || mode() === "kakuyomu";
		const isNotManuscript = (): boolean => mode() !== "manuscript";

		return [
			{
				type: "group",
				heading: "表示",
				items: [
					{
						name: "ステータスバーに総文字数を表示",
						desc: "現在のノートの本文文字数と、選択範囲の文字数を表示します。",
						control: { type: "toggle", key: "showStatusBar" },
					},
					{
						name: "見出しごとの文字数を表示",
						desc: "エディタ上の各見出しの行末に、そのセクションの文字数を表示します。",
						control: { type: "toggle", key: "showHeadingCounts" },
					},
					{
						name: "セクションの末尾にも文字数を表示",
						desc: "長い章では見出しが画面の外に出てしまうため、セクションの最後の行末にも同じ文字数を表示します。",
						control: { type: "toggle", key: "showSectionEndCounts" },
					},
					{
						name: "段落ごとの文字数を表示",
						desc: "空行で区切られた本文ブロックごとに文字数を表示します。文章量が多いと画面が賑やかになります。",
						control: { type: "toggle", key: "showParagraphCounts" },
					},
					{
						name: "「完」の行に総文字数を表示",
						desc: "「# 完」のような見出しの行の右端に、そこまでの本文全体の総文字数を表示します。「本文の範囲」の打ち切り設定がオンのときだけ働きます。",
						control: { type: "toggle", key: "showCompletionTotal" },
					},
					{
						name: "概数で表示（カクヨム式）",
						desc: "カクヨムの文字数表示に合わせ、100字単位に丸めて「約2,700字」のように表示します。100字未満はそのままの数値を表示します。",
						control: { type: "toggle", key: "approximateCounts" },
					},
				],
			},
			{
				type: "group",
				heading: "カウント方式",
				items: [
					{
						name: "カウントモード",
						desc: "Manuscript: 執筆用（Markdown記号を除いた本文の文字数）／ Raw Text: ファイルの文字列をそのまま／ VSCode Compatible: VSCodeの文字数表示に合わせる／ カクヨム: カクヨムの文字数表示に合わせる。",
						control: {
							type: "dropdown",
							key: "countMode",
							options: {
								manuscript: "Manuscript（執筆用）",
								raw: "Raw Text（そのまま）",
								vscode: "VSCode Compatible（比較用）",
								kakuyomu: "カクヨム（投稿サイト準拠）",
							},
						},
					},
					{
						name: "VSCode Compatible モードの数え方",
						desc: "VSCode Compatible モードでは、以下の除外設定は使用されません（Markdown記号はそのまま数え、改行は数えません）。",
						visible: () => mode() === "vscode",
					},
					{
						name: "カクヨムモードの数え方",
						desc: "カクヨムモードでは、以下の除外設定は使用されません。改行・半角スペース・全角スペース・ルビの読み（|親文字《ルビ》、漢字《ルビ》）を数えず、傍点（《《…》》）は親文字だけを数えます。話のタイトルは本文とは別に入力するため、見出し行も数えません。カクヨムはMarkdownを解釈しないので、Markdown記号はそのまま数えます。",
						visible: () => mode() === "kakuyomu",
					},
					{
						name: "Markdown記号を除外",
						desc: "**強調** や見出しの # 、リンク記法などを除いて数えます（Manuscriptモードのみ）。",
						control: {
							type: "toggle",
							key: "excludeMarkdownSyntax",
							disabled: isNotManuscript,
						},
					},
					{
						name: "改行を除外",
						control: {
							type: "toggle",
							key: "excludeNewlines",
							disabled: isFixedMode,
						},
					},
					{
						name: "半角スペースを除外",
						control: {
							type: "toggle",
							key: "excludeHalfWidthSpace",
							disabled: isFixedMode,
						},
					},
					{
						name: "全角スペースを除外",
						desc: "オフの場合、字下げなどの全角スペースも1文字として数えます。",
						control: {
							type: "toggle",
							key: "excludeFullWidthSpace",
							disabled: isFixedMode,
						},
					},
					{
						name: "YAML frontmatterを除外",
						control: {
							type: "toggle",
							key: "excludeFrontmatter",
							disabled: isFixedMode,
						},
					},
					{
						name: "ルビの読みを除外",
						desc: "カクヨム記法のルビ（|時任《ときとう》、時任《ときとう》）を親文字だけ数え、傍点（《《…》》）の記号も数えません（Manuscriptモードのみ）。",
						control: {
							type: "toggle",
							key: "excludeRubyReading",
							disabled: isNotManuscript,
						},
					},
					{
						name: "書記素クラスタ単位で数える",
						desc: "絵文字や結合文字を、画面上の見た目どおり1文字として数えます（Intl.Segmenter を使用）。",
						control: { type: "toggle", key: "useGraphemeClusters" },
					},
				],
			},
			{
				type: "group",
				heading: "本文の範囲",
				items: [
					{
						name: "「完」「了」の見出しで本文を打ち切る",
						desc: "「# 完」のような見出しが現れたら、その直前までを本文として数えます。見出しでない行の「完」は無視されます。最初に見つかった1つだけが本文の終わりになります。",
						control: { type: "toggle", key: "stopAtCompletionHeading" },
					},
					{
						name: "本文終了とみなす見出し語",
						desc: "カンマ区切りで指定します。見出しの文字列と完全一致した場合のみ対象になります。",
						control: {
							type: "text",
							key: "completionKeywords",
							placeholder: "完, 了",
						},
					},
				],
			},
			{
				type: "group",
				heading: "見出しの集計範囲",
				items: [
					{
						name: "親見出しに子見出しの文字数を含める",
						desc: "オフの場合、次の見出しが現れるまでの本文だけを数えます。オンの場合、配下の子セクションもまとめて数えます。",
						control: { type: "toggle", key: "includeSubheadingsInParent" },
					},
				],
			},
			{
				type: "group",
				heading: "その他",
				items: [
					{
						name: "空白と改行の印",
						desc: "空白や改行をエディタ上に記号で示します。文字数には影響しません。見た目は CSS スニペットの --jcc-ws-* 変数で変えられます。",
					},
					{
						name: "全角スペースを表示",
						desc: "文字の中央に小さめの点線の四角を示します。",
						control: { type: "toggle", key: "showFullWidthSpaceMarks" },
					},
					{
						name: "半角スペースを表示",
						desc: "文字の下端に「⊥」の形の印を示します。行頭のスペース4つごとの区切り線は、区切り目に揃えて表示します。",
						control: { type: "toggle", key: "showHalfWidthSpaceMarks" },
					},
					{
						name: "改行を表示",
						desc: "行末に折り返しの矢印を示します。",
						control: { type: "toggle", key: "showNewlineMarks" },
					},
				],
			},
			{
				type: "group",
				heading: "詳細",
				items: [
					{
						name: "再計算の遅延（ミリ秒）",
						desc: "入力が止まってから文字数を数え直すまでの待ち時間です。長文で動作が重い場合は大きくしてください。",
						control: {
							type: "slider",
							key: "updateDelayMs",
							min: 0,
							max: 1000,
							step: 50,
						},
					},
				],
			},
		];
	}

	/** Obsidian 1.13 以降で、コントロールの値が変わったときに呼ばれる。 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		await this.saveValue(key, value);
		// 除外設定の有効・無効と、モードの説明の表示は、カウントモードで変わる
		if (requireApiVersion("1.13.0")) this.refreshDomState();
	}

	/** Obsidian 1.13 より前で呼ばれる。1.13 以降は getSettingDefinitions() が使われる。 */
	display(): void {
		this.renderLegacy();
	}

	/** 値を保存し、エディタとステータスバーの表示へ反映する。 */
	private async saveValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
	}

	private renderLegacy(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const group of this.getSettingDefinitions()) {
			new Setting(containerEl).setName(group.heading).setHeading();
			for (const row of group.items) {
				if (row.visible && !row.visible()) continue;
				const setting = new Setting(containerEl).setName(row.name);
				if (row.desc) setting.setDesc(row.desc);
				if (row.control) this.addLegacyControl(setting, row);
			}
		}
	}

	private addLegacyControl(setting: Setting, row: ControlRow): void {
		const { control } = row;
		const { settings } = this.plugin;

		switch (control.type) {
			case "toggle":
				setting.addToggle((toggle) =>
					toggle
						.setValue(settings[control.key])
						.setDisabled(control.disabled?.() ?? false)
						.onChange((value) => this.saveValue(control.key, value))
				);
				break;
			case "dropdown":
				setting.addDropdown((dropdown) =>
					dropdown
						.addOptions(control.options)
						.setValue(settings[control.key])
						.onChange(async (value) => {
							await this.saveValue(control.key, value);
							// モードによって他の行の表示が変わるので描き直す
							this.renderLegacy();
						})
				);
				break;
			case "text":
				setting.addText((text) =>
					text
						.setPlaceholder(control.placeholder)
						.setValue(settings[control.key])
						.onChange((value) => this.saveValue(control.key, value))
				);
				break;
			case "slider": {
				// 古い Obsidian はスライダーの値を表示しないので、説明に書き添える
				const showValue = (value: number): void => {
					setting.setDesc(`${row.desc ?? ""}（現在の値: ${value}）`);
				};
				showValue(settings[control.key]);
				setting.addSlider((slider) =>
					slider
						.setLimits(control.min, control.max, control.step)
						.setValue(settings[control.key])
						.onChange(async (value) => {
							showValue(value);
							await this.saveValue(control.key, value);
						})
				);
				break;
			}
		}
	}
}
