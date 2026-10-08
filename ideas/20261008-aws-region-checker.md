# AWSマネコン リージョン確認拡張 案

## 結論
Chrome拡張(Manifest V3)のコンテンツスクリプトだけで作れる。ビルド不要の素のJSで3ファイル程度。

## 「削除するには」の解釈
- 案A: バナー自体を消すためにリージョンを入力する(リージョンを強制的に意識させる)
- 案B: リソース削除操作の前にリージョン入力を要求する(誤削除ガード)

## 案A: 入力で消えるバナー(推奨・MVP)
- リージョンセレクタ付近に「現在のリージョン: ap-northeast-1 / 消すにはリージョンを入力」を表示
- 入力値が現在のリージョンコードと一致したらバナーを消す
- リージョンが変わったら再表示(確認済みリージョンは sessionStorage に保持)
- 例: 東京で `ap-northeast-1` と入力 → 消える → us-east-1 に切替 → 再びバナー表示

## 案B: 削除操作ガード
- Delete / Terminate / 削除 等のボタンのクリックを capture で止め、リージョン入力モーダルを出す
- 問題: サービスごとにDOMが違い、ボタン文言判定に頼るため取りこぼしと誤検知が出る。AWS側のUI変更で壊れやすい
- 「ガードがあるから安全」と誤認させるリスクがある

## 案C: Tampermonkeyユーザースクリプト
- 案Aと同じ中身を1ファイルで。配布や権限管理は拡張より雑になる

## 構成(案A)
- manifest.json: matches `https://*.console.aws.amazon.com/*`、permissions なし
- content.js: リージョン取得、バナー挿入、入力照合
- content.css: スタイル(Shadow DOM 内に閉じる)

## リージョン取得
1. ホスト名 `ap-northeast-1.console.aws.amazon.com`
2. クエリ `?region=ap-northeast-1`
3. ナビのリージョンボタン(`[data-testid="awsc-nav-regions-menu-button"]` 想定、実DOMで要確認)
- IAM / CloudFront / Route 53 等のグローバルサービスは「Global」表示として扱う

## 挿入位置
- リージョンボタンの隣に挿入。セレクタが見つからなければ画面右上に fixed でフォールバック
- ナビは遅延描画・再描画されるので MutationObserver で監視

## セキュリティ
- 外部通信なし、権限はホスト一致のみ
- DOM挿入は textContent のみ(innerHTML 不使用)
- 認証情報・アカウント情報は読まない

## 決定事項(2026-10-08)
- 案Aで作る
- 対象は Chrome と Firefox(同一コードの WebExtension、manifest に `browser_specific_settings.gecko.id` を追加)
- 全リージョンで表示

## 配布
- AWS Marketplace は対象外(AMI / SaaS / コンテナ等のAWS上で動く製品向けで、ブラウザ拡張の枠がない)
- GitHub で OSS 公開(MIT)+ Chrome Web Store(登録料 $5 一回)+ Firefox Add-ons(無料)
- Edge は Chrome 用がそのまま動く。Edge Add-ons(無料)にも出せる
- Safari は Xcode での変換と Apple Developer Program(年 $99)が要るので対象外
- 名称: 公式と誤認されない形にする。例「Region Checker for AWS Console」。AWSロゴは使わない。非公式である旨を明記
