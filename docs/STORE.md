# Chrome Web Store 提出ガイド

## 提出時に確認する項目

- 公開リポジトリ URL とプライバシーポリシー URL がストアの掲載情報と一致していること。
- Chrome Web Store 開発者アカウント、必要な本人確認、公開範囲。
- リポジトリの Private Vulnerability Reporting が有効であること。

拡張名は Lookalike Link Alert、開発者・権利者は bafubafu-bafuu、サポート窓口は bafubafu-bafuu@puripuri.dev です。

## 単一目的の説明

日本語: アクセスする URL に含まれる類似文字・文字種混在・誤認を招く構造を端末内で検査し、理由付きの警告と利用者による検査設定を提供します。

English: Inspects URLs the user is about to visit for look-alike characters, mixed scripts and deceptive structure, entirely on-device, and shows an explained warning with user-configurable checks.

## 掲載文（日本語）

### 概要（132 文字以内）

リンクの類似文字・文字種の混在・不審な URL 構造を端末内で検査し、理由付きで警告します。URL の外部送信なし。サーバー・アカウント不要。

### 詳細説明

Lookalike Link Alert は、クリックしようとしているリンクや入力した URL に、人の目では見分けにくい「なりすましの特徴」がないかを端末内で検査し、理由を日本語で説明する Chrome 拡張機能です。

■ 検査する内容
・英数字に似たキリル文字・ギリシャ文字などの類似文字（Unicode confusables 16.0.0 を同梱）
・同じドメイン内での不自然な文字種の混在
・見えない文字・表示順を変える制御文字
・Unicode / Punycode の表記と、本当の登録可能ドメイン
・リンクの表示文字と実際の接続先の不一致
・@ より前の「ユーザー情報」を使った接続先の偽装
・登録した正規ドメインに似た綴り、別ドメインのサブドメインへの埋め込み
・参考情報：HTTP、IP アドレス、非標準ポート、深いサブドメイン、長い URL、一部の短縮 URL

■ 動作
・通常ページ上のリンクをクリック・キーボード操作・修飾キー・中クリックしたとき、移動前に検査してページ内で警告します。
・Punycode や @ を含む URL への直接入力やリダイレクトは、宛先への通信が発生する前に拡張の確認画面で止めます。
・確認画面では実際の接続先を大きく表示し、「移動をやめる」か「危険性を理解して今回だけ進む」を選べます。継続はそのタブ・その URL に限った一時的な許可です。
・URL を開かずに調べたいときは、ツールバーから手動チェックができます。

■ 設定
・通常 / 慎重のプリセット、16 項目の個別オン・オフ、警告レベル、閾値
・保護したい正規ドメインの登録（国内で狙われやすい銀行・決済・通販・物流・通信・公的機関の候補から 1 クリックで追加可能）
・警告を省略するホストの例外
・設定の JSON 書き出し・取込
・日本語ドメインは、日本語であることだけでは警告しません（必要なら有効にできます）

■ プライバシー
・URL や閲覧情報を外部に送信しません。サーバー、アカウント、外部判定 API、テレメトリー、広告はありません。
・設定はこの端末の Chrome に保存され、Chrome Sync には同期しません。
・Cookie、閲覧履歴、ブックマークの権限は要求しません。

■ 権限について
・HTTP / HTTPS サイトへのアクセス：ページ上のリンクを端末内で検査するため
・storage：設定と一時的な確認状態の保存
・declarativeNetRequest：疑わしい候補を通信前に確認画面へ送り、確認後の継続をタブ・URL 限定で許可するため
・webNavigation / alarms：一時許可と確認状態の後片付け

■ ご注意
この拡張は URL の特徴を説明する補助ツールです。詐欺サイトの網羅的な検出や、すべての遷移の事前遮断を保証するものではありません。POST 送信、iframe、ダウンロード、右クリックメニューからの移動、シークレットモードは自動検査の対象外です。Chrome 自身のセーフブラウジングと併用してください。

対応：Chrome 140 以降。オープンソース（MIT License）。

## Store listing (English)

### Summary (132 characters max)

Warns before you open look-alike or deceptive URLs. Confusable characters, mixed scripts and URL tricks are checked on-device only.

### Detailed description

Lookalike Link Alert inspects the links you are about to click and the URLs you type for spoofing techniques that are hard to spot by eye, and explains every warning in plain language. All checks run inside your browser.

■ What it checks
- Look-alike characters such as Cyrillic or Greek letters that mimic Latin ones (bundled Unicode confusables 16.0.0)
- Suspicious mixing of scripts inside one domain label
- Invisible and bidirectional control characters
- Unicode vs. Punycode spelling, next to the real registrable domain
- Link text that shows one address while pointing to another
- "userinfo" tricks that hide the real host behind an @ sign
- Domains that look like, or embed, the legitimate domains you register
- Informational notes: HTTP, IP addresses, unusual ports, deep subdomains, very long URLs and common URL shorteners

