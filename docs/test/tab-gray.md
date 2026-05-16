# Test: tab-gray (T018)

## 自動テスト
`npm test` で実行される。

### `tests/host-match.test.mjs`
`src/lib/host-match.ts` の `normalizeHost` / `hostMatches` を網羅:
- 大文字小文字非依存
- 末尾ドット除去 / `www.` 除去
- exact match / subdomain suffix match / 深い subdomain
- 非マッチ (`foo-youtube.com`, `myoutube.com` など — `.` 境界が必要)
- 空入力 / 空 sites 配列
- sites 内の空文字列スキップ

## 手動チェック (Chrome に load unpacked)
事前準備:
1. `npm run build` で `dist/` を生成。
2. Chrome の `chrome://extensions` → developer mode → load unpacked → このディレクトリを指定。

| # | シナリオ | 期待結果 |
| - | -------- | -------- |
| 1 | `enabled=true`, `sites` 既定, `grayIntensity=80` で `youtube.com` を開く | `<html data-anti-distraction="active">` が付き、画面がグレー＆やや暗くなる |
| 2 | `m.youtube.com` を開く | サブドメインでもグレー化される (suffix match) |
| 3 | options で `enabled=false` に変更 | ページをリロードしなくても属性が外れて元に戻る |
| 4 | options で `youtube.com` を sites から削除 | 属性が外れる |
| 5 | options で `grayIntensity=0` | 属性が外れ filter 効果なし |
| 6 | `grayIntensity` を 30 → 90 にスライダで動かす | リロード不要で即反映 (CSS 変数のみ更新) |
| 7 | `example.com` (非対象) を開く | content script は manifest matches 外なので一切注入されない |
| 8 | YouTube 内の `<iframe>` (例: 埋め込みプレイヤー) | iframe には適用されない (top frame only — 設計通り) |
| 9 | `prefers-reduced-motion: reduce` を OS で有効化 | `transition` が無効化される (CSS `@media` 分岐) |
| 10 | `chrome.storage` 取得失敗 (DevTools で storage を一時的に壊す) | 例外で握り潰され、ページ操作は阻害されない |

## 整合性チェック
- [x] `manifest.json#content_scripts.matches` が `DEFAULT_SITES` 6 件すべてをカバーしている。
- [x] `src/content.ts` の `getValues(["enabled","sites","grayIntensity"])` のキーが `StorageSchema` に存在する。
- [x] `<html>` への属性付与方式なので SPA 遷移 (DOM 入れ替え) でも `<html>` 自体は残り副作用なし。
- [x] `window.top !== window` で iframe を弾く (設計5)。
- [x] `chrome.storage.onChanged` 購読で動的反映 (設計4)。

## 既知の制限 (後続イテレーション)
- ユーザーが options で manifest matches 外のホスト (例: `reddit.com`) を sites に追加しても、content script が注入されないためグレー化されない。
  - 対応案: `chrome.scripting.registerContentScripts` で動的登録、または `host_permissions` を `<all_urls>` + dynamic injection。プライバシー方針との兼ね合いを要検討。
- iframe には適用されない (YouTube 埋め込み等)。後続で評価。
