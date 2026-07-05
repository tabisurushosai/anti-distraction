# プライバシーポリシー / Privacy Policy

最終更新日 / Last updated: 2026-07-06

## 日本語

### 1. 基本方針

「脱注意散漫」(以下「本拡張機能」) はローカルファーストで動作します。
閲覧履歴は収集しません。端末内に保存する利用統計と設定を、広告、外部分析、
追跡のために送信しません。
Chrome APIから受け取る情報は、本拡張機能の利用時間制限機能を提供するためだけに使用し、
Chrome Web Store User Data PolicyとLimited Use要件に従って取り扱います。

### 2. ブラウザ内に保存する情報

本拡張機能は、機能提供のため次の情報を`chrome.storage.local`へ保存します。

- ブロック対象サイトと時間制限などの設定
- サイト利用時間、解除回数、無料お試し開始日時
- Premium状態
- 利用者が入力したGumroadライセンスキー
- ライセンスの最終確認日時とオフライン猶予期限

設定のExportには、対象サイト、時間制限、外観、クールダウン設定だけを含めます。
利用統計、解除回数、Trial、Premium、License情報は含めません。

### 3. Gumroadへ送信する情報

Premiumの有効性を確認する時だけ、次の情報をGumroad License APIへ送信します。

- 公開されたGumroad商品ID
- 利用者が入力したライセンスキー

Gumroadの応答には購入状態などが含まれる場合があります。本拡張機能は、Premiumの有効・無効を
判断するためだけに応答を使用し、購入者Email、決済カード情報、Gumroadの応答内容を保存しません。
閲覧URL、ブロック対象サイト、利用統計、端末識別子をGumroadへ送信しません。

決済情報はGumroadの画面でGumroadが処理します。本拡張機能はカード番号を受領または保存しません。
API接続時、Gumroadは通常のNetwork通信に伴うIP Addressなどの技術情報を処理する場合があります。
Gumroadによる情報処理にはGumroadのプライバシーポリシーが適用されます。

### 4. 権限

- `storage`：設定、利用統計、Trial、Premium状態を端末内へ保存
- `tabs`：現在のTabが対象サイトか判定し、設定画面または購入画面を開く
- `alarms`：時間計測、日次処理、License再確認
- `idle`：離席時間を利用時間へ加算しない
- 対象サイトのHost権限：灰色化と制限画面の表示
- `https://api.gumroad.com/*`：利用者が入力したLicenseの確認

### 5. 収集または外部送信しない情報

- 氏名、住所、電話番号
- 閲覧履歴、検索履歴、Cookie
- 閲覧URLの外部送信
- 利用統計の外部Analytics送信、Crash Report、広告識別子、Telemetry

### 6. 保存期間と削除

設定画面のResetは、ブロック対象や時間制限など利用者が編集できる設定だけを初期化します。
利用統計、Trial、Premium、License情報を含む全情報は、拡張機能を削除すると削除されます。
無効、返金、紛争、Chargebackが確認されたLicenseはPremiumを停止し、保存したLicense Keyを削除します。

### 7. お問い合わせ

本ポリシーに関するお問い合わせは、Chrome Web Store掲載ページのSupport連絡先までお願いします。

## English

### 1. Overview

Anti-Distraction (the "Extension") is local-first. It does not collect browsing
history. It does not transmit locally stored usage statistics or settings for
advertising, external analytics, or tracking.
Information received through Chrome APIs is used only to provide the
Extension's site-usage limiting features and is handled in accordance with the
Chrome Web Store User Data Policy, including its Limited Use requirements.

### 2. Data Stored in the Browser

The Extension stores the following data in `chrome.storage.local` to provide
its features:

- Blocked-site and time-limit settings
- Site-usage time, unblock counts, and trial start time
- Premium entitlement state
- The Gumroad license key entered by the user
- Last license verification time and offline-grace expiry

Settings exports include only sites, time limits, appearance, and cooldown
settings. They exclude usage statistics, unblock counts, trial, Premium, and
license information.

### 3. Data Sent to Gumroad

Only when verifying Premium, the Extension sends the following to the Gumroad
License API:

- The public Gumroad product ID
- The license key entered by the user

Gumroad's response may include purchase information. The Extension uses it
only to decide whether Premium is valid. It does not store the purchaser's
email, payment-card data, or the Gumroad response. Browsing URLs, blocked-site
lists, usage statistics, and device identifiers are not sent to Gumroad.

Payment information is entered and processed on Gumroad. The Extension never
receives or stores card numbers. Gumroad may process technical information,
such as an IP address, as part of ordinary network communication. Gumroad's
privacy policy applies to Gumroad's processing.

### 4. Permissions

- `storage`: Store settings, usage statistics, trial, and Premium state locally
- `tabs`: Check whether the active tab is in scope and open settings or checkout
- `alarms`: Time tracking, daily work, and license revalidation
- `idle`: Avoid counting time while the user is away
- Target-site host access: Apply grayscale and the limit screen
- `https://api.gumroad.com/*`: Verify a user-entered license

### 5. Data We Do Not Collect or Transmit

- Name, address, or phone number
- Browsing history, search history, or cookies
- External transmission of visited URLs
- External analytics transmission of usage statistics, crash reports,
  advertising identifiers, or telemetry

### 6. Retention and Deletion

The Reset action restores user-editable settings such as blocked sites and
time limits; it does not delete usage, trial, Premium, or license data.
Uninstalling the Extension deletes all locally stored Extension data.
When a license is invalid, refunded, disputed, or charged back, Premium is
disabled and the stored license key is deleted.

### 7. Contact

For privacy questions, use the support contact on the Chrome Web Store listing.
