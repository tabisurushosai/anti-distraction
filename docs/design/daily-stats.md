# Design: daily-stats

## 目的
`time-limit` が `usageByDate[YYYY-MM-DD]` に蓄積している「対象サイト滞在ミリ秒」を、
ユーザーが popup / options 画面で確認できるように可視化する。本機能は **読み取り
専用** で、表示・集計・古いデータの掃除のみを担い、計測ロジック自体は持たない
（計測は `time-limit` 側で完結）。

`src/popup.ts` には既に「本日の利用時間」と「残り時間」の素朴な表示があり（T013）、
本設計はそれを **仕様として形式化** し、複数日表示（履歴）・Premium ゲート・
データ TTL・タイムゾーン整合性・i18n を明文化する。

## スコープ
- 含む: 日毎の集計表示、本日サマリ、過去 N 日の履歴、Premium ゲートでの拡張表示、
  `usageByDate` の TTL 削除。
- 含まない: 計測そのもの（`time-limit`）、ホスト別の内訳（本機能は「対象サイト
  合計」のみ。ホスト別内訳は将来の `daily-stats-per-host` イテレーションで検討）、
  グラフ描画ライブラリ依存（外部依存ゼロを維持。SVG 直書きまたは CSS のみ）。

## 関連ストレージキー (`src/storage.ts`)
| key | 型 | 役割 |
| --- | --- | --- |
| `usageByDate` | `Record<"YYYY-MM-DD", number>` | 日付ごとの滞在ミリ秒。`time-limit` が `addUsageMs` で加算 |
| `dailyLimitMinutes` | number | 1日上限（分）。残り時間 / バー表示に使う |
| `enabled` | boolean | 無効時は「計測停止中」の注記を出す（数値は最後の値をそのまま表示） |
| `premium_unlocked` | boolean | Premium 解放フラグ。履歴日数の上限切替 |
| `trial_start_ts` | number \| null | お試し期間中なら Premium 相当の表示にする |

> 本機能で新規追加するキーは **無し**。既存キーの読み取りと、`usageByDate`
> に対する TTL 削除（書き込み）だけ。

## データモデル
### 日付キー
- `todayKey(date)` は既に `src/storage.ts` で定義済み。`YYYY-MM-DD` を **ローカル
  タイムゾーン** で生成する（`getFullYear/getMonth/getDate`）。
- 集計や表示も同じ「ローカル日」で行う。UTC との混在は禁止（境界バグの温床）。
- ユーザーが OS のタイムゾーンを変えた場合は、変えた瞬間以降の `addUsageMs` から
  新 TZ の日付キーに入る。過去キーは旧 TZ のままで残るが、表示上はキー名どおりに
  並べる（補正しない）。

### 履歴の窓
- 「直近 N 日」を返す純関数 `lastNDays(today: Date, n: number): string[]` を新設。
  - 例: `lastNDays(today=2026-05-17, n=7)` → `["2026-05-11", ..., "2026-05-17"]`（昇順）。
- 表示用集計 `summarizeUsage(usage, days)` → `{ key, ms, minutes, exceeded }[]` を
  返す純関数。`exceeded = dailyLimitMinutes > 0 && minutes >= dailyLimitMinutes`。

### 表示単位
- ms → 分: `Math.floor(ms / 60_000)`。
- 60 分以上は `H時間M分` / `Xh Ym` の i18n で表記（既存の `popup_minutes` は分のみ
  なので、新規 i18n キー `stats_hours_minutes` を追加）。
- 0 分は空欄ではなく `0 分` と明示（「データ無し」と区別するため。データ自体が
  無い日も同じく `0 分` と表示してよい）。

## UI

### popup（本日のみ・既存の拡張）
- 既存の `#today-usage` と `#remaining-time` をそのまま使う。
- 追加: 直近 7 日の **小型バー列**（横並び 7 本、各日 12px 幅）を `<section>` に
  追加し、`stats_recent_7d` セクション見出しを置く。
  - バーの高さは `min(minutes / dailyLimitMinutes, 1) * maxBarHeight`。
  - 上限超過日は `--ad-color-warn`（赤系）で塗る、それ以外は `--ad-color-accent`。
  - hover/focus でその日の `YYYY-MM-DD: N 分` を `aria-label` / `title` で提示。
  - `dailyLimitMinutes === 0` のときは「上限未設定」ラベルにして、バーは全日 100% で
    出さず代わりに分数のみ列挙する。
