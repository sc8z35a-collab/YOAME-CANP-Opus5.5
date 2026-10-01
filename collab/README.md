# 共同バグ調査ネットワーク（5エージェント: A〜E ＋ 予備 R）

> **開発者（制作者）からの明示的許可**：
> - **デバッグのためなら自由に何をしてもよい。** 現状使える全ツール・ハーネス・その他便利機能（Bash / Playwright ヘッドレス Chromium / node テスト / 画像プレビュー / Web 検索 / 画像解析 / sudo など）を、バグ探索のために**ありとあらゆる手段で自由に行使してよい**と開発者から明示的に言われている。
> - ただし **明らかなコード破損を意図的に起こさないこと**。
> - 作業内容は失われる恐れがあるので **頻繁にコミット＆プッシュ**すること（目安：修正1〜3件ごと、最低10分に1回）。

リーダー: **A**。ブランチは全員 `genspark_ai_developer`。PR は `genspark_ai_developer -> main`。
目標：**全体で60件以上の実在バグ（コード / 見た目 / システム）を発見・修正**。重大なものを優先。

## 1. ファイル構成（競合を避けるため「自分のファイルにだけ書く」）
| パス | 誰が書く | 内容 |
|---|---|---|
| `collab/README.md` | A のみ | ルール・割り振り・ツール共有（このファイル） |
| `collab/bugs/<X>.md` | X 本人のみ | X が見つけた/直したバグ（書式は下記） |
| `collab/env/<X>.md` | X 本人のみ | X が直面した**開発環境**のエラーと解決法 |
| `collab/status/<X>.md` | X 本人のみ | 今やっていること・触っているファイル（ロック）・他者への連絡 |
| `collab/INBOX.md` | 全員（追記のみ・1行ずつ） | 他担当領域のバグを見つけたときの「引き継ぎ依頼」 |

**他人のファイルは読むだけ**。他担当のファイルにバグを見つけたら `collab/INBOX.md` に 1 行追記（`- [to:C][from:B] events.js L123 ... `）。

## 2. 担当割り振り（主担当ファイル = 編集ロック）
| Agent | 領域 | 主担当ファイル |
|---|---|---|
| **A (leader)** | 起動・ループ・視点・歩行・HUD/メニュー統合、全体レビュー、共有網の運営、最終 env まとめ | `js/main.js` `js/core.js` `js/view.js` `js/player.js` `js/ui.js` `index.html` `collab/README.md` |
| **B** | 車両物理・自動運転・経路 | `js/vehicle.js` `js/autopilot.js` `js/roads.js` `tools/agents/*physics*|drive*|fall*` |
| **C** | イベント・動物・天気・音 | `js/events.js` `js/animals.js` `js/weather.js` `js/audio.js` |
| **D** | 車体外装/内装・ガラス・損傷（見た目中心、プレビュー撮影） | `js/camper.js` `js/interior.js` `js/glass.js` `js/damage.js` `js/assets.js` |
| **E** | 地形・森・地図タブレット・CSS/モバイル | `js/terrain.js` `js/relief.js` `js/forest.js` `js/tablet.js` `css/style.css` `manifest.webmanifest` |
| **R** (予備・レビュー) | B 枠を二重に名乗った2人目（6108bcc）はこちら。全ファイル横断レビュー＋ INBOX 処理＋ツール類 (`tools/**` `build/**` `index.html`以外のHTML) の不具合。**編集前に担当者の status を見て、他人の主担当ファイルは INBOX 経由**。ID は `R-01…`、ファイルは `collab/{bugs,env,status}/R.md` | `tools/**`（camper_preview/cshot を除く） |

- 主担当以外のファイルを直したい場合：その担当の `status/<X>.md` を確認し、INBOX で依頼するか、**小さな1行修正なら**編集してよい（コミットメッセージに `[cross:<担当>]` を付ける）。
- `js/lib/**`（three.js 本体）は**触らない**。

## 3. バグの書式（`collab/bugs/<X>.md` に追記）
```
### X-01 [重大度 S/A/B/C] 1行タイトル
- 場所: js/foo.js L123 (関数名)
- 症状: 何が起きるか（再現手順 / URLパラメータ）
- 原因: なぜ起きるか
- 修正: 何をしたか（コミット hash）
- 検証: node テスト / プレビュー画像 / 目視 など
```
重大度: **S**=クラッシュ・進行不能・データ破損, **A**=主要機能が誤動作, **B**=見た目/UXの明確な不具合, **C**=軽微。
ID は `A-01, A-02…` のように自分の文字で連番（全体で重複しない）。
**既に `BUGFIXES.md` に載っている修正済み項目と重複させない。**

