# セキュリティ監査: バックグラウンド / メッセージング / ストレージ

- 日付: 2026-10-14
- 対象: `manifest.json`, `background.js`, `content.js`(この 3 ファイルのみ。`docs/` `ideas/` は未読)
- 観点: `chrome.runtime.onMessage` の送信元検証、メッセージ内容の検証、`chrome.storage.session`、タブ ID キー、service worker / イベントページ、競合状態

## 要約

| 重大度 | 件数 |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |
| 情報 (Info) | 3 |

**結論: 全体として CVSS 3.9 以下に収まっている。最大値は 3.1(指摘 1)。**

- 他の拡張、任意の Web ページ、サブフレームから確認状態を読み書きする経路は見つからなかった。
- 「ユーザーが入力していないのに、現在のリージョンが確認済み扱いになる」経路は、設計上の制限(指摘 2)と bfcache 復元直後の最大 1 秒(指摘 3)だけ。それ以外の競合はすべて「バナーが余分に出る」側に倒れる。
- 実ブラウザに拡張を読み込んでの動作確認はしていない。確かめたのは正規表現の挙動(Node.js v26.3.1)だけで、残りは公式文書とコードからの判断。各項目の確度欄を参照。

### 指摘一覧

| # | 重大度 | CVSS v3.1 | 内容 |
| --- | --- | --- | --- |
| 1 | Low | 3.1 | 保存するリージョン文字列に長さ上限がなく、1 タブでセッションストレージの容量を使い切れる |
| 2 | Low | 2.5 | 確認状態がタブ ID とリージョン文字列だけに結び付き、アカウント / ロールや経過時間に結び付いていない |
| 3 | 情報 | 2.5(上限値) | bfcache 復元直後、古い `confirmed` のまま最大 1 秒バナーが出ない |
| 4 | 情報 | 0.0 | プリレンダリングされたページの `get` が `frameId !== 0` で無視され、確認済みでもバナーが出る |
| 5 | 情報 | 0.0 | Chrome 120 以前は `background.scripts` 併記の MV3 拡張を読み込まない。`minimum_chrome_version` 未指定 |

---

## 指摘

### 1. 保存値に長さ上限がない(Low)

- **CVSS v3.1**: `AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:N/A:L` = **3.1**
- **根拠**: `background.js:8`(`REGION_RE` の `[a-z]+` と `(...)+` に上限がない)、`background.js:11-12`(`isRegion` は型と形式だけを見る)、`background.js:28-29`(検証を通った値をそのまま `set`)
- **確度**: 正規表現が長大な文字列を受理することは実際に確かめた。容量超過時の挙動は公式文書で確認。レンダラ乗っ取り時に送信できることはコードと公式文書からの推論。

**内容**

`"aa-" + "a".repeat(9_000_000) + "-1"` は `REGION_RE` に一致する(Node.js で 9,000,005 文字が約 3 ms で `true`)。メッセージの上限は 64 MiB、`storage.session` の上限は 10 MB なので、1 回の `set` で容量のほぼ全部を 1 つのキーに書ける。

正規の `content.js` は、ユーザーがバナーに同じ文字列を打ち込んだときしか `set` を送らない(`content.js:128-131`)。したがって攻撃者は、コンテンツスクリプトが動いているレンダラ(AWS コンソールのタブ)を乗っ取って、コンテンツスクリプトになりすます必要がある。Chrome の公式文書も、コンテンツスクリプトからの入力はレンダラが乗っ取られうる前提で検証するよう求めている。

**攻撃手順**

1. 攻撃者が AWS コンソールのタブのレンダラプロセスを乗っ取る(ブラウザの脆弱性が別途必要)。
2. コンテンツスクリプトとして `{ type: "set", region: "aa-" + "a".repeat(9_000_000) + "-1" }` を送る。
3. `tab:<そのタブ>` に約 9 MB が保存される。
4. 以後、他のタブの `set` は容量超過で失敗する(`background.js:30` が `{ ok: false }` を返すが、`content.js:84` は応答を見ない)。
5. 他のタブでは確認がページ内変数 `confirmed` にしか残らず、ページを読み込み直すたびにバナーが再表示される。攻撃者のタブを閉じると `background.js:36-38` でキーが消えて回復する。

**影響**

