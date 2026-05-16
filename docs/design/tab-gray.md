# Design: tab-gray

## 目的
ユーザーが SNS / YouTube などの「気を散らすサイト」を開いた際、ページ全体を視覚的に減衰（グレー化）させ、滞在意欲を下げる。クリックや操作はブロックせず、視覚的なナッジに留める。

## 関連ストレージキー (`src/storage.ts`)
| key | 型 | 役割 |
| --- | --- | --- |
| `enabled` | boolean | 機能全体の ON/OFF |
| `sites` | string[] | 対象ホスト（正規化済み）の配列 |
| `grayIntensity` | number (0–100) | グレー化の強さ。0=無効、100=完全グレー相当 |

## 動作モデル

### 1. ホスト判定
- `manifest.json#content_scripts.matches` で対象ホストを限定（既に既定6サイトが列挙済み）。
- ただし `sites` はユーザーが編集できるため、最終判定は content script 内で `location.hostname` と `sites[]` の "suffix match" で行う。
  - 例: `sites = ["youtube.com"]` のとき `m.youtube.com` も対象。
  - 正規化規則: 小文字化 / 先頭の `www.` 除去 / 末尾ドット除去（`storage.ts` 側の正規化と一致）。
- 対象でなければ何もせず終了（早期 return）。

### 2. グレー化の適用
- ルート要素に `filter: grayscale(N%) brightness(M%)` を適用する。
  - `N = grayIntensity` (0–100)
  - `M = 100 - grayIntensity * 0.3`（強くするほどわずかに暗く）
- 実装は `<html>` に `data-anti-distraction="active"` 属性を付け、注入した `<style id="anti-distraction-style">` で：
  ```css
  html[data-anti-distraction="active"] {
    filter: grayscale(var(--ad-gray, 80%)) brightness(var(--ad-bright, 76%));
    transition: filter 200ms ease-out;
  }
  ```
- CSS 変数 `--ad-gray` / `--ad-bright` をインラインで上書きすることで強度を動的に変更できる。
- `prefers-reduced-motion: reduce` が指定されている場合は `transition` を 0 にするフォールバックを `@media` で用意する。

### 3. 適用条件
適用するのは以下すべてを満たすとき:
1. `enabled === true`
2. ホストが `sites[]` にマッチ
3. `grayIntensity > 0`

それ以外は `data-anti-distraction` 属性を外し、`filter` 効果を解除する。

### 4. 状態変化への追従
- content script は読み込み時に `chrome.storage.local.get` で初期状態を取得し適用。
- `chrome.storage.onChanged` を購読し、`enabled` / `sites` / `grayIntensity` のいずれかが変化したら再評価。
- `pagehide` / `unload` での明示的クリーンアップは不要（タブが破棄されればスタイルも破棄される）。

### 5. iframe 対応
- まずはトップフレームのみ。`window.top !== window` の場合は早期 return。
- iframe（YouTube 埋め込み等）の対応は後続イテレーションで再検討。

### 6. SPA / late-mount への耐性
- `<html>` への属性付与方式なので、SPA の遷移によって DOM が差し替えられても `<html>` 自体は残るため副作用なし。
- `document_idle` で動作するため初期適用は十分早い。FOUC を許容（ユーザーは "なるべく早くグレー" を求めているわけではなく "視覚的な減衰" が目的のため）。

## time-limit との連携
- `time-limit` 側で「上限超過」状態になったら storage に `over_limit: boolean` または `usageByDate[today] >= dailyLimitMinutes` 状態を起点に、別の content script (overlay) でブロックする想定。
- tab-gray はあくまで「常時の視覚的減衰」レイヤーであり、上限超過時の全面オーバーレイとは独立して動作する（z-order 的にも干渉しない）。

## ファイル分割
- `src/content.ts` …… エントリ。グレー化のロジックをまとめて呼び出す（T017 で実装）。
- 必要に応じて `src/lib/host-match.ts` にホスト一致判定だけ切り出し可能（storage.ts の正規化と共有）。

## 失敗時の挙動
- chrome.storage 取得失敗 → 何もしない（grayIntensity の DEFAULT=80 のままだが、フィルタ未適用で安全側に倒す）。
- 例外発生 → try/catch でログだけ出して握り潰す（ユーザー操作を妨げない）。

## アクセシビリティ
- `filter` は視覚効果のみで `aria-*` / セマンティクスを変更しない。
- スクリーンリーダー利用者には影響しない（音声出力には影響しない）。
- ハイコントラストモード使用者向けに `grayIntensity = 0` で完全無効化可能。

## テスト観点（T018 で確認）
1. 対象サイトを開くと `<html>` に `data-anti-distraction="active"` が付くこと。
2. `enabled = false` で外れること。
3. `sites` から該当ホストを除外すると外れること。
4. `grayIntensity = 0` で外れること。
5. `grayIntensity` を動的変更すると即反映されること（リロード不要）。
6. 非対象サイトでは一切何も注入されないこと。
