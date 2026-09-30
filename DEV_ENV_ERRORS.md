# 開発環境エラーと解決法（実際に直面したもの）

5〜6 体の AI エージェント（A=リーダー, B, C, D, E ＋予備 R）が **1 つの Linux サンドボックス（RAM 約 1GB / 2 CPU）と 1 つの GitHub ブランチ**を共有し、ヘッドレス Chromium で WebGL の three.js ゲームを並行してデバッグしたときに、**開発環境そのもの**で実際に起きたエラーと解決法をまとめた。

制作物固有の話ではない。次に環境を作るときの参考用。
出典: `collab/env/{A,B,C,D,E}.md`（各エージェントの一次記録）

---

## 0. 結論：次の環境で最初にやること（チェックリスト）

| # | 対策 | 防げる問題 |
|---|---|---|
| 1 | **RAM は最低 2GB、できれば 4GB**（ヘッドレス Chromium＋swiftshader は 1 枚の WebGL 撮影で 750MB） | §3 メモリ枯渇・フリーズ |
| 2 | 起動スクリプト 1 本で `pip install playwright` → `playwright install chromium` → `sudo playwright install-deps chromium` → http.server 起動まで**冪等に**再構築 | §1 リセット後の再構築、§2 ライブラリ不足 |
| 3 | **作業はこまめに push**（修正 1 件ごと）。push したものだけが永続する | §1 リセットで作業が消える |
| 4 | 追記型の共有ファイルに `.gitattributes` で `merge=union` | §4 共有ノートの行消失 |
| 5 | 自動マージで `-X ours` / `-X theirs` を使わない。競合したら止めて人（エージェント）が解決 | §4 他人の修正が黙って消える |
| 6 | エージェントごとに**ポート番号を割り当てる**（8080, 8084, 8090…）。撮影ツールは `QA_BASE` 環境変数で向き先を変えられるようにしておく | §5 ポート衝突 |
| 7 | ヘッドレスブラウザは**同時に 1 つだけ**（ファイルロック）＋ memory watchdog | §3 |
| 8 | 長時間コマンドはバックグラウンド実行＋ログファイル。ツールの同期実行タイムアウト（120 秒）を前提にする | §6 タイムアウト |
| 9 | 担当領域（ファイル単位のロック）を最初に決め、先着順は git コミットで確定させる | §7 担当の二重取得 |

---

## 1. サンドボックスのリセット（最頻出・全エージェントが遭遇）

### 1-1. 作業ツリーが初期状態（main・README だけ）に戻る
- **症状**: 突然 `ls` で `js/` が無い、`git branch` が `main`、`collab/` が無い。未 push の変更、`/tmp` の自作スクリプト、`pip` で入れたパッケージ、`~/.cache/ms-playwright` がすべて消える。1 セッション中に **3 回以上**発生した。
- **原因**: 環境側のリセット／再作成。ユーザーがターンを中断したとき、またはメモリ枯渇で固まった後の再起動で起きる。ディスクは初期クローン状態に戻る。**リモートに push 済みのコミットだけが残る**。
- **解決法**:
  ```bash
  cd /home/user/webapp
  git fetch -q origin && git checkout -q genspark_ai_developer && git pull -q
  (pip install -q playwright pillow numpy \
   && python3 -m playwright install chromium \
   && sudo python3 -m playwright install-deps chromium) > /tmp/boot.log 2>&1 &
  # http.server は Bash ツールの run_in_background で起動する（§6-2）
  ```
- **予防**:
  - 修正 1 件ごとに commit ＋ push する（`tools/save.sh`）。
  - **新しく作ったツールは、動作確認より先に一度 push する**。動作確認中のリセットで 2 回消えた。
  - `save.sh` は長いコマンドチェーンに混ぜず、単独で実行する。チェーンの途中で中断されると、その前の成果も消える。
  - 補助スクリプトは `/tmp` ではなくリポジトリ内（`tools/agents/` など）に置いてコミットする。`/tmp` も消える。

