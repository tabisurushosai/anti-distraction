# Design: unblock-cooldown

## 目的
`time-limit` がオーバーレイで対象サイトをブロックしている状態で、ユーザーが
**「N 秒だけ続ける」ボタン** を押した際の一時解除（猶予継続）フローを定義する。
無条件解除ではなく、

- 1 回の解除は短時間（既定 30 秒、`cooldownSeconds`）に限定し、終わったら即再ブロック
- 1 日あたりの解除回数に上限を設け（無料 3 回 / Premium 10 回）、上限到達後は disabled
- ユーザーの「あと少しだけ」という現実的な要求にこたえつつ、解除を儀式化して
  逃げ道として濫用されないようにする

の 3 点で「優しいけれど甘くない」抑止層を提供する。本機能は `time-limit` の延長で
あり、`time-limit` 単体では overlay 上の「N 秒だけ続ける」ボタンは disabled の
プレースホルダになっている（T020 実装）。本設計でそれを **活性化** し、解除フロー
を完成させる。

## スコープ
- 含む: 一時解除の要求 → 承認 → 残時間カウントダウン → 自動再ブロック、回数制限、
  Premium ゲート、`unblockCountByDate` の TTL 削除、popup の「クールダウン中」表示、
  options 画面での回数上限 UI。
- 含まない:
  - 「サイトを永久解除」「特定サイトだけ解除」（要件外。本機能は時間ベース）。
  - パスコード / 親モード（後続イテレーション候補。本タスクでは未着手）。
  - ブロック判定そのものの変更（`evaluateBlock` のシグネチャは不変）。

## 関連ストレージキー (`src/storage.ts`)
| key | 型 | 役割 | 状態 |
| --- | --- | --- | --- |
| `cooldownSeconds` | number | 1 回の一時解除で許可する秒数。既定 30、最低 5、最大 300 | 既存 |
| `lastUnblockAt` | number \| null | 直近の解除を承認した epoch ms。SW 再起動後も継続判定に使う | **新規** |
| `unblockCountByDate` | `Record<"YYYY-MM-DD", number>` | 日付ごとの解除回数 | **新規** |
| `unblockMaxPerDayFree` | number | 無料時の上限。既定 3 | **新規（定数で可、storage に置く必要は無いがリセットで戻すために配置）** |
| `unblockMaxPerDayPremium` | number | Premium 時の上限。既定 10 | **新規（同上）** |
| `premium_unlocked` / `trial_start_ts` | — | Premium 判定（既存） | 既存 |

> 上限値は将来的に options から変えられるようにするため、定数ではなく storage に
> 置く方針（既存 `cooldownSeconds` と同じ立場）。`DEFAULTS` に追加すること。

### 既存 vs 新規の整理
- 既存 `cooldownSeconds` は T015 時点から「解除待機時間」として宣言済み（既定 30）。
  本タスクではこの値を「1 回の解除許可時間（秒）」として確定させる（待機時間では
  なく **猶予時間**。用語のブレを i18n 説明文ごと修正）。
- `lastUnblockAt` は T019 設計で「後続で導入する」と予告されていたキー。本タスクで
  正式に追加する。

## 動作モデル

### 1. 状態機械
```
[BLOCKED] --request-unblock--> [COOLDOWN_ACTIVE]   (回数上限内 / Premium 判定 OK)
[BLOCKED] --request-unblock--> [BLOCKED] (回数上限超過。content に denied 通知)
[COOLDOWN_ACTIVE] --N 秒経過--> [BLOCKED] (background が再 evaluate して block 送信)
[COOLDOWN_ACTIVE] --ホスト切替--> [UNBLOCKED] (別ホストへ移動。session も自動リセット)
[UNBLOCKED] --上限再到達--> [BLOCKED]
```

`COOLDOWN_ACTIVE` は次のいずれかの条件で終了：
- `now - lastUnblockAt >= cooldownSeconds * 1000`（時間切れ）
- ユーザーがタブを閉じた / 別ホストへ移動した（session 終了）
- `enabled = false` に切り替えた
- `sites[]` から該当ホストを外した
- `dailyLimitMinutes` / `sessionLimitMinutes` を 0 にした（= 上限解除）

### 2. メッセージング
- content → background:
  - `{ type: "ad/time-limit/request-unblock" }`
  - background は要求を評価して以下のいずれかを返信（`sendResponse`）：
    - `{ ok: true, untilMs: <epoch ms> }` → 解除承認
    - `{ ok: false, reason: "rate-limit"|"disabled"|"premium-required"|"not-blocked" }`
      → 拒否。`reason` ごとに content 側で別文言を出す
