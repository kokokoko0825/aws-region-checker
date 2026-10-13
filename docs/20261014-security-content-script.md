# セキュリティ監査: コンテンツスクリプトと DOM まわりの攻撃面

- 監査日: 2026-10-14
- 対象: `manifest.json` / `content.js` / `content.css` / `background.js`(作業ツリーの現状。`docs/` `ideas/` は未読)
- 観点: ページ側(改ざんされたページ・他の拡張)から拡張へ入る経路、露出、イベント処理、MutationObserver、適用範囲

## 要約

| 重大度 | 件数 |
| --- | --- |
| Critical (9.0–10.0) | 0 |
| High (7.0–8.9) | 0 |
| Medium (4.0–6.9) | 0 |
| Low (0.1–3.9) | 3 |
| 情報(CVSS 対象外の堅牢性・アクセシビリティ・品質) | 5 |

**結論: 全体として CVSS 3.9 以下に収まっている。最大は L-1 の 3.1。**

理由は次の 3 点。

1. 拡張がページから受け取る値は、正規表現で検証したリージョン文字列だけ。HTML や URL として解釈するシンクがない。
2. 拡張の権限は `storage` のみで、ページへ返す機密もない。ページ側を完全に掌握した攻撃者が拡張経由で新しく得られるものがない。
3. 残る 3 件はすべて「警告バナーを出さない・偽の表示にする」という完全性 Low の影響で、いずれも前提条件が重い。

Low 3 件の一覧:

| ID | 内容 | CVSS v3.1 | 確度 |
| --- | --- | --- | --- |
| L-1 | `?region=` クエリを信頼するため、リンク経由で表示リージョンを偽れる可能性 | 3.1 | コードから推論(AWS 側の挙動は未確認) |
| L-2 | DOM clobbering(`<img name="body">` など)でバナーを出させない | 2.6 | メインワールドで確かめた。isolated world では未確認 |
| L-3 | ページの CSS だけでバナーを隠せる(`div:empty` など) | 2.6 | 最小再現で確かめた |

## 検証方法と限界

- Node.js で `REGION_RE` の実行時間を計測した。
- Playwright(Chrome 155)の `about:blank` に、`content.js` と同じ構造の最小再現(closed Shadow DOM、同じリスナ、同じ MutationObserver 設定)を流し込んで挙動を確かめた。
- **拡張として読み込んでの検証はしていない。** ローカルサーバの待ち受けと `file:` の読み込みがサンドボックスで拒否されたため、`content.js` そのものは実行していない。「実際に確かめた」と書いた項目は、メインワールドでの最小再現の結果である。
- 実際の AWS コンソールには接続していない。コンソールの DOM 構造、CSP、リダイレクトの挙動はすべて未確認。
- 公式ドキュメントで確認したのは次の 3 点だけ。それ以外のブラウザ仕様の前提は、各項目に未確認と書いた。
  - Chrome: `web_accessible_resources` の `matches` は「どのサイトがリソースにアクセスできるか」を指定する。
  - Chrome: コンテンツスクリプトは isolated world で動き、ページと互いの変数・コンテキストにアクセスできない。`match_about_blank` の既定は false。
  - MDN: Firefox の `moz-extension://` の UUID はブラウザインスタンスごとにランダム。web accessible なリソースは CSP と CORS でブロックされない。

## 脅威モデル

コンテンツスクリプトが動くページは AWS コンソールのオリジンだけ。そこで任意のスクリプトを実行できる攻撃者は、すでにコンソールのセッションを操作できる。したがって「ページの JS がバナーを消せる」こと自体は、拡張が新しく生む被害ではない。

意味があるのは、スクリプト実行より弱い前提で成立する次の 3 経路。Low の 3 件はこれに対応する。

- 細工したリンクを踏ませるだけ(L-1)
- スクリプトなしの HTML 注入(L-2)
- CSS だけの注入、またはコンソール自身の CSS との偶然の衝突(L-3)

---

## 指摘

### L-1: `?region=` クエリを信頼するため、表示リージョンを偽れる可能性

- 重大度: Low
- CVSS v3.1: `AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N` = **3.1**
- 根拠: `content.js:74-78`(判定の優先順位)、`content.js:230`(`region === confirmed` ならバナーを消す)
- 確度: コードから推論。AWS 側が `region` クエリをどう扱うかは未確認

**内容**

`getRegion()` はホスト名にリージョンがないとき、ボタンの文言より先に `?region=` を採用する。クエリはリンクの作成者が自由に決められる。

**攻撃手順(成立条件つき)**

