# プライバシーポリシー / Privacy Policy

最終更新日 / Last updated: 2026-05-17

---

## 日本語

### 1. 基本方針
「脱注意散漫」(以下「本拡張機能」) は、ユーザーの個人情報を一切収集しません。すべてのデータはユーザーのブラウザ内 (`chrome.storage.local`) にのみ保存され、外部サーバーへ送信されることはありません。

### 2. 収集しない情報
- 氏名・メールアドレス・電話番号などの個人識別情報
- 閲覧履歴、検索履歴、Cookie
- IP アドレス、デバイス識別子
- アクセス先 URL の外部送信
- 利用統計、クラッシュレポート、テレメトリ

### 3. ブラウザ内に保存する情報
本拡張機能は以下の情報を、ユーザーのブラウザ内 (`chrome.storage.local`) にのみ保存します。これらは本拡張機能の機能提供のためにのみ使用され、外部に送信されることはありません。
- ユーザーが指定したブロック対象サイトのリスト
- 1 日あたりの滞在時間制限の設定値
- 当日のサイト別滞在時間 (統計表示用、日次でリセット)
- 無料お試し開始日時 (`trial_start_ts`)
- Premium 解放状態 (`premium_unlocked`)

### 4. 権限の使用目的
- `storage`: 上記の設定および統計をブラウザ内に保存するため
- `tabs`: 現在のタブの URL を取得し、ブロック対象かどうかを判定するため
- `alarms`: 日次リセットおよび滞在時間の計測のため
- ホスト権限: ユーザーが指定したブロック対象サイトに対してのみ、ページ表示の灰色化を行うため

### 5. 第三者提供
本拡張機能は、収集した情報を第三者に提供することは一切ありません (そもそも収集していません)。

### 6. 子供のプライバシー
本拡張機能は、不登校児・発達特性児などを含む子供の利用を想定して設計されており、児童の個人情報を一切収集・送信しません。広告も表示しません。

### 7. Premium 決済について
Premium 機能の決済処理は外部の決済代行サービス (Stripe) を利用します。Stripe に対しては、ユーザーが Stripe のチェックアウト画面で直接入力した情報のみが Stripe のプライバシーポリシーに基づいて処理されます。本拡張機能は、決済情報 (カード番号等) を一切受領・保存しません。

### 8. お問い合わせ
本ポリシーに関するお問い合わせは、本拡張機能の配布元 (Chrome Web Store) のサポート連絡先までお願いします。

---

## English

### 1. Overview
"Anti-Distraction" (the "Extension") does not collect any personal information. All data is stored exclusively in the user's browser via `chrome.storage.local` and is never transmitted to any external server.

### 2. Information We Do Not Collect
- Personally identifiable information such as name, email address, or phone number
- Browsing history, search history, or cookies
- IP addresses or device identifiers
- URLs visited (no external transmission)
- Usage analytics, crash reports, or telemetry

### 3. Information Stored Locally in Your Browser
The Extension stores the following information only within your browser (`chrome.storage.local`). This data is used solely to provide the Extension's functionality and is never transmitted externally.
- User-defined list of sites to block
- Daily time-limit settings
- Per-site daily usage time (for in-extension statistics, reset daily)
- Free-trial start timestamp (`trial_start_ts`)
- Premium unlock status (`premium_unlocked`)

### 4. Permissions and Their Purposes
- `storage`: To save settings and statistics within your browser
- `tabs`: To read the current tab's URL and determine whether it should be greyed out
- `alarms`: To perform daily resets and time-tracking
- Host permissions: Used only for the sites the user has chosen to block, to apply the grey-out overlay

### 5. Third-Party Sharing
The Extension does not share any information with third parties (because it does not collect any in the first place).

### 6. Children's Privacy
The Extension is designed with consideration for children, including those who are out-of-school or neurodivergent. It does not collect or transmit any personal data from children, and it does not display advertisements.

### 7. Premium Payments
Premium feature purchases are processed by an external payment provider (Stripe). Information you enter on Stripe's checkout page is handled according to Stripe's own privacy policy. The Extension itself never receives or stores any payment information (e.g. card numbers).

### 8. Contact
For inquiries regarding this policy, please contact us through the support channel on the Extension's Chrome Web Store listing.
