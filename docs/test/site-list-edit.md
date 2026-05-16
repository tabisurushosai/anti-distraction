# Test: site-list-edit (T024)

## 自動テスト
`npm test` で実行される。

### `tests/site-input.test.mjs`
`src/lib/site-input.ts` の純関数を網羅 (25 ケース)。

`normalizeHost(input: string): string | null`:
- 大文字小文字非依存 / `trim` / 周辺空白除去
- スキーム付き URL からホスト抽出 (`HTTPS://WWW.YouTube.com/watch?v=...` → `youtube.com`、`http://example.com/foo` → `example.com`)
- manifest match パターン `*.example.com` の `*.` 剥がし
- 先頭 `www.` を 1 回剥がす
- 末尾 `.` 剥がし
- スキーム無しでパスが残った場合の `/` 以降切り捨て
- 多段組み合わせ (`*.www.example.com.` → `example.com`)
- 無効入力で `null`: 空文字 / 空白のみ / `localhost`（単一ラベル） / `1.2.3.4`（IP リテラル） / 空白を含む文字列 / `https://`（hostname 空） / `.com`（前置ラベル無し）
- **idempotent**: 出力を `host-match.normalizeHost` に再度通しても同値（保存値が runtime 側の `hostMatches` でそのまま使えることを保証 — 設計の整合点 11）

`isCoveredByManifest(host: string): boolean`:
- exact match (`youtube.com`)
- subdomain (`m.youtube.com`) / 深い subdomain (`studio.m.youtube.com`)
- 入力側の case-insensitive (`M.YouTube.COM`)
- 非マッチ (`example.org`)
- 境界チェック (`foo-youtube.com` / `myoutube.com` は false)
- `MANIFEST_MATCH_HOSTS` の全要素自身が covered

> options.ts は `chrome.*` API / DOM に強く依存するためユニットテスト対象外。
> 入力正規化と「manifest 範囲外」判定は `site-input.ts` に集約されており、
> 残りの UI 操作（追加/削除/Premium ゲート/永続化）は下記の手動チェックでカバー。

## 手動チェック (Chrome に load unpacked)

事前準備:
1. `npm run build` で `dist/` を生成。
2. `chrome://extensions` → developer mode → load unpacked → このディレクトリを指定。
3. 拡張アイコン右クリック → 「オプション」で options ページを開く。
4. DevTools の Application > Storage > Extension storage で `chrome.storage.local` を直接編集できる。

| #  | シナリオ | 期待結果 |
| -  | -------- | -------- |
| 1  | options を開いた直後 | sites リストに既定 6 件 (`youtube.com`, `twitter.com`, `x.com`, `instagram.com`, `facebook.com`, `tiktok.com`) が表示される |
| 2  | 入力欄に `https://m.YouTube.com/watch?v=abc` と入れて「サイトを追加」 | リスト末尾に `youtube.com` が **重複登録されず**、入力欄がクリア + 再フォーカス |
| 3  | 入力欄に `reddit.com` を入れて Enter | リストに `reddit.com` が追加され、`site-warning` 領域に「監視範囲外」文言が表示される |
| 4  | 続けて `m.youtube.com` を追加 | `youtube.com` 配下のため warning は出ない（重複登録は無視） |
| 5  | 入力欄に `*.example.com` を入れて追加 | `example.com` として登録される |
| 6  | 入力欄に `localhost` を入れて追加 | `options_site_invalid` 文言が `site-warning` に表示、リストに追加されない、入力欄にフォーカスが残る |
| 7  | リストの任意 1 件で「削除」ボタンを押下 | その行のみがリストから消える。確認ダイアログは出ない。`site-warning` がクリアされる |
| 8  | 「初期設定に戻す」を押下 | sites が DEFAULT 6 件に戻り、limits / grayIntensity / cooldown も初期値に戻る。`site-warning` はクリアされる |
| 9  | sites を 10 件まで追加 (例: `a.example.com`, `b.example.com`, …, `j.example.com`) | 10 件到達直後に「追加」ボタンと入力欄が disabled になり、`site-limit` 領域に `options_site_limit_reached`（「無料版では最大 10 件まで」）が表示される |
| 10 | 上記状態で DevTools から `chrome.storage.local.set({premium_unlocked: true})` | options を再描画せずに即座に「追加」ボタンと入力欄が enabled に戻り、`site-limit` の文言が消える |
| 11 | trial を `chrome.storage.local.set({trial_start_ts: Date.now()})` でセット | 同様に Premium 扱いとなり、上限が解除される。7 日経過後（時刻を進める / `Date.now() - 8 * DAY_MS` をセット）は再び 10 件上限が適用される |
| 12 | sites を編集して「保存」を押す | `options_saved` トーストが約 1.8 秒表示される。リロードしても `sites` が維持される |
| 13 | options タブを開いたまま、別の Chrome ウィンドウから DevTools 経由で `chrome.storage.local.set({sites: ["youtube.com"]})` | `chrome.storage.onChanged` 経由で options 側のリストも同期更新される |
| 14 | sites に追加した `reddit.com` で実際に `https://reddit.com` を開く | content script が manifest matches 外のため注入されず、グレー化も time-limit overlay も発動しない（設計通り。warning は事前に出ている） |
| 15 | sites に `m.youtube.com` を追加した状態で `https://m.youtube.com` を開く | manifest matches の `*.youtube.com` でカバーされるため content script が動作し、グレー化される（tab-gray / time-limit との整合） |