1. 被害者がタブで `ap-northeast-1` を確認済みにしている。
2. 攻撃者が `https://console.aws.amazon.com/<サービス>/home?region=ap-northeast-1` のようなリンクを踏ませる。
3. そのページが、ホスト名にリージョンを含まず、かつ `region` クエリを無視して別のリージョン(たとえば前回使った `us-east-1`)で動く場合、`getRegion()` は `ap-northeast-1` を返す。確認済みと一致するのでバナーは出ない。

成立するには手順 3 の条件を満たすコンソールのページが必要。通常のサービスはクエリのリージョンのホストへリダイレクトするはずで、その場合は表示が正しくなり攻撃は成立しない。該当するページが実在するかは確かめていないので AC:H とした。

**修正案**

クエリを判定に使わない。ホスト名で決まらなければボタンの文言だけを見る。

```js
return (
  findRegion(location.hostname.split(".")) ??
  findRegion(buttonText.split(/[^a-z0-9-]+/))
);
```

ボタンの文言がリージョンコードでなく表示名(「東京」など)だけの環境では、ホスト名にリージョンがないページでバナーが出なくなる。その場合は「クエリとボタンの両方から取れて食い違うならバナーを出す」形にする。ボタン文言の実際の形式は未確認。

### L-2: DOM clobbering でバナーを出させない

- 重大度: Low
- CVSS v3.1: `AV:N/AC:H/PR:L/UI:R/S:U/C:N/I:L/A:N` = **2.6**
- 根拠: `content.js:71`、`content.js:158`、`content.js:170`、`content.js:196-198`、`content.js:254`
- 確度: メインワールドでは実際に確かめた。isolated world(Chrome)と Xray(Firefox)で同じになるかは未確認

**内容**

`document.body` / `document.querySelector` / `document.documentElement` をプロパティとして直接読んでいる。`Document` は名前付き要素が組み込みプロパティを上書きするため、スクリプトなしの HTML 注入で値をすり替えられる。

**再現例(Chrome 155、メインワールド)**

| 注入する HTML | 結果 |
| --- | --- |
| `<img name="body">` | `document.body` がその `img` になる。`document.body.append(host)` は `img` の子に入り、バナーは描画されない |
| `<form name="querySelector">` | `document.querySelector(...)` が `TypeError: document.querySelector is not a function`。`update()` が毎回例外で止まり、バナーは出ない |
| `<img name="documentElement">` | `document.documentElement` がその `img` になる。読み込み時に存在すれば MutationObserver が `img` を監視し、DOM の変化を拾えない |
| `<img name="location">` | 影響なし。`location` は上書きされない |

**攻撃手順**

1. 攻撃者が、コンソール上で HTML として描画される場所(リソースの説明欄など)に上の要素を入れる。スクリプトは不要なので CSP の `script-src` では止まらない。
2. 被害者がそのページを開くと、バナーが出ない。

前提として、`name` 属性を残す HTML 注入がコンソール側に必要。そのような箇所が実在するかは確かめていない。DOMPurify などは既定でこの種の `name` を落とすため AC:H とした。

**修正案**

冒頭でプロトタイプから参照を取り、以後それを使う。確かめた範囲では `Document.prototype.querySelector.call(document, ...)` は clobbering の影響を受けなかった。

```js
const getter = (name) => Object.getOwnPropertyDescriptor(Document.prototype, name).get;
const bodyOf = getter("body");
const rootOf = getter("documentElement");
const qs = (selector) => Document.prototype.querySelector.call(document, selector);
const qsa = (selector) => Document.prototype.querySelectorAll.call(document, selector);
```

`document.body` → `bodyOf.call(document)`、`document.documentElement` → `rootOf.call(document)` に置き換える。`document.createElement`(`content.js:113` ほか)も同じ理由で `Document.prototype.createElement.call(document, ...)` にする。

### L-3: ページの CSS だけでバナーを隠せる

- 重大度: Low
- CVSS v3.1: `AV:N/AC:H/PR:L/UI:R/S:U/C:N/I:L/A:N` = **2.6**
- 根拠: `content.js:178-182`(`setProperty` に優先度を付けていない)、`content.js:224`、`content.css:3-6`
- 確度: 最小再現で実際に確かめた

**内容**

ホスト要素は light DOM にある `<body>` 直下の `div` で、light DOM 上の子を持たない。そのため `:empty` に一致する。ページ側の `!important` 付きの規則は、優先度なしのインライン指定と `:host` の規則に勝つ。

**再現例**

```css
div:empty { display: none !important; }
```