- 「統計を見る」ボタン（既存）から options 画面の statistics セクションへ
  `chrome.runtime.openOptionsPage()` でジャンプ（ハッシュ `#stats` を URL に
  付与してスクロール）。

### options（履歴詳細）
- 既存 `options.html` に **新セクション** を追加: `<section id="stats">`、
  見出し `options_section_stats`（既に i18n に定義済み）。
- 表構造:
  - 列: 日付 / 滞在時間 / 上限 / 達成状態（`✓` 上限未満 / `!` 超過）。
  - 行: 直近 N 日（無料: 7 / Premium: 30）。
  - 上限欄は **その日時点の `dailyLimitMinutes`** を出したいところだが、過去の上限
    値を保存していないため、現在値を全行に出す。注釈で「現在の上限値で評価」と明記。
- 合計欄: 表の最後に N 日合計と平均（分）。
- 達成率: `上限未満で過ごせた日 / N` をパーセント表記。Premium 専用の追加メトリクス
  として、最大連続達成日数（streak）も `streak_current` / `streak_best` で出す。
- CSV エクスポートボタンは作らない（個人情報非収集を貫くため、UI からの出力は
  クリップボードコピー or 画面表示のみとする。Premium でも同方針）。

### Premium ゲート
- 無料: 直近 7 日。合計・平均・達成率まで。
- Premium（`premium_unlocked === true` または `trial_start_ts` から 7 日以内）: 直近
  30 日 + streak。
- ゲート判定は **新規ヘルパ** `isPremiumEffective(state, now): boolean` を `src/lib/
  premium-status.ts` に切り出す（T031 で再利用する想定）。本タスクの設計範囲では
  シグネチャだけ確定し、実装は T026 で行う。

## データ TTL とクリーンアップ
- `usageByDate` は日付ごとに加算され続けるため、放置すると永久に肥大化する。
- 保持期間: **90 日**（無料・Premium 共通）。
  - 90 日にした理由: 30 日 Premium 表示の 3 倍程度を保持しておけば、月跨ぎや
    タイムゾーンずれを吸収できる。100 日程度に増やしても容量は数 KB 程度だが、
    storage.local の 5MB 制限内で安全側に倒す。
- 削除タイミング: `chrome.alarms.create("daily-stats-cleanup", { periodInMinutes: 60 * 24 })`
  で 1 日 1 回。ただし service_worker が起きた直後にも `runCleanupIfNeeded()` を
  呼び、`lastCleanupAt` (storage に持たない、in-memory + 起動時に最初の tick で実行) を
  目安に重複実行を避ける。
- 削除は純関数 `pruneUsage(usage, today, retainDays): UsageByDate` で実装。
  - キーが `YYYY-MM-DD` で parse できないものは無条件削除（破損データの掃除）。
  - `today` から `retainDays - 1` 日前以前のキーを削除。
- アラーム ID は `time-limit-tick` と衝突しないよう `daily-stats-cleanup` を使う。

## メッセージング
- popup / options ともに `chrome.storage.local.get` で読むのみ。
- `chrome.storage.onChanged` で `usageByDate` の変更を検知して再描画。debounce は
  popup 200ms / options 500ms。

## i18n（追加する `_locales` キー）
| key | ja | en |
| --- | --- | --- |
| `stats_recent_7d` | 直近 7 日 | Last 7 days |
| `stats_recent_30d` | 直近 30 日 | Last 30 days |
| `stats_hours_minutes` | `$H$ 時間 $M$ 分` | `$H$h $M$m` |
| `stats_total` | 合計 | Total |
| `stats_average` | 平均 | Average |
| `stats_achievement_rate` | 達成率 | Achievement rate |
| `stats_streak_current` | 連続達成日数 | Current streak |
| `stats_streak_best` | 最長連続達成 | Best streak |
| `stats_no_data` | データなし | No data |
| `stats_limit_note` | 上限は現在値で評価しています | Limit values reflect current settings |
| `stats_premium_required` | Premium で 30 日間の履歴と連続達成日数を表示 | Premium unlocks 30-day history and streaks |

> placeholders を含むキー（`stats_hours_minutes`）は `$H$ / $M$` のように
> 既存規約に合わせる。

