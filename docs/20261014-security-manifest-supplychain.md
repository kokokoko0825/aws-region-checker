# セキュリティ監査: マニフェスト・配布物・リポジトリ衛生・プライバシー

- 監査日: 2026-10-14
- 対象: `/Users/koshi/orca/projects/aws-region-checker` の作業ツリー(未コミットの変更を含む)と git の全履歴(2 コミット、`main` / `feat/region-banner` / `origin/main`)
- 方法: 静的な読解と検索のみ。**実ブラウザ・実際の AWS コンソールでは何も動かしていない。** ブラウザの仕様に関する記述は監査者の知識に基づき、この監査中に公式文書で再確認していない(該当箇所は確度を下げている)。
- `docs/` の review と名の付くファイルと `ideas/` は判断材料にしていない。ただし秘密情報スキャンの検索対象には含めたため、検索結果として数行が目に入っている(指摘 1 は `content.js` の読解と自分の実行結果だけを根拠にした)。

## 要約

| 重大度 | 件数 |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 3 |
| Info | 4 |

**CVSS 3.9 以下に収まっているか: 条件付きで収まっている。**

- 依頼された観点(権限・マニフェスト、配布物、リポジトリ衛生、プライバシー)では、CVSS を付けられる脆弱性は見つからなかった。外部通信・リモートコード・動的コード実行はなく、秘密情報の混入もない。
- 唯一 CVSS が付くのは観点外で見つけた指摘 1(`region` クエリの文字列がバナーに出る)。攻撃条件を高(AC:H)と見れば 3.1、低(AC:L)と見れば 4.3 になる。どちらになるかは「リージョンを含まないホストで、実際のコンソールが不正な `region` クエリを残すか」で決まり、未検証。指摘 1 の修正(正規表現の厳格化、数行)を入れれば、条件なしで 3.9 以下と言える。

最重要の 3 件:

1. 指摘 1: `region` クエリの任意文字列(末尾に電話番号のような数字列も可)がバナーに表示される。
2. 指摘 2: 配布 zip の作り方が決まっておらず、`.gitignore` もない。フォルダごと zip すると `.git/`・`.claude/`・レビュー文書・`ideas/` が入る。配布対象の `content.js` / `content.css` は未コミット。
3. 指摘 3: README の「参照するのは…だけ」が実装と合っていない。また `host_permissions` なしという説明が、インストール時に出るサイトアクセスの警告に触れていない。

## 指摘

### 指摘 1(Low・観点外): `region` クエリの任意文字列がバナーに表示される

- CVSS v3.1: `AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N` = **3.1**。実コンソールが不正な `region` クエリをそのまま残すなら AC:L で **4.3**。
- 根拠:
  - `content.js:10` の `REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d+$/` は、英小文字 2 字で始まり数字で終わるハイフン区切りの文字列なら何でも通す。
  - `content.js:74-78` は ホスト名 → `region` クエリ → リージョンボタンの文字 の順で採用する。ホスト名にリージョンがないとき、クエリがボタンの表示より優先される。
  - `content.js:238` がその値を「現在のリージョン: …」として表示する。
  - 実行結果(Node で同じ正規表現を評価):

    ```
    aa-call-support-0312345678 → REGION_RE: true
    https://console.aws.amazon.com/console/home?region=aa-call-support-0312345678
      host: null / query: aa-call-support-0312345678
    ```
- 影響: リンクを踏ませるだけで、拡張の赤いバナーに攻撃者が選んだ文言を出せる。使えるのは英小文字・ハイフン・末尾の数字だけで、URL や空白は入らない。スクリプト実行にはつながらない(`textContent` で書き込んでいる)。`background.js:8` も同じ正規表現なので、ユーザーが入力すれば保存もされる。
- 未確認の前提: リージョンを含まないホスト(素の `console.aws.amazon.com` など)で、コンソールが不正な `region` クエリを書き換えずに残すこと。リージョン付きホストへ転送されるなら成立しない。
- 修正案: 正規表現を実在するリージョンの形に絞る(`content.js:10` と `background.js:8` の両方)。次の式は上の文字列を拒否し、`ap-northeast-1` / `us-gov-west-1` / `eu-central-2` / `mx-central-1` を通すことを確認した。

  ```js
  const REGION_RE =
    /^(af|ap|ca|cn|eu|il|me|mx|sa|us)(-gov|-iso[a-z]?)?-(north|south|east|west|central|northeast|northwest|southeast|southwest)-\d$/;
  ```

  新しい地域の接頭辞が増えたら追加が要る。それを避けたいなら、クエリよりリージョンボタンの表示を優先する順に入れ替える方法もある。