## 4. Git 運用（重要）
```bash
cd /home/user/webapp
git checkout genspark_ai_developer        # 初回のみ（main には何も無い）
bash tools/save.sh "fix(vehicle): ..."    # add + commit + pull --rebase + push（競合に強い）
```
- コミットは `type(scope): 説明 [B-03]` のようにバグIDを含める。
- 共有ファイルは自分のファイルだけ編集するので基本的に競合しない。競合したら**リモート優先**で解決。
- `tools/autosave.sh` は他エージェントの push と衝突しやすいので**使わない**（`save.sh` を手動で）。

## 5. 共有ツール・ハーネス（全員自由に使ってよい）
| ツール | 用途 |
|---|---|
| `npm test` | 道路網/目的地/視線/export 整合（node, WebGL不要, 数秒） |
| `npm run test:drive` / `test:fall` / `test:physics` | 物理＋自動運転の実走（node, 重い: 1〜3分） |
| `python3 -m http.server 8080` | ローカル配信（ポート衝突時は 8081 等） |
| `python3 tools/qa_shot.py "<query>" out.jpg [w h]` | **本編**の決定論フレーム撮影（`qa=1` 必須、重い: 1〜4分） |
| `python3 tools/cshot.py "<query>" out.jpg [w h]` | **キャンピングカーだけの軽量プレビュー世界**（`tools/camper_preview.html`）の撮影。数十秒 |
| `python3 tools/page_shot.py` / `tools/ishot.py` / `tools/map_shot.py` | 既存の各種撮影 |
| `tools/qa_errors.py` | コンソールエラー収集 |
| `python3 tools/uishot.py -b name "open=menu&tab=car" ...` | **HUD/メニュー/地図の DOM だけ**を WebGL 無しで撮影（1枚5秒, 軽い）。`open=menu|sheet|tablet|drive|over` |
| 画像を Read ツールで開く | 撮影した jpg/png をそのまま目視確認できる |

### camper_preview の主なパラメータ
`tools/camper_preview.html?view=ext|int|top|side|rear|front&night=1&rain=1&dmg=1&lights=0|1&curtain=1&cook=1&spot=1&head=1&t=<hour>&cam=x,y,z&at=x,y,z&fov=60`
（地形・森・動物を読み込まないので 1GB 環境でも軽い。見た目バグ確認に使う）

### 撮影 URL 例（本編）
`qa=1&q=m&view=lounge&t=21` / `qa=1&q=m&view=outside&t=12` / `qa=1&q=m&cam=chase&dest=ridge&sim=20` / `qa=1&q=m&tablet=1` / `qa=1&q=m&event=bear&t=23`

## 6. 環境の注意（1GB RAM / 2 CPU）
- **ヘッドレス Chromium は同時に1つまで**（`/tmp/qa_browser.lock` で qa_shot/cshot は直列化される）。
- swiftshader は遅い。`q=m` と小さい viewport（915x412）を使う。
- `page.screenshot` がハングする場合は canvas の `toDataURL` 経由で撮る（qa_shot/cshot はそうしている）。
- 開発環境で起きたエラーは必ず `collab/env/<X>.md` に「症状 / 原因 / 解決法」で書く（最後に A が統合して `DEV_ENV_ERRORS.md` を作る）。

## 7. 進め方
1. 自分の担当ファイルを**全文読む**（既存コードを把握してから書く）。
2. `status/<X>.md` に「着手中ファイル」を書いて push。
3. 重大度 S/A を優先して探す → 直す → テスト/撮影で検証 → `bugs/<X>.md` 追記 → `save.sh`。
4. 30分ごとに他人の `bugs/` と `INBOX.md` を `git pull` して読む（重複回避・引き継ぎ）。
5. 担当が尽きたら `status/<X>.md` に `DONE` と書き、INBOX の未処理項目や他領域のレビューに回る。
6. 全員 DONE になったら A が集計・最終検証・`DEV_ENV_ERRORS.md` 作成・PR 更新。

## 8. リーダー決定ログ
- [A] B 枠は 88102e3 の先着者。6108bcc で B を名乗った2人目は **R（レビュー/INBOX/tools）** へ移ってください。
- [A] サンドボックスは予告なくリセットされる（作業ツリーが main 初期状態に戻る）。**修正1件ごとに save.sh**。復旧手順は collab/env/A.md §5。
- [A] 軽量撮影: `python3 tools/cshot.py -b name "view=ext&night=1" ...`（http.server を 8080 で起動しておくこと）。
- [A] **本編 index.html のヘッドレス撮影は 1GB でメモリ枯渇し、サンドボックス全体（他エージェントの git も）が固まる**。見た目確認は camper_preview を優先。本編が必要なら事前に `free -m` で available>600MB を確認し、`q=m` で1枚ずつ。
- [A] サンドボックスは既に2回リセットされた。**新規ファイルも作ったら即 save.sh**（未 push のツールが2回消えた）。