- 確認状態の保存が止まるだけで、バナーは「出る」側に倒れる。確認の偽装や情報漏えいにはならない。
- 前提のレンダラ乗っ取りが成立した時点で、攻撃者はそのタブの AWS コンソールを直接操作できる。この指摘が追加で与える被害は小さい。
- Firefox 127〜130 は `storage.session` の容量制限がない(`QUOTA_BYTES` は Firefox 131 から)。この範囲では失敗せずにメモリを消費する。

**修正案**

`isRegion` に長さ上限を足す。実在のリージョンコードは 20 文字未満。

```js
const MAX_REGION_LENGTH = 32;
const isRegion = (value) =>
  typeof value === "string" &&
  value.length <= MAX_REGION_LENGTH &&
  (value === GLOBAL || REGION_RE.test(value));
```

`content.js` の `REGION_RE` と二重管理になっている(`background.js:7` のコメント参照)ので、上限も両方に入れる。

---

### 2. 確認状態がアカウント / ロール・経過時間に結び付いていない(Low)

- **CVSS v3.1**: `AV:L/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N` = **2.5**(攻撃者のいない誤操作シナリオ。ベクタは参考値)
- **根拠**: `background.js:13`(キーは `tab:<tabId>` だけ)、`background.js:29`(値はリージョン文字列だけ)、`content.js:230`(`region === confirmed` ならバナーを出さない)
- **確度**: コードから推論

**内容**

保存するのは「このタブで最後に確認したリージョン文字列 1 件」だけで、次の 2 つを区別しない。

- **アカウント / ロール**: 同じタブでサインアウトして別アカウントに入り直す、またはロールを切り替えても、リージョンが同じならバナーは出ない。
- **経過時間**: 確認はタブを閉じるかブラウザを終了するまで有効。何日も開いたままのタブでは最初の 1 回の確認が残り続ける。

**再現例**

1. タブ A で検証用アカウントの `ap-northeast-1` を開き、バナーに `ap-northeast-1` と入力して消す。
2. 同じタブでロールを本番アカウントに切り替える。
3. リージョンは `ap-northeast-1` のままなので `get` は `ap-northeast-1` を返し、バナーは出ない。

**影響**

拡張の説明は「リージョンの確認」であり、アカウントの確認は約束していない。仕様の範囲内だが、「バナーが出ていない = 確認済みの環境」と読むユーザーには誤解を与える。別ウィンドウや別タブへの持ち越しは起きない(後述の「問題なし」参照)。

**修正案**(どれか 1 つ)

- 仕様として README に明記する(コード変更なし。最小)。
- アカウント切り替えで再確認させたい場合は、`content.js` がナビゲーションバーからアカウント ID を読み、`set` / `get` の比較対象に含める。ただし DOM 依存が増え、読めなかったときの扱いを決める必要がある。
- 時間で失効させたい場合は、値を `{ region, at }` にして `get` 時に経過時間を見る。

---

### 3. bfcache 復元直後、古い `confirmed` のまま最大 1 秒バナーが出ない(情報)

- **CVSS v3.1**: `AV:L/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N` = **2.5**(上限値。実際の窓は通常数十 ms)
- **根拠**: `content.js:263-265`(`pageshow` で `restore()` を呼ぶが `confirmed` と `restored` はそのまま)、`content.js:94-100`(応答が来るまで `confirmed` を更新しない)、`content.js:25` と `content.js:101`(上限 1 秒)
- **確度**: コードから推論(AWS コンソールが bfcache の対象になるかは未確認)

**再現例**

1. タブで `us-east-1` を確認する(ページ A。`confirmed = "us-east-1"`)。
2. 同じタブで `us-west-2` のコンソールへ移動し、`us-west-2` を確認する(保存値は `us-west-2`)。
3. ブラウザの「戻る」でページ A が bfcache から復元される。
4. ページ A の `confirmed` は `us-east-1` のままなので、`get` の応答が届くまでバナーは出ない。応答(`us-west-2`)が届くとバナーが出る。service worker が停止していれば起動時間ぶん遅れ、最長で 1 秒後のタイムアウトで出る。

**影響**

「最後に確認した 1 件だけ有効」という仕様に対し、最長 1 秒だけ古い確認が効く。攻撃者が利用できる経路はない。

**修正案**

復元時は古い値を捨ててから取り直す。応答までの間バナーが一瞬出るが、安全側になる。

```js
addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  confirmed = null;
  update();
  restore();
});
```

---

### 4. プリレンダリングされたページの `get` が無視される(情報)

