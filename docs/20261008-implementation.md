# Region Checker for AWS Console 実装内容(案A)

仕様: `ideas/20261008-aws-region-checker.md` の案A。案B・案Cは実装していない。

2026-10-09 更新: レビュー指摘への対応で、確認済みリージョンの保存先をページの `sessionStorage` から拡張側の `chrome.storage.session` に移した。仕様の「permissions なし」はこの 1 点だけ変更し、`storage` 権限を追加している(ユーザー決定)。変更点の一覧は末尾の「2026-10-09 の変更」を参照。

## 検証状況(先に結論)

- 実ブラウザ(Chrome / Firefox)・実際の AWS コンソールでは **未検証**。`background.js` と `chrome.storage.session`、メッセージの往復も実ブラウザでは動かしていない。
- 実施済みなのは、構文チェック、manifest の JSON 妥当性、禁止 API の grep、Node 上の偽 DOM・偽 `chrome` API によるロジックのスモークテストのみ。
- 下記「未確認の前提」は、実 DOM・実ブラウザで確認するまで動作を保証できない。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `manifest.json` | Manifest V3。`https://*.console.aws.amazon.com/*` に `content.js` を注入。`permissions` は `storage` のみ。`host_permissions` なし |
| `content.js` | リージョン取得、バナー挿入、入力照合、DOM 監視(IIFE 1 つ) |
| `background.js` | タブごとの確認済みリージョンを `chrome.storage.session` に読み書きする仲介(約 40 行) |
| `content.css` | バナーのスタイル。Shadow DOM 内でのみ読み込む |

ビルド工程・依存パッケージなし。

## content.js の動作

`update()` が唯一の描画入口で、確認済みリージョンの復元完了時・DOM 変化時・`popstate` / `hashchange` 時に呼ばれる。

1. `getRegion()` で現在のリージョンを決める
2. 判別不能、またはメモリ上の確認済みリージョン(`confirmed`)と同じならバナーを外す
3. それ以外ならバナーを作り(初回のみ)、文言を更新し、`place()` で配置する

### リージョン取得

| 順 | 取得元 | 例 | 結果 |
| --- | --- | --- | --- |
| 0a | パス先頭がグローバルサービス | `us-east-1.console.aws.amazon.com/iam/home` | `Global` |
| 0b | リージョンボタンの文言が `Global` / `グローバル` | ボタン表示「グローバル」 | `Global` |
| 1 | ホスト名のラベル | `ap-northeast-1.console.aws.amazon.com` | `ap-northeast-1` |
| 2 | クエリ `region` | `console.aws.amazon.com/ec2/home?region=us-west-2` | `us-west-2` |
| 3 | リージョンボタンの文言中のコード | ボタン表示「Tokyo (ap-northeast-1)」 | `ap-northeast-1` |

- リージョンコードは `^[a-z]{2}(-[a-z]+)+-\d+$` に一致する文字列だけを採用する。URL やボタン由来の文字列は、この形式に一致したものしか表示しない(長さと実在の確認はしていない)。
- グローバル判定を順 1 より前に置いた理由: IAM などはホスト名が `us-east-1` になるため、仕様の優先順(ホスト名 → クエリ → ボタン)だけでは「us-east-1」と誤表示する。
- グローバル扱いのパスは `iam` `iamv2` `cloudfront` `route53` `organizations` `billing` `costmanagement`。網羅はしていない(YAGNI)。漏れは 0b のボタン文言で拾う想定。
- どの手段でも判別できない場合はバナーを出さない。消す手段のないバナーを出さないため。

### バナーと入力照合

- 表示: `現在のリージョン: ap-northeast-1` + `消すにはリージョンを入力` + 入力欄。
  - 案内文言はプレースホルダではなくバナー本文(入力欄を包む `<label>` のテキスト)なので、入力中も消えない。`<label>` で包んでいるため、入力欄のアクセシブルネームにもなる。
- 入力値を trim・小文字化して現在のリージョンと比較し、一致した時点で消す(Enter 不要)。
  - 例: `ap-northeast-` まで入力 → 消えない。`ap-northeast-1` → 消える。`Global` 表示時は `global` でも消える。