### 1-2. コマンド実行中に作業ディレクトリが丸ごと作り直される
- **症状**: 1 回の Bash 呼び出しの途中から `No such file or directory` や `fatal: not a git repository` が出る。直後に見ると `/home/user/webapp` の mtime が新しく、中身は再クローンされている。
- **原因**: 同じサンドボックスを共有する別プロセス（別エージェントの復旧処理、または環境の再作成）がディレクトリを削除して作り直した。シェルの cwd は、削除済みの古いディレクトリを指したまま残る。
- **解決法**: コマンドごとに `cd /home/user/webapp &&` を付け直す。共有環境では **`rm -rf <repo> && git clone` 型の復旧をしない**。`fetch / checkout / pull` だけで直す。

---

## 2. ヘッドレス Chromium（Playwright）の導入

### 2-1. `ModuleNotFoundError: No module named 'playwright'`
- **原因**: 初期状態、またはリセットで site-packages が消えた。
- **解決法**: `pip install -q playwright pillow numpy && python3 -m playwright install chromium`（約 20 秒、約 114MB）。

### 2-2. ブラウザが `exitCode=127` で即終了する
- **症状**: `browserType.launch: ... <process did exit: exitCode=127>`
- **原因**: 共有ライブラリが不足している。`ldd chrome-headless-shell | grep "not found"` で確認すると、libatk-1.0、libatk-bridge-2.0、libXcomposite、libXdamage、libatspi などが出る。
- **解決法**: `sudo python3 -m playwright install-deps chromium`（apt 経由、約 15 秒）。リセットのたびに必要。

### 2-3. WebGL を使うには起動フラグが必要
- `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` を付ける。
- swiftshader では `page.screenshot()` がハングすることがある。ページ内で `canvas.toDataURL()` して base64 を受け取る方式が安定した（`preserveDrawingBuffer: true`、または描画直後に取得）。
- DOM だけを確認したいときは `--disable-gpu` で WebGL を使わないページを撮る。1 枚約 5 秒で、メモリもほとんど使わない。

---

## 3. メモリ枯渇（1GB RAM）

### 3-1. フル 3D ページのヘッドレス撮影で、サンドボックス全体が固まる
- **症状**: `free -m` の available が 20〜40MB、load average が 11。`git push`、`pgrep`、`uptime` まで 30〜120 秒かかるかタイムアウトする。他のエージェントの作業も巻き添えで止まる。
- **原因**: chrome-headless-shell の GPU プロセス（swiftshader）が RSS 約 500MB、レンダラが約 250MB。大きな地形、数千本のインスタンス、4096px のシャドウマップ、テクスチャで 1GB を超える。軽量設定（低画質・小さい viewport）でも、起動 25 秒で available 40MB まで落ちた。
- **解決法**:
  - 重いページの撮影はやめ、検証を分割する。
    - 見た目 → 対象オブジェクトだけを置いた**軽量プレビューページ**。
    - UI → WebGL なしの **DOM ハーネス**。
    - ロジック → **node の単体テスト**（WebGL 不要）。
  - **watchdog を並走させる**（`tools/memguard.sh`）。available が 60MB を下回ったら `pkill -f chrome-headless-shell`。
    - 注意: watchdog が `pgrep -f "cshot.py|..."` のように**自分の引数にも一致するパターン**を使うと、自分自身を見つけて終わらなくなる。`python3 tools/(...)\.py` のように、実際のコマンドラインにだけ一致させる。
  - 撮影前に `free -m` で available が 600MB 以上あることを確認する。
  - ヘッドレスブラウザは全エージェントで同時に 1 つまで（`/tmp/qa_browser.lock` を `fcntl.flock` で取り合う）。
  - 固まったら `ResetSandbox` などで復帰する。ファイルは残るが、プロセス（http.server など）は再起動が必要。
  - `--js-flags=--max-old-space-size=384 --renderer-process-limit=1` を付けると多少ましになる。

### 3-2. 軽量ページでもブラウザが突然閉じる（`Target page, context or browser has been closed`）
- **原因**: 3 秒間隔の watchdog が kill する前に、GPU プロセスが OOM で落ちた。
- **解決法**: 1 ブラウザで連続撮影する枚数を減らし、1 枚ずつ再試行する。シャドウを無効にする（`noshadow`）と通った。

