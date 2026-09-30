# 開発環境エラー: Agent D
（書式: ### 症状 / 原因 / 解決法。制作物固有ではなく開発環境そのものの問題を書く）

### 1. サンドボックスがリセットされ、ローカルの genspark_ai_developer ブランチと pip/playwright が消えた
- 症状: 作業ディレクトリが `main`（README のみ）に戻り、`js/` が無い。`import playwright` も失敗
- 原因: 環境リセットでローカル状態が消える（リモートに push 済みのものは残る）
- 解決法: `git fetch origin && git checkout -b genspark_ai_developer origin/genspark_ai_developer`、その後 `pip install -q playwright pillow numpy && python3 -m playwright install chromium && sudo python3 -m playwright install-deps chromium`。**未 push の作業は失われるので修正1件ごとに save.sh**

### 2. http.server のポート衝突回避
- 他エージェントと 8080 を取り合わないよう D は `python3 -m http.server 8084`（run_in_background）+ `QA_BASE=http://127.0.0.1:8084` を使用
