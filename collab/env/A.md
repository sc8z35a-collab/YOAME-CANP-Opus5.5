# 開発環境エラー: Agent A
（書式: ### 症状 / 原因 / 解決法。制作物固有ではなく開発環境そのものの問題を書く）

### 1. Playwright の Python パッケージ / ブラウザが未インストール
- 症状: `ModuleNotFoundError: No module named 'playwright'`
- 原因: サンドボックスのリセットでユーザー site-packages / ~/.cache が消えている（または初期状態）
- 解決法: `pip install -q playwright pillow numpy && python3 -m playwright install chromium`（約20秒, 114MB）。`tools/bootstrap.sh` でも可

### 2. ヘッドレス Chromium が exitCode=127 で即終了
- 症状: `browserType.launch: ... <process did exit: exitCode=127>`
- 原因: 共有ライブラリ不足（`ldd chrome-headless-shell | grep "not found"` → libatk-1.0, libatk-bridge-2.0, libXcomposite, libXdamage, libatspi 等）
- 解決法: `sudo python3 -m playwright install-deps chromium`（apt で依存導入、約15秒）

### 3. `nohup python3 -m http.server 8080 &` がすぐ消える → ERR_CONNECTION_REFUSED
- 症状: 直後の撮影で `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8080`
- 原因: ツールの Bash セッション終了時に子プロセスごと殺される（サブシェル `( ... &)` でも同様）
- 解決法: Bash ツールの `run_in_background: true` で `python3 -m http.server 8080` を起動する（または pm2 / supervisor）。起動確認は `curl -sI http://127.0.0.1:8080/index.html`

### 4. swiftshader での撮影は遅い
- 症状: 本編 (index.html) の1枚に数分、軽量プレビューでも約50秒
- 解決法: 軽量世界 `tools/camper_preview.html` + `tools/cshot.py -b` で1ブラウザ複数枚。`q=m`、915x412、同時起動は1つ（/tmp/qa_browser.lock）

### 5. サンドボックスが作業途中でリセットされ、作業ツリー・pip パッケージ・~/.cache が消える
- 症状: 突然 `/home/user/webapp` が初期コミット（main, README のみ）に戻り、`js/` が存在しない / `ModuleNotFoundError: playwright` / `~/.cache/ms-playwright` 消失。未コミットの修正は全損
- 原因: 環境リセット（ユーザー操作の中断や資源枯渇後の再起動）。ディスクは初期状態に戻り、リモート push 済みのものだけが残る
- 解決法: ①修正ごとに即 `bash tools/save.sh` で push（リモートが唯一の永続層）。②修正は `/tmp` に python パッチスクリプトとして書いて適用すると、再適用が容易。③復帰手順: `git fetch && git checkout genspark_ai_developer` → `pip install playwright pillow numpy && python3 -m playwright install chromium && sudo python3 -m playwright install-deps chromium` → http.server を background で再起動

### 6. 本編 (index.html) のヘッドレス撮影でメモリ枯渇 → サンドボックス全体がスラッシング
- 症状: `free -m` の available が 20MB、load average 11、`git push` や `pgrep` すら 100 秒以上かかる。Bash ツールが 120 秒でタイムアウト
- 原因: 1GB RAM で chrome-headless-shell の GPU(swiftshader) プロセスが RSS 500MB + レンダラ 250MB。地形 480m×480m・森 1900 本・4096 シャドウマップ等で溢れる
- 解決法: 本編撮影は避け、軽量世界 `tools/camper_preview.html`（RSS 約 300MB）で見た目確認。どうしても本編なら `q=m&nomap&noevents` + `--js-flags=--max-old-space-size=384`、他エージェントと時間をずらす。固まったら `pkill -f chrome-headless-shell`
- 補足: Bash ツールの既定タイムアウトは 120 秒。重い処理は `run_in_background: true` + ログファイル

### 7. リセットは繰り返し起こる（1セッションで2回以上）— 作った直後のツールが未 push で消えた
- 症状: 新規作成した `tools/ui_harness.html` / `tools/uishot.py`（検証済み）が次のリセットで消失
- 解決法: **新規ファイルは動作確認の前に一度 push**。再構築は1コマンド:
  `git fetch -q && git checkout -q genspark_ai_developer && git pull -q; (pip install -q playwright pillow numpy; python3 -m playwright install chromium; sudo python3 -m playwright install-deps chromium) &` → http.server を background で起動

### 8. コマンド実行中に作業ディレクトリが丸ごと作り直され `fatal: not a git repository` / `No such file`
- 症状: 同じ Bash 呼び出しの途中から `collab/env/A.md: No such file or directory`、`fatal: not a git repository`。直後に見ると `/home/user/webapp` の mtime が新しく、中身は再クローン済み
- 原因: 同じサンドボックスを共有する別エージェント（または環境の復旧処理）が webapp を削除→再クローンした。シェルの cwd は削除済みの inode を指したまま
- 解決法: 毎回 `cd /home/user/webapp &&` を先頭に付け直す（古い cwd を使い続けない）。**共有サンドボックスでは `rm -rf webapp` 系の復旧を行わない**（`git fetch && git checkout && git pull` のみ）。未 push の変更は消えるので即 push
