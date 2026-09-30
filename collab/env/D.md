# 開発環境エラー: Agent D
（書式: ### 症状 / 原因 / 解決法。制作物固有ではなく開発環境そのものの問題を書く）

### 1. サンドボックスがリセットされ、ローカルの genspark_ai_developer ブランチと pip/playwright が消えた
- 症状: 作業ディレクトリが `main`（README のみ）に戻り、`js/` が無い。`import playwright` も失敗
- 原因: 環境リセットでローカル状態が消える（リモートに push 済みのものは残る）
- 解決法: `git fetch origin && git checkout -b genspark_ai_developer origin/genspark_ai_developer`、その後 `pip install -q playwright pillow numpy && python3 -m playwright install chromium && sudo python3 -m playwright install-deps chromium`。**未 push の作業は失われるので修正1件ごとに save.sh**

### 2. http.server のポート衝突回避
- 他エージェントと 8080 を取り合わないよう D は `python3 -m http.server 8084`（run_in_background）+ `QA_BASE=http://127.0.0.1:8084` を使用

### 3. サンドボックスが作業中に計3回リセットされた（ブランチ・pip・背景サーバが消える）
- 症状: 突然 `main` に戻る / `ERR_CONNECTION_REFUSED`（http.server も消える）
- 解決法: #1 の手順で復旧＋ `python3 -m http.server 8084` を run_in_background で再起動。**1〜3件ごとに save.sh** していたので失ったのは未コミットのシェル状態だけだった

### 4. save.sh の push が `cannot lock ref ... expected <sha>` で拒否
- 原因: 他エージェントの push と同時刻に競合（GitHub 側の ref ロック）
- 解決法: そのまま再実行（save.sh 内の3回リトライで通った）。`git status -sb` で ahead 0 を確認

### 5. WebGL 無しでジオメトリを数値検証したい
- 解決法: node で document/canvas をスタブし TextureLoader を空テクスチャに差し替えて `buildCamper()` を実行（/tmp/ovl.mjs 方式）。Box3 で部品の重なり・浮きを数秒で確認でき、1回50秒の撮影を節約できた。ライブ環境での評価は `tools/dbg_d.py`