- 入力欄の `keydown` / `keypress` / `keyup` は伝播を止める。コンソール側のキーボードショートカットが入力中に発火するのを避けるため。
- `createBanner()` はローカル変数で組み立て、最後に `host` / `label` / `input` へ代入する。途中で例外が出ても「`host` だけ代入済み」の状態は残らず、次の `update()` で作り直す。
  - `chrome.runtime.getURL` が例外を出す場合(拡張の更新・再読み込みでコンテキストが無効になった古いタブ)は、スタイルの `<link>` だけ諦めて無装飾のバナーを出す。

### 確認済みリージョンの保持

**保持するもの: タブごとに「最後に確認したリージョン 1 件」。**

| 置き場所 | 役割 |
| --- | --- |
| `content.js` の変数 `confirmed` | そのページでの正。バナーを出すかどうかはこの値だけで決める |
| `chrome.storage.session` のキー `tab:<タブ ID>`(`background.js` 経由) | ページ読み込みをまたぐための復元用 |

流れ:

1. ページ読み込み時、`content.js` が `chrome.runtime.sendMessage({ type: "get" })` を送る。
2. `background.js` が送信元のタブ ID(`sender.tab.id`)でキーを作り、`chrome.storage.session` から読んで `{ region }` を返す。
3. `content.js` は応答を `confirmed` に入れてから初回の `update()` を行う(応答前は描画しない。確認済みのページでバナーが一瞬出るのを避けるため)。
4. 正しく入力されたら `confirmed` を更新してバナーを消し、`{ type: "set", region }` を送って保存する。

例(同じタブ):

| 操作 | 保存値(タブ 1) | バナー |
| --- | --- | --- |
| 東京を開く | なし | 表示 |
| `ap-northeast-1` を入力 | `ap-northeast-1` | 消える |
| us-east-1 に切替(別オリジンへ遷移) | `ap-northeast-1` | 表示 |
| `us-east-1` を入力 | `us-east-1` | 消える |
| 東京に戻る | `us-east-1` | **表示**(以前は表示されなかった) |
| 東京を入力せず us-east-1 に戻る | `us-east-1` | 出ない(最後に確認したのは us-east-1 のまま) |

- 同一オリジン内も同じ規則になる。例: `us-east-1` の EC2 で確認 → IAM へ移動すると `Global` で再表示 → `Global` を確認 → EC2 に戻ると `us-east-1` で再表示。
- タブ単位: 別タブ(タブ 2)はキーが `tab:2` なので、タブ 1 の確認状態に影響しない。新しいタブ・複製したタブはタブ ID が別なので、最初から表示される。
- 消えるタイミング: タブを閉じると `tabs.onRemoved` でそのタブのキーを削除する。ブラウザ終了、拡張の無効化・再読み込み・更新で `storage.session` ごと消える。

失敗時は「黙って消えない側」に倒す:

| 状況 | 挙動 |
| --- | --- |
| `get` に 1 秒(`RESTORE_TIMEOUT_MS`)応答がない | 確認済みなしとしてバナーを出す。遅れて届いた応答は無視する |
| `get` が `lastError` で返る / `sendMessage` が例外(拡張コンテキスト無効) | 確認済みなしとしてバナーを出す |
| `set` が失敗する(送信の例外、`storage.session.set` のエラー) | `confirmed` は更新済みなのでバナーは消える。次のページ読み込みでは復元できず、再表示される |
| bfcache から復元された(`pageshow` の `persisted`) | `confirmed` が古い可能性があるので `get` をやり直す。例: 東京を確認 → us-east-1 を確認 → ブラウザの「戻る」で東京が bfcache から復元 → 取り直した値は `us-east-1` なので再表示 |

#### background.js のメッセージ検証

応答・保存するのは、次をすべて満たすメッセージだけ。満たさないものには応答しない(コンテンツスクリプト側は応答なしとして扱い、バナーを出す)。

- `sender.id` が自拡張の ID と一致する
- `sender.tab.id` が整数で、`sender.frameId` が 0(最上位フレーム)
- `type` が `get` または `set`
- `set` の `region` が `^[a-z]{2}(-[a-z]+)+-\d+$` に一致するか、`Global`

`get` で読んだ値も同じ検証を通し、通らなければ `null` を返す。例: `{ type: "set", region: "<img src=x>" }` や、タブを持たない送信元(拡張のページなど)からの `set` は保存されない。

`REGION_RE` と `GLOBAL` は `content.js` と `background.js` の両方に書いてある。ビルド工程がなく、service worker とコンテンツスクリプトで 1 ファイルを共有する簡単な方法がないため、2 行の重複を許容した(コメントで相互参照)。

