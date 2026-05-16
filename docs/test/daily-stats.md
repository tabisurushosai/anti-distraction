# Test: daily-stats (T027)

## 自動テスト
`npm test` で実行される。本タスクで合計 54 ケースを追加。

### `tests/usage-stats.test.mjs`
`src/lib/usage-stats.ts` の純関数 9 種を網羅 (39 ケース)。

`lastNDays(today, n)` (8 ケース):
- 通常 `n=7` で昇順 7 件、末尾が `today` の `YYYY-MM-DD` キー
- `n=1` / `n=0` / 負の `n`
- 月跨ぎ (`2026-03-02` 基点で 2 月最終週まで連続)
- 年跨ぎ (`2027-01-02` 基点で `2026-12-30` まで)
- 閏年の Feb 29 (`2028` は閏年、`2028-02-29` がキーに含まれる)
- 30 日窓のソート保証

`msToMinutes(ms)` (5 ケース):
- `0` / 境界 `59_999` (→0) / `60_000` (→1) / 負数 / `NaN` / `Infinity`

`summarizeUsage(usage, keys, dailyLimitMinutes)` (5 ケース):
- 欠落日を `minutes=0, exceeded=false` で埋める
- `minutes >= dailyLimitMinutes` のとき `exceeded=true` (境界含む)
- `minutes < dailyLimitMinutes` のとき `exceeded=false`
- `dailyLimitMinutes <= 0` のとき常に `exceeded=false`

`formatMinutes(minutes, template)` (8 ケース):
- `0` / `59` / `60` / `125` を ja (`$H$ 時間 $M$ 分` / `$MIN$ 分`) と en (`$H$h $M$m` / `$MIN$m`) の両テンプレートで検証
- 負数 / `NaN` は `0 分` へフォールバック

`pruneUsage(usage, today, retainDays)` (8 ケース):
- 8 日窓で `today` および 7 日前まで保持、8 日前は削除
- 90 日窓の境界保持
- 不正キー (`invalid`, `2026-13-01`, `2026-02-30`, 空文字) を削除
- `NaN` / `Infinity` 値を削除
- `retainDays=0` で空オブジェクト
- `null` / `undefined` の usage で空オブジェクト
- 未来日キーは保持 (壊れたデータ扱いしない)

`computeStreak(summary, dailyLimitMinutes)` (6 ケース):
- 全日達成 / 全日超過 / 末尾の達成連続 / 過去最長 > 現在連続 / 上限 0 で `null` / 空配列で `{current:0,best:0}`

`achievementRate` / `totalMinutes` / `averageMinutes` (8 ケース):
- 達成率 0.75 / 上限 0 で `null` / 空で `null`
- 合計の通常ケース・空ケース
- 平均の rounded mean・空ケース

### `tests/premium-status.test.mjs`
`src/lib/premium-status.ts` の `isPremiumEffective` と `trialDaysLeft` を網羅 (15 ケース)。

`isPremiumEffective(state, now)`:
- `premium_unlocked=true` は trial 期限切れでも常に true
- `trial_start_ts` から 7 日以内は true (delta 0 / 3 日経過の双方)
- ちょうど `TRIAL_DAYS * DAY_MS` 経過は false (境界排他)
- 期限切れ / 未来日 (時計ずれ) / null / `NaN` は false

`trialDaysLeft(state, now)`:
- `premium_unlocked=true` は `null`
- `trial_start_ts=null` は `TRIAL_DAYS` (7)
- 開始直後は 7、3 日経過で 4
- 期限切れは 0 (負値にならず clamp)
- 非有限 `trial_start_ts` は `TRIAL_DAYS`

> popup.ts / options.ts は `chrome.*` API と DOM に強く依存するためユニットテスト対象外。
> 表示・再描画・Premium ゲートの最終的な動作は下記の手動チェックで担保。

## 手動チェック (Chrome に load unpacked)

