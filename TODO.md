# TODO: 脱注意散漫 (anti-distraction)

## Phase 1: 基盤セットアップ (T001-T010)
- [x] T001: package.json (devDeps: typescript, vite, @types/chrome; scripts: build, lint, package)
- [x] T002: tsconfig.json (target ES2020, strict, jsx none)
- [x] T003: vite.config.ts (Chrome 拡張用ビルド設定、entry: popup + background + content)
- [x] T004: manifest.json (V3, name は __MSG_appName__、description は __MSG_appDesc__、default_locale ja、icons 3サイズ、permissions は機能要件最小限)
- [ ] T005: _locales/ja/messages.json (appName, appDesc, popup_*, options_* 全項目)
- [ ] T006: _locales/en/messages.json (上記の英訳)
- [ ] T007: icons/icon16.png, icon48.png, icon128.png (シンプルなデザイン、絵文字風 SVG → PNG 変換)
- [ ] T008: src/i18n.ts (chrome.i18n.getMessage ヘルパ)
- [ ] T009: src/background.ts (service_worker 雛形、onInstalled で初期化)
- [ ] T010: legal/PRIVACY.md, legal/TERMS.md (個人情報非収集、外部送信なし明記)

## Phase 2: UI 基盤 (T011-T015)
- [ ] T011: src/popup.html (基本レイアウト、i18n attr)
- [ ] T012: src/popup.css (シンプル・アクセシブル、ダークモード対応)
- [ ] T013: src/popup.ts (popup を起動時に表示、i18n 適用)
- [ ] T014: src/options.html, options.ts (必要なら、設定UI)
- [ ] T015: src/storage.ts (chrome.storage.local ラッパ、型付き)

## Phase 3: コア機能実装 (T016-T030 = 15タスク、上の features 5個を3タスクずつ分解)
- [ ] T016: tab-gray — 設計
- [ ] T017: tab-gray — 実装
- [ ] T018: tab-gray — テスト・整合
- [ ] T019: time-limit — 設計
- [ ] T020: time-limit — 実装
- [ ] T021: time-limit — テスト・整合
- [ ] T022: site-list-edit — 設計
- [ ] T023: site-list-edit — 実装
- [ ] T024: site-list-edit — テスト・整合
- [ ] T025: daily-stats — 設計
- [ ] T026: daily-stats — 実装
- [ ] T027: daily-stats — テスト・整合
- [ ] T028: unblock-cooldown — 設計
- [ ] T029: unblock-cooldown — 実装
- [ ] T030: unblock-cooldown — テスト・整合

## Phase 4: Premium ゲート (T031-T033)
- [ ] T031: src/premium.ts (trial_start_ts 管理、is_premium / is_trial 判定関数)
- [ ] T032: Premium 機能の UI ゲート (無料: 基本機能のみ、Premium: 詳細統計/無制限)
- [ ] T033: src/upgrade.ts (Stripe Checkout URL 生成、購入後 chrome.storage に premium_unlocked=true)

## Phase 5: 仕上げ (T034-T035)
- [ ] T034: npm run lint 通過、npm run build 通過
- [ ] T035: release/anti-distraction.zip 生成 (manifest + icons + _locales + dist/)