- 確度: 正規表現が通すこと・表示経路は高。実コンソールで成立するかは低(未検証)。

### 指摘 2(Low): 配布 zip の手順がなく、`.gitignore` もない

- CVSS: 該当なし(現時点で混入しうるファイルに秘密情報はない。手順の欠落)。
- 根拠:
  - `.gitignore` と `.gitattributes` が存在しない(`ls` で確認)。`.claude/` が追跡されていないのは、利用者個人のグローバル ignore(`~/.config/git/ignore`)が効いているだけ(`git check-ignore -v .claude/settings.local.json` の結果)。他の環境で clone して作業すると追跡対象になりうる。
  - フォルダをそのまま zip した場合に入るファイル(`find . -type f`): 拡張本体 5 件のほかに `README.md`、`docs/` 5 件(うちレビュー 4 件)、`ideas/` 1 件、`.claude/settings.local.json`、`.git/` 配下 46 件(228K、全履歴・リモート URL・コミット用メールアドレスを含む)。
  - `git archive HEAD` をパス指定なしで実行しても、`docs/`(レビュー 4 件を含む)と `ideas/` が入る(`unzip -Z1` で確認)。
  - 配布対象の `content.js`(126 行差)と `content.css`(47 行差)が未コミット(`git diff --stat`)。`git archive HEAD` で作る zip は作業ツリーより古いコードになる。
  - `docs/20261008-implementation.md:19` に、実ブラウザ・実コンソールでは未検証と書かれている。
- 修正案: 下の「(5) 配布 zip」の `.gitignore` とコマンドを採用する。
- 確度: 高。

### 指摘 3(Low): README の記述と実装の食い違い

- CVSS: 該当なし(文書の不一致)。
- 3a. 読み取る情報の範囲
  - `README.md:43` は「参照するのは URL のホスト名・パス・`region` クエリと、リージョンボタンの表示テキストだけです」と書く。
  - 作業ツリーの実装はほかに次を読む: 最初の `h2`(なければ `h3`)の計算済み `font-size`(`content.js:158-160`)、`[class*="awsui_toolbar-container"]` の矩形(`content.js:170-171`)、ナビバー要素の矩形(`content.js:205`)、リージョンボタンの矩形と `aria-expanded`(`content.js:199`, `224`)、ビューポート幅(`content.js:207`, `221`)。
  - いずれも寸法・状態だけで文言や個人情報ではないが、「だけ」は事実と違う。`docs/20261008-implementation.md:255` は正しく列挙しているので、README をそれに合わせる。
  - 修正文案: 「参照するのは、URL のホスト名・パス・`region` クエリ、リージョンボタンの表示テキストと開閉状態、バナーの位置と大きさを決めるための要素の寸法(リージョンボタン、ナビバー、ツールバー、見出しの文字サイズ、画面幅)です。見出しの文言は読みません。」
- 3b. `host_permissions` なしの説明
  - `README.md:40` の「`host_permissions` は要求しません」は `manifest.json` と一致する。ただし `content_scripts.matches`(`manifest.json:13`)があるので、Chrome はインストール時に `console.aws.amazon.com` のサイト上のデータの読み取りと変更の警告を出し、コンテンツスクリプトは技術的にはそのページの DOM 全体を読める。README だけ読むとサイトへのアクセスがないように受け取れる。
  - 修正文案を 1 文足す: 「コンテンツスクリプトを注入するため、インストール時に『console.aws.amazon.com 上のデータの読み取りと変更』の確認が表示されます。」
  - 確度: 警告が出ること自体は中(実ブラウザで未確認)。
