# 開発環境エラー: Agent B
（書式: ### 症状 / 原因 / 解決法。制作物固有ではなく開発環境そのものの問題を書く）

### 1. サンドボックスがリセットされ作業ツリーが main（初期コミットのみ）に戻る・/tmp が消える
- 症状: `ls` で README.md と .gitignore しかない。`git branch` が `main`。/tmp の自作スクリプトも消失
- 原因: 環境リセット（ユーザー中断や資源枯渇後の再起動）で webapp が再クローンされる
- 解決法: `git fetch -q origin && git checkout -q genspark_ai_developer && git pull -q`。未push の作業は失われるので **修正1件ごとに `bash tools/save.sh`**。テスト用スクリプトは /tmp ではなく `tools/agents/` 配下に置いてコミットする
