# セキュリティ監査を受けた修正と多言語化

- 日付: 2026-10-14
- 対象: `content.js` / `content.css` / `background.js` / `manifest.json` / `_locales/` / `.gitignore` / `README.md`
- 元の指摘: `docs/20261014-security-*.md` の 5 本
- 検証: Node の偽 DOM で `content.js` と `background.js` を無改変のまま動かして確認(24 項目)。**実ブラウザ・実コンソールでは未検証。**

## 修正

| 指摘 | 修正 | 例 |
| --- | --- | --- |
| ホスト名を左から探すため偽装できる | `console.aws.amazon.com` の直前のラベルだけを見る(`HOST_RE`) | `ap-northeast-1.us-east-1.console.aws.amazon.com` → `us-east-1` |
| `region` クエリをそのまま信じる | ホスト名 → ボタン文言 → クエリの順にし、クエリが食い違うときは両方を表示する | `us-east-1` のホストに `?region=ap-northeast-1` → `us-east-1/ap-northeast-1`。`us-east-1` を確認済みでも表示する |
| 任意の文字列がリージョンとして通る | `REGION_RE` を方角の語を含む形に限定(`content.js` と `background.js`) | `aa-call-support-0312345678`、`zz-fake-9` は不一致。`eusc-de-east-1` は一致するようになった |
| 保存値に長さ上限がない | `background.js` の `isRegion` で 64 文字を上限にし、正規表現より先に判定する | 9MB の文字列は保存されない |
| ページの CSS でバナーが消える | ホスト要素のインライン指定をすべて `!important` にし、`visibility` / `opacity` / `transform` / `clip-path` / `display` も毎回書き戻す | `div:empty { display: none !important }` があっても `display: block !important` が勝つ |
| 赤地が CSS の読み込みに依存する | 背景色と文字色を `content.js` から要素に直接指定する | `content.css` が読み込めなくても赤地に白文字で出る |
| bfcache 復元直後に古い確認が効く | `pageshow` で `confirmed` を捨ててから取り直す | 復元直後はいったんバナーが出て、確認済みなら消える |
| バナーが画面外に出る | `top` の下限を 0 にし、幅が 200px を取れないときは既定の右端(16px)に出す | ツールバーが `top: -480` でもバナーは `top: 0` |
| Chrome 120 以前で読み込めない | `minimum_chrome_version: "121"` | 古い Chrome ではインストール不可と表示される |
| 配布物に不要なファイルが混ざる | `.gitignore` を追加(`.claude/`、`*.zip`、`*.crx`、`*.pem` など) | — |
| README が実装と合っていない | 読み取る情報、インストール時の確認表示、制限を追記 | — |

## 多言語化

- `_locales/en` と `_locales/ja` を追加し、`manifest.json` の `name` / `description` とバナーの文言を `chrome.i18n` に移した。`default_locale` は `en`。
- ブラウザの表示言語が日本語なら日本語、それ以外は英語になる。
- 拡張コンテキストが無効で `chrome.i18n` を呼べないときは、`content.js` 内の英語の文言で出す。

## 見送ったもの

| 指摘 | 理由 |
| --- | --- |
| CSS を `content.js` に取り込み `web_accessible_resources` を削除する | `<style>` の挿入はページの CSP、`adoptedStyleSheets` は Firefox のコンテンツスクリプトでの動作を確認できていない。色だけ直接指定する方法にとどめた |
| DOM clobbering(`<img name="body">` など) | コンソール側に `name` 属性を残す HTML 注入が必要で、コンテンツスクリプトの隔離環境で成立するかも未確認 |
| 判定できないページで「リージョン不明」を出す | 表示仕様の変更になる。実コンソールで該当ページを確かめてから決める |
| グローバル判定の順序、プリレンダリング待ち | 実コンソールでの確認が必要、または現状で安全側に倒れる |

## アイコンと掲載画像

- `icons/16.png` / `48.png` / `128.png` を追加し、`manifest.json` の `icons` に登録した。128px は絵柄 96px + 周囲 16px の透明余白、16px と 48px は余白なし。
- `store/promo-440x280.png` はストア掲載用の小プロモタイル。拡張の動作には使わないので、提出用の zip には `store/` と `docs/` を含めない。

## 実機で確認すること

1. 東京の EC2 でバナーが出て、`ap-northeast-1` の入力で消える。
2. リージョンを切り替えると再表示される。
3. IAM で `Global` と表示される。
4. S3 でほかのリージョンのバケットを開いたとき、`us-east-1/ap-northeast-1` 形式の表示が頻繁に出すぎないか(S3 の URL 形式は未確認)。
5. ブラウザの表示言語を英語にすると英語で出る。
6. `chrome://extensions` にエラーが出ていない。
