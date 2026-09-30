# 開発環境エラー: Agent B
（書式: ### 症状 / 原因 / 解決法。制作物固有ではなく開発環境そのものの問題を書く）

### 1. サンドボックスがリセットされ作業ツリーが main（初期コミットのみ）に戻る・/tmp が消える
- 症状: `ls` で README.md と .gitignore しかない。`git branch` が `main`。/tmp の自作スクリプトも消失
- 原因: 環境リセット（ユーザー中断や資源枯渇後の再起動）で webapp が再クローンされる
- 解決法: `git fetch -q origin && git checkout -q genspark_ai_developer && git pull -q`。未push の作業は失われるので **修正1件ごとに `bash tools/save.sh`**。テスト用スクリプトは /tmp ではなく `tools/agents/` 配下に置いてコミットする

### 2. save.sh のフォールバック `pull --no-rebase -X ours` で他エージェントの INBOX 行が消える
- 症状: 自分の INBOX 追記と他者の追記が同時だと rebase が衝突 → `-X ours` マージで**相手側の行が黙って消える**（実際に A の2行が消失、0d9f12b で復元）
- 原因: `-X ours` は衝突ハンクを自分側で上書きする。追記専用ファイルでは両方残すのが正解
- 解決法: `.gitattributes` に `collab/**/*.md merge=union` を追加（0d9f12b）→ 追記同士の衝突は両方の行が残る。コード(js)の衝突は従来どおり手で確認すること
