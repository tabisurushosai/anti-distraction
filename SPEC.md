# 脱注意散漫 (anti-distraction)

## 概要
SNS/YouTube タブ灰色化、滞在時間制限

## カテゴリ
生産性

## ターゲット
- SNSや動画サイトによる中断を減らしたい一般利用者
- 試験勉強やリモートワークへ集中したい日本語・英語利用者

## 技術スタック
- Manifest V3 (manifest_version: 3)
- TypeScript + Vite (`npm run package` で公開設定を検査してRelease ZIP生成)
- chrome.storage.local (設定、利用統計、License状態を端末内保存)
- Gumroad License API (入力されたLicense Keyと商品IDだけを購入確認のため送信)
- chrome.i18n API (`_locales/ja`, `_locales/en` 完備、messages.json で全文字列管理)
- アイコン: 16, 48, 128 px (icons/)

## コア機能
tab-gray,time-limit,site-list-edit,daily-stats,unblock-cooldown

## 収益モデル
- 基本機能: 完全無料
- Premium 機能: $9 USD 買い切り (Gumroad連携)
- Premium 解放範囲: 詳細統計 / 無制限 / カスタマイズ拡張 など
- 7日無料お試し: chrome.storage.local の trial_start_ts で判定

## 制約 (絶対遵守)
- 閲覧履歴、利用統計、個人識別情報を収集・外部送信しない
- License確認以外はローカル動作とし、広告を表示しない
- Chrome Web Store ポリシー遵守 (権限最小限、ホスト権限は機能要件分のみ)
- Manifest V3 必須 (V2 不可)
- service_worker は短時間で完了する処理のみ (長時間 keep-alive 禁止)

## ファイル構成 (期待)
```
anti-distraction/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── background.ts (service_worker)
│   ├── popup.html
│   ├── popup.ts
│   ├── popup.css
│   ├── options.html (設定画面、必要なら)
│   ├── options.ts
│   ├── content.ts (content_script、必要なら)
│   └── i18n.ts (chrome.i18n ヘルパ)
├── _locales/
│   ├── ja/messages.json
│   └── en/messages.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── legal/
│   ├── PRIVACY.md
│   └── TERMS.md
└── release/
    └── anti-distraction.zip
```

## 完成基準
- TODO.md 全消化
- npm run lint 通過
- npm run build 通過
- release/anti-distraction.zip 生成
- _locales/ja, _locales/en 両方完備
- icons 3サイズ
- legal/PRIVACY.md, TERMS.md
- Chrome Web Store にアップロード可能な状態

## ストア掲載情報案
- 名前 (ja): 脱注意散漫
- 名前 (en): 
- 概要 (132字以内, ja): SNS/YouTube タブ灰色化、滞在時間制限
- カテゴリ: 生産性
- 言語: 日本語, English
- プライバシーポリシー URL: https://github.com/tabisurushosai/anti-distraction/blob/main/legal/PRIVACY.md