- background → content（タブ単位 `chrome.tabs.sendMessage`）:
  - 既存: `{ type: "ad/time-limit/block", reason }`
  - 既存: `{ type: "ad/time-limit/unblock" }` (overlay 消去)
  - **新規: `{ type: "ad/time-limit/cooldown-active", untilMs }`**（残り秒数の同期）
  - **新規: `{ type: "ad/time-limit/cooldown-denied", reason }`**（content から要求した
    結果が NG だった場合の補足通知。`sendResponse` で済むなら省略可だが、popup 側にも
    通知する必要があるため `chrome.runtime.sendMessage` でブロードキャスト）

### 3. background のフロー（`onRequestUnblock`）
```ts
async function onRequestUnblock(senderTabId: number): Promise<UnblockResponse> {
  const cfg = await getValues([
    "enabled","sites","cooldownSeconds",
    "dailyLimitMinutes","sessionLimitMinutes","usageByDate",
    "lastUnblockAt","unblockCountByDate",
    "unblockMaxPerDayFree","unblockMaxPerDayPremium",
    "premium_unlocked","trial_start_ts",
  ] as const);

  // 1. 拡張が無効 / 対象外なら否決
  if (!cfg.enabled) return { ok:false, reason:"disabled" };
  if (tracker.activeHost === null) return { ok:false, reason:"not-blocked" };
  if (!hostMatches(tracker.activeHost, cfg.sites)) {
    return { ok:false, reason:"not-blocked" };
  }

  // 2. 実際にブロック状態かを再確認
  const reason = evaluateBlock(cfg, cfg.usageByDate[todayKey()] ?? 0,
                               tracker.session.accumulatedMs);
  if (reason === null) return { ok:false, reason:"not-blocked" };

  // 3. 回数チェック
  const isPremium = isPremiumEffective(cfg, new Date());
  const maxToday = isPremium ? cfg.unblockMaxPerDayPremium
                             : cfg.unblockMaxPerDayFree;
  const key = todayKey();
  const used = cfg.unblockCountByDate[key] ?? 0;
  if (used >= maxToday) {
    return { ok:false, reason:"rate-limit" };
  }

  // 4. 承認: 状態を更新
  const now = Date.now();
  const untilMs = now + cfg.cooldownSeconds * 1000;
  await setValues({
    lastUnblockAt: now,
    unblockCountByDate: { ...cfg.unblockCountByDate, [key]: used + 1 },
  });
  tracker.cooldownUntil = untilMs;            // in-memory ミラー
  await sendToTab(senderTabId, { type:"ad/time-limit/cooldown-active", untilMs });
  return { ok:true, untilMs };
}
```

`tracker` 構造体に **`cooldownUntil: number | null`** を追加して、SW 生存中の判定を
高速化する。SW が落ちて再起動した場合は `lastUnblockAt + cooldownSeconds * 1000` を
読み直して in-memory を再構築する（次節）。

### 4. 再ブロックのタイミング
- `onTick`（`time-limit-tick` alarm）内で `evaluateAndBlock` を呼ぶ前に、
  「cooldown 中か？」を判定して、cooldown 中なら **block メッセージを送らない**。
  ```ts
  function isCooldownActive(now: number, lastUnblockAt: number | null,
                            cooldownSeconds: number): boolean {
    if (lastUnblockAt === null) return false;
    return now - lastUnblockAt < cooldownSeconds * 1000;
  }
  ```
- cooldown 中も `addUsageMs` は通常どおり加算する（=「解除中の滞在も日次累計に
  含まれる」）。これが本機能の本質: 解除しても時間は使い続ける。
- cooldown 終了直後の tick で `evaluateAndBlock` が再度 `evaluateBlock` を呼び、
  まだ上限超過なら overlay 再表示。
- session 上限超過のケースでも `session.accumulatedMs` は cooldown 中も進み続け、
  終了後に再ブロックされる。

### 5. SW 再起動時の復元
- `chrome.runtime.onStartup` / `onInstalled` の初期化処理で：
  ```ts
  const { lastUnblockAt, cooldownSeconds } = await getValues(
    ["lastUnblockAt","cooldownSeconds"] as const);
  if (lastUnblockAt !== null) {
    const untilMs = lastUnblockAt + cooldownSeconds * 1000;
    if (untilMs > Date.now()) tracker.cooldownUntil = untilMs;
  }
  ```
