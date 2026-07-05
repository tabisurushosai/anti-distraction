# 脱注意散漫 (anti-distraction)

Chrome 拡張機能 (Manifest V3)。SNS / 動画サイトのタブを灰色化し、滞在時間を制限して集中力を守ります。

A Chrome extension (Manifest V3) that grays out SNS / video tabs and enforces visit time limits to protect your focus.

---

## 日本語

### 主な機能
- **タブ灰色化**: YouTube / Twitter (X) / Instagram / Facebook / TikTok を CSS フィルタで灰色化し視覚的誘惑を減らす
- **滞在時間制限**: 1日と1セッションの上限を設定し、超過時にブロック画面を表示
- **対象サイト編集**: 制限するサイトを追加・削除
- **一時解除**: 回数上限と再解除までのクールダウンを適用
- **統計**: 最近7日間のサイト利用時間を端末内で記録
- **設定バックアップ**: 対象サイト、時間制限、外観、クールダウンをJSONで保存・復元
- **ローカルファースト**: 閲覧履歴を収集せず、設定と利用統計の外部送信なし、広告なし
- **Premium ($9 買い切り)**: 30日統計、連続達成日数、サイト数と一時解除の上限拡張
- **購入確認**: 商品IDと入力されたライセンスキーを Gumroad へ送信して購入状態を確認

### インストール
1. Chrome Web Store からインストール (申請準備済)
2. または開発版: `git clone` → `npm install` → `npm run build` → `chrome://extensions` で `dist/` を「パッケージ化されていない拡張機能を読み込む」

### 使用例
- **作業中のSNS制限**: 1セッションの上限を設定して長時間利用を防ぐ
- **試験勉強**: 対象サイトを追加し、一時解除後のクールダウンを設定
- **毎日の利用管理**: 1日の上限と最近の利用統計を確認

### 開発
```bash
npm install     # 依存インストール
npm run lint    # 型チェック (tsc --noEmit)
npm run build   # vite で dist/ にビルド
npm run test    # node:test で単体テスト
npm run audit:package
                # 生成済み ZIP の必須/禁止ファイル、権限、公開設定を監査
VITE_GUMROAD_PRODUCT_ID=... VITE_GUMROAD_CHECKOUT_URL=... npm run package
                # 公開設定を検査し、ZIP を生成・監査
```

---

## English

### Features
- **Tab gray-out**: YouTube / Twitter (X) / Instagram / Facebook / TikTok rendered with a CSS filter to reduce visual temptation
- **Time limits**: Set daily and per-session limits; show a block screen when exceeded
- **Site list**: Add or remove sites to limit
- **Temporary unblock**: Apply a daily allowance and cooldown between requests
- **Stats**: Track the last seven days of site usage locally
- **Settings backup**: Export and restore sites, limits, appearance, and cooldown settings as JSON
- **Local-first**: No browsing-history collection or usage-stat transmission, no ads
- **Premium ($9 one-time)**: 30-day stats, streaks, unlimited sites, and higher temporary-unblock limits
- **Purchase verification**: The product ID and entered license key are sent to Gumroad

### Install
1. Install from the Chrome Web Store (submission ready)
2. Or dev build: `git clone` → `npm install` → `npm run build` → load `dist/` as unpacked at `chrome://extensions`

### Usage examples
- **Limit social media during work**: Set a per-session limit to prevent long visits
- **Study sessions**: Add distracting sites and configure the temporary-unblock cooldown
- **Daily usage management**: Set a daily limit and review recent usage

### Develop
```bash
npm install     # install deps
npm run lint    # type check (tsc --noEmit)
npm run build   # build to dist/ with vite
npm run test    # unit tests via node:test
npm run audit:package
                # audit the generated ZIP, permissions, and release values
VITE_GUMROAD_PRODUCT_ID=... VITE_GUMROAD_CHECKOUT_URL=... npm run package
                # validate config, create, and audit release/anti-distraction.zip
```

---

## ストア / Store
Chrome Web Store (申請準備済 / submission ready)

詳細は [STORE_DESCRIPTION.md](STORE_DESCRIPTION.md) 参照。

## ライセンス / License
詳細は [legal/](legal/) ディレクトリ参照。