## ファイル分割
- `src/lib/usage-stats.ts` ……純関数群（`lastNDays`, `summarizeUsage`,
  `pruneUsage`, `formatMinutes`, `computeStreak`）。
- `src/lib/premium-status.ts` ……`isPremiumEffective` のみ。T031 で本実装され、
  本タスクでは型と最小実装。
- `src/popup.ts` ……既存の `renderUsage` を `renderTodaySummary` にリネーム + 直近
  7 日バーの `renderRecentBars` を追加。
- `src/options.ts` ……stats セクションの DOM 生成・再描画を追加。
- `src/background.ts` ……`chrome.alarms` に `daily-stats-cleanup` を登録、
  `onAlarm` のスイッチに分岐追加。
- `_locales/ja/messages.json`, `_locales/en/messages.json` ……上記 i18n キー追加。

## 非機能要件
- 計算は全て純関数・同期。`Date` 依存は引数で注入してテスト可能に。
- DOM 操作は textContent ベース。innerHTML / outerHTML を介した文字列結合は禁止
  （XSS 経路を作らないため。日付や i18n 文字列はサニタイズなしで textContent に
  代入する想定でも、innerHTML を避けることで二重防御になる）。
- アクセシビリティ:
  - バー列は `<ul role="list">` 内の `<li>` に `aria-label="2026-05-17: 12 分"` を
    付ける。
  - 表は `<table>` で `<caption>` に「直近 N 日の利用統計」を含める。
  - 色だけに依存しない（達成状態は `✓` / `!` の文字付き）。
  - `prefers-reduced-motion: reduce` でバーの growth アニメを無効化。
- パフォーマンス:
  - `lastNDays(30)` × `summarizeUsage` は O(N) で十分高速。
  - popup 起動時の `chrome.storage.local.get(["usageByDate", ...])` 1 回で完結。

## 失敗時の挙動
- `usageByDate` 取得失敗 → 全行 `stats_no_data` を出し、合計・平均は 0 として描画。
- 不正な日付キー → `pruneUsage` で削除候補に回す（次の cleanup tick で消える）。
- `dailyLimitMinutes <= 0` → バーは描かず、達成率は「—」と表示。
- 端末の時計が大きくずれている → 表示はキー名どおり。補正しない。

## tab-gray / time-limit との関係
- 完全に **読み取り側**。書き込みは `usageByDate` の TTL 削除のみ。
- `enabled === false` の間は `time-limit` 側で加算が止まるので、本機能の表示も自然
  に停滞する。「無効中」バッジを popup 上部の既存 status badge が表現するので、
  stats セクション内で改めて警告は出さない。

## テスト観点（T027 で確認）
1. `lastNDays(today, n)` が昇順で n 件返ること、月跨ぎ・年跨ぎでも欠落しないこと。
2. `summarizeUsage(usage, days)` がデータ欠落日も `0 分` で埋めて返すこと。
3. `pruneUsage(usage, today, 90)` が 90 日以前のキーと不正キーのみ削除すること。
4. `formatMinutes(0)` → `0 分`、`formatMinutes(125)` → `2 時間 5 分`（ja）/
   `2h 5m`（en）。
5. `computeStreak(summary, limit)` が現在連続・最長連続の双方を返し、上限 0 のとき
   `null` を返すこと。
6. `isPremiumEffective` が `premium_unlocked === true` で常に true、
   `trial_start_ts` から 7 日以内で true、それ以外で false を返すこと。
7. options 画面の表行数が、Premium 状態によって 7 / 30 に切り替わること。
8. popup のバーは `dailyLimitMinutes` 変更後に `chrome.storage.onChanged` 経由で
   再描画されること。
9. cleanup alarm を手動 fire しても TTL 範囲内のキーは消えないこと（既存テスト
   ハーネスでは `chrome.alarms` をモックして純関数 `pruneUsage` の挙動で担保）。

## 後続イテレーションの候補（本タスクでは未着手）
- ホスト別内訳（`usageByDateByHost`）。現状の `time-limit` は合計しか持たないので
  ストレージ・計測の両方を拡張する必要があり、別タスクとして切り出す。
- 週次・月次グラフ（折れ線）。SVG 描画コードが増えるので、まずは表とバー列の
  範囲で価値を出し切ってから検討。
- iCal / CSV エクスポート。前述のとおりプライバシー方針を維持するため、UI 上に
  「画面コピーで OK」と明記する方針で当面は不要。
