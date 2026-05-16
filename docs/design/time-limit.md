# Design: time-limit

## 目的
対象サイト（`sites[]`）への滞在時間を計測し、1日の累計（`dailyLimitMinutes`）または 1セッションの連続滞在（`sessionLimitMinutes`）が上限を超えたら、ページ全体をブロック用オーバーレイで覆ってアクセスを抑制する。`tab-gray` の常時グレー化に対し、本機能は「上限超過時のみ作動する強い抑止」のレイヤー。

## 関連ストレージキー (`src/storage.ts`)
| key | 型 | 役割 |
| --- | --- | --- |
| `enabled` | boolean | 機能全体の ON/OFF（false なら計測もブロックもしない） |
| `sites` | string[] | 対象ホスト配列（`tab-gray` と共通） |
| `dailyLimitMinutes` | number | 1日累計の上限（分）。0 = 無効 |
| `sessionLimitMinutes` | number | 1セッション（連続滞在）の上限（分）。0 = 無効 |
| `usageByDate` | `Record<"YYYY-MM-DD", number>` | 日付ごとの累計滞在ミリ秒。`storage.addUsageMs` で加算 |
| `cooldownSeconds` | number | `unblock-cooldown` 用。本機能では「ブロック解除後の一時許可時間」として参照 |

> 追加で必要なら `lastUnblockAt: number | null`（解除時刻）を後続イテレーション（T028 unblock-cooldown）で導入する。本タスクの範囲ではブロック判定までを設計する。

## 動作モデル

### 1. アクティブタブ判定
- 計測対象は「ユーザーが現在見ているタブ」だけ。バックグラウンドで開いているだけのタブはカウントしない。
- 判定は `service_worker (background.ts)` 側で次のイベントを購読：
  - `chrome.tabs.onActivated` … タブ切替
  - `chrome.windows.onFocusChanged` … ウィンドウ切替（`WINDOW_ID_NONE` のときは「フォーカスなし」＝計測停止）
  - `chrome.tabs.onUpdated` (status === "complete" など) … URL 変化
  - `chrome.idle.onStateChanged` … `idle` / `locked` のとき停止、`active` で再開
- これらから「現在アクティブな対象サイトのホスト」を 1つだけ保持する（無ければ `null`）。

### 2. 計測ループ
- service_worker は短命なので、長時間 `setInterval` は禁止。
- 代わりに `chrome.alarms.create("time-limit-tick", { periodInMinutes: 1/60 })`（= 約1秒）を使う。
  - 注: Chrome 120+ で `periodInMinutes` の最小値は 0.5 分（30秒）。仕様変更に追従するため、本機能では **15秒粒度** を採用：`periodInMinutes: 0.25`。
  - 細かい計測が必要な場合は alarm のたびに「前回 alarm 時刻との差分」を `Date.now()` で算出し、その差分を `addUsageMs` する（粒度より精度を取る）。
- 各 tick で：
  1. 現在のアクティブ対象ホストを再確認（不在なら何もせず終了）。
  2. `now - lastTickAt` を当日分の `usageByDate[today]` に加算（`addUsageMs`）。
  3. 同時に「セッション累計」を service_worker の変数に加算（永続化不要、SW 終了で 0 にリセット＝新セッション扱い）。
  4. 上限判定 → 超過なら該当タブにブロック指示を送る。
- SW が休止しても問題ない設計：alarm が再起動してくれる。

### 3. セッションの定義
- 「同一の対象ホストが連続してアクティブだった時間」をセッションとする。
- 別ホストへ切替・別タブへ切替・ウィンドウ非フォーカス・idle 30秒以上 のいずれかで **セッション終了**（カウンタ 0 リセット）。
- 同じホスト内の SPA 遷移（pushState）は同一セッション扱い。

### 4. 上限判定
ブロック条件は次のいずれか：
- `dailyLimitMinutes > 0` かつ `usageByDate[today] >= dailyLimitMinutes * 60_000`
- `sessionLimitMinutes > 0` かつ `セッション累計 >= sessionLimitMinutes * 60_000`