- 食い違いなしと確認した記述: `permissions` は `storage` のみ(`manifest.json:6`)、`tabs` 権限なし・タブの URL/タイトルを参照しない(`background.js` は `sender.tab.id` と `sender.frameId` だけ使う)、外部通信なし、保存はタブごと 1 件(`background.js:29`)、タブを閉じると削除(`background.js:36-38`)、Firefox 127 以降(`manifest.json:26`)。

### 指摘 4(Info): `minimum_chrome_version` がない

- 根拠: `manifest.json:7-10` は `background.scripts` と `service_worker` を併記している。Chrome がこの併記を警告付きで受け入れるのは 121 以降で、それより前は読み込みに失敗する。`chrome.storage.session` は 102 以降。
- 修正案: `"minimum_chrome_version": "121"` を足す(古い Chrome で壊れた状態ではなく、インストール不可として明示される)。
- 確度: 中(バージョン番号は監査者の記憶。公式文書で再確認していない)。

### 指摘 5(Info): `content_security_policy` を明示していない

- 根拠: キーがない(`manifest.json`)。MV3 の既定値は `script-src 'self'; object-src 'self'`(Firefox は `script-src 'self'; upgrade-insecure-requests`)で、リモートスクリプトと `eval` は既定で禁止される。拡張ページ(popup / options)は存在せず、既定値で不足はない。
- 修正案(任意): 将来の変更で通信やリモート資源が紛れ込むのを止める目的で、より厳しい値を明示できる。

  ```json
  "content_security_policy": {
    "extension_pages": "default-src 'none'; script-src 'self'"
  }
  ```

  Firefox のイベントページでこの値が `background.js` の読み込みを妨げないことは、実ブラウザで確認してから入れる。
- 確度: 既定値で足りることは高。厳格化した値の両ブラウザでの動作は中(未検証)。

### 指摘 6(Info): `web_accessible_resources` による導入検知

- 根拠: `manifest.json:17-22` が `content.css` を `https://*.console.aws.amazon.com/*` に公開している。コンソールのページ上で動くスクリプトは、この URL を読めるかどうかで拡張の導入を判定できる。Firefox では拡張の内部 UUID がインストールごとに違うため、UUID を知られると同じブラウザの識別子になる。
- 影響: 判定できるのは AWS コンソールのオリジンだけ(`matches` で限定済み)。相手はすでにログイン中の利用者を知っており、CSS の中身は静的。脆弱性とは判断しない。`docs/20261008-implementation.md:204` にも既知の性質として書かれている。
- 修正案(任意): 公開をなくすなら、CSS を `content.js` 内の文字列にして Shadow Root に `<style>` で入れ、`web_accessible_resources` を削除する。ページの CSP(`style-src`)の影響を受けないかを Chrome / Firefox の両方で確認する必要があるので、現状維持でもよい。
- 確度: 高(性質)。代替案の動作は中(未検証)。

### 指摘 7(Info): コミットが未署名で、リリースを指すタグがない

- 根拠: `git log --all --format='%h %G?'` は 2 コミットとも `N`(署名なし)。`git tag` は空。CI 設定(`.github/`)もない。
- 影響: 配布物がどのコミットから作られたかを後から確かめる手段がない。
- 修正案: リリースごとに署名付きタグ(`git tag -s v0.1.0`)を打ち、そのタグから zip を作る。ストアの開発者アカウントと GitHub アカウントは 2 要素認証を有効にする(設定状況はこの監査では確認できない)。
- 確度: 高。

## (1) manifest.json の最小権限