## 整合性チェック

- [x] `src/options.ts` の `FREE_SITES_LIMIT = 10` が設計と一致。
- [x] `src/options.ts` は `normalizeHost` / `isCoveredByManifest` を `./lib/site-input` から import（重複定義なし）。
- [x] `src/lib/manifest-hosts.ts` の `MANIFEST_MATCH_HOSTS` が `manifest.json#content_scripts.matches` の既定 6 ホストと同一集合。
- [x] `normalizeHost` 出力は `host-match.normalizeHost` の fixed point（自動テストで担保）。
- [x] 入力バリデーション失敗時は `options_site_invalid` を `site-warning` に表示し、保存も行わない。
- [x] 範囲外ホスト追加時は `options_site_not_covered` を表示（追加自体は許可）。
- [x] 上限到達時は追加ボタン + 入力欄を `disabled` にして無効化。
- [x] `chrome.storage.onChanged` の `local` エリア購読で `sites` / `trial_start_ts` / `premium_unlocked` の外部更新を反映。
- [x] `chrome.storage.local.set` 失敗時は `console.warn` のみで UI を継続。
- [x] `_locales/ja` と `_locales/en` の双方に新規キー (`options_site_limit_reached` / `options_site_not_covered` / `options_site_invalid`) が存在。

## 既知の制限・後続課題

- **manifest matches の静的性**: MV3 は `content_scripts.matches` を実行時に変更できないため、既定 6 ホスト配下以外を追加しても content script は注入されない。`site-warning` で事前周知のみ可能。動的注入は `chrome.scripting.registerContentScripts` + `host_permissions` で対応する余地があるが、Premium 機能 / 後続イテレーションに先送り。
- **並び替え未対応**: drag-and-drop は本タスクの範囲外。追加順 = 表示順 = 保存順。
- **削除に確認ダイアログなし**: 設計通り。誤操作は「初期設定に戻す」で 6 既定までは回復可。カスタム追加分の undo は後続課題。
- **`FREE_SITES_LIMIT` の集中管理**: 現状は `src/options.ts` 内ローカル定数。T031 (premium.ts) で `src/premium.ts` に移植予定。
- **trial 期限判定の `Date.now()` 依存**: お試し開始時刻からの経過のみで判定。手動でシステム時計を巻き戻すと一時的に再 trial 可能（拡張ユースケースとしては許容範囲）。
- **lint (`npm run lint`)**: 先行する型エラー (`src/storage.ts:159`, `vite.config.ts` の `__dirname` / `node:path`) が残存。本タスク範囲外で T034 にて対応。
