# Bugs found/fixed by Agent A
（書式は collab/README.md §3）

### A-01 [A] 追従カメラ切替時の向きが 180° 逆になる
- 場所: js/view.js setView
- 症状: 🎥 を押すと、36目的地中20か所で車の「前」側からのアングルで始まる（後ろ追従のつもり）
- 原因: `G.camper.rotation.y`（Euler Y）を方位に使用。四元数→Euler 分解で yaw≈±π かつ微小な傾きがあると rotation.y が ±π 反転した値になる（node 検証: 20/36 目的地で heading と 3.0rad ずれ）
- 修正: 実際の前方ベクトルから方位を算出する `camperHeading()`
- 検証: node で DESTS 全点の Euler 分解を比較

### A-02 [B] 追従カメラのピンチ・ホイールズームが壊れている
- 場所: js/view.js initView
- 症状: 追従カメラで2本指ピンチすると毎回 11m 基準にジャンプ（前回のズームが保持されない）。マウスホイールは追従中に効かず、裏で一人称FOVが変わる
- 原因: `11 * pinch0 / d` と定数を基準にしていた。wheel ハンドラが cam モードを見ていない
- 修正: ピンチ開始時の距離 `dist0` を保存、wheel は追従中は距離を変更

### A-03 [A] `?view=outside` で外に出た位置が車と関係ない場所になる
- 場所: js/main.js init
- 症状: 起動時に外視点だと、プレイヤーが原点付近（identity 行列基準）に出る・向きもずれる。車が hollow 以外にいると森の中に放り出される
- 原因: `goOutside(C.group)` を `updateMatrixWorld` の前に呼んでいた（localToWorld が古い行列）。pendingOutside も消えない
- 修正: 行列更新後に呼び、フラグを下ろす

### A-04 [A] 「レッカーでキャンプ地へ」の不具合（外に取り残し・保存されない・1フレーム自動運転継続）
- 場所: js/main.js rescueHome
- 症状: 外を歩いている時に使うとプレイヤーだけ元の場所に残る（車は数百m先）。再読込すると元の場所に戻る（fc3d_spot 未更新）。disengage が非同期 import 後なので移送後に自動運転が1フレーム走る
- 修正: 同期 disengage → 配置 → 車内へ戻す → fc3d_spot 保存 → AP.at 更新

### A-05 [C] `?t=` に不正値で時刻が NaN（空・照明・HUD が永久に壊れる）
- 場所: js/core.js G.hour
- 修正: isFinite チェック + 0..24 に正規化（t=25 等も翌日扱いで破綻しない）