これをページに入れると、ホストの `getComputedStyle(host).display` は `none` になった。インライン側を `setProperty("display", "block", "important")` にすると `block` に戻った。

攻撃としては CSS 注入が必要で、前提は L-2 と同程度に重い。ただしこの規則は一般的な書き方なので、**攻撃でなくてもコンソール側の CSS 変更で偶然バナーが消える**。`opacity` `visibility` `transform` `clip-path` と、`--banner-font-size`(`content.js:214`)も同じ方法で上書きできる。

**修正案**

`setStyle` で常に `important` を付ける。

```js
else host.style.setProperty(name, value, "important");
```

あわせて `HOST_STYLE` に `visibility: visible` / `opacity: 1` / `transform: none` / `clip-path: none` を足す。`display` は表示時に `null`(指定なし)ではなく `block` を入れる。

これで防げるのは CSS だけの経路。ページのスクリプトによる削除や、top layer(`<dialog>` の `showModal()` など)での上書きは防げない。それは脅威モデルの範囲外として受け入れる。

---

## 情報(CVSS 対象外)

### I-1: `stopPropagation` はキャプチャ段階のリスナには効かない

- 根拠: `content.js:133-136`
- 確度: 最小再現で実際に確かめた

入力欄にフォーカスして `u` を押したとき、`document` のバブル段階のリスナには届かなかった。`window` のキャプチャ段階のリスナには `key="u"`、`target` はホストの `DIV` として届いた。

- コンソールのショートカットがキャプチャ段階で登録されていれば、入力中にも発火する。コメントの意図は部分的にしか満たされない。コンソール側の登録方法は未確認。
- ページは打鍵を読める。ただし入力内容はページ自身が表示しているリージョンコードで、秘密ではない。機密性の影響はない。

修正するなら、`window` にキャプチャ段階のリスナを置き、`event.composedPath()[0] === input` のときだけ `stopImmediatePropagation()` する。ページのスクリプトが先に登録していれば防げないので、完全にはならない。現状維持でも安全上の問題はない。

### I-2: ページのスクリプトが確認を代行できる(追加の影響なし)

- 根拠: `content.js:128-132`
- 確度: 最小再現で実際に確かめた

closed な Shadow DOM の中の入力欄にフォーカスがあるとき、ページから `document.execCommand("insertText", false, "us-east-1")` を呼ぶと値が入り、`input` イベントが 1 回発火した。つまりユーザーが入力欄をクリックした瞬間に、ページ側が確認を完了させられる。

`host.focus()` ではフォーカスは移らなかった。ユーザーの操作なしには成立しない。

ページのスクリプトはホストを直接 `remove()` できるので、これで得られるものは増えない。保存される値も `background.js:28` で検証済みのリージョン文字列に限られる。対応不要。

### I-3: `margin` の比較が常に不一致になり、毎回 style を書き換える

- 根拠: `content.js:52`、`content.js:179`
- 確度: 実際に確かめた

`setProperty("margin", "0")` のあと `getPropertyValue("margin")` は `"0px"` を返した。`"0px" === "0"` は偽なので、`update()` のたびに `margin` を書き直す。`setStyle` のコメント「値が変わらないときは書き換えない」が `margin` だけ成り立っていない。

MutationObserver は `style` 属性を監視していないのでループにはならない。`HOST_STYLE.margin` を `"0px"` にすれば直る。

### I-4: アクセシビリティ

- 根拠: `content.js:116-126`、`content.js:196`、`content.js:209-216`
- 確度: コードから推論

- バナーに `role` も live region もない。スクリーンリーダーには出現が通知されない。`banner` に `role="status"` を付けるとよい。
- ホストは `<body>` の末尾に追加される。Tab の順序は最後になり、キーボードだけで入力欄に行くにはページ全体を通過する。
- `z-index: 2147483647` でツールバー行の右側に重なる。その位置にコンソールのボタン(情報パネルの開閉など)があれば隠れて押せない。実際の配置は未確認。
- `stopPropagation` は既定動作を止めないので、Tab 移動、IME、ブラウザのショートカットは壊れない。
- 白文字と `#d91515` のコントラスト比は計算上 約 5.2:1 で、WCAG AA(4.5:1)を満たす。

### I-5: 適用範囲の抜け(安全側ではない方向)

- 根拠: `manifest.json:13`、`content.js:10`
- 確度: `REGION_RE` の結果は実際に確かめた。各パーティションのドメインは未確認

