# Design: site-list-edit

## 目的
`sites[]`（`tab-gray` と `time-limit` が共通で参照する「対象ホスト」リスト）をユーザーが
オプション画面から追加・削除・初期化できるようにする。ホスト文字列は正規化済みの形で
保存し、後段の機能（`hostMatches`）が安全に suffix-match で評価できる状態を維持する。

`src/options.ts` には既に最低限の UI が存在する（T014）。本設計はそれを **仕様として
形式化** し、バリデーション・正規化・永続化・Premium ゲート・manifest matches との
関係を明文化する。

## 関連ストレージキー (`src/storage.ts`)
| key | 型 | 役割 |
| --- | --- | --- |
| `enabled` | boolean | リスト編集自体は `enabled` に依存しない（UI は常時操作可） |
| `sites` | `string[]` | 正規化済みホスト配列。`tab-gray` / `time-limit` の判定キー |
| `premium_unlocked` | boolean | Gumroad検証済みPremium候補フラグ |
| `premium_verified_at` | number \| null | 最終検証日時 |
| `premium_grace_until` | number \| null | Offline時のPremium猶予期限 |
| `trial_start_ts` | number \| null | お試し期間開始時刻 |

> `sites` は **配列順序を保持** する（UI 表示順 = 追加順）。同一ホスト重複は禁止。

## ホスト正規化（バリデータ）
保存される `sites` の各要素は次の規約を満たす：

1. 入力文字列を `trim().toLowerCase()`。
2. スキーム付き（`https://...` / `http://...`）であれば `new URL(input).hostname` で
   ホスト部だけを抽出。`URL` 構築失敗 → 無効。
3. 先頭の `*.` を剥がす（manifest match パターンを貼り付けた場合の救済）。
4. 先頭の `www.` を 1 回だけ剥がす。
5. 末尾のドット（`example.com.`）を剥がす。
6. パス（`/...`）が残っていれば、最初の `/` 以降を捨てる。
7. 最終形に対し以下のドメイン正規表現で検証：
   ```
   /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
   ```
   - 例えば `localhost` 単体や IP アドレスは無効扱い（拡張のユースケース外）。
8. 結果が空文字 / 不一致 → null を返し、UI 側は入力欄に focus を戻す（保存しない）。

この正規化ロジックは `options.ts` の `normalizeHost` で既に実装済み。今後は
**`src/lib/site-input.ts` に切り出し** して、テストで網羅できるようにする（T024）。

`tab-gray` / `time-limit` 側で参照される `src/lib/host-match.ts` の `normalizeHost` は
「保存済みデータの再正規化」用（小文字化 / 末尾ドット / `www.` だけ）であり、入力時の
バリデータとは目的が異なるため別関数として共存させる。

## 重複・大文字小文字
- 比較は常に正規化後の小文字で行う。
- 既に `sites` に含まれるホストを再追加しようとした場合は **無視**（エラー表示も
  出さず、入力欄をクリアする）。

## 操作モデル

### 1. 追加
- 入力欄に文字列を入れて「サイトを追加」ボタン or `Enter` キー押下。
- 正規化に成功し、未重複であれば `sites = [...sites, normalized]`。
- 失敗時は入力欄を `focus + select` して再入力を促す（HTML5 の `:invalid` には頼らない
  — 独自バリデーションが優先）。

### 2. 削除
- 各行の「削除」ボタン押下で `sites = sites.filter(s => s !== host)`。
- 確認ダイアログは出さない（誤操作は「初期設定に戻す」で回復可能）。
- 最後の 1 件まで削除可能。空配列も許可（= 何も対象にしない状態）。

### 3. 並び替え
- 本機能では **未対応**（drag-and-drop は後続イテレーション、要件次第）。
- 順序は「追加順 = 保存順」。

### 4. 初期化（「初期設定に戻す」）
- `DEFAULT_SITES` で `sites` を上書き。同時に他の数値設定（limits / gray /
  cooldown）もデフォルトに戻す（既存実装と同じ）。
- ユーザーが追加したカスタムサイトは消える。確認ダイアログは出さない（既存の
  UX 維持）。後続イテレーションで undo を検討してもよい。

### 5. 保存
- 「保存」ボタン押下時に `chrome.storage.local.set` で一括書き込み。
- 自動保存はしない（保存忘れ防止より「明示保存」を優先 — children-friendly な UX）。
- 保存成功で `options_saved` メッセージを 1.8 秒だけ表示。

## manifest.json `content_scripts.matches` との関係
- **重要**: `manifest_version: 3` では `content_scripts.matches` を**実行時に変更でき
  ない**。ユーザーが `sites` に追加した任意ホストは、当該ホストが既存 matches に
  含まれない限り content script が注入されない（= グレー化も overlay も発動しない）。
- 既定 6 サイト（youtube/twitter/x/instagram/facebook/tiktok）の subdomain 範囲では
  matches がすでに広めに設定されているため、`m.youtube.com` 等の追加は機能する。