- **CVSS v3.1**: `AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:N/A:N` = **0.0**(セキュリティ影響なし。安全側の機能不具合)
- **根拠**: `background.js:18`(`sender.frameId !== 0` なら応答しない)、`content.js:103-105`(応答なしは `finish(null)`)
- **確度**: `frameId` の仕様は公式文書で確認。プリレンダリング中にコンテンツスクリプトが動くこと、有効化後に `frameId` が 0 になることは推測。

**内容**

Chrome の公式ブログは「`frameId == 0` はアクティブなページの最上位フレームを指し、同じタブ内の他のページ(プリレンダリング中など)の最上位フレームは 0 以外になる」と説明している。プリレンダリング中に `restore()` が走ると `get` は無視され、`confirmed = null` で確定する。ページが有効化されると、そのリージョンを確認済みでもバナーが出る。

**再現例**

1. タブで `us-east-1` を確認する。
2. アドレスバーに `us-east-1` のコンソール URL を入力し、Chrome が候補をプリレンダリングする。
3. Enter で有効化するとバナーが出る(保存値は `us-east-1` のまま)。

**影響**

バナーが余分に出るだけ。確認が飛ばされる方向には働かない。

**修正案**

`content.js` 側で、プリレンダリング中は復元を待つ。

```js
if (document.prerendering) {
  document.addEventListener("prerenderingchange", restore, { once: true });
} else {
  restore();
}
```

---

### 5. Chrome 120 以前で読み込めない(情報)

- **CVSS v3.1**: `AV:L/AC:L/PR:N/UI:R/S:U/C:N/I:N/A:N` = **0.0**(セキュリティ影響なし)
- **根拠**: `manifest.json:7-10`(`scripts` と `service_worker` の併記)、`manifest.json` に `minimum_chrome_version` がない
- **確度**: 公式文書で確認(MDN)

**内容**

MDN によると、Chrome 120 以前は `background.scripts` を含む MV3 拡張の読み込みを拒否し、121 以降は無視する。Firefox は `service_worker` に対応しておらず、121 以降は併記されていても `scripts` をイベントページとして起動する(120 以前は起動しなかった)。

Firefox 側は `strict_min_version: "127.0"`(`manifest.json:26`)で条件を満たしている。Chrome 側は下限の指定がない。

**修正案**

`manifest.json` に `"minimum_chrome_version": "121"` を足す。

---

## 問題なしと判断した項目

### (1) 送信元の検証

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| 他の拡張からの送信 | 成立しない | 他の拡張からのメッセージは `onMessageExternal` に届く。この拡張は `onMessage` しか登録していない(`background.js:15`) | 公式文書で確認 |
| Web ページからの送信 | 成立しない | `externally_connectable` 未指定時は「すべての拡張は接続できるが、Web ページは接続できない」。拡張からの接続も上の理由で届かない | 公式文書で確認 |
| サブフレームからの送信 | 成立しない | `content_scripts` に `all_frames` がなく最上位フレームにしか注入されない(`manifest.json:11-16`)。加えて `frameId !== 0` を拒否(`background.js:18`) | コードから推論 |
| 他の拡張のコンテンツスクリプト | 成立しない | 同じページに注入された他拡張のスクリプトは、その拡張自身の ID でしか送信できない | 推測(ブラウザ実装依存) |
| `sender.id` の検査(`background.js:17`) | 冗長だが無害 | `onMessage` には自拡張のコンテキストからしか届かない。残しておいて害はない | 公式文書で確認 |
| `sender.tab` のない送信元(拡張ページなど) | 拒否される | `Number.isInteger(sender.tab?.id)` で落ちる。この拡張に拡張ページはない | コードから推論 |
| 乗っ取られたレンダラ | 影響は自タブに限定 | キーはメッセージではなく `sender.tab.id` から作る(`background.js:19`)。`sender.tab` はブラウザ側が付けるため、他タブのキーは読み書きできない。得られるのは自タブのリージョン文字列だけで、特権操作は呼べない。残る影響は指摘 1 | コードから推論。`sender.tab` をレンダラが偽装できないことは推測 |
| `web_accessible_resources` の `content.css` | メッセージ経路にならない | CSS はスクリプト実行コンテキストではない。公開先も AWS コンソールに限定(`manifest.json:17-22`) | コードから推論 |