| 項目 | 現状 | 判断 |
| --- | --- | --- |
| `permissions` | `["storage"]`(`manifest.json:6`) | 必要。`chrome.storage.session` に使う(`background.js:22`, `29`, `37`)。削れる権限はない。`storage` はインストール時の警告を出さない(確度: 中)。 |
| `host_permissions` / `optional_*` | なし | 問題なし。 |
| 暗黙のホスト権限 | `content_scripts.matches` によるコンソールへのアクセス | 機能に必要。指摘 3b のとおり README に 1 文足す。Firefox の MV3 ではコンテンツスクリプトの一致先が利用者の許可対象になり、127 以降はインストール時に許可される(`strict_min_version: 127.0` と整合。確度: 中)。 |
| `tabs` 権限 | なし | `tabs.onRemoved`(`background.js:36`)と `sender.tab.id` は権限なしで使える(確度: 中、実ブラウザ未確認)。 |
| `content_scripts.matches` | `https://*.console.aws.amazon.com/*` | 適切。https 限定。サインイン画面(`signin.aws.amazon.com`)や他の `amazon.com` には一致しない。これ以上は絞れない(リージョンごとにサブドメインが変わる)。 |
| `run_at` | 未指定(既定 `document_idle`) | 適切。早める理由がない。 |
| `all_frames` / `match_about_blank` / `match_origin_as_fallback` | 未指定(既定 `false`) | 適切。最上位フレームだけに注入。`background.js:18` も `frameId !== 0` を拒否する。 |
| `world` | 未指定(既定 `ISOLATED`) | 適切。 |
| `web_accessible_resources` | `content.css` をコンソールだけに公開 | 指摘 6。 |
| `content_security_policy` | 未指定 | 指摘 5。既定値で足りる。 |
| `externally_connectable` | 未指定 | 問題なし。既定ではウェブページから接続できない。他の拡張は `onMessageExternal` に送れるが、リスナーがない(`background.js` は `onMessage` のみ)。`background.js:17` は送信元の拡張 ID も確認している。 |
| `incognito` | 未指定(既定 `spanning`) | 問題なし。シークレットウィンドウでは利用者が許可した場合だけ動く。保存先はメモリ上の `storage.session` で、タブ ID は通常ウィンドウと重複しない。 |
| `minimum_chrome_version` | 未指定 | 指摘 4。 |
| `gecko` | `id`、`strict_min_version: 127.0`、`data_collection_permissions.required: ["none"]` | 実装と整合(収集なし)。`id` は作者ドメインのメールアドレス形式で、公開される識別子。`update_url` なし(ストア経由の更新)。 |
| `update_url` / `key` / `oauth2` | なし | 問題なし。 |

足すべき堅牢化(指摘 4 は推奨、指摘 5 は任意)。既定値と同じ `run_at` / `all_frames` は足さなくてよい。

```json
{
  "manifest_version": 3,
  "name": "Region Checker for AWS Console",
  "version": "0.1.0",
  "description": "Unofficial. Shows the current region in the AWS Management Console and keeps the banner until you type the region code.",
  "minimum_chrome_version": "121",
  "permissions": ["storage"],
  "content_security_policy": {
    "extension_pages": "default-src 'none'; script-src 'self'"
  },
  "background": {
    "scripts": ["background.js"],
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://*.console.aws.amazon.com/*"],
      "js": ["content.js"]
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["content.css"],
      "matches": ["https://*.console.aws.amazon.com/*"]
    }
  ],
  "browser_specific_settings": {
    "gecko": {
      "id": "(現状のまま)",
      "strict_min_version": "127.0",
      "data_collection_permissions": { "required": ["none"] }
    }
  }
}
```

## (2) 外部通信・リモートコード・動的コード実行

**なし(確度: 高)。** 対象は配布される 4 ファイル(`manifest.json` `background.js` `content.js` `content.css`)。

```
$ grep -nE 'fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|\beval\s*\(|new Function|Function\s*\(|import\s*\(|^\s*import\s|importScripts|innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser|srcdoc|setAttribute\(\s*["']on|https?://|postMessage|chrome\.scripting|executeScript|chrome\.cookies|document\.cookie|localStorage|sessionStorage|indexedDB|navigator\.' manifest.json background.js content.js content.css
manifest.json:13:      "matches": ["https://*.console.aws.amazon.com/*"],
manifest.json:20:      "matches": ["https://*.console.aws.amazon.com/*"]
```

一致は一致パターンの 2 行だけで、通信先 URL ではない。

```
$ grep -nE 'setTimeout|setInterval|requestAnimationFrame' background.js content.js
content.js:101:    setTimeout(finish, RESTORE_TIMEOUT_MS, null);
content.js:247:    setTimeout(() => {
```

どちらも第 1 引数は関数で、文字列ではない。

```
$ grep -nE 'url\(|@import|@font-face|expression\(' content.css
(一致なし)
```