- cooldown 中に SW が落ちた場合: 再起動して tick が呼ばれるまで block も unblock も
  送られないが、overlay 自体は content 側にまだ残っている（前回送信した状態を
  維持）。tick で `isCooldownActive` を見て、true なら何もしない、false なら
  `evaluateAndBlock` 経由で再ブロック。

### 6. content 側 (`src/content.ts`) の変更
現状 disabled になっている「N 秒だけ続ける」ボタンを活性化：
```ts
button.disabled = false;
button.removeAttribute("aria-disabled");
button.addEventListener("click", async () => {
  button.disabled = true; // 二度押し防止
  const res = await chrome.runtime.sendMessage({ type:"ad/time-limit/request-unblock" });
  if (res?.ok) {
    startCountdown(res.untilMs);
  } else {
    showDeniedMessage(res?.reason ?? "rate-limit");
    button.disabled = false; // 再試行可
  }
});
```

カウントダウン UI:
- overlay の card 内に `<p id="ad-cooldown-countdown" aria-live="polite">` を追加。
- `setInterval(250ms)` で残秒数を再計算して textContent に書く。
  - 「残り N 秒」 / `N seconds remaining`（新 i18n キー `cooldown_remaining`、`$SEC$`）
- `untilMs <= Date.now()` になったら自動的に overlay を消す（=「猶予終了。再評価まで
  あと少し」のメッセージを 1 秒だけ表示してから fade out）。
  - **注**: 実際の再ブロックは background の次の tick（最大 15 秒後）に来る。
    UI 上は「すぐ再ブロックされる」と誤解させないため、ボタンを再 disabled にし、
    短いキャプション `cooldown_returning` を表示。
- 既存 overlay と完全に統合: 重複 DOM を作らず、`#anti-distraction-overlay` 内に
  countdown 要素を差し込む。

`request-unblock` の返信が `rate-limit` の場合は overlay の card 内に
`<p class="ad-cooldown-denied">` を追加し、`cooldown_denied_rate_limit` の文言で
理由を提示。`disabled` / `premium-required` の場合も同様に専用文言。

### 7. popup の変更
- 既存の `popup_cooldown_active`（"クールダウン中: $SEC$ 秒"）を活用。
- popup を開いたとき & `chrome.storage.onChanged` で `lastUnblockAt` が変わったとき、
  `cooldownSeconds` と現在時刻から残秒数を再計算してバッジ表示。
- 「一時解除をリクエスト」ボタン（`popup_unblock_request`）も活性化:
  - クリック → `chrome.runtime.sendMessage({ type:"ad/time-limit/request-unblock" })`
  - 成功時はバッジ更新、失敗時は inline で理由テキスト。
- popup から要求した場合の対象タブ判定: `chrome.tabs.query({ active:true, lastFocusedWindow:true })`
  でアクティブタブを取得し、そのタブ ID を `senderTabId` 相当として使う。

### 8. options 画面の変更
- 既存 `options_section_cooldown` セクション内に：
  - 既存: `cooldownSeconds` 入力欄（既に T014 で実装済み）。最低 5、最大 300 を明示。
  - **追加**: 今日の使用回数 `M / N`（M=`unblockCountByDate[today]`、N=日次上限）を
    `<p aria-live="polite">` で表示。
  - **追加**: `<details>` で 1 行注釈「N 秒経過後に自動で再ブロックされます。1 日
    あたり最大 N 回までです（Premium で N 回に増加）」（新 i18n: `options_cooldown_note`）。
- 数値検証: 5 <= cooldownSeconds <= 300。範囲外は保存前にクランプ。

### 9. TTL とクリーンアップ
- `unblockCountByDate` も `usageByDate` 同様に永久蓄積するので、`daily-stats-cleanup`
  alarm（既存）の `runStatsCleanup` を拡張して **両方の `Record<date,number>` を
  prune** する：
  ```ts
  await setValues({
    usageByDate: pruneUsage(usage, today, STATS_RETAIN_DAYS),
    unblockCountByDate: pruneUsage(unblockCountByDate, today, STATS_RETAIN_DAYS),
  });
  ```
- `pruneUsage` は `usage-stats.ts` の純関数で、日付キー以外を捨てる仕様なので
  そのまま流用可能。

