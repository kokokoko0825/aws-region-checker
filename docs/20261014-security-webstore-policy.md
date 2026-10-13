# Chrome Web Store 審査観点レビュー(Region Checker for AWS Console)

- 審査日・ドキュメント取得日: 2026-10-14(以下の出典 URL はすべてこの日に取得した原文に基づく)
- 対象: `manifest.json` / `content.js` / `content.css` / `background.js` / `README.md` / `LICENSE` / `docs/20261008-implementation.md`(作業ツリーの状態。`README.md` `content.css` `content.js` `docs/20261008-implementation.md` は未コミットの変更を含む)
- 読んでいないもの: `docs/` の review と名の付くファイル、`ideas/`
- コードは変更していない。追加したのはこのレポート 1 ファイルのみ
- 確度の表記: 高 = 公式文書の明文またはソースで確認 / 中 = 明文はあるが当てはめに解釈が入る / 低 = 公式文書で確認できず推定

## 1. 結論

**このまま提出しても通らない。** コードとポリシーの相性(単一用途、権限、リモートコード、難読化、外部通信)に問題はないが、提出物として欠けているものがある。

提出前に必須の対応は次の 5 件。上から順に却下の確実性が高い。

1. **アイコンがない**。`manifest.json` に `icons` がなく、パッケージに 128x128 の PNG もない。ストアは `icons` を必須キーとし、アイコン欠落は却下と明記している。
2. **掲載素材がない**。スクリーンショット 1 枚以上、440x280 の小プロモタイル、詳細説明文、カテゴリ、言語が要る。スクリーンショット欠落も却下と明記されている。
3. **実ブラウザで一度も動かしていない**。実装ドキュメント自身が「実ブラウザ・実際の AWS コンソールでは未検証」と書いている。動かない拡張は「Functionality not working」で却下される。提出する zip そのものを Chrome に読み込んで確認する必要がある。
4. **Privacy タブの記入**(単一用途、権限の正当化、リモートコード不使用の申告、データ利用の申告と証明)。未記入では公開できない。文案は 5 章。
5. **プライバシーポリシーの掲載**(安全側の判断)。外部送信はないが、公式 FAQ は「端末内だけで処理・保存する場合も開示が必要」としており、URL 由来の値を保存するこの拡張は「ユーザーデータを扱う」と読まれ得る。文案は 6 章。

これらを済ませれば、通る見込みは高い。新規開発者・新規拡張は審査が詳しくなると公式に書かれているので、初回は数日〜数週間を見込む。

## 2. 必須対応

### M1. アイコンを同梱し `icons` を宣言する(確度: 高)

- 現状: `manifest.json:1-32` に `icons` キーがない。リポジトリに画像ファイルが 1 つもない(`git ls-files` で確認)。実装ドキュメントも「アイコンは未同梱」と記載(`docs/20261008-implementation.md:246`)。
- 根拠:
  - manifest リファレンスは `description` と `icons` を「Keys required by Chrome Web Store」に分類している。https://developer.chrome.com/docs/extensions/reference/manifest
  - 「You must provide a 128x128-pixel extension icon image in the ZIP file of your extension.」PNG 必須、絵柄は 96x96 で周囲 16px は透明余白。https://developer.chrome.com/docs/webstore/images
  - 「If your product has a blank description field or is missing an icon or screenshots, it will be rejected.」https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
  - 却下理由一覧の Yellow Zinc「The extension is missing an icon, title, screenshot, or description.」https://developer.chrome.com/docs/webstore/troubleshooting