### (2) メッセージ内容・保存値

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| 型の検証 | 十分 | `typeof value === "string"` と正規表現 / `"Global"` の一致(`background.js:11-12`)。オブジェクトや配列は保存されない | コードから推論 |
| 形式の検証 | 十分(長さを除く) | `^`・`$` で全体一致。`"us-east-1\n"`、前後の空白、大文字、全角数字はすべて不一致 | 実際に確かめた(Node.js) |
| キーの注入 | 成立しない | キーは `tab:<整数>` 固定で、メッセージの内容を含まない。`__proto__` などにはならない | コードから推論 |
| 読み出し値の再検証 | 十分 | `get` でも `isRegion` を通してから返す(`background.js:24`) | コードから推論 |
| ReDoS | 成立しない | 各グループが `-` で始まるため分割が一意。100 万文字の不一致入力で約 3.5 ms | 実際に確かめた(Node.js) |
| 巨大入力での例外 | 無害 | `-a` を 450 万回繰り返した入力で `Maximum call stack size exceeded` が出る。リスナーが例外で終わり応答しないだけで、保存はされない | 例外は Node.js で確かめた。service worker 内の挙動は推論 |
| 未知の `type` / 不正な `region` | 無害 | 応答せずに終わる。送信側は `lastError` を読み捨てる(`content.js:84`, `content.js:104`) | コードから推論 |
| 保存する情報の機微性 | 低い | リージョンコードだけ。認証情報、アカウント ID、URL は保存しない | コードから推論 |

### (3) `chrome.storage.session` の性質

| 項目 | 内容 | 確度 |
| --- | --- | --- |
| アクセスレベル | 既定ではコンテンツスクリプトに公開されない。`setAccessLevel()` を呼んでいないので、`content.js` や乗っ取られたレンダラから直接は読めない。Firefox は `setAccessLevel()` 自体が未実装 | 公式文書で確認 |
| 保存先 | メモリ上。ディスクには書かれない | 公式文書で確認 |
| 容量 | Chrome 112 以降 10 MB(111 以前は 1 MB)。超過する書き込みは失敗し `runtime.lastError` が立つ。Firefox は 131 から 10 MB、127〜130 は制限なし | 公式文書で確認 |
| 消えるタイミング | Chrome: 拡張の無効化・再読み込み・更新、ブラウザ再起動。Firefox: ブラウザ終了、拡張の無効化・アンインストール | 公式文書で確認 |
| 対応バージョン | Chrome 102、Firefox 115。`strict_min_version: "127.0"` は満たす | 公式文書で確認 |
| 通常の利用で容量に達するか | 達しない。1 件が数十バイトで、タブを閉じると消える(`background.js:36-38`) | コードから推論 |
| シークレットウィンドウ | `incognito` 未指定(既定は spanning)で、許可した場合は同じメモリ領域を共有する。保存するのはリージョンコードだけで、タブを閉じると消え、ディスクに残らない | 推測 |

### (4) タブ ID をキーにすること

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| タブ ID の再利用 | 問題なし | タブ ID はブラウザセッション内で一意。ブラウザを再起動すると ID は変わりうるが、`storage.session` も同時に消える | 公式文書で確認 |
| セッション復元 / 閉じたタブを開き直す | 問題なし(安全側) | 再起動後は保存値がない。同一セッション内で開き直したタブは新しい ID になり、閉じた時点でキーも消えている | 推測(新 ID になる点) |
| タブの複製 | 問題なし(安全側) | 複製先は別の ID なので確認状態は引き継がれず、バナーが出る | 推測 |
| 別ウィンドウへの移動 | 問題なし | タブ ID は変わらず同じタブとして扱われる。別のタブに確認が移ることはない | 推測 |
| 別アカウント | 指摘 2 | 同じタブ内では引き継がれる | コードから推論 |
| プリレンダリング | 指摘 4(安全側) | 同じタブ ID だが `frameId` が 0 以外 | 公式文書で確認 |
| bfcache | 指摘 3 | `pageshow` で取り直すが、応答までは古い値 | コードから推論 |
| タブの破棄(discard)で ID が変わる場合 | 問題なし(安全側) | 新しい ID には保存値がなくバナーが出る。古いキーは数十バイト残るだけ | 推測 |
| `tabs.onRemoved` の取りこぼし | 問題なし | 取りこぼしても残るのは数十バイトで、ID が再利用されないため誤って効くことはない | コードから推論 |
| `tabs` 権限なしでの `onRemoved` | 動く | `tabs` 権限が要るのは `url` などの機微なプロパティだけ | 公式文書で確認(権限要件の記載なし) |

