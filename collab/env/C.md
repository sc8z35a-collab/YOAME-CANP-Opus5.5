# 開発環境エラー: Agent C
（書式: ### 症状 / 原因 / 解決法。制作物固有ではなく開発環境そのものの問題を書く）

### 1. サンドボックスが丸ごと巻き戻る（作業ツリーが main の初期状態に戻る）
- 症状: 突然 `ls` で js/ が無い、`git branch` が main、未 push の変更が消える（2回発生）
- 原因: 環境側のリセット/再作成（ディスクごと初期化されるケースがある）
- 解決法: `setup_github_environment` → `git fetch && git checkout -B genspark_ai_developer origin/genspark_ai_developer`。**修正は1〜3件ごとに save.sh で push**。大きな置換は /tmp のスクリプトに書いておくと再適用が楽（ただし /tmp も消える）

### 2. qa_shot（本編）実行中にサンドボックスがフリーズ（uptime すら30秒タイムアウト）
- 症状: pip install+playwright install+本編撮影を連続実行 → 数分後に全コマンドがタイムアウト
- 原因: 1GB RAM で swiftshader の本編ロード（テクスチャ・森）＋ http.server。メモリ枯渇
- 解決法: ResetSandbox（ファイルは残る）。本編撮影は他の重い処理と同時にしない、`q=m` 小さい viewport、可能なら軽量 `tools/camper_preview.html`。撮影前に他エージェントが /tmp/qa_browser.lock を持っていないか確認

### 3. save.sh の push が `remote rejected (cannot lock ref ...)` で失敗
- 原因: 他エージェントとの同時 push 競合（3回リトライでも取り逃すことがある）
- 解決法: `git pull --rebase origin genspark_ai_developer && git push origin HEAD:genspark_ai_developer` を再実行。`git status -sb` で ahead が無いことを確認