### 5. ブロック表示（content script 側）
- `src/content.ts`（既存の tab-gray と同居）で受け口を実装、または `src/overlay.ts` に分離。
- background から `chrome.tabs.sendMessage(tabId, { type: "ad/time-limit/block", reason: "daily"|"session" })` を受信したら：
  - `<html>` 直下に `<div id="anti-distraction-overlay">` を注入。
  - `position: fixed; inset: 0; z-index: 2147483647;`、半透明黒背景、中央に：
    - メッセージ（i18n: `overlay_blocked_title`, `overlay_blocked_reason_daily` / `_session`）
    - 残り時間（日次は「明日 0:00 まで」、セッションは「タブを閉じてください」）
    - 「30秒だけ続ける」ボタン（`unblock-cooldown` で扱う、本タスクでは UI だけ用意して disabled でも可）
  - `aria-modal="true"` `role="dialog"`、フォーカス管理。
  - すでにオーバーレイが存在する場合は二重注入しない。
- ブロック解除条件（再評価で `block` ではなくなった場合）は `{ type: "ad/time-limit/unblock" }` を受け、オーバーレイ要素を remove。

### 6. メッセージング設計
- background → content（タブ単位）：
  - `{ type: "ad/time-limit/block", reason }`
  - `{ type: "ad/time-limit/unblock" }`
- content → background（ユーザー操作）：
  - `{ type: "ad/time-limit/request-unblock" }` （cooldown 機能、T029 で実装）

### 7. データ整合性
- 日付またぎ: `addUsageMs` は呼び出し時の `Date` から `YYYY-MM-DD` を生成し、`usageByDate` の該当キーに加算する。日付が変わると自動で新キーへ。
- 日次リセットは不要（古いキーは残るが `daily-stats` で表示用に整形、`usageByDate` の肥大化は cleanup タスクで対応：T026 以降）。
- 設定変更（`dailyLimitMinutes` を下げた等）は次の alarm tick で自然に反映される。

### 8. 失敗時の挙動
- `chrome.storage` 取得失敗 → そのまま「ブロックしない」側に倒す（ユーザー操作を妨げない）。
- `tabs.sendMessage` がレシーバ不在で reject → catch して握り潰し（コンソールにのみログ）。
- content script ロード前に block メッセージを送ってしまった場合は、content 側が `document_idle` で初期化後に `chrome.storage` を確認してから自己判断で overlay を出す（フェイルセーフ）。

## ファイル分割
- `src/background.ts` …… アクティブタブ追跡 + alarm tick + ブロック判定。
- `src/lib/time-tracker.ts` …… セッション累計などの純関数（テスト容易性のため切り出す）。
- `src/content.ts` …… 既存 tab-gray と同居でメッセージリスナを追加するか、`src/overlay.ts` に分離。
- `src/lib/host-match.ts` …… 既存のものを background でも import 可能にする（既に export 済み）。

## tab-gray との関係
- 独立して動作する：tab-gray は `<html>` の `filter` 属性ベース、time-limit は最前面 div を被せる方式。
- 視覚的優先順位: overlay > grayscale。overlay が出ているときも背景はグレーのままで構わない。

## アクセシビリティ
- overlay は `role="dialog" aria-modal="true"` で SR にも提示。
- ESC キーでは閉じない（無視）。閉じるのは cooldown ボタン経由のみ。
- 配色は十分なコントラスト比（WCAG AA 4.5:1 以上）を維持。
- `prefers-reduced-motion: reduce` で overlay のフェードを 0ms に。

## Premium との関係
- 無料: 既定（`dailyLimitMinutes` / `sessionLimitMinutes` のいずれか or 両方が使える）。
- Premium: 詳細統計表示 / 日次・セッションの個別カスタマイズ拡張など（T032 でゲート）。
- 本機能のコア（計測・ブロック）は無料側に置く。

## テスト観点（T021 で確認）
1. 対象サイトをアクティブにしていると `usageByDate[today]` が単調増加すること。
2. 別タブ／別ウィンドウ／idle 状態では加算が止まること。
3. `dailyLimitMinutes` を 1 にしたら 1分後に overlay が出ること。
4. `sessionLimitMinutes` を 1 にしたら同一サイトを 1分連続滞在で overlay が出ること、別サイトへ移動するとセッションリセットされること。
5. `enabled = false` で計測もブロックも止まること。
6. ブロック中に該当ホストを `sites[]` から外すと overlay が消えること。
7. 日付が変わると当日分カウンタが 0 から再スタートすること（手動で `Date` を操作可能な純関数のテストで担保）。
8. 非対象サイトでは一切 overlay が表示されないこと。