事前準備:
1. `npm run build` で `dist/` を生成。
2. `chrome://extensions` → developer mode → load unpacked → このディレクトリを指定。
3. DevTools の Application > Storage > Extension storage で `chrome.storage.local` を直接編集できる。
4. 検証用シードを書き込むため、Service Worker のコンソールで以下を実行:
   ```js
   const now = new Date();
   const k = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   const usage = {};
   for (let i = 0; i < 35; i++) {
     const d = new Date(now); d.setDate(now.getDate() - i);
     usage[k(d)] = (i % 3 === 0 ? 45 : 10) * 60_000; // 3 日ごとに上限超え
   }
   await chrome.storage.local.set({ usageByDate: usage });
   ```

| #  | シナリオ | 期待結果 |
| -  | -------- | -------- |
| 1  | popup を開く (`dailyLimitMinutes=30`、上記シード適用後) | 「本日の利用時間」「残り時間」が表示され、`#recent-bars` 内に 7 本のバーが並ぶ。3 日おきの超過日が `--ad-color-warn` で塗られている |
| 2  | バーに hover / focus | `aria-label` / `title` に `YYYY-MM-DD: N 分` 形式のラベルが出る (スクリーンリーダー読み上げで確認) |
| 3  | popup の「統計を見る」ボタンを押下 | `src/options.html#stats` を新規タブで開き、stats セクションへスクロールする |
| 4  | options を開く (無料状態 `premium_unlocked=false`, `trial_start_ts=null`) | `#stats` セクションに **7 行** の表が描画される。合計・平均・達成率が出る。`stats_premium_required` の案内が表示される |
| 5  | DevTools から `chrome.storage.local.set({premium_unlocked: true})` | options が再描画され、表が **30 行** に切り替わり、`streak_current` / `streak_best` の 2 メトリクスが追加表示される |
| 6  | `premium_unlocked=false` に戻し、`trial_start_ts: Date.now()` をセット | trial 中のため再び 30 行表示 + streak。`trialDaysLeft` 表示が 7 から減っていく (UI 反映は別タスクで実装予定) |
| 7  | `trial_start_ts: Date.now() - 8 * 86400000` をセット | trial 期限切れで 7 行に戻る (`isPremiumEffective` が false を返す) |
| 8  | popup を開いたまま `chrome.storage.local.set({dailyLimitMinutes: 60})` を別タブから実行 | popup のバー高さが debounce (200ms) 後に再計算され、超過日が減るのが見える |
| 9  | options を開いたまま同上 | 表が debounce (500ms) 後に再描画され、`exceeded` 列の `!` が `✓` に切り替わる行がある |
| 10 | `dailyLimitMinutes=0` をセット | popup のバーは peak ベース表示に切り替わり、達成率は `—`、streak メトリクスは消える (`computeStreak` が `null`) |
| 11 | Service Worker コンソールで `chrome.alarms.create("daily-stats-cleanup", {when: Date.now() + 1000})` で手動 fire | 90 日以内のキーは残ったまま、90 日以前 / 不正キーのみ削除される (`pruneUsage` の挙動) |
| 12 | 不正なキーを意図的に投入 (`chrome.storage.local.set({usageByDate: {"bad-key": 100, "2026-13-01": 200, "2026-05-17": 300}})`) → alarm を手動 fire | 次回 cleanup tick 後に `bad-key` と `2026-13-01` が消え、`2026-05-17` のみ残る |
| 13 | 拡張を無効化 (`enabled=false`) | 計測は止まるが stats 表示はキャッシュ値で継続。「データなし」にはならない |
| 14 | `usageByDate` が空の状態で popup / options を開く | 全行 `0 分` (`stats_no_data` 相当)、合計 0、達成率は上限 > 0 なら 100%、上限 0 なら `—` |
| 15 | `prefers-reduced-motion: reduce` を OS でセットして popup を開く | バーの growth アニメが無効化される (CSS 側で対応) |