#### 保存方式の選択理由

| 案 | 判断 |
| --- | --- |
| **`background.js` + runtime メッセージ + `chrome.storage.session`(採用)** | タブ ID は `sender.tab.id` から得られ、コンテンツスクリプトがタブ ID を知る必要がない。保存領域はコンテンツスクリプトにもページにも公開されない |
| コンテンツスクリプトから直接 `chrome.storage.session` を使う | 既定ではコンテンツスクリプトに公開されず、`setAccessLevel()` を呼ぶ background が結局要る。コンテンツスクリプトはタブ ID を知らないので、タブ単位のキーも作れない |
| ページの `sessionStorage` + `document.referrer` で切替を検出 | 権限は不要だが、リファラが残るかがコンソールの遷移経路に依存する。ユーザー決定により不採用 |
| `chrome.storage.local` | ディスクに残り、ブラウザ終了で消えない。要件(終了で消える)に合わない |

#### 既知の制約

- タブ ID はブラウザのセッション内で一意という前提。ブラウザを再起動してタブを復元した場合は `storage.session` が空なので、全タブで再表示される(安全側)。
- バナーを消さずに「最後に確認したリージョン」へ戻った場合は再表示しない(上の表の最終行)。確認済みを 1 件だけ持つという仕様どおりの挙動。
- 拡張を更新・再読み込みすると `storage.session` が消える。開いたままのタブは `confirmed` がメモリに残るので、次にページを読み込むまでは非表示のまま。読み込み後は再表示される。
- service worker の起動が 1 秒より遅い場合、確認済みのページでもバナーが出る(入力し直せば消える)。
- タブの破棄(メモリ節約)などでブラウザがタブ ID を付け替えた場合は、復元できず再表示される(安全側。付け替えが起きるかは未確認)。

### 挿入位置と監視

- `[data-testid="awsc-nav-regions-menu-button"]` があれば、その直前(同じ親の中)に挿入する。
- なければ `document.body` 直下に置き、右上に固定表示する。後からボタンが現れたら隣へ移動する。
  - 固定表示の `position: fixed` / `top: 56px` / `right: 16px` / `z-index: 2147483647` / `margin: 0` は、`content.js` がホスト要素の `style` に直接設定する(`FALLBACK_STYLE`)。`content.css` が未読込・読込失敗でも右上に出る。ボタンの隣へ移るときは同じプロパティを外す。
  - 例: 拡張コンテキストが無効で CSS を読めない古いタブでも、無装飾のバナーが右上に固定で出る(以前は `body` の末尾、ページ最下部に入っていた)。
- `MutationObserver`(`document.documentElement`、`childList` + `subtree`)で DOM 変化を監視し、200ms にまとめて `update()` を呼ぶ。これ 1 つで次を兼ねる。
  - ナビの遅延描画・再描画でバナーが消された場合の再挿入
  - SPA 遷移によるリージョン変更の検知(コンテンツスクリプトからはページ側の `history.pushState` をフックできないため、遷移に伴う DOM 変化を契機に URL を読み直す)
- 挿入合戦の打ち切りは、累計ではなく頻度で判定する。
  - 前回のナビ挿入から 2 秒(`NAV_INSERT_QUIET_MS`)以上空いた挿入は正常な再描画とみなし、カウンタを 0 に戻す。
  - 2 秒未満の間隔の挿入が 20 回(`MAX_NAV_INSERTS`)続いたら、以後そのページでは右上固定に切り替える(ページ再読み込みまで)。
  - 例: SPA の画面遷移で 3 秒おきにナビが再描画され 60 回消されても、毎回ボタンの隣に戻る。ページ側が挿入のたびに即座に消す場合は、約 200ms 間隔で 20 回(約 4〜5 秒)挿入した時点で打ち切る。
  - 打ち切り後に自動で戻さない理由: 戻すと合戦が一定間隔で再開し、バナーがナビと右上を行き来し続けるため。

## Shadow DOM へのスタイル適用方法

**採用: `content.css` を `web_accessible_resources` に登録し、Shadow Root 内に `<link rel="stylesheet">` で読み込む。**

```js
const style = document.createElement("link");
style.rel = "stylesheet";
style.href = chrome.runtime.getURL("content.css");
root.append(style);
```

理由:

- manifest の `content_scripts.css` で注入した CSS はページのドキュメントに適用され、Shadow DOM の中には届かない。逆にページ側へ漏れる。
- `web_accessible_resources` は権限ではない。
- 読み込むのは拡張に同梱したファイルで、ネットワーク通信は発生しない。
- スタイルを CSS ファイルとして分離でき、JS 文字列への埋め込みが要らない。

比較した案:

| 案 | 不採用理由 |
| --- | --- |
| `content_scripts.css` | Shadow DOM に効かず、ページ側へ漏れる |
| JS 内の CSS 文字列を `<style>` に入れる | `content.css` が不要になり仕様の構成と合わない。ページの CSP(`style-src`)の影響を受ける可能性がある |
| `adoptedStyleSheets` | 同上で CSS を JS に持つことになる。Firefox のコンテンツスクリプトでの挙動に不安がある(未確認) |

副作用と対策:

- `web_accessible_resources` の `matches` を AWS コンソールに限定した。他サイトは `content.css` を取得できない。AWS コンソールのページ自身は取得でき、拡張の導入有無を検知できるが、中身は静的な CSS のみ。
- `<link>` は非同期読み込みのため、初回表示の一瞬だけスタイル未適用になり得る。位置指定は CSS に依存しないので、その間も表示位置は変わらない。
- `:host { all: initial }` でページからの継承スタイルを切っている。Shadow Root は `closed`。

## manifest.json の補足

### background(Chrome / Firefox 共通の書き方)

```json
"permissions": ["storage"],
"background": {
  "scripts": ["background.js"],
  "service_worker": "background.js"
}
```

`scripts` と `service_worker` の両方に同じファイルを指定する。Chrome は `service_worker` を使い、Firefox は `scripts` をイベントページとして使う。

根拠(MDN「manifest.json / background」の Browser support と「Cross-browser Manifest V3 background scripts」の節。2026-10-09 に確認):

- Chrome: MV3 では `service_worker` のみ対応。Chrome 121 以降は MV3 の `background.scripts` を無視する。**Chrome 120 以前は `scripts` があると拡張の読み込みを拒否する。**
- Firefox: `service_worker` は未対応。Firefox 121 以降は `service_worker` が併記されていても `scripts` で背景ページを起動する。`strict_min_version` は 127.0 なので条件を満たす。
- MDN 自身が、両対応の方法としてこの併記を例示している。

`background.js` を両方の環境で動かすための書き方:

- `chrome.*` 名前空間とコールバック形式だけを使う(`browser.*` や Promise 形式の差に依存しない)。
- 非同期の応答は、リスナーが `true` を返して `sendResponse` を後から呼ぶ形式(Chrome の runtime API リファレンスに記載の方式)。
- DOM・`window`・`importScripts` を使わない。状態はすべて `storage.session` に置き、service worker / イベントページが停止しても失われない。
- イベントリスナーはトップレベルで同期的に登録する。

### 権限

- `permissions` は `storage` のみ。`chrome.storage.session` のために必要。`host_permissions`、`tabs` などは足していない。
- `tabs.onRemoved` と `sender.tab.id` は `tabs` 権限なしで使う。Chrome の tabs API リファレンスは「ほとんどの機能は権限不要」「`tabs` 権限が必要なのは `url` / `pendingUrl` / `title` / `favIconUrl`」としており、これらの値は参照していない。
- `storage.session` の性質(Chrome の storage API リファレンス、MDN「storage.session」。2026-10-09 に確認): メモリ上に保持されディスクに書かれない。既定ではコンテンツスクリプトに公開されない。ブラウザ終了、拡張の無効化・再読み込み・更新で消える。Chrome 102 以降の MV3 で利用可。

### その他

- `browser_specific_settings.gecko.id`: `region-checker@kokokoko0825.dev`
- `strict_min_version: 127.0`: Firefox の MV3 では、コンテンツスクリプトの対象ホストへのアクセスがインストール時に付与されるのが 127 以降という理解に基づく。それ以前はユーザーが手動で許可するまで黙って動かない。
- `data_collection_permissions: { required: ["none"] }`: AMO の新規提出で求められるデータ収集申告。収集なし。
- アイコンは未同梱。ストア提出時に必要になる(AWS ロゴは使わない)。

## セキュリティ