---

## 4. 複数エージェントによる同時 git 操作

### 4-1. 自動フォールバック `git pull --no-rebase -X ours` が他人の変更を黙って消す
- **症状**: 共有 INBOX に同時に追記したとき、相手の行が消えた（実害 2 行、後で復元）。同じコードファイルでも同様に、他人の修正が巻き戻る可能性がある。
- **原因**: `-X ours` は、衝突した塊を自分側で上書きする。
- **解決法**:
  - 追記型の共有ファイルは `.gitattributes` に次の 2 行を書く。
    ```
    collab/INBOX.md merge=union
    collab/**/*.md merge=union
    ```
    これで追記同士の衝突でも、両方の行が残る。
  - コードの衝突は自動解決しない。`save.sh` では rebase を中止して `exit 2` し、手動解決を促すように変えた。

### 4-2. push が `remote rejected (cannot lock ref ...)` / non-fast-forward になる
- **原因**: 他エージェントとの同時 push。
- **解決法**: `git pull --rebase` → `git push` を、間隔を延ばしながら数回リトライする。最後に `git status -sb` で ahead が残っていないか確認する。

### 4-3. 共有ファイルの編集で、他人の記述を上書きしてしまう
- **症状**: 状態ファイルを 1 つにまとめていたため、別エージェントが他人の欄を上書きした（すぐ復元）。
- **解決法**: ファイルはエージェントごとに分ける（`status/<X>.md`、`bugs/<X>.md`、`env/<X>.md`）。本人しか書かない。全員が書くのは追記専用の `INBOX.md` だけにする。

---

## 5. ポート衝突
- **症状**: 全員が `python3 -m http.server 8080` を使おうとして取り合った。撮影ツールがポート 8080 に固定されていた。
- **解決法**: エージェントごとにポートを変える（8080 / 8084 / 8090 …）。撮影スクリプトは `QA_BASE=http://127.0.0.1:<port>` 環境変数で向き先を変えられるようにする。

---

## 6. ツール実行まわり

### 6-1. Bash ツールの同期実行が 120 秒でタイムアウトする
- **症状**: フル撮影（2〜4 分）や物理走行テスト（3 分）が途中で打ち切られる。
- **解決法**: `run_in_background: true` で実行し、出力をログファイルに書く。`sleep N; cat log` でポーリングする。

### 6-2. `nohup python3 -m http.server &` がすぐ消える → `ERR_CONNECTION_REFUSED`
- **原因**: ツールの Bash セッションが終わると、子プロセスごと終了させられる（サブシェル `( ... &)` でも同じ）。リセット後も当然消えている。
- **解決法**: Bash ツールの `run_in_background: true` で起動する（または pm2 / supervisor を使う）。起動確認は `curl -sI http://127.0.0.1:8080/`。

### 6-3. ユーザーによるターン中断
- 中断されたツール呼び出しは、実行されたかどうか不明になる。さらに中断をきっかけにリセットが起きることが多い。
- **解決法**: 再開したら、まず `pwd; git branch --show-current; git log -3; git status` で状態を確認してから、足りない部分だけやり直す。

---

## 7. 並行エージェントの運用
- **担当の二重取得**: 2 体が同じ担当枠「B」を同時に名乗った。先着順を git の履歴（コミット順）で判定し、2 体目には予備枠「R」を割り当てた。
- **有効だった仕組み**:
  - 最初に全コードを読んだうえで、担当ファイル（＝編集ロック）を割り振る。
  - 他人の担当ファイルで見つけたバグは `INBOX.md` に 1 行で依頼する。対応した側が `(done by X, hash)` を追記する。
  - バグの ID はエージェントごとの連番（`A-01`、`C-12` …）にして、重複を防ぐ。
  - 重い検証環境は共有ツールとして 1 か所に置く。軽量プレビュー、DOM ハーネス、watchdog、安全な save スクリプトなど。
