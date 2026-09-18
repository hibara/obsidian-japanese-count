# Japanese Character Count（Obsidian プラグイン）

## 記憶とTODOの置き場所

このプロジェクトに関する記憶・TODO は、**必ずこのフォルダー内**に置くこと。
Obsidian は Windows / macOS 両対応で、このリポジトリは Dropbox 同期されている。
`~/.claude/projects/...`（ホーム配下のメモリー）に置くと片方のマシンからしか読めない。

- `.claude/memory/MEMORY.md` — 記憶のインデックス。作業開始時にまず読む
- `.claude/memory/*.md` — 記憶の本体（1ファイル1トピック）
- `.claude/TODO.md` — 未着手・進行中のタスク

新しく覚えるべきことが出たら `.claude/memory/` にファイルを追加し、`MEMORY.md` に1行のポインタを足す。
既存の内容と重なる場合は新規作成せず、そのファイルを更新する。

## ビルドと配置

```sh
npm run build   # tsc 型チェック + esbuild（main.js を生成）
npm test        # vitest
```

配置先 Vault は `~/Documents/呪術医/.obsidian/plugins/japanese-character-count/`（macOS）。
`main.js` / `manifest.json` / `styles.css` をコピーする。**`data.json` は上書きしない**（ユーザー設定が消えるため）。
コピー後、Obsidian 側で「Reload app without saving」またはプラグインのオフ→オンが必要。

`main.js` は `.gitignore` 済みなので、ソースだけ同期された状態ではビルド成果物が古いままになる。
別マシンに移ったら、まず Vault 側の `main.js` の日付を確認すること。