| 項目 | 実装 |
| --- | --- |
| 外部通信 | なし。ネットワーク API を使っていない。読み込むのは同梱の `content.css` のみ。拡張内のメッセージ(`runtime.sendMessage`)は外部に出ない |
| DOM 挿入 | `createElement` / `textContent` / `append` / `before` のみ。HTML 文字列を解釈する API は不使用 |
| 表示する値 | 正規表現に一致したリージョンコードか固定文字列 `Global` のみ |
| 読む情報 | `location.hostname` / `pathname` / `search` の `region`、リージョンボタンの `textContent` |
| 読まない情報 | Cookie、アカウント ID、ユーザー名、コンソールのセッション情報(meta タグ等)、タブの URL・タイトル |
| 保存する情報 | タブごとにリージョンコードまたは `Global` を 1 件(`chrome.storage.session`、メモリ上のみ)。キーはタブ ID |
| 権限 | ホスト一致と `storage` のみ。`host_permissions` なし |
| 秘密情報 | API キー・パスワード等は存在しない |

補足:

- マルチセッション有効時はホスト名にアカウント ID を含むラベルが付くことがある。ホスト名を `.` で分割してリージョン形式のラベルだけを取り出しており、他のラベルは保持・保存・表示しない。
- 保存先を拡張側に移したので、ページ側スクリプトが保存値を書き換えてバナーを抑止することはできなくなった(以前は `sessionStorage` をページと共有していた)。`sessionStorage` のキーによる導入検知もなくなった。
- `background.js` は `runtime.onMessage` だけを待ち受ける。`externally_connectable` を宣言していないので Web ページからは送れず、他の拡張からのメッセージは `onMessageExternal` 側に届くため受け取らない。そのうえで送信元とリージョン形式を検証している(多層化)。
- 想定される最悪の影響は、表示の欠落・誤表示(完全性・可用性への軽微な影響)で、機密性への影響はない。追加した `storage` 権限で扱うのはリージョンコードだけで、評価は変わらない。CVSS 0〜3.9(Low)の範囲に収まる設計と判断している。

## 未確認の前提

実 DOM・実ブラウザで確認していない。外れた場合の挙動を併記する。

| 前提 | 外れた場合 |
| --- | --- |
| リージョンボタンが `[data-testid="awsc-nav-regions-menu-button"]` で取れる | 常に右上 fixed 表示になる。グローバル判定 0b と取得順 3 も効かない |
| ボタンの親要素に兄弟として挿入してもナビのレイアウトが崩れない | 見た目が崩れる。短い間隔で消され続ければ 20 回で fixed に切り替わる |
| グローバルサービスでボタン文言が `Global` / `グローバル` と完全一致する | 上記パス一覧以外のグローバルサービスがホスト名のリージョンで表示される |
| ボタン文言にリージョンコードが含まれる(順 3) | ホスト名にもクエリにもリージョンがないページではバナーが出ない |
| グローバルサービスのパス先頭が上記一覧どおり | 該当サービスが `Global` にならない |
| fixed 表示の `top: 56px` がナビの下に収まる | ナビや本文と重なる |
| ページの CSP 下で拡張同梱 CSS の `<link>` が読み込める(Chrome / Firefox) | バナーが無装飾で表示される(機能と表示位置は保たれる) |
| ページの CSP 下でも `host.style.setProperty()` による位置指定が効く(CSSOM 経由の設定は `style-src` の対象外という理解) | フォールバック表示が右上に固定されず、`body` の末尾に入る |
| Firefox 127 以降でホストアクセスがインストール時に付与される | Firefox でユーザーの手動許可が必要になる |
| `data_collection_permissions` の書式が AMO の要件どおり | AMO 提出時に修正が必要 |
| 同じ manifest の `background.scripts` + `service_worker` 併記が Chrome 121 以降 / Firefox 127 以降で読み込める(MDN の記載どおり) | 拡張が読み込めない、または background が起動せず、常に 1 秒後にバナーが出る |
| Firefox のイベントページで `chrome.storage.session` / `chrome.runtime.onMessage` / `chrome.tabs.onRemoved` がコールバック形式で動く | 復元できず、ページ読み込みのたびにバナーが出る |
| `tabs` 権限なしで `tabs.onRemoved` が発火し、`sender.tab.id` が得られる(Chrome の文書は「ほとんどの機能は権限不要」と書くが、`onRemoved` を名指しした記載は見つけていない。Firefox 側は未確認) | `onRemoved` が来なければ閉じたタブのキーがブラウザ終了まで残る(1 件数十バイト)。`sender.tab.id` がなければ応答せず、常にバナーが出る |
| `storage` 権限がインストール時の警告を出さない(レビューに記載。公式文書では確認できていない) | インストール時に権限の確認が表示される |
| リージョン切替・ページ遷移でタブ ID が変わらない。タブ ID が同一セッション内で再利用されない | 変わる場合は復元できず再表示される(安全側)。再利用される場合は、閉じたタブの値は `onRemoved` で消しているので影響しない想定 |
| service worker の起動を含め、`get` の応答が通常 1 秒以内に返る | 確認済みのページでも読み込みのたびにバナーが出る |
| コンソールのページが bfcache から復元されたとき `pageshow`(`persisted: true`)がコンテンツスクリプトに届く | 「戻る」で復元したページが古い確認状態のまま、次のページ読み込みまで再表示されない |