- `https://*.console.aws.amazon.com/*` は GovCloud や中国リージョンなど別ドメインのコンソールに一致しない。そこではバナーが出ない。
- `REGION_RE` は `eusc-de-east-1` に一致しない(先頭が 2 文字固定のため)。`us-gov-west-1` `us-isob-east-1` `cn-north-1` `mx-central-1` には一致する。
- 脆弱性ではなく対応範囲の話。README に対象外と書くか、必要になったときに足す。

---

## 問題なしと判断した項目

### (1) ページ側から拡張へ入る経路

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| DOM XSS・HTML シンク | 問題なし | `innerHTML` `outerHTML` `insertAdjacentHTML` `document.write` `eval` `setTimeout(文字列)` を使っていない。DOM は `createElement` と `textContent`(`content.js:238`)と `append(文字列)`(`content.js:126`、固定文言)だけで組む | コードを確認 |
| ラベルに入る値 | 問題なし | `region` は固定値 `"Global"` か `REGION_RE` に一致した文字列だけ。`textContent` なのでマークアップにもならない | コードを確認 |
| style への注入 | 問題なし | 値はすべて `Math.round` などを通した数値から作る。`"NaNpx"` を入れても無視され、空のままだった | 実際に確かめた |
| URL の扱い | 問題なし(L-1 を除く) | `location` の値は比較と正規表現にしか使わない。`<link>` の `href` は `chrome.runtime.getURL("content.css")` の固定パス(`content.js:141`) | コードを確認 |
| ReDoS | 成立しない | `(-[a-z]+)+` は各繰り返しが必ず `-` で始まり、分割の仕方が 1 通りしかない。200 万〜500 万文字の不一致入力で 6〜13 ms、線形だった。`split(/[^a-z0-9-]+/)` も 206 万文字で 9 ms | 実際に確かめた |
| プロトタイプ汚染 | 成立しない | コンテンツスクリプトは isolated world で動き、ページが書き換えた `Object.prototype` などは見えない(Chrome 公式で確認)。ページ由来のオブジェクトをマージする処理もない。Firefox の Xray については未確認 | 公式+コード |
| `attachShadow` のフック | 成立しない | 同じ理由で、ページが `Element.prototype.attachShadow` を差し替えてもコンテンツスクリプトの呼び出しには影響しない | 公式から推論、未検証 |
| closed Shadow DOM の中身の読み取り | 読めないが、秘密でもない | `host.shadowRoot` は `null`、`host.innerText` と `textContent` は空、`document.body.innerText` にもラベルは含まれなかった。中身はページ自身が持つリージョン名なので、読めても影響はない | 実際に確かめた |
| ページの MutationObserver から見えるもの | ホストの追加・削除と `style` 属性だけ | Shadow DOM 内の変更(ラベルの書き換え)は `document` を監視する observer に届かなかった | 実際に確かめた |
| CSS による入力値の読み取り | 成立しない | ページのセレクタは Shadow DOM の中に届かない。値も秘密ではない | 仕様から推論 |
| closed Shadow DOM の実効性 | 境界としては弱い | スタイルの隔離と、安易な `querySelector` を防ぐ効果はある。削除、被せ、CSS での非表示(L-3)、フォーカス時の値の注入(I-2)は防げない。他の拡張は `chrome.dom.openOrClosedShadowRoot` で中に入れるはず(未確認)。セキュリティ境界として頼らないこと | 確かめた+推論 |
| 他の拡張からのメッセージ | 成立しない | 外部からのメッセージは `onMessageExternal` に届き、`onMessage`(`background.js:15`)には届かないはず(未確認)。さらに `sender.id`、タブ ID、`frameId === 0` を検査し、値は `isRegion` で検証する | コードを確認 |
| 保存値の汚染 | 影響なし | キーは送信元のタブ ID から作るので他のタブを書き換えられない。値は検証済みのリージョン文字列だけ。読み出し時も再検証する(`background.js:24`) | コードを確認 |

### (2) `web_accessible_resources` とフィンガープリント

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| 露出範囲 | 妥当 | 公開は `content.css` の 1 ファイルで、`matches` は AWS コンソールだけ(`manifest.json:17-22`)。他のサイトからは読めない(Chrome 公式で確認)。中身は色と余白だけで秘密はない | 公式+コード |
| 拡張の検出 | AWS コンソールからは検出できる。受け入れ可 | コンソールは `chrome-extension://<ID>/content.css` を取得できる。それ以前に `<body>` 末尾の `div` と `--banner-font-size` で分かる。無関係なサイトからは検出できない。コンソールはログイン済みの利用者をすでに識別しているので、追加の追跡にはならない | コードから推論 |
| Firefox の UUID | 影響は小さい | UUID はインスタンスごとにランダム(MDN で確認)。見えるのはコンソールだけ | 公式 |
| ページの CSP による CSS のブロック | おそらくブロックされない | web accessible なリソースは CSP でブロックされない(MDN で確認)。Chrome で同じかは未確認。ブロックされても位置は `HOST_STYLE` で直接指定しているので、無装飾でバナーは出る(`content.js:138-145`) | 公式+推論 |