使っている拡張 API は次で全部(`grep -noE 'chrome\.[a-zA-Z.]+'`): `runtime.getURL`(`content.js:141`)、`runtime.sendMessage`(`content.js:84`, `103`)、`runtime.onMessage`(`background.js:15`)、`runtime.id` / `runtime.lastError`、`storage.session.get/set/remove`、`tabs.onRemoved`。

DOM への書き込みは `createElement` / `append` / `textContent` / `style.setProperty` だけで、HTML 文字列を解釈させる箇所はない。読み込む資源は同梱の `content.css` 1 件(`content.js:139-142`)。不可視の双方向制御文字も配布 4 ファイルにない(perl で確認)。

## (3) 読み取る情報と保存する情報

読み取る情報(すべて `content.js`):

| 情報 | 場所 | 用途 |
| --- | --- | --- |
| `location.pathname` の先頭セグメント | 68 | グローバルサービスの判定 |
| `location.hostname` | 75 | リージョンの取得 |
| `location.search` の `region` | 76 | リージョンの取得(指摘 1) |
| `[data-testid="awsc-nav-regions-menu-button"]` の `textContent` | 71 | リージョン名・Global の判定 |
| 同ボタンの矩形と `aria-expanded` | 199, 224 | 位置決め、メニュー表示中に隠す |
| `#awsc-nav-header, header, nav` の矩形 | 205 | 位置決め |
| `[class*="awsui_toolbar-container"]` の矩形 | 170-171 | 位置と高さ |
| 最初の `h2` / `h3` の計算済み `font-size` | 158-160 | 文字サイズ(文言は読まない) |
| `document.documentElement.clientWidth` | 207, 221 | 位置と最大幅 |
| バナー自身の入力欄の値 | 129 | 表示中のリージョンとの一致判定だけ。保存しない |
| DOM の変化(`childList`、`aria-expanded` 属性) | 254-258 | 再描画のきっかけ。変化の内容は読まない |

保存する情報:

| 情報 | 保存先 | 保持期間 |
| --- | --- | --- |
| タブごとのリージョンコードまたは `Global` 1 件。キーは `tab:<タブ ID>`(`background.js:13`, `29`) | `chrome.storage.session`(メモリ上、ディスクに書かれない) | タブを閉じるまで(`background.js:36-38`)。ブラウザ終了、拡張の無効化・再読み込み・更新で全件消える |
| 同じ値 | `content.js:61` の変数 `confirmed` | ページを離れるまで |

アカウント ID・認証情報: **触れていない(確度: 高)。** `document.cookie`・`localStorage`・`sessionStorage`・`chrome.cookies` の使用はなく((2) の検索結果)、アカウントメニューやページ本文を対象にするセレクタもない。保存前に `background.js:11-12` がリージョンの形か検査する。ただしこの検査は指摘 1 の緩い正規表現なので、厳格化すれば保存値も実在するリージョンの形に限られる。

## (4) 秘密情報の混入

**API キー・トークン・パスワード・絶対パス・AWS アカウント ID は、作業ツリーにも全履歴にもない(確度: 高)。** 履歴は `git log --all -p` を `$TMPDIR/hist.patch`(1572 行)に出力して検索した。到達不能オブジェクトと stash もない(`git fsck --unreachable`、`git stash list` とも空)。

| 検索 | 作業ツリー | 全履歴 |
| --- | --- | --- |
| 鍵の形式(`AKIA…`/`ASIA…`、`ghp_` 類、`github_pat_`、`xox?-`、`sk-…`、`AIza…`、`-----BEGIN`、JWT) | 0 件 | 0 件 |
| 語句(`password` `passwd` `api_key` `secret` `token` `bearer` `authorization` `credential`、大文字小文字無視) | 0 件 | 0 件 |
| 32 文字以上の連続した英数字列 | 6 件。すべてファイルパス・CSS クラス名・文書中の例示文字列 | 同じ内容のみ |
| 絶対パス(`/Users/` `/home/` `/private/` `/var/folders` `file://`) | 0 件 | 0 件 |
| 12 桁の数字(AWS アカウント ID の形) | 0 件 | 0 件 |
| メールアドレス | 1 種類・2 か所: `manifest.json:25` と `docs/20261008-implementation.md:243`(gecko の拡張 ID) | 同じ 1 種類 |

