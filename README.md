# 脱注意散漫 (anti-distraction)

Chrome 拡張機能 (Manifest V3)。SNS / 動画サイトのタブを灰色化し、滞在時間を制限して集中力を守ります。

A Chrome extension (Manifest V3) that grays out SNS / video tabs and enforces visit time limits to protect your focus.

---

## 日本語

### 主な機能
- **タブ灰色化**: YouTube / Twitter (X) / Instagram / Facebook / TikTok を CSS フィルタで灰色化し視覚的誘惑を減らす
- **滞在時間制限**: 1 日のサイト滞在時間に上限を設定、超過でブロック画面を表示
- **集中モード**: 任意の時間帯にブロックを強制 (15 分〜数時間)
- **クールダウン**: 一度集中モードを開始したら短時間では解除できないようロック
- **ホワイトリスト**: 業務利用などで例外にしたい URL を登録
- **励ましメッセージ**: ブロック画面に表示
- **統計**: 今週の集中時間を記録
- **完全オフライン**: データ送信なし、広告なし
- **Premium ($3 買い切り)**: 高度な統計、テーマ追加、エクスポート機能

### インストール
1. Chrome Web Store からインストール (申請準備済)
2. または開発版: `git clone` → `npm install` → `npm run build` → `chrome://extensions` で `dist/` を「パッケージ化されていない拡張機能を読み込む」

### 使用例
- **作業中の SNS 遮断**: 集中モードを 25 分でセット → ポモドーロ用途
- **試験勉強モード**: クールダウン 60 分 + ブロックリスト全部入り
- **就寝前のスマホ・PC 利用制限**: 夜 23 時以降は YouTube ブロック

### 開発
```bash
npm install     # 依存インストール
npm run lint    # 型チェック (tsc --noEmit)
npm run build   # vite で dist/ にビルド
npm run test    # node:test で単体テスト
npm run package # release/anti-distraction.zip を生成
```

---

## English

### Features
- **Tab gray-out**: YouTube / Twitter (X) / Instagram / Facebook / TikTok rendered with a CSS filter to reduce visual temptation
- **Time limit**: Cap daily time spent on each site; show a block screen when exceeded
- **Focus mode**: Force-block sites for a chosen duration (15 min – several hours)
- **Cooldown**: Once focus mode starts, it can't be disabled for a configurable period
- **Whitelist**: Allow specific URLs (work tabs, etc.) to bypass the block
- **Encouragement messages**: Shown on the block screen
- **Stats**: Tracks weekly focus time
- **Fully offline**: No data transmission, no ads
- **Premium ($3 one-time)**: Advanced stats, extra themes, export features

### Install
1. Install from the Chrome Web Store (submission ready)
2. Or dev build: `git clone` → `npm install` → `npm run build` → load `dist/` as unpacked at `chrome://extensions`

### Usage examples
- **Block SNS during work**: Focus mode 25 min → Pomodoro pattern
- **Study mode**: 60 min cooldown + full block list
- **Pre-sleep limits**: Block YouTube after 23:00

### Develop
```bash
npm install     # install deps
npm run lint    # type check (tsc --noEmit)
npm run build   # build to dist/ with vite
npm run test    # unit tests via node:test
npm run package # create release/anti-distraction.zip
```

---

## ストア / Store
Chrome Web Store (申請準備済 / submission ready)

詳細は [STORE_DESCRIPTION.md](STORE_DESCRIPTION.md) 参照。

## ライセンス / License
詳細は [legal/](legal/) ディレクトリ参照。