## 整合性チェック

- [x] `src/lib/usage-stats.ts` の `lastNDays` / `summarizeUsage` / `pruneUsage` / `formatMinutes` / `computeStreak` が設計と完全一致。
- [x] `summarizeUsage` の `exceeded` 判定は `dailyLimitMinutes > 0 && minutes >= dailyLimitMinutes` で設計通り。
- [x] `pruneUsage` は `today - (retainDays - 1)` を cutoff 下限とし、cutoff 日も保持。
- [x] `pruneUsage` が破損キー (parse 不能) と非有限値を無条件削除。
- [x] `src/lib/premium-status.ts` の `isPremiumEffective` が `premium_unlocked === true` で常に true、trial 7 日以内 (delta < `TRIAL_DAYS * DAY_MS`) で true、それ以外 false。
- [x] `_locales/ja` と `_locales/en` の双方に新規キー (`stats_recent_7d` / `stats_recent_30d` / `stats_hours_minutes` / `stats_total` / `stats_average` / `stats_achievement_rate` / `stats_streak_current` / `stats_streak_best` / `stats_no_data` / `stats_limit_note` / `stats_premium_required`) が存在。
- [x] `src/popup.ts` の `renderRecentBars` が `lastNDays(now, 7)` と `summarizeUsage` を使用し、`textContent` ベースで DOM を組み立てている (innerHTML 不使用)。
- [x] `src/options.ts` の `STATS_FREE_DAYS = 7` / `STATS_PREMIUM_DAYS = 30` が設計と一致。
- [x] `src/options.ts` が `isPremiumEffective` を `./lib/premium-status` から import し、Premium ゲートを集約。
- [x] `src/background.ts` の `DAILY_STATS_CLEANUP_ALARM = "daily-stats-cleanup"` は `TIME_LIMIT_ALARM` / `DAILY_RESET_ALARM` と衝突しない。
- [x] `onInstalled` / `onStartup` の双方で `scheduleStatsCleanup()` と `runCleanupIfNeeded()` が呼ばれる。
- [x] `runStatsCleanup` は変更がない場合 `setValues` を呼ばない (writes 抑制)。
- [x] `chrome.storage.onChanged` の `local` 購読で `usageByDate` / `dailyLimitMinutes` / `premium_unlocked` / `trial_start_ts` の外部更新を popup / options が反映 (debounce 200ms / 500ms)。

## 既知の制限・後続課題

- **ホスト別内訳なし**: 設計通り。`usageByDate` は合計値のみで、`time-limit` 側のストレージ拡張を伴う `daily-stats-per-host` イテレーションに先送り。
- **過去の上限値を保存していない**: `dailyLimitMinutes` を変更すると、過去日の `exceeded` 判定も新しい上限で塗り直される。表に「上限は現在値で評価」の注釈 (`stats_limit_note`) を出して明示。
- **trial 期限の表示なし**: `trialDaysLeft` を呼び出して残日数を popup / options に出す UI は T031 (premium.ts) で本実装予定。本タスクではゲート判定のみ提供。
- **CSV / クリップボードエクスポート未実装**: 個人情報非収集の方針に従い、UI からの出力は画面表示のみ。Premium でも同方針。後続課題として「画面コピーで OK」と明示しつつ、需要があれば改めて検討。
- **`chrome.alarms` の最短周期**: Manifest V3 で `periodInMinutes < 1` は dev 版以外で警告。`daily-stats-cleanup` は `60 * 24` のため問題なし。
- **タイムゾーン変更耐性**: ローカル日付キーを使う設計上、OS のタイムゾーン変更後は新 TZ で集計が継続される。過去キーは旧 TZ のまま表示されるが、補正はしない (キー名どおりに並べる)。
- **lint (`npm run lint`)**: 先行する型エラー (`src/storage.ts`, `vite.config.ts` の `__dirname` / `node:path`) が残存。本タスク範囲外で T034 にて対応。
