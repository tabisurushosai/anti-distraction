# Test: time-limit (T021)

## 自動テスト
`npm test` で実行される。

### `tests/time-tracker.test.mjs`
`src/lib/time-tracker.ts` の純関数を網羅 (33 ケース):

- `emptySession` / `startSession` — 初期形状
- `isSameHost` — 同一・不一致・null 入力
- `advanceSession`
  - null host / 欠落 lastTickAt → delta 0
  - 通常加算 / 連続 tick の累積
  - 長時間ギャップを `maxDeltaMs` (既定 5 分) で clamp する (suspend/resume 対策)
  - カスタム `maxDeltaMs` 引数の尊重
  - 時刻巻き戻し / 0 経過 / 非有限値 → delta 0 で lastTickAt のみ更新
- `evaluateBlock`
  - `enabled=false` で常に null
  - `dailyLimitMinutes=0` / `sessionLimitMinutes=0` でそのチェックを無効化
  - 上限ちょうど (`>=`) で発火、1ms 不足では発火しない
  - 両方上限到達時は daily が優先
- `extractHostFromUrl`
  - undefined / 空 / 不正 URL → null
  - http/https のみ採用、`chrome:`, `about:`, `file:`, `ftp:` は null
- `IDLE_RESET_THRESHOLD_SECONDS` が設計値 (30 秒) と一致

> background.ts は `chrome.*` API に強く依存するためユニットテスト対象外。判定ロジックを `time-tracker.ts` に寄せ、background.ts は薄い orchestration として手動チェックでカバーする方針。

## 手動チェック (Chrome に load unpacked)

事前準備:
1. `npm run build` で `dist/` を生成。
2. `chrome://extensions` → developer mode → load unpacked → このディレクトリを指定。
3. DevTools の Application > Storage > Extension storage で `chrome.storage.local` を直接編集できる。

| #  | シナリオ | 期待結果 |
| -  | -------- | -------- |
| 1  | 既定値 (`dailyLimitMinutes=30`, `sessionLimitMinutes=10`) で `youtube.com` を開き 15 秒待つ | `usageByDate[today]` が 15 秒前後増加 (15 秒粒度の alarm tick) |
| 2  | `dailyLimitMinutes=1` に変更し YouTube を 1 分以上滞在 | オーバーレイが reason=`daily` で表示される。`明日 0:00 まで` の文言が出る |
| 3  | `dailyLimitMinutes=0`, `sessionLimitMinutes=1` で YouTube を 1 分連続滞在 | オーバーレイが reason=`session` で表示される |
| 4  | セッション計測中に `twitter.com` (対象) へ切替 → 戻る | セッションカウンタがリセットされる (累積は変わるが session=0 から再カウント) |
| 5  | YouTube タブを開いたまま別の非対象タブ (`example.com`) を **アクティブ**にして放置 | 加算が止まる (`usageByDate[today]` が増えない) |
| 6  | YouTube タブをアクティブにしたまま、Chrome ウィンドウからフォーカスを外す (別アプリへ alt-tab) | `windows.onFocusChanged(WINDOW_ID_NONE)` で計測停止 |
| 7  | アイドル: 30 秒以上操作しない | `idle.onStateChanged` で計測停止、セッションもリセット |
| 8  | 復帰後 (`active`) に再びアクティブ操作 | 加算再開 (次の alarm tick で開始、最大 15 秒の遅れあり) |
| 9  | `enabled=false` に切替 | 進行中の計測停止、オーバーレイ表示中ならば消える (`unblock` が送られる) |
| 10 | ブロック中に該当ホストを `sites[]` から外す | `evaluateAndBlock` 再評価でオーバーレイが消える |
| 11 | 非対象サイト (`example.com`) を開く | content script は manifest matches 外なので注入されず、オーバーレイも一切出ない |
| 12 | ブロック中の「30秒だけ続ける」ボタン | disabled で操作不可 (T029 unblock-cooldown で実装予定) |
| 13 | overlay 表示中に Tab/Shift+Tab でフォーカス移動 | ボタンへ初期フォーカス。`role="dialog"` `aria-modal="true"` が SR にも提示される |
| 14 | ESC キー押下 | オーバーレイは閉じない (設計通り) |
| 15 | 日付が変わる前後 (`Date` を進めるか深夜またぎ) | 当日キーが切り替わり、新しい日は 0 から再カウント |

## 整合性チェック

- [x] `background.ts` の `alarm name` は `TIME_LIMIT_ALARM = "time-limit-tick"` / `DAILY_RESET_ALARM = "daily-reset"` で重複なし。
- [x] `chrome.alarms.create(TIME_LIMIT_ALARM, { periodInMinutes: 0.25 })` = 15 秒粒度 (Chrome 120+ の 30 秒最小制限の半分以下だが、`addUsageMs` 側で `Date.now()` 差分で精度を担保)。
- [x] manifest.json の `permissions` に `tabs`, `alarms`, `idle`, `storage` がすべて宣言済み。
- [x] `evaluateBlock` の上限比較は `>=` (設計4 と一致)。
- [x] `advanceSession` の `maxDeltaMs` (5 分) でスリープ復帰時の累積暴走を防止。
- [x] content.ts は `window.top !== window` で iframe を弾く (tab-gray と共通)。
- [x] content.ts の `installMessageListener` は `chrome.runtime.onMessage` を購読し、`ad/time-limit/block` / `unblock` のみ反応。型ガード `isIncomingMessage` あり。
- [x] background → content の `sendToTab` は reject を try/catch で握り潰す (受信側未準備に対するフェイルセーフ)。
- [x] `addUsageMs` は ms <= 0 や非有限値で no-op (storage 汚染防止)。
- [x] `usageByDate` は日付キーで分離されており、日付またぎは `todayKey(new Date())` が自動で切替える。

## 既知の制限・後続課題

- **service_worker 再起動と session 状態**: `tracker.session` は SW のメモリ上のみに保持され、SW 休止で消える。設計通り「SW 終了 = 新セッション扱い」だが、ユーザー視点では「短時間離れた後にセッションがリセットされた」と感じる場合がある。
- **`tracker.lastBlockTabId`**: 書き込まれるが現状未参照のデッドステート。T028 (unblock-cooldown) で利用予定 — それまでは informational。
- **`tabs.onUpdated` リスナの冗長条件**: `if (tabId !== tracker.activeTabId && !tab.active) return;` は直前の `!tab.active` チェックにより常に false。動作上の害はないが T028 以降のリファクタで削除予定。
- **idle 復帰時の即時再評価なし**: `idle.onStateChanged` の `active` 復帰では `evaluateAndBlock` を呼ばない。次の alarm tick (最大 15 秒) で反映される。許容範囲だが、UX を重視するなら同期発火を検討。
- **alarm 粒度**: 15 秒以下の精密計測は不可。`Date.now()` 差分で実時間は正確だが、上限超過判定は最大 15 秒遅れる。設計上は十分。
- **lint**: `npm run lint` は本タスク範囲外で先行する型エラー (storage.ts:159, vite.config.ts) があり未通過。T034 で対応予定。
