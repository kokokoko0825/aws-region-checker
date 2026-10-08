# 敵対的コードレビュー(コンテキストなし): Region Checker for AWS Console

- 対象: `manifest.json` / `content.js` / `content.css` の3ファイルのみ(ideas/・docs/・README.md・git ログは未読)
- 手法: 静的読解 + 同ディレクトリの使い捨てスクリプト `verify-nocontext.mjs`(Node で `getRegion` / 正規表現 / 確認ロジックを再現)
- 未実施: 実ブラウザへのロード、実 AWS コンソールでの確認。AWS コンソールの DOM・URL 形式・CSP に依存する指摘はすべて「推測」と明記した

## 結論

- 重大度「高」(コード実行・情報漏えい・権限昇格)は見つからなかった。権限ゼロ・通信ゼロ・`textContent` のみで、攻撃面は小さい
- ただし「安全装置」として見ると、**黙って表示されない(fail-open)経路**と**誤ったリージョンを表示する経路**が複数ある。中 5 件、低 11 件
- コードから読み取った目的: コンソールのリージョンボタン横に現在リージョンのバナーを出し、ユーザーがリージョンコードを打ち込むまで消さない

## 指摘一覧

| # | 重大度 | 概要 | 確度 |
|---|---|---|---|
| 1 | 中 | ホスト名を最優先するため、`?region=` と食い違うページで誤ったリージョンを表示 | ロジックは確認済 / URL 形式は推測 |
| 2 | 中 | 確認状態がオリジン単位で残り、リージョンを往復してもバナーが再表示されない。一方 us-east-1 内では毎回再表示される | ロジックは確認済 |
| 3 | 中 | リージョンボタンが DOM にあれば可視性を見ずに挿入するため、非表示コンテナ内でバナーが見えなくなる | ロジックは確認済 / 実 DOM は推測 |
| 4 | 中 | `sessionStorage.setItem` だけ失敗すると、正しく入力してもバナーが永久に消えない | スクリプトで確認済 |
| 5 | 中 | リージョン判定不能時は無言でバナーを消す(「不明」状態がない) | スクリプトで確認済 |
| 6 | 低 | 「Global」判定が英語・日本語ラベルと 7 サービスのパスに限定 | ロジックは確認済 / 他言語表記は推測 |
| 7 | 低 | 確認状態がページ側と共有の `sessionStorage` にあり、ページスクリプトが読み書きできる | 確認済 |
| 8 | 低 | `createBanner` が途中で例外を出すと `host` だけ残り、以後ずっと TypeError | ロジックは確認済 / 発火条件は推測 |
| 9 | 低 | ナビ再挿入の上限 20 回がページ寿命で累積しリセットされない | 確認済 |
| 10 | 低 | リージョン無しホストで `?region=` に任意のリージョン風文字列を表示させられる | スクリプトで確認済 / AWS 側リダイレクト有無は推測 |
| 11 | 低 | 全角入力(IME オン)では一致しない | スクリプトで確認済 |
| 12 | 低 | `stopPropagation` はキャプチャ段階のリスナーを止められない。closed shadow で他拡張の入力判定も壊しうる | 推測 |
| 13 | 低 | CSS を `<link>` で非同期ロードするため未スタイル表示が出る。ロード失敗時はフォールバックの `position: fixed` も効かない | ロジックは確認済 / 失敗条件は推測 |
| 14 | 低 | フォールバック表示が最前面固定で、移動も閉じることもできない | 確認済 |
| 15 | 低 | Firefox は拡張更新時に既存タブへ再注入するため、操作不能な旧バナーが残る | 推測 |
| 16 | 低 | manifest の対象が商用パーティションのみ。アイコン・i18n なし | 確認済 |

---

## 中

