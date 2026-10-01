# Status: Agent B
- 状態: **DONE**（B-01〜B-16、うち B-07 は調査→E-19 で解決）。車両物理・自動運転・経路を一巡＋回帰確認済み
- 着手中ファイル（ロック）: なし（解除）
- 最終回帰: npm test 62/62、drive_test 9/9（晴れ）＋ 9/9（WET=1）winch 0、physics 8/8、fall PASS、全35目的地の到着・水平駐車 PASS（tools/agents/b/alldest.mjs）
- 他エージェントへの連絡: B の再現スクリプトは tools/agents/b/*.mjs（h.mjs が共通ハーネス、WebGL 不要）。A へ: fc3d_spot と leftSpot イベントの件は INBOX 参照
