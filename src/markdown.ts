/**
 * Markdown記法の除去。
 *
 * 「画面に本文として表示される文字だけを残す」ことを目的とした、軽量な
 * テキスト変換を行う。完全なMarkdownパーサではなく、日本語原稿で頻出する
 * 記法に絞って処理する（正確性より原稿での自然さを優先）。
 */

/** コードフェンス（``` や ~~~）の開始/終了行にマッチするか。 */
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** ATX見出し行（# 〜 ######）。 */
const HEADING_RE = /^(#{1,6})(\s+(.*))?$/;

/** 水平線のみの行。 */
const THEMATIC_BREAK_RE = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;

/** テーブルの区切り行（|---|:--:|）。 */
const TABLE_DELIMITER_RE = /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/;

/** 行頭の引用記号。 */
const BLOCKQUOTE_RE = /^\s{0,3}(>\s?)+/;

/** 行頭のリストマーカー（箇条書き・番号付き）。 */
const LIST_MARKER_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+/;

/** チェックボックス。 */
const TASK_MARKER_RE = /^\[[ xX>\-/?!*"lbi'SnkupcdfwWP]\]\s+/;

/** Calloutのラベル部分（> [!note]+ タイトル）。 */
const CALLOUT_RE = /^\[!\w+\][+-]?\s*/;

/** 脚注定義行の先頭（[^1]: ）。 */
const FOOTNOTE_DEF_RE = /^\s{0,3}\[\^[^\]\s]+\]:\s*/;

export interface HeadingLine {
	level: number;
	text: string;
}

/** 行がATX見出しならレベルと見出しテキストを返す。 */
export function parseHeadingLine(line: string): HeadingLine | null {
	const m = HEADING_RE.exec(line);
	if (!m) return null;
	const level = m[1].length;
	// 閉じの # 列（## 見出し ##）は取り除く
	const text = (m[3] ?? "").replace(/\s+#+\s*$/, "").trim();
	return { level, text };
}

/** コードフェンスの開始/終了を追跡するための状態。 */
export class FenceTracker {
	private marker: string | null = null;

	/**
	 * 1行渡して状態を更新する。
	 * 戻り値は「その行がフェンス記号の行自体か」。
	 */
	feed(line: string): boolean {
		const m = FENCE_RE.exec(line);
		if (!m) return false;
		const marker = m[1][0];
		if (this.marker === null) {
			this.marker = marker;
			return true;
		}
		if (this.marker === marker) {
			this.marker = null;
			return true;
		}
		return false;
	}

	/** 現在コードブロックの内側か。 */
	get inside(): boolean {
		return this.marker !== null;
	}
}

/**
 * 先頭のYAML frontmatterを取り除く。
 * frontmatterが無ければ元の文字列をそのまま返す。
 */
export function stripFrontmatter(text: string): string {
	const end = frontmatterEndLine(text.split("\n"));
	if (end < 0) return text;
	return text.split("\n").slice(end + 1).join("\n");
}

/**
 * YAML frontmatterの終端行（閉じの --- の行番号、0始まり）を返す。
 * frontmatterが無い場合は -1。
 */
export function frontmatterEndLine(lines: string[]): number {
	if (lines.length === 0 || lines[0].trim() !== "---") return -1;
	for (let i = 1; i < lines.length; i++) {
		const t = lines[i].trim();
		if (t === "---" || t === "...") return i;
	}
	return -1;
}

/**
 * Markdown記法を取り除き、本文として表示される文字だけを残す。
 *
 * frontmatterはここでは扱わない（呼び出し側で stripFrontmatter する）。
 */
export function stripMarkdown(text: string): string {
	const protectedParts: string[] = [];
	const protect = (value: string): string => {
		protectedParts.push(value);
		return `\u0000${protectedParts.length - 1}\u0000`;
	};

	let s = text;

	// コメント（表示されない要素）は数えない
	s = s.replace(/<!--[\s\S]*?-->/g, "");
	s = s.replace(/%%[\s\S]*?%%/g, "");

	// 行単位の処理。コードブロックの内容は本文として残しつつ、
	// インライン記法の処理からは保護する。
	const fence = new FenceTracker();
	const outLines: string[] = [];
	for (const rawLine of s.split("\n")) {
		const isFenceLine = fence.feed(rawLine);
		if (isFenceLine) {
			// ``` の行自体は本文ではない
			continue;
		}
		if (fence.inside) {
			outLines.push(protect(rawLine));
			continue;
		}
		outLines.push(stripBlockSyntax(rawLine));
	}
	s = outLines.join("\n");

	// インラインコードは中身を残し、記号だけ落とす
	s = s.replace(/(`+)([^\n]*?)\1/g, (_all, _tick, code: string) =>
		protect(code)
	);

	// エスケープされた記号は「本文の1文字」として保護する
	s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|>~=])/g, (_all, ch: string) =>
		protect(ch)
	);

	// 埋め込み（![[...]] / ![alt](url)）は表示上テキストではないので数えない
	s = s.replace(/!\[\[[^\]]*\]\]/g, "");
	s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");

	// 脚注参照
	s = s.replace(/\[\^[^\]\s]+\]/g, "");

	// Wikiリンク：表示名があれば表示名、無ければリンク先
	s = s.replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, "$2");
	s = s.replace(/\[\[([^\]|]+)\]\]/g, (_all, target: string) =>
		target.replace(/[#^]/g, "")
	);

	// 通常リンク：表示名のみ
	s = s.replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1");

	// 自動リンク <https://...> は URL が表示されるので山括弧のみ落とす
	s = s.replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1");

	// HTMLタグ
	s = s.replace(/<\/?[A-Za-z][^>]*>/g, "");

	// 強調・打ち消し・ハイライト
	s = s.replace(/\*\*\*([^\n]+?)\*\*\*/g, "$1");
	s = s.replace(/\*\*([^\n]+?)\*\*/g, "$1");
	s = s.replace(/\*([^*\n]+?)\*/g, "$1");
	s = s.replace(/~~([^\n]+?)~~/g, "$1");
	s = s.replace(/==([^\n]+?)==/g, "$1");
	// アンダースコアは単語の途中（snake_case）を壊さないよう境界を見る
	s = s.replace(/(^|[^\w\\])__([^\n]+?)__(?![\w])/g, "$1$2");
	s = s.replace(/(^|[^\w\\])_([^_\n]+?)_(?![\w])/g, "$1$2");

	// 保護した文字列を戻す
	s = s.replace(/\u0000(\d+)\u0000/g, (_all, idx: string) => {
		const value = protectedParts[Number(idx)];
		return value === undefined ? "" : value;
	});

	return s;
}

/** 行頭の記法（見出し・引用・リストなど）を取り除く。 */
/** ルビの親文字になれる文字（漢字・々・〆・ヶ）。 */
const RUBY_BASE_RE = /[\u4E00-\u9FFF\u3005\u3006\u3007\u3400-\u4DBF\u30F6]+《[^》\n]*》/g;

/**
 * カクヨム記法を、サイト上で本文として表示される文字だけに変換する。
 *
 * - 傍点 `《《文字》》` → 親文字だけ残す
 * - ルビ `|親文字《ルビ》` → 親文字だけ残す（全角の ｜ も同じ）
 * - ルビ `漢字《ルビ》` → 漢字だけ残す
 *
 * 親文字を伴わない `《…》` は、カクヨムでもルビにならずそのまま表示されるため
 * 残す。傍点を先に処理するのは、`《《…》》` を二重のルビと誤認しないため。
 */
export function stripKakuyomuNotation(text: string): string {
	return text
		.replace(/《《([^》\n]+)》》/g, "$1")
		.replace(/[|｜]([^|｜《》\n]*)《[^》\n]*》/g, "$1")
		.replace(RUBY_BASE_RE, (all) => all.slice(0, all.indexOf("《")));
}

/**
 * 見出し行を、行ごと取り除く。
 * カクヨムでは話のタイトルは本文とは別に入力するため、本文の文字数には含めない。
 */
export function stripHeadingLines(text: string): string {
	const fence = new FenceTracker();
	const out: string[] = [];
	for (const line of text.split("\n")) {
		const isFenceLine = fence.feed(line);
		if (isFenceLine || fence.inside) {
			out.push(line);
			continue;
		}
		if (parseHeadingLine(line) !== null) continue;
		out.push(line);
	}
	return out.join("\n");
}

function stripBlockSyntax(line: string): string {
	if (THEMATIC_BREAK_RE.test(line)) return "";
	if (TABLE_DELIMITER_RE.test(line)) return "";

	let s = line;

	const heading = parseHeadingLine(s);
	if (heading) return heading.text;

	// 引用・Callout
	if (BLOCKQUOTE_RE.test(s)) {
		s = s.replace(BLOCKQUOTE_RE, "");
		s = s.replace(CALLOUT_RE, "");
	}

	// リスト・チェックボックス（インデントも記法の一部として落とす）
	s = s.replace(LIST_MARKER_RE, "");
	s = s.replace(TASK_MARKER_RE, "");

	// 脚注定義（本文は残す）
	s = s.replace(FOOTNOTE_DEF_RE, "");

	// テーブル行の区切り記号
	if (/^\s*\|.*\|\s*$/.test(s)) {
		s = s.replace(/\s*\|\s*/g, "");
	}

	return s;
}