個人情報として残っているもの(いずれも意図した公開情報と判断。指摘には数えない):

- `LICENSE:3` の著作権表示に作者の氏名。
- コミットの作者・コミッター欄(2 コミットとも同一の 1 アドレス)。リモートに push 済みなので、公開したくない場合は履歴の書き換えが要る。
- gecko の拡張 ID に作者のドメイン。

`.gitignore`: **存在しない**(指摘 2)。`.claude/settings.local.json` の中身は orca コマンドをサンドボックスから除外する設定だけで、秘密情報はない。

## (5) 配布 zip

入れるファイル(5 件):

- `manifest.json` `background.js` `content.js` `content.css`
- `LICENSE`(MIT の表示義務のため同梱する)

入れてはいけないファイル:

- `.git/`(全履歴、リモート URL、コミット用メールアドレス)
- `.claude/`(ローカルのツール設定)
- `docs/`(レビュー文書 4 件には攻撃シナリオの記述がある)、`ideas/`
- `README.md`(害はないが拡張の動作に不要)
- `.DS_Store` などの OS 生成ファイル(現在は存在しない)

再現可能な作成コマンドの案(コミット済みの内容だけを使い、作業ツリーの未追跡ファイルが入らない):

```sh
# 前提: 配布する内容をコミットし、タグを打ってある(現状は content.js / content.css が未コミット)
git archive --format=zip -o "$TMPDIR/region-checker-0.1.0.zip" v0.1.0 \
  manifest.json background.js content.js content.css LICENSE
unzip -Z1 "$TMPDIR/region-checker-0.1.0.zip"     # 5 件だけであることを確認
shasum -a 256 "$TMPDIR/region-checker-0.1.0.zip" # リリースノートに記録
```

検証: `HEAD` を対象に同じコマンドを 2 回実行し、SHA-256 が一致すること、中身が上の 5 件だけであることを確認した(git 2.54.0)。`git archive` はタイムスタンプにコミット時刻を使うので、同じコミット・同じ git のバージョンなら同じバイト列になる。git のバージョンが違うと圧縮結果が変わる可能性がある。

`.gitignore` の案(リポジトリに置き、個人のグローバル設定に頼らない):

```gitignore
.claude/
.DS_Store
*.zip
```

パスを毎回並べたくない場合は `.gitattributes` に `docs/ export-ignore`、`ideas/ export-ignore`、`README.md export-ignore`、`.gitignore export-ignore`、`.gitattributes export-ignore` を書けば、`git archive v0.1.0` だけで同じ 5 件になる(この方法は未検証)。

## (6) 依存関係とサプライチェーン

- **依存ゼロ(確度: 高)。** `package.json`・ロックファイル・`node_modules`・`.gitmodules`・`.npmrc`・`.github/` はいずれも存在しない(`ls` で確認)。追跡ファイルに同梱ライブラリや圧縮済みコード(`*.min.*`、`vendor`)もない。ビルド工程がないので、配布物はリポジトリのソースそのもの。
- 実行時に取得する外部資源もない((2))。
- 更新経路: `manifest.json` に `update_url` がなく、ストア(Chrome Web Store / AMO)の標準の更新だけになる。README の手順(パッケージ化されていない拡張として読み込む)では自動更新されず、利用者が手で取り直す。
- 残る経路は、作者の GitHub アカウントとストアの開発者アカウント。指摘 7 を参照。
- リモートは `origin`(GitHub、https)1 つだけ。

## (7) README と実装の食い違い

指摘 3 を参照。食い違いは 2 点(読み取る情報の「だけ」、サイトアクセスの警告に触れていないこと)で、それ以外の権限・保存・通信に関する記述は実装と一致している。

## この監査で確認していないこと

- 実ブラウザでの動作(インストール時の警告文、`tabs` 権限なしでの `tabs.onRemoved`、Firefox のイベントページ、CSP を厳格化した場合の動作)。
- 実際の AWS コンソールが不正な `region` クエリをどう扱うか(指摘 1 の成立条件)。
- GitHub リポジトリの公開設定、ブランチ保護、アカウントの 2 要素認証。