- 対応: 128x128 は必須。48x48 は拡張機能の管理ページ用に「should also provide」、16x16 は任意(https://developer.chrome.com/docs/extensions/reference/manifest/icons)。例:

  ```json
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
  ```

- 注意: AWS のロゴ、スマイルマーク、それに似せた図柄は使わない。AWS の商標ガイドラインは第三者の公正使用を「plain text only (no logos)」に限っている(https://aws.amazon.com/trademark-guidelines/ 、ページ記載の最終更新 2026-07-17。要約モデル経由で取得したため原文の逐語確認は未了)。

### M2. 掲載素材をそろえる(確度: 高。動画のみ中)

| 素材 | 要件 | 必須か | 出典 |
| --- | --- | --- | --- |
| ストアアイコン | 128x128 PNG | 必須 | images |
| スクリーンショット | 1280x800 または 640x400、角丸・余白なし、1〜5 枚 | 必須(1 枚以上) | images |
| 小プロモタイル | 440x280、PNG か JPEG | 必須 | images / cws-dashboard-listing |
| マーキータイル | 1400x560 | 任意 | images |
| 詳細説明文 | 冒頭に何をする拡張かを 1 文で | 必須(空欄は却下) | listing-requirements |
| カテゴリ、言語 | 各 1 つ | 必須 | cws-dashboard-listing |
| YouTube 動画 | — | 任意と判断 | 下記 |

- 出典: https://developer.chrome.com/docs/webstore/images 、https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- 動画について文書間に食い違いがある。`cws-dashboard-listing`(2020-12-07 更新)は「マーキー以外は must provide」の一覧に YouTube 動画を含めているが、`images`(2018-06-11 更新)は「Only the extension icon, a small promotional image, and a screenshot are mandatory」と書く。ポリシー本文が却下理由に挙げるのはアイコン・スクリーンショット・説明だけなので、動画は任意と判断した。ダッシュボードの実際の必須表示は未確認。
- スクリーンショットの注意(この拡張に固有):
  - AWS コンソールの画面を写すことになる。アカウント ID、アカウント名、IAM ユーザー名、リソース名を写さないか塗りつぶす。
  - バナーが拡張の表示であると分かる構図にする(R1 参照)。
  - 「実際のユーザー体験を示すこと」が求められているので、合成画像ではなく実画面を使う。

### M3. 実ブラウザで動作確認する(確度: 高)

- 現状: 「実ブラウザ(Chrome / Firefox)・実際の AWS コンソールでは **未検証**」(`docs/20261008-implementation.md:19-21`)。セレクタ(`content.js:4`、`content.js:9`)、`aria-expanded`、Shadow DOM 内の CSS 読み込みなど 30 件超が「未確認の前提」として残っている(`docs/20261008-implementation.md:268-305`)。
- 根拠:
  - 「Extensions with broken functionality—such as dead sites or non-functioning features—are not allowed.」https://developer.chrome.com/docs/webstore/program-policies/policies (Minimum Functionality)
  - Yellow Magnesium の是正方法「Test the exact files that you submit to the web store, not just a local development version.」「Unpacked and packed extensions can have different behaviors.」https://developer.chrome.com/docs/webstore/troubleshooting
- 対応: 提出用 zip を展開したフォルダを `chrome://extensions` で読み込み、最低限次を確認する。
  1. エラー・警告の表示内容(M3 の副産物として 4 章の (7)(8) の実機確認になる)
  2. リージョンのあるサービス(例: EC2 東京)でバナーが出て、`ap-northeast-1` の入力で消える
  3. リージョン切替で再表示される
  4. IAM で `Global` と表示される
  5. リージョンメニューを開いたときに隠れる
- 本レビューでの試行: 手元の Chrome 155.0.8059.40 で `--pack-extension` を試したが、サンドボックスの制約で `.crx` が生成されず、受理可否の実機確認は成立しなかった(ブラウザを開いての読み込みは行っていない)。

### M4. Privacy タブをすべて記入する(確度: 高)

- 根拠: 「Every item will need to provide these data collection disclosures and limited use certification in order to be updated or published.」https://developer.chrome.com/docs/webstore/program-policies/user-data-faq 。記入項目は https://developer.chrome.com/docs/webstore/cws-dashboard-privacy 。
- 項目: 単一用途の説明 / manifest で宣言した権限ごとの正当化 / リモートコードの使用有無 / データ利用のチェックボックスと証明 / プライバシーポリシー URL。
- 文案は 5 章。リモートコードは「No, I am not using remote code」を選ぶ。使っているのに申告しないと却下、と明記されている(この拡張は使っていない。4 章 (3))。

### M5. プライバシーポリシーを公開し、URL を所定欄に入れる(確度: 中)

- ポリシー本文は条件付き: 「If your Product handles any user data, then you must post an accurate and up to date privacy policy.」https://developer.chrome.com/docs/webstore/program-policies/privacy
- 「扱う」に当たるかの判断材料(いずれも https://developer.chrome.com/docs/webstore/program-policies/user-data-faq):
  - FAQ 3: 「Extensions are required to disclose how they handle user data, even when data is processed or stored locally on a user's device and is not transmitted to external servers or third parties.」
  - FAQ 4: ユーザーデータの例に「Website content and resources」「Web browsing activity (… including the domains or URLs the browser interacts with)」を挙げる。
  - FAQ 14: ローカル保存だけでもポリシー掲載は必要。「may not need to be long or complicated」。
- この拡張の当てはめ: 外部送信はゼロ。ただし URL のホスト名・パス・`region` クエリ(`content.js:68-78`)とリージョンボタンの表示文字列(`content.js:70-71`)を読み、そこから得たリージョンコードを `chrome.storage.session` に保存する(`background.js:29`)。「URL 由来の情報を端末内で処理・保存している」と読める。
- 判断: 掲載不要と主張する余地はあるが、「ポリシーなし」での却下(Purple Lithium)は頻出で、掲載の手間は小さい。**掲載する**ことを勧める。置き場所は GitHub リポジトリ内のページ(例: `PRIVACY.md` の表示 URL)か kokokoko0825.dev 配下で足りる。URL は説明文ではなく所定欄に入れる(説明文に書いただけでは却下理由になる、と troubleshooting に明記)。
- Limited Use の表明: 「An affirmative statement that your use of the data complies with the Limited Use restrictions must be disclosed on a website belonging to your extension」https://developer.chrome.com/docs/webstore/program-policies/limited-use 。6 章の文案に 1 文入れてある。

### M6. 開発者アカウント側の前提(確度: 高。登録料の額は未確認)

- 登録料の支払い(1 回限り)。https://developer.chrome.com/docs/webstore/register
- 2 段階認証: 「2-Step Verification is required for all developer accounts prior to publishing」https://developer.chrome.com/docs/webstore/program-policies/policies
- 連絡先メールの確認、パブリッシャー名(必須)。https://developer.chrome.com/docs/webstore/set-up-account
- トレーダー / 非トレーダーの自己申告(EU 向け)。https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure
- パブリッシャー名に「AWS」「Amazon」を入れない(なりすまし規定)。

## 3. 推奨対応

### R1. バナーに拡張の名前を出す(確度: 中。優先度 高)

- 現状: バナーの文言は「現在のリージョン: …」「消すにはリージョンを入力」だけ(`content.js:126`、`content.js:238`)。色は「コンソールのエラー通知に合わせた赤地に白文字」(`content.css:21`)。拡張の名前も「非公式」の表示もなく、AWS 純正の警告に見える。
- 根拠: 「don't represent that your product is authorized by, endorsed by, or produced by another company or organization」https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property 。却下理由 Red Nickel ほか「The extension pretends to be authorized by another entity.」
- 評価: manifest の説明と README は「Unofficial / 非公式」を明記しており(`manifest.json:5`、`README.md:5`)、掲載情報の面では問題ない。弱いのは画面上の表示だけ。
- 対応案: バナー内に小さく「Region Checker」と入れる。スクリーンショットでも拡張の表示だと分かる。

### R2. 表示言語と掲載言語をそろえる(確度: 中。優先度 高)

- 現状: manifest の `name` と `description` は英語(`manifest.json:3-5`)、バナーは日本語固定(`content.js:126`、`content.js:238`)。英語の掲載を見て入れた利用者は日本語の指示を読めず、バナーを消せない。
- 根拠: 「We don't allow extensions with misleading, inaccurate, incomplete … metadata」https://developer.chrome.com/docs/webstore/program-policies/listing-requirements 。審査担当も日本語話者とは限らない。
- 対応案(どちらか):
  - (a) 掲載の言語を日本語にし、説明文の冒頭に「表示は日本語のみ」と書く。コード変更なし。
  - (b) `_locales/ja` と `_locales/en` を用意して文言を `chrome.i18n` に移す。このとき `default_locale` が必須になる。
- `default_locale` は現状ないのが正しい。「This key is required in localized extensions, and must not be used in extensions that aren't localized.」https://developer.chrome.com/docs/extensions/reference/manifest

### R3. `minimum_chrome_version` を `"121"` にする(確度: 中)

- 理由: MDN は「before Chrome 121, Chrome refuses to load a Manifest V3 extension with `background.scripts` or `background.page` present. From Chrome 121, their presence in a Manifest V3 extension is ignored.」と書く。https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- 指定がないと、Chrome 120 以前の利用者はインストールできても読み込みに失敗する。指定すればストアが「Not compatible」を出してインストールを止める。https://developer.chrome.com/docs/extensions/reference/manifest/minimum-chrome-version
- 必須キーではない(任意)。

### R4. テスト手順を書く(確度: 中)

- 現状: 動作対象は `https://*.console.aws.amazon.com/*`(`manifest.json:13`)で、サインイン後でないと 1 画面も対象にならない。審査担当が AWS アカウントを持たなければ機能を確認できない。
- 根拠: Test instructions タブは必須ではないが、「This is only useful if the item requires restricted credentials or a paid account for full access to all features.」https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions 。この拡張はまさにそれに当たる。
- 対応案: 手順(どの URL で何が出て、何を入力すると消えるか)を英語で書く。認証情報を渡す場合は、権限を何も付けない IAM ユーザーを審査専用アカウントに作る。普段使いのアカウントの認証情報は渡さない。渡さない場合は、動作を示すスクリーンショットを増やす。

### R5. 詳細説明文の書き方(確度: 高)

- キーワードスパム規定に「Lists of regional locations」「Unnatural repetition of the same keyword more than 5 times」がある。https://developer.chrome.com/docs/webstore/program-policies/listing-requirements
  - **対応リージョンの一覧(東京、バージニア北部、…)を説明文に並べない。** この拡張では書きたくなる内容なので特に注意。
  - 「AWS」の連呼を避ける。5 章の文案は 5 回以内に収めてある。
- 非公式である旨と商標の帰属を入れる。AWS のガイドラインが求める帰属文は「Amazon Web Services, AWS, and the Powered by AWS logo are trademarks of Amazon.com, Inc. or its affiliates.」(https://aws.amazon.com/trademark-guidelines/ 。逐語は未確認)。
- 権限と理由を載せる。「you should include a list of permissions used and the reasons you require them in your Chrome Web Store listing」https://developer.chrome.com/docs/webstore/program-policies/user-data-faq (Minimum Permission 4)
- 「誤操作を防止する」と断定しない。README の「防止・保証するものではありません」(`README.md:48`)と同じ調子にする。できないことを機能としてうたうのは Misleading or Unexpected Behavior に触れる。

### R6. zip に入れるファイルを絞る(確度: 中)

- 入れる: `manifest.json`(必ずルート直下)、`content.js`、`content.css`、`background.js`、追加するアイコン。`LICENSE` は任意。
- 入れない:

  | 対象 | 理由 |
  | --- | --- |
  | `.git/` | 履歴・作者情報が配布物に入る。容量も増える |
  | `.claude/` | 開発ツールのローカル設定 |
  | `docs/`、`ideas/` | 設計メモとレビュー記録。拡張の動作に無関係 |
  | `README.md` | 動作に不要(入れても違反ではない) |
  | `.DS_Store` などの OS 生成物 | 不要 |
  | `*.pem`、`*.crx` | `.pem` は署名用の秘密鍵。パック操作をした場合に生成される |

- 根拠: 「Make sure you place the manifest file in the root directory, not in a folder.」https://developer.chrome.com/docs/webstore/prepare 。不要ファイルの混入を禁じる明文は見つけていない。審査は「コード量が多いほど時間がかかる」と書いている(https://developer.chrome.com/docs/webstore/review-process)。
- 例(アイコンを `icons/` に置いた場合):

  ```sh
  zip -r region-checker-0.1.0.zip manifest.json content.js content.css background.js icons LICENSE
  ```

- フォルダごと圧縮すると `manifest.json` がルートに来ず、アップロードで弾かれる。
- 未コミットの変更が 4 ファイルにある。提出する zip は、M3 で確認した状態をコミットしてから作る。

### R7. `homepage_url` とサポート URL(確度: 高)

- どちらも任意。`homepage_url` は未指定ならストアのページになる(https://developer.chrome.com/docs/extensions/reference/manifest)。GitHub リポジトリの URL を入れておくと、Limited Use の表明やプライバシーポリシーの置き場所と筋が通る。

### R8. Chrome 専用の manifest を用意できるようにしておく(確度: 低)

- `background.scripts` と `service_worker` の併記を Chrome 本体は受け付ける(4 章 (7))。一方、**Web Store のアップロード検証が受け付けるかは公式文書で確認できていない。**
- アップロードで弾かれた場合の回避策は、`background.scripts` を外した Chrome 用 manifest を zip に入れること。ビルド工程を今から作る必要はない(弾かれてからで足りる)。

## 4. 問題なしと判断した項目

### (1) 単一用途(確度: 高)

- 機能は「AWS コンソールで現在のリージョンを表示し、入力で確認させる」の 1 つ。設定画面、ツールバーボタン、広告、新規タブの置き換え、検索の変更はない(`manifest.json:1-32` に `action` `options_ui` `chrome_url_overrides` なし)。
- 「An extension can have a single purpose limited to a narrow focus area or subject matter」https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq に当たる。
- 常時表示の UI については「actively enhance the user's current task while causing minimal distractions」とある。バナーは確認するまでツールバー行を覆うが、それ自体が目的で、入力すれば消える。説明文にこの挙動を明記すれば足りる。

### (2) 権限の最小化(確度: 高)

- `storage`: `chrome.storage.session` を実際に使っている(`background.js:22`、`background.js:29`、`background.js:37`)。却下理由一覧の表は「When using the chrome.storage API」を storage が必要な場合としている。https://developer.chrome.com/docs/webstore/troubleshooting
  - より狭い代替がないか: ページの `sessionStorage` は権限不要だが、コンソールはリージョンごとにオリジンが変わるため値を持ち越せない(`README.md:41`)。代替不可という説明は成り立つ。
  - 権限一覧で `storage` に「Warning displayed」の記載はない。https://developer.chrome.com/docs/extensions/reference/permissions-list
- `host_permissions`: 宣言なし。`tabs`: 宣言なし。`chrome.tabs.onRemoved`(`background.js:36`)と `sender.tab.id`(`background.js:18`)は `tabs` 権限なしで使える。同じ表が「This permission ONLY grants access to the `url`, `pendingUrl`, `title`, or `favIconUrl` properties」としている。
- コンテンツスクリプトの一致パターン `https://*.console.aws.amazon.com/*`(`manifest.json:13`): HTTPS のみ、AWS コンソールのホストのみ。`all_frames` 未指定で最上位フレームだけ。`*.` はサブドメインに一致する(https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)。リージョンがサブドメインに入るため、これ以上は絞れない。
  - `content_scripts.matches` はインストール時の警告対象になり得る(「Changes may trigger a warning」https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)。警告の文言は未確認。
- `web_accessible_resources`(`manifest.json:17-22`): `content.css` だけを AWS コンソールに限定して公開。権限ではない。副作用は、コンソールのページがこのファイルの取得可否で拡張の導入を検知できること。中身は静的な CSS で、情報は漏れない。

### (3) リモートコード・難読化・eval(確度: 高)

- `content.js` `background.js` `content.css` を検索し、`eval(`、`new Function`、`innerHTML` 系、`document.write`、`fetch(`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、`importScripts`、`atob(`、16 進・Unicode エスケープ、`http(s)://` の URL 文字列、`cookie`、`localStorage` のいずれも 0 件。
- 外部から読み込むものはない。唯一の `<link>` は同梱の `content.css`(`content.js:139-142`、`chrome.runtime.getURL`)。
- コードは圧縮も難読化もしていない(コメント付きの原文)。
- 根拠: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements 、https://developer.chrome.com/docs/webstore/program-policies/code-readability

### (4) ユーザーデータの扱い(確度: 高。申告の要否は M5 のとおり中)

- 外部送信なし。保存はメモリ上のセッション領域のみで、タブを閉じると該当分を削除する(`background.js:36-38`)。
- 保存する値は形式検証を通ったリージョンコードか `Global` だけ(`background.js:8-12`、`background.js:28`)。
- アカウント ID、ユーザー名、Cookie は読まない。見出しは計算済みのフォントサイズだけを読む(`content.js:156-166`)。
- 入力欄の値は保存も送信もせず、表示中のリージョンとの比較にだけ使う(`content.js:128-132`)。

### (5) 名称と説明文(確度: 中)

- 名称「Region Checker for AWS Console」は 30 文字(上限 75)、説明は 119 文字(上限 132)。https://developer.chrome.com/docs/extensions/reference/manifest
- 「[自分の名前] for [AWS の商標]」の形は、AWS の商標ガイドラインが第三者に認める書式と一致する(例示は「YourApp for Amazon S3」。https://aws.amazon.com/trademark-guidelines/ )。「AWS」は同ガイドラインの商標一覧にあり、「AWS Management Console」は一覧にないとの取得結果だった(要約経由。逐語は未確認)。
- 説明の冒頭に「Unofficial.」がある(`manifest.json:5`)。README にも非公式の明記と商標の帰属がある(`README.md:5`)。
- Chrome Web Store 側の規定(なりすまし、知的財産)に触れる表現は見当たらない。残る弱点は R1(画面上の表示)とアイコンの図柄(M1)。
- 商標権者からの申立てがあれば、ストアは掲載の可視性を下げ得る(「The visibility of your Product may be impacted」)。これは事前に排除できない。

### (6) manifest のその他の項目(確度: 高)

| キー | 現状 | 判断 |
| --- | --- | --- |
| `manifest_version` | 3(`manifest.json:2`) | 必須。問題なし |
| `name` | あり | 必須。問題なし |
| `version` | `0.1.0`(`manifest.json:4`) | 必須。書式は有効。更新のたびに上げる必要がある |
| `description` | あり、119 文字 | ストア必須。問題なし |
| `icons` | **なし** | ストア必須。M1 |
| `default_locale` | なし | 現状は付けないのが正しい(R2) |
| `homepage_url` | なし | 任意(R7) |
| `minimum_chrome_version` | なし | 任意(R3) |
| `short_name` | なし | 任意。上限 12 文字。不要 |

### (7) `background.scripts` と `service_worker` の併記(確度: Chrome 本体は高、Web Store は低)

- Chromium のソース(main ブランチ)で確認した。
  - `background.scripts` は `max_manifest_version: 2` の機能として登録されている。https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/api/_manifest_features.json
  - manifest の値は、その版で使えないキーを除いたうえで読まれる(`available_values_`)。https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/manifest.cc
  - 併記を禁じるエラー(「Only one of 'background.page', 'background.scripts', and 'background.service_worker' can be specified.」)は存在するが、MV3 では `scripts` が先に除外されるため発動しない。https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/manifest_handlers/background_info.cc
  - 使えないキーがあると、エラーではなくインストール警告が 1 件付く(同 `manifest.cc` の `ValidateManifest`)。警告は `chrome://extensions` に出る開発者向けの表示で、動作には影響しない。警告の正確な文言は未確認。
- MDN も Chrome 121 以降は無視すると記載し、両対応の方法としてこの併記を例示している。
- Chrome 公式の manifest リファレンス(https://developer.chrome.com/docs/extensions/reference/manifest/background)は `service_worker` しか説明しておらず、併記には触れていない。
- **Web Store のアップロード検証がこの併記を受け付けるかは未確認。** 公式文書に記載がない。対策は R8。

### (8) `browser_specific_settings`(確度: Chrome 本体は高、Web Store は低)

- Chromium のソースに、警告を出さず無視するキーとして明記されている。

  ```cpp
  inline constexpr const char* const kIgnoredUnrecognizedKeys[] = {
      // This is used by non-Chromium browsers:
      "browser_specific_settings",
      "$schema"};
  ```

  https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/manifest_constants.h
- MDN: 「Chrome doesn't use this key and ignores it if present」https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
- Chrome 側で警告にも却下にもならない。この無視リストが手元の Chrome 155 に入っているかは未確認(main ブランチのソースで確認した)。Web Store 側の扱いを定めた公式文書は見つけていない。
- 中身の `gecko.id`(`region-checker@kokokoko0825.dev`)は公開情報で、秘密ではない。

### (9) zip の内容

- R6 のとおり。現状のリポジトリにはパッケージ化の手順がなく、フォルダごと圧縮すると `.git/` `.claude/` `docs/` `ideas/` が入る。

## 5. ダッシュボードに貼る文案

審査担当に読まれる欄は英語で書いてある。

### 単一用途の説明(Single purpose description)

```text
This extension has one purpose: to make the user confirm which AWS region they are working in.
On pages of the AWS Management Console it shows a banner with the current region code, and the banner stays until the user types that region code. It appears again when the region changes in that tab. It has no other features.
```

### 権限の正当化: `storage`

```text
The extension remembers, per browser tab, the last region the user confirmed, so the banner is not shown again on every page load. The value is kept in chrome.storage.session (in memory only, cleared when the browser closes). The console uses a different origin for each region, so the page's own sessionStorage cannot carry this value across a region switch. Only a region code such as "ap-northeast-1" or the word "Global" is stored. Nothing is written to disk or sent anywhere.
```

### ホスト権限の正当化(欄が表示された場合): `https://*.console.aws.amazon.com/*`

`host_permissions` は宣言していないが、コンテンツスクリプトの一致パターンに対して欄が出る可能性がある(出るかどうかは未確認)。

```text
The content script runs only on the AWS Management Console (https://*.console.aws.amazon.com/*), because that is the only place the banner is needed. The region is part of the subdomain (for example us-east-1.console.aws.amazon.com), so a wildcard subdomain is required. The script reads the region from the page URL and from the console's region button, and draws the banner. It does not read account IDs, user names, cookies or page content, and it makes no network requests.
```

### リモートコード

「No, I am not using remote code」を選ぶ。理由欄が出た場合:

```text
All JavaScript and CSS is included in the package. The extension does not load or execute any remote code and makes no network requests.
```

### データ利用の申告

- 第 1 群(収集するデータの種類): **どれもチェックしない**ことを勧める(確度: 中)。
  - 理由: 開発者にも第三者にもデータは渡らない。端末内に残るのはリージョンコード 1 件で、個人や閲覧先を特定する情報ではない。
  - 異論の余地: FAQ 3 は端末内だけの処理も開示対象とする。より安全側に倒すなら、閲覧履歴に相当する項目(Web history)にチェックを入れ、ポリシーで「URL からリージョンコードだけを取り出す」と説明する。その場合、ストアの掲載ページに「閲覧履歴を扱う」と表示される。どちらを選んでも、6 章のポリシーで実際の扱いを具体的に書くことが前提になる。
  - チェックボックスの正確な項目名は、公式文書に列挙がなく未確認。ダッシュボードの実表示で確認する。
- 第 2 群(証明): 3 項目すべてにチェックできる。第三者への販売・移転なし、単一用途と無関係な利用・移転なし、与信目的の利用・移転なし。実装と一致する(4 章 (4))。
- 申告とポリシーと実際の挙動が食い違うと、掲載削除やアカウント停止の対象になる(user-data-faq)。今後、解析や通信を足す場合は先に申告を直す。

### 詳細説明文(日本語で掲載する場合)

```text
AWS マネジメントコンソールで、いま操作しているリージョンを入力するまで消えないバナーを表示します。リージョンを取り違えたまま作業するのを減らすための拡張です。

■ 動作
・コンソールの画面右上に「現在のリージョン: ap-northeast-1」と入力欄を表示します。
・表示されているリージョンコードを入力するとバナーが消えます。
・同じタブでリージョンを切り替えると、もう一度表示します。
・IAM などリージョンを持たないサービスでは「Global」と表示します。

■ 権限とデータ
・動作するのはコンソール(*.console.aws.amazon.com)のページだけです。
・「storage」権限は、タブごとに最後に確認したリージョンを覚えるために使います。保存先はメモリ上で、ブラウザを閉じると消えます。
・外部との通信は行いません。アカウント ID、ユーザー名、Cookie は読みません。

■ 注意
・表示は日本語のみです。
・リージョンを意識するための表示であり、誤操作を防ぐことを保証するものではありません。
・コンソールの画面構成が変わると、表示位置がずれたり表示されなくなったりすることがあります。
・GovCloud と中国リージョンのコンソールは対象外です。

非公式の拡張です。Amazon Web Services, Inc. およびその関連会社とは無関係で、提供・承認・サポートを受けていません。Amazon Web Services、AWS は Amazon.com, Inc. またはその関連会社の商標です。
```

### テスト手順(Test instructions)

```text
1. Sign in to the AWS Management Console (any account; no AWS permissions are needed).
2. Open https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1
3. A red banner appears near the top right, showing the region code "ap-northeast-1" and a text field. The banner text is in Japanese.
4. Type ap-northeast-1 in the field. The banner disappears.
5. Switch the region with the console's region menu. The banner appears again with the new region code.
```

## 6. プライバシーポリシー文案

公開する URL を Privacy タブの所定欄に入れる。連絡先は公開してよいアドレスに差し替える。

```markdown
# Region Checker for AWS Console プライバシーポリシー

最終更新日: 2026-10-14

## 収集・送信する情報

この拡張は、利用者の情報を開発者にも第三者にも送信しません。外部との通信を行いません。

## 端末内で扱う情報

AWS マネジメントコンソールのページ(https://*.console.aws.amazon.com/)でのみ、次の情報を読み取ります。

- ページの URL のうち、ホスト名、パスの先頭部分、region パラメータ(リージョンを判定するため)
- コンソールのリージョン選択ボタンの表示文字列(同上)
- 画面上の要素の位置と文字サイズ(バナーを配置するため)

アカウント ID、ユーザー名、Cookie、認証情報、ページの内容は読み取りません。

## 保存する情報

タブごとに、最後に確認したリージョンコード(例: ap-northeast-1)または「Global」を 1 件、ブラウザのメモリ上(chrome.storage.session)に保存します。

- ディスクには書き込みません。
- タブを閉じるとそのタブの分を削除します。
- ブラウザの終了、拡張の無効化・更新ですべて消えます。

## 第三者への提供

ありません。

## 利用目的の制限

この拡張による情報の利用は、Chrome ウェブストアのユーザーデータに関するポリシー(Limited Use の要件を含む)に従います。扱う情報は、現在のリージョンを表示し確認させるという単一の目的にのみ使います。

## 変更

このポリシーを変更する場合は、このページを更新します。

## 連絡先

me@kokokoko0825.dev
```

英語版を併記する場合の要点(同じ内容): "This extension does not collect or transmit any data. On AWS Management Console pages it reads the region from the page URL and the region button, and keeps the last confirmed region code per tab in memory (chrome.storage.session) until the tab or browser is closed. Nothing is shared with third parties. The use of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements."

## 7. 出典一覧(すべて 2026-10-14 取得)

| 文書 | URL | ページ記載の更新日 |
| --- | --- | --- |
| Program Policies(全文) | https://developer.chrome.com/docs/webstore/program-policies/policies | 2025-05-22 |
| Listing Requirements | https://developer.chrome.com/docs/webstore/program-policies/listing-requirements | 2024-07-10 |
| Impersonation & Intellectual Property | https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property | 2022-11-01 |
| Use of Permissions | https://developer.chrome.com/docs/webstore/program-policies/permissions | 2022-11-01 |
| Privacy Policies | https://developer.chrome.com/docs/webstore/program-policies/privacy | 2022-11-01 |
| Limited Use | https://developer.chrome.com/docs/webstore/program-policies/limited-use | 2022-11-01 |
| Code Readability Requirements | https://developer.chrome.com/docs/webstore/program-policies/code-readability | 2022-11-01 |
| Additional Requirements for Manifest V3 | https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements | 2024-04-03 |
| User Data FAQ | https://developer.chrome.com/docs/webstore/program-policies/user-data-faq | ページ表示は 2016-04-23(本文は 2019 年以降の内容を含む) |
| Quality Guidelines FAQ(単一用途) | https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq | 2024-07-10 |
| Trader / Non-Trader | https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure | 2024-02-09 |
| 却下理由の一覧(Troubleshooting) | https://developer.chrome.com/docs/webstore/troubleshooting | 2026-07-20 |
| Privacy タブの記入 | https://developer.chrome.com/docs/webstore/cws-dashboard-privacy | 2020-06-12 |
| Store listing タブの記入 | https://developer.chrome.com/docs/webstore/cws-dashboard-listing | 2020-12-07 |
| Test instructions | https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions | 2025-05-16 |
| 画像の要件 | https://developer.chrome.com/docs/webstore/images | 2018-06-11 |
| 提出準備 | https://developer.chrome.com/docs/webstore/prepare | 2023-10-16 |
| 公開手順 | https://developer.chrome.com/docs/webstore/publish | 2014-02-28 |
| 審査プロセス | https://developer.chrome.com/docs/webstore/review-process | 2021-12-10 |
| 登録 / アカウント設定 | https://developer.chrome.com/docs/webstore/register 、https://developer.chrome.com/docs/webstore/set-up-account | 2024-02-13 / 2023-10-16 |
| Manifest file format | https://developer.chrome.com/docs/extensions/reference/manifest | 2012-09-18 |
| Manifest: background / icons / minimum_chrome_version | https://developer.chrome.com/docs/extensions/reference/manifest/background ほか | 2023-05-24 / 2013-05-12 / 2024-04-26 |
| 権限一覧 | https://developer.chrome.com/docs/extensions/reference/permissions-list | 2026-09-09 |
| 権限の宣言 / 一致パターン | https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions 、…/match-patterns | 2024-02-05 / 2012-09-18 |
| chrome.storage | https://developer.chrome.com/docs/extensions/reference/api/storage | 2026-09-11 |
| Chromium ソース(main) | https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/ 配下の `manifest.cc`、`manifest_constants.h`、`manifest_handlers/background_info.cc`、`api/_manifest_features.json` | — |
| MDN: background / browser_specific_settings | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background 、…/browser_specific_settings | 未確認(要約経由で取得) |
| AWS Trademark Guidelines | https://aws.amazon.com/trademark-guidelines/ | 2026-07-17(要約経由で取得) |

developer.chrome.com と chromium.googlesource.com は原文を直接取得して読んだ。MDN と AWS の 3 ページは要約モデル経由の取得で、引用は要約が返した文言であり、原文との逐語照合はしていない。

## 8. 未確認の事項

| 事項 | 影響 |
| --- | --- |
| Web Store のアップロード検証が `background.scripts` + `service_worker` の併記を受け付けるか | 弾かれたら Chrome 用 manifest から `scripts` を外す(R8) |
| Web Store が `browser_specific_settings` に警告を出すか | Chrome 本体は無視する。弾かれたら Chrome 用 manifest から外す |
| Chrome 155 での実際の読み込み結果と警告表示 | M3 の実機確認で分かる |
| Privacy タブのデータ種別チェックボックスの正確な項目名と、コンテンツスクリプトの一致パターンに正当化欄が出るか | 5 章の文案の当てはめ先が変わるだけ |
| インストール時に表示される権限警告の文言 | 説明文に書く内容に影響しない |
| ダッシュボードが YouTube 動画を必須として扱うか | 必須なら短い動画が要る |
| 開発者登録料の金額 | — |
| `chrome.storage.session` が使える最小の Chrome バージョン(実装ドキュメントは 102 と記載) | R3 で 121 を指定すれば影響しない |
| AWS 商標ガイドラインと MDN の原文の逐語 | 引用文言の細部 |