露出をなくしたいなら、`new CSSStyleSheet()` と `root.adoptedStyleSheets` に切り替えれば `web_accessible_resources` を削除できる。Firefox のコンテンツスクリプトで動くかは未確認。現状の露出は小さいので必須ではない。

### (3) イベント処理

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| `stopPropagation` によるページ動作の破壊 | 壊さない | 対象は拡張自身の入力欄で発生したキーイベントだけ。ページの他の要素でのキー操作には触れない。`preventDefault` は呼んでいない | 確かめた+コード |
| `input` ハンドラの `shownRegion` が `null` | 実害なし | `shownRegion` が `null` になるのはホストを外したときだけで、外れた入力欄にはイベントが来ない | コードから推論 |
| `resize` `popstate` `hashchange` `pageshow` | 問題なし | どれも 200 ms のスロットル経由で `update()` を呼ぶか、`restore()` を呼ぶだけ | コードを確認 |

詳細は I-1 と I-4。

### (4) MutationObserver の負荷・無限ループ・DoS

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| 自己ループ | 起きない | 拡張自身の変更で observer に届くのは、ホストを `<body>` に追加したときの 1 回だけ。2 回目の `update()` では `host.parentNode === document.body` で追加せず、そこで止まる。`style` 属性と Shadow DOM 内の変更は監視対象外。外れたノードへの `remove()` は記録を生まなかった | 実際に確かめた |
| ページがホストを消し続ける場合 | 上限あり | 再追加は 200 ms に 1 回まで(`content.js:244-251`)。毎秒 5 回で、DoS にはならない | コードから推論 |
| 1 回の `update()` のコスト | 小さい | 5 万ノードの DOM で、読み取り一式は平均 0.9 ms。毎回レイアウトを無効化した場合は平均 7.9 ms(大半はページ自身がいずれ払うレイアウト計算)。毎秒 5 回が上限 | 実際に確かめた |
| コールバック自体のコスト | 小さい | observer のコールバックはフラグを見てタイマーを 1 本張るだけ。変化の件数に比例する処理はない | コードを確認 |
| 確認済みのとき | さらに軽い | `getRegion()`(`querySelector` 1 回)だけで終わり、`place()` は呼ばない | コードを確認 |
| 拡張の更新・無効化後 | 問題なし | `chrome.runtime` の呼び出しは `try`/`catch` で囲んである(`content.js:83-87`、`102-108`、`138-145`)。observer は残るが、例外にはならない | コードから推論 |

### (5) iframe・`all_frames`・一致パターン

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| `all_frames` | 妥当 | 指定がなく最上位フレームだけで動く。他サイトに埋め込まれたコンソールでは動かない。`background.js:18` も `frameId === 0` だけを受け付ける | コードを確認(既定値は Chrome 公式の説明から) |
| `match_about_blank` | 妥当 | 既定の false(Chrome 公式で確認) | 公式 |
| `https://*.console.aws.amazon.com/*` | 妥当 | `https` 限定で、AWS が管理するドメインの配下だけ。利用者のコンテンツを配信するサブドメインがこの配下にあるかは未確認。あったとしても、そこで得られるのはバナーの表示だけ | コードから推論 |
| プリレンダリング | 安全側に倒れる | プリレンダリング中のページの最上位フレームは `frameId` が 0 でないはず(未確認)。その場合 `get` に応答がなく、確認済みなしとしてバナーを出す | 推測 |
| 復元の待ち時間 | 安全側に倒れる | 応答が 1 秒を超える・失敗する・拡張が無効、のどれでも確認済みなしとして扱う(`content.js:92-109`) | コードを確認 |

## 対応の優先順位

1. L-3: `setProperty` に `important` を付ける。数行で済み、攻撃以外の偶然の非表示も防げる。
2. L-2: `document` のプロパティをプロトタイプ経由で読む。
3. L-1: `?region=` を判定から外す。ボタン文言の実際の形式を確かめてから決める。
4. I-3: `HOST_STYLE.margin` を `"0px"` にする。
5. I-4: `role="status"` を付ける。
