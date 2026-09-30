# 開発環境エラー: Agent E
（書式: ### 症状 / 原因 / 解決法。制作物固有ではなく開発環境そのものの問題を書く）

### 1. サンドボックスがリセットされ、作業ツリーが main ブランチ・初期状態に戻っていた
- 症状: 途中で `git status` が `On branch main` / `collab/` 消失、`/tmp` も空、playwright も未インストールに戻る
- 原因: 環境リセット（コミット前の変更・pip パッケージ・~/.cache は消える。リモートの push 済みコミットは無事）
- 解決法: `git fetch && git checkout -B genspark_ai_developer origin/genspark_ai_developer` → `pip install -q playwright pillow numpy && python3 -m playwright install chromium && sudo python3 -m playwright install-deps chromium`。**未コミットの編集は消えるので修正1件ごとに save.sh**

### 2. tools/map_shot.py がポート 8080 固定
- 症状: 他エージェントが 8080 を使っていると撮影先を変えられない
- 解決法: `QA_BASE=http://127.0.0.1:8090 python3 tools/map_shot.py ...`（E が QA_BASE 環境変数対応を追加）

### 3. 本編 qa_shot.py（index.html 全体）が 1GB 環境でサンドボックスごと固まる
- 症状: `qa_shot.py "qa=1&q=m&view=outside"` が 7分でタイムアウト → 次の Bash が `failed to resume sandbox: timeout` → 復帰後 /tmp が消えていた
- 原因: swiftshader + 森全体(木1250本/下草 数千インスタンス)の初回シェーダコンパイル＋描画でメモリ枯渇
- 解決法: 森・地形の検証は node で数値検証（terrain/forest は DOM 無しで import 可能）、地図/HUD は page_shot.py（WebGL不要）で撮影。本編撮影が必要なら他エージェントの Chromium が動いていないことを確認し `frames=2` で