## 実施した検証

```
$ node --check content.js                       # 成功
$ node --check background.js                    # 成功
$ node -e 'JSON.parse(...manifest.json...)'     # 妥当。permissions は ["storage"]、host_permissions キーなし
$ grep -nE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval|fetch|XMLHttpRequest|WebSocket' content.js background.js
                                                # 該当なし(終了コード 1)
```

加えて、Node の `vm` に最小限の偽 DOM と偽 `chrome` API(`runtime` のメッセージ、`storage.session`、`tabs.onRemoved`)、偽の時計を用意し、`content.js` と `background.js` をそのまま実行して次を確認した(使い捨てスクリプト。リポジトリには含めていない)。

- (a) 東京を確認 → us-east-1 を確認 → 同じタブで東京に戻ると再表示される。東京を確認せず us-east-1 に戻ると出ず、東京を確認してから戻ると出る
- bfcache 復元(`pageshow` の `persisted`)で取り直して再表示される
- (b) タブ 1 とタブ 2 の確認状態が混ざらない。タブ 1 を閉じると `tab:1` だけ消える
- background が、他拡張 ID・タブなし・子フレーム・不正な `region`・未知の `type` のメッセージを保存も応答もしない。保存値が不正なら `null` を返す
- (c) `storage.session.set` が失敗しても、`sendMessage` が例外を出しても、入力一致でバナーが消える
- 拡張コンテキスト無効(`getURL` が例外)でも、無装飾のバナーが右上固定で出て、入力一致で消える
- (d) 3 秒間隔で 60 回消されても毎回ボタンの隣に入る。250ms 間隔の挿入合戦は 20 回で打ち切り、右上固定になる
- (e) background が無応答なら 1 秒後にバナーが出る。`lastError` 応答・`sendMessage` の例外でも出る。応答があれば確認済みのページでは出ない
- ボタンがないとき、位置指定がホスト要素の `style` に入る。入力中も「消すにはリージョンを入力」がバナー本文にある
- IAM のパスで `Global` と表示され、`global` で消え、復元される

偽 DOM・偽 API はブラウザの挙動(Shadow DOM、CSS 読み込み、CSP、実際のナビ構造、service worker の起動と停止、実際の `storage.session`)を再現しないため、実ブラウザでの確認の代わりにはならない。

## 2026-10-09 の変更

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | 一度確認したリージョンに同じタブで戻ると再表示されない | 保存先を `chrome.storage.session`(タブごと 1 件)に移し、`background.js` で仲介。`storage` 権限を追加 |
| 2 | README が挙動と合っていない | 再表示の条件、保存先、`storage` 権限の理由を書き直した |
| 3 | 保存に失敗するとバナーを消せない | メモリ上の `confirmed` を正とし、保存は復元用にした |
| 4 | 挿入回数の上限が累計 | 2 秒以上空いたら数え直す。短い間隔で 20 回続いたときだけ打ち切る |
| 5 | フォールバックの位置が CSS 依存 | 位置指定をホスト要素の `style` に直接設定。`content.css` の `:host([data-fallback])` は削除 |
| 6 | `createBanner()` が途中で失敗すると半端な状態が残る | 組み立て終えてから代入。`getURL` の失敗は無装飾表示に倒す |
| 7 | 案内文言がプレースホルダだけ | バナー本文に常時表示(`<label>`)。プレースホルダは削除 |

手を付けていない指摘(全角入力、多言語化、ボタンの可視性チェック、capture 段階のショートカット、アイコン、表示文字列の長さ上限など)は従来のまま。
