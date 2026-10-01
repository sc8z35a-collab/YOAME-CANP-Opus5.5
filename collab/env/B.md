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

### 3. 作業中に何度もサンドボックスがリセットされ、未コミットの修正と /tmp のテストが消える（B は計4回）
- 症状: 長いテスト（drive_test 等）を回している最中や、ユーザー中断の直後に `/home/user/webapp` が main の初期状態に戻る。直前の未コミット修正（setPose リセット、パッド平坦化）と /tmp のスクリプトが消えた
- 原因: 環境側のリセット（中断・資源上限）。プロセスも全て止まる
- 解決法: ①修正を当てたら**テスト前に**すぐ `git commit && git push`（wip で可）②プローブは `tools/agents/b/*.mjs` に置いてコミット ③重いテストは `( ... > /tmp/x.txt &)` で背景実行し、結果ファイルを後で読む（リセットされても他の作業は失わない）④復旧は `git fetch && git checkout genspark_ai_developer && git pull` のみ