### 1. ホスト名最優先による誤表示
- 場所: `content.js:41-45`
- シナリオ: `https://us-east-1.console.aws.amazon.com/s3/buckets/b?region=ap-northeast-1`(ボタン表示が Global 以外)→ バナーは「現在のリージョン: us-east-1」。操作対象のバケットは ap-northeast-1。同様に `…/wafv2/homev2/web-acls?region=ap-northeast-1` も us-east-1 と表示
- 根拠: 優先順位が ホスト名 → `?region=` → ボタン文言 で、コンソール自身が表示しているボタン文言が最下位。スクリプト出力で 2 例とも `"us-east-1"` を確認
- 推測部分: S3・WAF が us-east-1 ホスト + `?region=` 形式を使うことは記憶ベースで未検証
- 補足: 第 3 候補 `findRegion(buttonText.split(...))` はボタン文言にリージョン**コード**が含まれる場合しか効かない。表示が「Tokyo」「東京」等の名称なら事実上デッドコード(推測)
- 影響: 誤ったリージョンを「確認させる」ことになり、無いより悪い

### 2. 確認状態のスコープが一貫しない
- 場所: `content.js:18`, `48-63`, `114`
- シナリオ A(再表示されない): 同一タブで ap-northeast-1 を確認 → us-east-1 に切替えて確認 → ap-northeast-1 に戻る → バナーが出ない。`sessionStorage` はオリジン(= リージョン別サブドメイン)ごとに別で、ap-northeast-1 側の値が残っているため
- シナリオ B(出すぎる): us-east-1 で EC2 を確認 → IAM(同じ us-east-1 オリジン、パス判定で Global)→ 「Global」を入力 → EC2 に戻ると単一スロットが上書きされており再度入力を要求。us-east-1 利用者だけ往復のたびに要求される
- シナリオ C: マルチセッション無効でロール切替・別アカウントへ再ログインしても同一オリジンなら確認済みのまま(本番/検証アカウントの取り違えには無防備)。タブ複製でも `sessionStorage` がコピーされ確認済みで始まる
- 根拠: 保存値はリージョン文字列 1 個、キーにアカウントもリージョンも含まない
- 影響: 「リージョンを切り替えたのに気付かない」という最も守りたい場面でバナーが出ない

### 3. 可視性を確認せずに挿入
- 場所: `content.js:99-109`
- シナリオ: 狭いウィンドウ幅などでナビが折りたたまれ、リージョンボタンが `display: none` の祖先配下や折りたたみメニュー内に残る → `querySelector` はヒットするので `button.before(host)` → バナーは不可視。`data-fallback` は付かないので fixed 表示にもならない
- 根拠: 判定は `document.querySelector(REGION_BUTTON)` の存在のみ。`host.getClientRects()` 等のチェックなし。同じ `data-testid` が複数ある場合も最初の 1 件(非表示側かもしれない)を使う
- 追加: `:host` の宣言はページ側 CSS に負ける。挿入先の親に対する `> div { display: none }` のようなルールで消える
- 推測部分: 実際の AWS ナビがそういう DOM になるかは未検証

### 4. `setItem` のみ失敗するとバナーが消せない
- 場所: `content.js:48-63`
- シナリオ: `sessionStorage` の容量超過などで `setItem` が例外、`getItem` は成功 → 正しいリージョンを入力 → `setConfirmed` は例外を握りつぶす → `update()` の `getConfirmed()` は `sessionStorage.getItem()` の `null` を返す → バナーは残り、入力欄もクリアされず無反応
- 根拠: `confirmedFallback` を読むのは `getItem` が例外を出したときだけ。スクリプト出力: `setItem失敗時 getConfirmed() = null / fallback = us-east-1`
- 修正案: `return sessionStorage.getItem(STORAGE_KEY) ?? confirmedFallback;`

### 5. 判定不能時に無言で消える
- 場所: `content.js:114-118`
- シナリオ: `https://health.console.aws.amazon.com/health/home`(ホスト名にリージョン無し、`?region=` 無し、ボタン文言が名称のみ)→ `getRegion()` が `null` → バナー無し。ユーザーには「確認済み」と区別がつかない
- 根拠: スクリプト出力 `null`。`!region` と確認済みを同じ分岐で処理
- 同種の fail-open: Chrome でサイトアクセスを「クリック時」に変更、Firefox でホスト権限を取り消し、いずれも無言で動かなくなる

---

## 低