### 10. 失敗時の挙動
- background の `request-unblock` ハンドラで `chrome.storage.local.get/set` が throw
  → `{ ok:false, reason:"storage-error" }` を返す。content は denied 表示。
- content からのメッセージが background に届く前に SW が起動中 → `sendMessage` は
  自動で待ってくれる。タイムアウト発生時は content 側で 5 秒タイムアウトを設けて
  「もう一度押してください」と表示。
- 重複承認（同一タブで 2 回連打）→ in-memory `tracker.cooldownUntil > now` なら
  既存の `untilMs` を返すだけで、回数を増やさない（idempotent）。
- 別タブで同時に request → in-memory ロック（boolean）で逐次化。1 回ぶんしか
  カウントしない。

## Premium ゲート
- 無料: 1 日 **3 回** までの解除。`cooldownSeconds` は 30 秒固定（変更しても 30 にクランプ）。
- Premium: 1 日 **10 回**。`cooldownSeconds` は 5〜300 秒で自由に設定可。
- 上記の判定は `isPremiumEffective(state, now)` を使用（T026 で実装済み、`src/lib/premium-status.ts`）。
- Premium 解放後は即座に options UI の上限値表示も切替（`chrome.storage.onChanged`
  で `premium_unlocked` を監視）。
- お試し期間（`trial_start_ts` から 7 日以内）も Premium 相当の上限を適用。

## アクセシビリティ
- 「N 秒だけ続ける」ボタンは `<button>` のままで、`aria-describedby` で
  `#ad-cooldown-countdown` を紐付ける。
- カウントダウン要素は `aria-live="polite"`、`aria-atomic="true"`。スクリーン
  リーダーで毎秒の更新が煩いので、**3 秒に 1 回だけ aria-live 経由で読ませる**
  ようにし、視覚側は 250ms 毎で更新。具体的には `aria-label` を 3 秒毎に書き換え、
  視覚 textContent は `setInterval(250)` で書き換える。
- 拒否メッセージは `role="alert"`（割り込みで読ませる）。
- 配色は WCAG AA 4.5:1 以上を維持。残時間表示の色は overlay 背景（暗）に対して
  `#fff` 系で固定。
- `prefers-reduced-motion: reduce` でフェード／カウントダウン進捗バーをすべて
  即時切替に。

## i18n（新規追加するキー）
| key | ja | en |
| --- | --- | --- |
| `cooldown_remaining` | `残り $SEC$ 秒` | `$SEC$s remaining` |
| `cooldown_returning` | `まもなく再ブロックされます` | `Re-blocking shortly` |
| `cooldown_denied_rate_limit` | `本日の解除回数を使い切りました` | `Daily unblock limit reached` |
| `cooldown_denied_disabled` | `拡張が無効化されています` | `Extension is disabled` |
| `cooldown_denied_not_blocked` | `現在ブロック中ではありません` | `Not currently blocked` |
| `cooldown_denied_premium_required` | `Premium が必要です` | `Premium required` |
| `cooldown_denied_storage` | `保存に失敗しました` | `Failed to save state` |
| `options_cooldown_note` | `$SEC$ 秒経過後に自動で再ブロックされます。1 日あたり最大 $N$ 回まで（Premium で $P$ 回）。` | `Auto re-blocks after $SEC$s. Up to $N$ per day (Premium: $P$).` |
| `options_cooldown_used_today` | `本日の使用回数: $USED$ / $MAX$` | `Used today: $USED$ / $MAX$` |

> `cooldownSeconds` 入力欄の既存 label `options_cooldown_seconds` は変更不要。
> 既存 `popup_cooldown_active` / `popup_unblock_request` をそのまま活用。

## ファイル分割
- `src/background.ts`
  - `tracker.cooldownUntil: number | null` 追加。
  - `onRequestUnblock(tabId): Promise<UnblockResponse>` 追加。
  - `chrome.runtime.onMessage` リスナで `ad/time-limit/request-unblock` を受ける。
  - `evaluateAndBlock` を「`isCooldownActive` なら block も unblock も送らない」に
    分岐拡張。
  - `runStatsCleanup` に `unblockCountByDate` の prune を追加。
- `src/lib/cooldown.ts` ……（新規）純関数 `isCooldownActive`、`remainingSeconds`、
  `canUnblock(state, today, isPremium): { ok, reason? }`、`recordUnblock(state, now)`
  などをまとめる。テスト対象。
