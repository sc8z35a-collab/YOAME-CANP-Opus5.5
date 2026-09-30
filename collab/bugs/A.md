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

### A-06 [B] PC: 画面左側をマウスドラッグすると「歩く」と「見回す」が同時に動く
- 場所: js/ui.js joystick pointerdown / js/view.js
- 原因: view.js は mouse なら左半分も look に使うが、ui.js も mouse 左ボタンでジョイスティックを出していた
- 修正: 仮想スティックはタッチ専用（PC は WASD）

### A-07 [B] Esc で地図（タブレット）が閉じない
- README の「Esc 閉じる」と不一致。closeAll がタブレットを閉じない → Esc で closeTablet も

### A-08 [B] 🏃 走るトグルがキー入力のたびに解除される
- 原因: updKeys が毎回 `PL.run = keys.has('ShiftLeft')` で上書き。ShiftRight 未対応
- 修正: runToggle を保持して OR

### A-09 [B] ウィンドウのフォーカスを失うとキーが押しっぱなし扱い（勝手に歩き続ける）
- 修正: window blur で keys をクリア

### A-10 [B] E / M を押し続けるとキーリピートで座る⇔立つ・地図の開閉が連打される
- 修正: `e.repeat` は移動キー更新だけ

### A-11 [B] 縦向き警告画面に文字がない（アイコンだけ）
- 場所: index.html #rotate
- README は「横向きにしてください」を表示と記載しているが、HTML にテキストが無く意味が伝わらない（aria-label も英語 "rotate"）
- 修正: 縦並びでアイコン＋「スマホを横向きにしてください」、role=alert

### A-12 [B] 車外を歩くと木・岩・焚き火をすり抜ける／世界の外まで歩ける
- 場所: js/player.js updatePlayer（外歩行）
- 原因: 外歩行は車体だけ押し出し。forest の colliders を無視。ワールド境界のクランプなし（外周の山を登り切って heightAt のクランプ外へ）
- 修正: colliders で円押し出し、WORLD の内側 12m にクランプ

### A-13 [C] UI 構築前に出たトースト（起動直後の自動運転・強制イベントの通知）が消える
- 場所: js/ui.js toast
- 原因: toastEl が null の間は捨てていた
- 修正: 最大6件キューして buildUI 後に表示

### A-14 [A] ゲームオーバー後もエンジン音・自動運転 HUD が続く／地図を開いているとゲームオーバー画面が隠れる
- 場所: js/main.js bus 'gameover'
- 原因: updateDrive は止まるが AP.on / G.driving が残る（エンジン音・HUD 表示が継続）。#over に z-index が無く #tablet(z12) やメニューの下に隠れて「もう一度」が押せない
- 修正: gameover で disengage、タブレット/メニュー/シートを閉じ、#over を z-index 30 に

### A-15 [C] メニューの「+3h」で 6:00 をまたぐと「夜を越えた」がカウントされない
- 場所: js/main.js loop
- 原因: `prev < 6 && hour >= 6` のフレーム間エッジ判定。+3h で 4→7 にジャンプすると prev も 7 扱いにならず…ではなく、ボタンはフレーム間で hour を書き換えるので prev はジャンプ後の値になり判定をすり抜ける
- 修正: 「夜(<5時)を経験した」フラグ＋ 6〜12 時で未カウントの日なら加算

### A-16 [C] 「🕳 タイヤが埋まっている」警告が絶対に表示されない
- 場所: js/ui.js updateUI
- 原因: `!AP.on && G.driving` — G.driving は AP.on の間しか true にならない（autopilot.js）ため条件が常に偽
- 修正: 停車中(!AP.on)でスタックしていれば表示

### A-17 [B] 車体が 30% でも凹み・傷の記録が無いと「直すところはない」と修理を拒否
- 場所: js/ui.js repairBtn
- 原因: 凹み/傷の数だけで判定。洪水（C 側で hull を減らす）・クラッシュ下限など、凹みが残らない損傷や「修理済み表示だけ消えた」状態で hull が回復できない
- 修正: hull < 60 なら修理を実行（hull を 60 まで）