### 6. Global 判定の取りこぼし
- 場所: `content.js:8-17`, `35-39`
- シナリオ: コンソール言語が英語・日本語以外で、リスト外のグローバルサービス(例: Global Accelerator、ボタン表示「Mondial」「全球」)→ ホスト名から `us-west-2` / `us-east-1` と表示(スクリプトで確認)
- ボタンの `textContent` にラベル以外の文字(アイコンの `<title>` 等)が混ざると完全一致が外れる(`"Global ▼"` → `us-east-1` を確認)
- ナビ描画前は必ずホスト名のリージョンが先に出て、描画後に Global へ切り替わる(入力途中なら入力欄がクリアされる)
- 推測部分: 各言語の実際の表記、ボタン内の DOM 構造

### 7. 確認状態がページから読み書き可能
- 場所: `content.js:50`, `59`
- シナリオ: ページ上の任意のスクリプトが `sessionStorage.setItem("region-checker:confirmed", "us-east-1")` → ユーザー操作なしでバナー消滅。キーの有無で拡張の導入も検出できる。逆にコンソール側の `sessionStorage.clear()` で確認が消える
- 根拠: コンテンツスクリプトの `sessionStorage` はページと共有。closed shadow root はこの経路を防がない
- 実害は小さい(ページは AWS 自身で、DOM からバナーを消す方が簡単)。`chrome.storage.session` なら隔離できるが `storage` 権限が必要

### 8. `createBanner` の部分初期化
- 場所: `content.js:66-71`, `119-122`
- シナリオ: Chrome で拡張を更新/再読込した後の孤立スクリプトで、バナー未生成のタブが初めてバナーを必要とする → `chrome.runtime.getURL` が "Extension context invalidated" を投げる → `host` は 66 行目で代入済み、`label` / `input` は `null` → 以後 `update()` のたびに `label.textContent` で TypeError、バナーは二度と出ない
- 根拠: `host` への代入が構築完了より前
- 推測部分: 発火にはその状況が必要で頻度は低い

### 9. 再挿入上限がリセットされない
- 場所: `content.js:20`, `27`, `99-105`
- シナリオ: 長時間開いたタブでナビが 20 回再描画される(SPA 遷移、リサイズなど)→ 以後は恒久的に fixed 表示。リロードまで戻らない
- 根拠: `navInserts` は増えるだけ。初回の正当な挿入も 1 回に数える
- 追加: `button.before(host)` で DOM を移動すると入力欄のフォーカスが外れる。ロード直後に fixed 表示で打ち始めると、ナビ描画時に中断される

### 10. `?region=` による表示の偽装
- 場所: `content.js:43`
- シナリオ: `https://console.aws.amazon.com/ec2/home?region=zz-evil-9` を踏ませる → 「現在のリージョン: zz-evil-9」。長さ制限がないため `aa-aaaa…-1` で `white-space: nowrap` のバナーを画面外まで伸ばせる
- 根拠: スクリプトで両方とも通過を確認
- 推測部分: AWS 側が即リダイレクトするなら一瞬で消える。XSS にはならない(`textContent`、文字種は `[a-z0-9-]` のみ)

### 11. 全角入力が一致しない
- 場所: `content.js:85`
- シナリオ: プレースホルダーは日本語で、IME オンのまま「ｕｓ－ｅａｓｔ－１」と入力 → 一致せず無反応
- 根拠: スクリプト出力 `全角一致: false`、`normalize("NFKC")` 後は `true`
- 関連: ラベルは選択可能なのでコピー&ペーストで通る(「打ち込ませる」意図は弱まる)。一致後に `host.remove()` でフォーカスが `body` に落ちる。`role` / `aria-live` なし

### 12. キーイベント遮断の限界
- 場所: `content.js:90-92`
- シナリオ: コンソールや他拡張が `window` / `document` にキャプチャ段階で登録したリスナーは、入力欄の `stopPropagation` より先に走る。しかも shadow DOM のリターゲットで `event.target` は `div` に見えるため、「入力欄なら無視」という判定をすり抜けてショートカットが発火しうる
- closed shadow root のため、Vimium 系の拡張が入力モードを検出できず、`us-east-1` の各キーがコマンドとして解釈される可能性
- すべて推測(未検証)