- `src/lib/premium-status.ts` …… 既存。`isPremiumEffective` を background / popup /
  options から参照。
- `src/content.ts` …… overlay 内ボタンを活性化、カウントダウン UI、`request-unblock`
  送信、`cooldown-active` 受信処理を追加。
- `src/popup.ts` …… 「一時解除をリクエスト」ボタンを活性化、`popup_cooldown_active`
  バッジの定期更新。
- `src/popup.html` …… 既存の `#unblock-button` をそのまま使う（属性追加なし）。
- `src/options.ts` / `options.html` …… cooldown セクションに「使用回数」と注釈を追加。
- `src/storage.ts` …… `StorageSchema` に `lastUnblockAt`、`unblockCountByDate`、
  `unblockMaxPerDayFree`、`unblockMaxPerDayPremium` を追加。`DEFAULTS` も更新
  （既定値: `null`, `{}`, `3`, `10`）。`VALIDATORS` も対応。
- `_locales/ja/messages.json`, `_locales/en/messages.json` …… 上記 i18n キー追加。

## tab-gray / time-limit / daily-stats との関係
- `tab-gray`: 影響なし。cooldown 中もグレースケールは適用されたまま（オーバーレイが
  外れた裏側で grayscale が見える）。
- `time-limit`: cooldown 中は overlay を送らない & 計測は継続。`evaluateBlock` 自体は
  不変。
- `daily-stats`: 表示は `usageByDate` を見るだけなので影響なし。`unblockCountByDate`
  は **本機能の内部状態として保持** するだけで、daily-stats の表示には現状含めない
  （後続イテレーション候補: 「今日の解除回数」を popup/options に出すのは本タスクで
  実装、stats 履歴には出さない）。

## テスト観点（T030 で確認）
1. `isCooldownActive(now, lastUnblockAt, cooldownSeconds)` の真偽境界:
   - `lastUnblockAt === null` で false。
   - `now - lastUnblockAt < cooldownSeconds*1000` で true。
   - 境界値 `===` で false（解除直後の `cooldownSeconds*1000` ms 経過で再ブロック）。
2. `canUnblock` が日次上限到達時 `{ ok:false, reason:"rate-limit" }` を返す。
3. `canUnblock` が Premium 状態で上限値が切り替わる。
4. `recordUnblock(state, now)` が `lastUnblockAt` を更新し、`unblockCountByDate[today]`
   を 1 増やす。
5. 同日中 3 回（無料）の解除が成功し、4 回目は denied になる。
6. 日付が変わるとカウンタがリセットされる（純関数で `today` を切替えて確認）。
7. cooldown 中に `evaluateBlock` が daily 超過で true でも、block メッセージが
   送られない（background のフロー単体テスト or 手動チェック）。
8. cooldown 終了直後の最初の tick で再ブロックされる（手動チェック）。
9. cooldown 中にホスト変更すると session がリセットされ、cooldownUntil もクリア
   される（手動チェック）。
10. SW 再起動後も `lastUnblockAt` から `cooldownUntil` が復元される（手動チェック）。
11. 重複連打: 同一タブから 2 回連続で request-unblock しても回数は 1 しか増えない
    （idempotent。`tracker.cooldownUntil > now` を見て承認済みなら同じ untilMs を返す）。
12. `pruneUsage` が `unblockCountByDate` でも 90 日以前を削除する（既存 prune を
    そのまま流用するので、`usageByDate` のテストが流用できる）。
13. content 側カウントダウン: `aria-live` が 3 秒に 1 回更新される（DOM テストは
    省略可、手動チェック）。
14. options 画面: 上限到達後に「使用回数: 3 / 3」と表示され、`request-unblock` を
    送ったら直ちに denied 表示が出る（手動チェック）。

## 後続イテレーションの候補（本タスクでは未着手）
- **パスコード保護**: cooldown ボタンを押す前に親が設定したパスコードを要求する。
  子向け運用の現実的なニーズだが、設計と UX が膨らむので別タスク（`parental-mode`）。
- **解除理由ログ**: 「なぜ解除したか」を選択させて記録（教育用途）。
- **時間帯別ロック**: 21:00–翌 7:00 は解除ボタンそのものを隠す。
- **解除中の視覚的注意喚起**: cooldown 中だけページ上部に細い赤帯を出すなど。
- **解除回数を daily-stats に表示**: 「今日 3/3 回使った」を統計画面の指標として
  正式に組み込む（本タスクでは options のみ表示）。