- 既定外のホスト追加は **保存はできるが効果が出ない**。本タスクの範囲では：
  - UI 上に「`<host>` は拡張が監視できる範囲外です。効果が出ない場合があります」
    という注意書きを **追加リストに加えた直後** にインライン表示する。
  - 後続イテレーション（Premium 機能）で `host_permissions` + `chrome.scripting.
    registerContentScripts` を使った動的注入を検討する。本タスクでは静的 matches に
    依存した範囲で動作することを明示する。

判定方法：
```ts
const MATCHES_HOSTS = ["youtube.com","twitter.com","x.com","instagram.com",
                       "facebook.com","tiktok.com"];
function isCoveredByManifest(host: string): boolean {
  return MATCHES_HOSTS.some(m => host === m || host.endsWith("." + m));
}
```
配列は manifest と乖離しないよう `src/lib/manifest-hosts.ts` に定数化する。

## Premium ゲート
- 無料: `sites` の追加可能件数は **最大 10 件** までに制限する。
- Premium: 無制限。
- 上限到達時は「追加」ボタンを disabled にし、`options_premium_sites_limit` の
  説明と「Premium にアップグレード」ボタンへの導線を表示。
- 削除は無料でも常時可能。
- 制限値 `FREE_SITES_LIMIT = 10` は `src/premium.ts`（T031）で集中管理する想定。
  本タスクでは options.ts 内に定数として置いておき、T031 で移植する。

## アクセシビリティ
- リストは `<ul aria-label="sites">` で、各項目は `<li>`。
- 削除ボタンには `aria-label="削除: example.com"` のように対象が分かるラベルを付与
  （既存実装どおり）。
- 入力欄は `<label>` 不在のため `data-i18n-placeholder` で意味を補う。スクリーン
  リーダー向けに `aria-label` の付与も後続改善で検討。
- 「保存」した結果は `<p id="save-status" aria-live="polite">` で通知。
- キーボード操作: `Enter` で追加。`Tab` で削除ボタンへ移動 → `Enter` / `Space` で
  削除。フォーカスは可視 outline を維持。

## i18n
新規追加文字列（`_locales/{ja,en}/messages.json`）：
- `options_site_limit_reached` … 「無料版では最大 10 件までです」
- `options_site_not_covered` … 「<host> は監視範囲外のため効果が出ない場合があります」
- `options_site_invalid` … 「ホスト名が正しくありません」（フィードバック表示用）

既存の `options_site_add` / `options_site_remove` / `options_site_placeholder` は
そのまま利用。

## ファイル分割
- `src/options.ts` ………… UI ロジック（既存）。本タスクで Premium ゲート / 範囲外
  警告を追加。
- `src/options.html` ……… 範囲外警告の `<p id="site-warning" aria-live="polite">`
  を sites セクションに追加。
- `src/lib/site-input.ts` ……（新規）`normalizeHost(input: string): string | null`
  と `isCoveredByManifest(host: string): boolean` を export。テスト対象。
- `src/lib/manifest-hosts.ts` …（新規）manifest と同期する既定ホスト配列を定数化。

## 失敗時の挙動
- `chrome.storage.local.set` 失敗 → `console.warn` のみでユーザー操作はそのまま続行。
  次回保存で再試行できる（永続化失敗はまれだが、ストレージ満杯のケースに備える）。
- `chrome.storage.onChanged` で他コンテキストから `sites` が更新された場合は
  リロードせずに UI 上の view を上書きするのが理想。本タスクでは options.ts の
  既存 `watchStorage` を `sites` も監視対象に拡張する（編集中のデータが消えるリスク
  があるため、保存中フラグを見て競合は最終書き込み優先で許容）。

## テスト観点（T024 で確認）
1. 正規化: `HTTPS://WWW.YouTube.com/watch?v=...` → `youtube.com`。
2. 正規化: `*.example.com` → `example.com`。
3. 正規化: `example.com.` → `example.com`（末尾ドット除去）。
4. 正規化: `localhost` / `1.2.3.4` / `not a host` → null（無効）。
5. 重複追加: 同一ホストを 2 回追加しても `sites.length` が増えない。
6. 削除: 任意の 1 件を削除すると配列から除外される。
7. 初期化: 「初期設定に戻す」で `DEFAULT_SITES` と一致する配列に戻る。
8. 範囲外警告: `example.org`（manifest matches 外）を追加すると `site-warning` に
   文言が表示される。`youtube.com` / `m.youtube.com` では出ない。
9. Premium ゲート: 無料状態で 10 件追加した直後、追加ボタンが disabled になる。
   `premium_unlocked = true`に加えて、有効な`premium_verified_at`と
   `premium_grace_until`がある場合だけ解放される。
10. 永続化: 「保存」押下後にページをリロードしても `sites` が維持されている。
11. `tab-gray` / `time-limit` との整合: 保存直後に `hostMatches` が真を返すこと
    （手動チェック項目）。

## tab-gray / time-limit との整合
- 本タスクは UI のみで、`tab-gray` / `time-limit` の挙動は変更しない。
- 既存テスト（`tests/host-match.test.mjs`）と同じ正規化ルールに揃えるため、
  `normalizeHost(input)` の結果は **`host-match.normalizeHost(saved)` を再度通しても
  同一の値** になる必要がある（idempotent）。テストで担保する。