### 13. CSS の非同期ロード
- 場所: `content.js:69-71`, `content.css:3-17`, `manifest.json:12-17`
- シナリオ: `<link>` のロード完了までバナーは未スタイル(毎ページロードで一瞬)。ロードに失敗した場合(ページ CSP、拡張コンテキスト無効化)、ナビ内ではレイアウト崩れ、フォールバックでは `position: fixed` が効かず `body` 末尾に置かれて実質見えない
- 推測部分: 実際に失敗する条件。Chrome は拡張スキームを CSP 対象外とし、Firefox もコンテンツスクリプト起点のロードは通す認識だが未検証
- 代案: `adoptedStyleSheets` で CSS を埋め込めば `web_accessible_resources` ごと不要になり、ページから `content.css` を取得して拡張を検出する経路も消える

### 14. フォールバック表示の被り
- 場所: `content.css:11-17`
- `top: 56px; right: 16px; z-index: 2147483647` 固定。コンソール右上の操作ボタンや通知に重なり、入力する以外にどかせない。ナビ内表示でも約 350px 幅・`nowrap` のため、狭い幅でアカウントメニュー等を押し出しうる(推測)

### 15. Firefox の再注入で旧バナーが残る
- シナリオ: Firefox は拡張の更新・再有効化時に既存タブへコンテンツスクリプトを再注入する。旧スクリプトの `host` は DOM に残り、リスナーは死んでいるので入力しても消えない。新スクリプトが 2 個目を挿入
- 根拠: 既存 `host` の検出・掃除処理がない
- 推測(Firefox の挙動は記憶ベース、未検証)

### 16. manifest の過不足
- `manifest.json:8`, `15`: 対象は `*.console.aws.amazon.com` のみ。GovCloud(`console.amazonaws-us-gov.com`)、中国(`console.amazonaws.cn`)、European Sovereign Cloud では動かない。`REGION_RE` は `us-gov-west-1` 等に対応しているのに到達しない
- `icons` なし、`default_locale` なし(UI 文言は日本語固定、manifest の説明は英語)
- 過剰な権限はない(下記)

---

## 崩せなかった点

- **XSS / コード注入**: DOM への書き込みは `textContent` とプロパティ代入のみ。`innerHTML`・`eval`・動的スクリプトなし。リージョン文字列は正規表現で `[a-z0-9-]` に限定
- **ReDoS**: `(-[a-z]+)+` は各反復が `-` 始まりで曖昧さがなく、8 万〜25 万文字の悪意ある入力でも 1ms 未満(スクリプトで確認)
- **MutationObserver の無限ループ**: 自身の挿入後は `host.nextSibling === button` / `host.parentNode === body` で再挿入されない。属性変更(`data-fallback`)と shadow 内の変更は監視対象外。他者との挿入合戦も 20 回で打ち切り。唯一の非有界経路は「ページが `body` から消し続ける」場合だが、ページ駆動で 200ms に 1 回
- **性能**: コールバックはフラグ確認のみ、`update()` は最大 5 回/秒で `querySelector` 2 回 + `sessionStorage` 読み 1 回。DOM 変化が止まれば完全に停止。目立つ劣化は作れなかった(常時 DOM が動くページで微小な定常コストが残る程度)
- **情報漏えい**: 通信なし、`permissions` / `host_permissions` なし、メッセージングなし、background なし。外へ出る経路がない。Firefox の拡張 UUID を含む `href` も closed shadow 内でページから読めない
- **closed shadow root の突破**: コンテンツスクリプトは隔離ワールドで動くため、ページが `Element.prototype.attachShadow` を差し替えても影響しない
- **SPA 遷移の取りこぼし**: `pushState` は直接監視していないが、リージョン変更はサブドメイン変更(= フルロード)で、同一文書内の遷移も DOM 変化で拾える。取りこぼす具体例は作れなかった
- **マルチセッション形式のホスト名**(`<account>-<id>.<region>.console…`): 先頭ラベルは数字始まりで `REGION_RE` に誤マッチせず、リージョンを正しく取得(スクリプトで確認)
- **Chrome / Firefox の API 差**: `chrome.runtime.getURL`、`toggleAttribute`、`??`、省略形 `catch` はいずれも Firefox 127+ で動く。`gecko.id` と `data_collection_permissions` も宣言済み
