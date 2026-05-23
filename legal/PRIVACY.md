# プライバシーポリシー / Privacy Policy

最終更新日 / Last updated: 2026-05-17

---

## 日本語

### 1. 基本方針
「脱注意散漫」(以下「本拡張機能」) は、ユーザーの個人情報を一切収集しません。設定・利用統計はユーザーのブラウザ内 (`chrome.storage.local`) にのみ保存され、外部サーバーへ送信されることはありません。Premium 購入手続きのためにユーザーがアップグレードを選択した場合のみ、ランダム生成されたインストール ID (`install_id`) が Stripe Checkout URL の `client_reference_id` として Stripe に送信されます。

### 2. 収集しない情報
- 氏名・メールアドレス・電話番号などの個人識別情報
- 閲覧履歴、検索履歴、Cookie
- IP アドレス、デバイス識別子
- アクセス先 URL の外部送信
- 利用統計、クラッシュレポート、テレメトリ

### 3. ブラウザ内に保存する情報
本拡張機能は以下の情報を、ユーザーのブラウザ内 (`chrome.storage.local`) に保存します。これらは本拡張機能の機能提供のためにのみ使用されます。`install_id` は、ユーザーが Premium 購入手続きを開始した場合のみ Stripe Checkout URL に付与されます。
- ユーザーが指定したブロック対象サイトのリスト
- 1 日あたりの滞在時間制限の設定値
- 当日のサイト別滞在時間 (統計表示用、日次でリセット)
- 無料お試し開始日時 (`trial_start_ts`)
- Premium 解放状態 (`premium_unlocked`)
- Premium 購入手続き用のランダムなインストール ID (`install_id`)

### 4. 権限の使用目的
- `storage`: 上記の設定および統計をブラウザ内に保存するため
- `tabs`: 現在のタブの URL を取得し、ブロック対象かどうかを判定するため
- `alarms`: 日次リセットおよび滞在時間の計測のため
- `idle`: ユーザーが離席・ロック中の時間を滞在時間として計測しないため
- コンテンツスクリプトの対象サイト: YouTube / X (Twitter) / Instagram / Facebook / TikTok 上でのみ、ページ表示の灰色化およびブロック画面表示を行うため

### 5. 第三者提供
本拡張機能は、設定・利用統計を第三者に提供することはありません。Premium 購入手続きを開始した場合のみ、購入照合のため `install_id` が Stripe Checkout URL に付与されます。

### 6. 子供のプライバシー
本拡張機能は、不登校児・発達特性児などを含む子供の利用を想定して設計されており、児童の個人情報を一切収集・送信しません。広告も表示しません。

### 7. Premium 決済について
Premium 機能の決済処理は外部の決済代行サービス (Stripe) を利用します。Stripe に対しては、ユーザーが Stripe のチェックアウト画面で直接入力した情報と、購入照合用に本拡張機能が Checkout URL へ付与する `install_id` が Stripe のプライバシーポリシーに基づいて処理されます。本拡張機能は、決済情報 (カード番号等) を一切受領・保存しません。

### 8. お問い合わせ
本ポリシーに関するお問い合わせは、本拡張機能の配布元 (Chrome Web Store) のサポート連絡先までお願いします。

---

## English

### 1. Overview
"Anti-Distraction" (the "Extension") does not collect any personal information. Settings and usage statistics are stored exclusively in the user's browser via `chrome.storage.local` and are never transmitted to any external server. Only when the user chooses to upgrade to Premium, a randomly generated install ID (`install_id`) is sent to Stripe as the Stripe Checkout URL's `client_reference_id`.

### 2. Information We Do Not Collect
- Personally identifiable information such as name, email address, or phone number
- Browsing history, search history, or cookies
- IP addresses or device identifiers
- URLs visited (no external transmission)
- Usage analytics, crash reports, or telemetry

### 3. Information Stored Locally in Your Browser
The Extension stores the following information within your browser (`chrome.storage.local`). This data is used solely to provide the Extension's functionality. `install_id` is added to the Stripe Checkout URL only when the user starts the Premium purchase flow.
- User-defined list of sites to block
- Daily time-limit settings
- Per-site daily usage time (for in-extension statistics, reset daily)
- Free-trial start timestamp (`trial_start_ts`)
- Premium unlock status (`premium_unlocked`)
- Random install ID for Premium checkout (`install_id`)

### 4. Permissions and Their Purposes
- `storage`: To save settings and statistics within your browser
- `tabs`: To read the current tab's URL and determine whether it should be greyed out
- `alarms`: To perform daily resets and time-tracking
- `idle`: To avoid counting time while the user is away or the device is locked
- Content-script target sites: Used only on YouTube, X (Twitter), Instagram, Facebook, and TikTok to apply the grey-out effect and block overlay

### 5. Third-Party Sharing
The Extension does not share settings or usage statistics with third parties. Only when the user starts the Premium purchase flow, `install_id` is added to the Stripe Checkout URL for purchase reconciliation.

### 6. Children's Privacy
The Extension is designed with consideration for children, including those who are out-of-school or neurodivergent. It does not collect or transmit any personal data from children, and it does not display advertisements.

### 7. Premium Payments
Premium feature purchases are processed by an external payment provider (Stripe). Information you enter on Stripe's checkout page, plus the `install_id` that the Extension adds to the Checkout URL for purchase reconciliation, is handled according to Stripe's own privacy policy. The Extension itself never receives or stores any payment information (e.g. card numbers).

### 8. Contact
For inquiries regarding this policy, please contact us through the support channel on the Extension's Chrome Web Store listing.