### (5) service worker / イベントページ

| 項目 | 判断 | 理由 | 確度 |
| --- | --- | --- | --- |
| service worker の停止・再起動 | 問題なし | 状態をグローバル変数に持たず、すべて `storage.session` に置く。リスナーは最上位で同期的に登録している(`background.js:15`, `background.js:36`)ので、停止中のイベントでも起動して処理される | コードから推論 |
| 起動が 1 秒を超えた場合 | 安全側 | `content.js:101` のタイムアウトで `confirmed = null` になり、バナーが出る | コードから推論 |
| Firefox のイベントページ | 問題なし | `persistent` は MV3 で既定 `false`。Firefox は `scripts` を使い、`service_worker` は無視する | 公式文書で確認 |
| `scripts` と `service_worker` の併記 | 指摘 5 を除き問題なし | Chrome 121 以降と Firefox 121 以降で互いに無視する | 公式文書で確認 |
| `chrome.*` とコールバック形式(Firefox) | 問題なし | Firefox は `chrome` 名前空間とコールバックに対応 | 推測 |

### (6) 競合状態

| 経路 | 結果 | 理由 | 確度 |
| --- | --- | --- | --- |
| 初回の `get` 応答前に `set` が来る | 起きない | `restored` が `false` の間は描画しない(`content.js:228`)ので、ユーザーは入力できない | コードから推論 |
| タイムアウト 1 秒後に遅延応答が届く | 安全側 | `done` フラグで 2 回目の `finish` を捨てる(`content.js:93-96`)。`confirmed = null` のままバナーが出続ける | コードから推論 |
| bfcache 復元中の `get` 応答前にユーザーが入力する | 安全側 | 後から届いた応答が `confirmed` を古い値で上書きし、バナーが再表示される。保存値は新しい値のまま | コードから推論 |
| bfcache 復元中の古い `confirmed` | 指摘 3 | 最長 1 秒、確認が飛ばされる側 | コードから推論 |
| 入力直後にページ遷移して `set` が届かない | 安全側 | 保存されず、次のページでバナーが出る | コードから推論 |
| background 内で `get` と `set` の順序が入れ替わる | 安全側 | `get` が返すのは「このタブでユーザーが実際に入力した値」か `null` だけ。入力していないリージョンが返ることはない | コードから推論 |
| 拡張の更新・再読み込みでコンテキストが無効になる | 安全側 | `sendMessage` の例外を捕まえて `confirmed` だけで続ける(`content.js:83-87`, `content.js:102-108`)。保存値は消えるので次のページでバナーが出る | コードから推論 |

---

## 範囲外の気づき(未検証)

`content.js:74-78` は、ホスト名にリージョンがないとき URL の `?region=` を採用する。リージョンを含まないサブドメインのページでは、リンクを踏ませる側がバナーの表示リージョンを指定できる可能性がある。リージョン判定は今回の観点(バックグラウンド、メッセージング、ストレージ)の外なので、成立するかどうかは確かめていない。

## 検証内容

- 実行したもの: `REGION_RE` に対する長大入力・境界入力のテスト(Node.js v26.3.1。スクリプトは `$TMPDIR` に置き、実行後に削除)。
- 実行していないもの: 実ブラウザ(Chrome / Firefox)への拡張の読み込み、AWS コンソール上での動作確認、レンダラ乗っ取りを模した送信。

## 出典

- Chrome `storage` API(session の保存先・消去・容量・アクセスレベル): https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome `externally_connectable`(未指定時の既定動作): https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable
- Chrome メッセージパッシング(コンテンツスクリプトの信頼度、メッセージ上限 64 MiB): https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Chrome 拡張とインスタントナビゲーション(プリレンダリング時の `frameId`): https://developer.chrome.com/blog/extension-instantnav
- Chrome `tabs` API(タブ ID の一意性): https://developer.chrome.com/docs/extensions/reference/api/tabs
- MDN `storage.session`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session
- MDN `storage.session.QUOTA_BYTES`(Firefox 131 から): https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session/QUOTA_BYTES
- MDN `manifest.json` の `background`(`scripts` と `service_worker` の併記): https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
- MDN `runtime.MessageSender`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/MessageSender
- MDN ブラウザ互換性データ `webextensions.api.storage.session`(Firefox 115、`setAccessLevel` 未対応、Chrome 112 未満は 1 MB)
