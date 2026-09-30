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