■ How it works
- Links on ordinary pages are checked before navigation, including keyboard, modifier-key and middle-click opening, and a warning dialog is shown in the page.
- Typed URLs and redirects that contain Punycode or an @ sign are stopped on a review page before any request reaches the destination.
- The review page shows the real destination prominently. You can stop, or continue once; continuing is a temporary allowance limited to that tab and that exact URL.
- A manual check in the toolbar lets you inspect any URL without opening it.

■ Settings
- Normal / Careful presets, 16 individual checks, warning level and thresholds
- Legitimate domains to protect, with a one-click list of frequently targeted Japanese banks, payment, shopping, delivery, telecom and government services
- Host exceptions that skip warnings
- JSON export and validated import of your settings
- Japanese internationalized domains are not flagged merely for being Japanese (you can enable that check)

■ Privacy
- No URLs or browsing data ever leave your device. There is no server, no account, no external reputation API, no telemetry and no ads.
- Settings are stored locally in Chrome and are not synced.
- The extension does not request cookie, history or bookmark permissions.

■ Permissions
- Access to HTTP / HTTPS sites: to check links on pages, on-device
- storage: your settings and short-lived review state
- declarativeNetRequest: to send suspicious candidates to the review page before the request is sent, and to allow a confirmed continuation for one tab and URL only
- webNavigation / alarms: to clean up temporary allowances and review state

■ Please note
This is an assistive tool that explains URL characteristics. It does not guarantee detection of every fraudulent site or pre-request blocking of every navigation. POST submissions, iframes, downloads, context-menu navigation and Incognito mode are outside automatic checking. Use it together with Chrome's built-in Safe Browsing.

Requires Chrome 140 or later. Open source under the MIT License. UI language: Japanese.

## 権限理由

| 権限 | 審査用説明（日本語） | Justification (English) |
| --- | --- | --- |
| ホストアクセス HTTP / HTTPS | ページ上のリンクと URL を端末内で検査し、一部の GET 遷移を事前検査するため | Needed to inspect links on pages on-device and to pre-check some GET navigations before the request is sent |
| storage | 利用者の検査設定の保存と、警告・一時許可のセッション状態の保持 | Stores the user's check settings and short-lived review / temporary-allowance state |
| declarativeNetRequest | 国際化ドメイン等の候補を接続前に拡張の検査ページへ送るため | Redirects candidate navigations (IDN, userinfo) to the extension's review page before any request, and allows a confirmed continuation scoped to one tab and URL |
| webNavigation | 遷移完了・失敗時に、そのタブの一時許可を削除するため | Removes the tab's temporary allowance when a navigation commits or fails |
| alarms | 期限切れの確認状態と一時許可を清掃するため | Periodically cleans up expired review state and temporary allowances |

リモートコード、テレメトリー、外部 URL 判定サービスは使用しません。
「収集なし」を安易に選ばず、URL を端末内で処理する事実も含め、提出時のデータ利用の定義と各設問を読み、実際の動作と一致する申告をしてください。

## 成果物と素材

- `npm run package` で生成した ZIP。秘密鍵・CRX を含めない。
- 自作アイコンの 128px 版。生成済み PNG はビルド成果物に含まれる。
- 警告と設定画面のスクリーンショット。ローカル `.test` のデモを使い、実際の個人情報を含めない。
- 提出画面が求める画像サイズ・枚数・プロモーション画像を提出時に確認する。

## 審査用の再現手順

1. 拡張を読み込み、初回の詳細設定を確認して保存する。
2. 手動チェックに `https://раураl.test/` を入力する。移動せず、混在や似た文字の理由を確認できる。
3. `https://日本語.jp/` を手動チェックする。初期設定では、日本語という理由だけの警告を出さない。
4. 日本語 IDN の検査を有効化して保存し、同じ URL の検出理由を確認する。
5. 保護対象に `example.com` を追加し、`https://example.com.attacker.test/` の実際の接続先を確認する。候補一覧からの 1 クリック追加も確認できる。
6. ネットワーク前遮断・リダイレクト・継続は `npm run test:e2e` のローカル試験で確認する。`.test` を通常の外部サイトとしてアクセスしない。

## リリースゲート

- 型検査、lint、単体・結合試験、E2E、ビルド、ZIP 検証の成功。
- 実 Chrome の現在の安定版で、読み込み・設定保存・警告・一時継続・日本語の正常例を確認。
- 権限の撤回、worker 再起動、拡張更新、戻る・進む、別タブ、長い URL、無効設定、悪意ある入力の確認。
- キーボード、明暗テーマ、200% 拡大、スクリーンリーダーで主要導線を確認。
- 他拡張が入っていない試験環境と、通常利用環境の差を確認。
- 未解決の重大な不具合や未検証の主要経路があれば公開を保留。
- プライバシー申告、単一目的、権限理由、説明文の保証範囲を実装に合わせる。
- ストア規約と必要素材を提出時に再確認。
