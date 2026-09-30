# Bugs found/fixed by Agent C
（書式は collab/README.md §3）

### C-01 [S] 効果音で Web Audio の RangeError が出る（遠くのクマの足音で毎フレーム例外）
- 場所: js/audio.js env() / updateAudio のクマ足音
- 症状: クマが30m以上離れていると `burst(peak=0)` → `exponentialRampToValueAtTime(0)` が **RangeError** を投げる。updateAudio は main loop 内なので例外で**そのフレームの以降の処理（updateUI・描画）が止まる**
- 原因: 指数ランプの目標値 0 は仕様上不正
- 修正: env() で peak を 0.0002 以上にクランプ＋聞こえない足音は鳴らさない

### C-02 [A] 動物の障害物回避が逆向き（木に向かって曲がる）
- 場所: js/animals.js Animal.steer
- 症状: 木の近くでシカ/クマ/オオカミが木へ突っ込み、押し戻されて止まる/震える
- 原因: 横方向判定 `ox*cos(want)-oz*sin(want)`>0 は障害物が +heading 側 = sin 側にある意味。そちらへ `+=` していた（node で符号検証済み）
- 修正: `-=` に。ついでに 6m 外の木を早期除外（数千本を毎フレーム hypot していた）

### C-03 [A] 旋回角の正規化が壊れていて、周回するオオカミ/クマがくるくる回る
- 場所: js/animals.js steer
- 症状: `((want-heading+3π)%2π)-π` は JS の `%` が負を返すため |heading| が 3π を超えると誤差角が -5.7rad 等になる。周回（circle/prowl）で heading が単調増加し、やがて逆方向に全力旋回する
- 修正: atan2(sin,cos) で最短角＋heading 自体も正規化

### C-04 [A] クマが車の前後から突進すると永遠に当たらない（突進ループ・イベント停止）
- 場所: js/animals.js charge
- 症状: 判定が「車中心から 3.2m 未満」。車体の足跡押し出しは前 5.6m/後 3.6m+半径なので前方から来たクマは中心から 6.5m 付近で止まり、衝突も終了もしない → 赤い警告が出っぱなし・threat>0 で以後イベントが一切起きない
- 修正: 車体箱からの距離 distToBox で接触判定＋20秒当たらなければ backoff

### C-05 [A] シカが帰らない（再接近のたびに滞在タイマーがリセット）
- 場所: js/animals.js graze
- 症状: graze→approach→graze で d.t=0 に戻るため `d.t>55` がほぼ成立せず（45秒連続で再接近しない確率 0.1%）、群れが延々と居座り、次のシカイベントも起きない
- 修正: 訪問全体の経過 d.visit (>80s) でも帰る。approach/leave に 25/60 秒のタイムアウト（車や木で詰まった場合）

### C-06 [B] メスジカにも角が生えている
- 場所: js/animals.js buildAnimals
- 原因: `/antler|horn/` を material.name で判定していたが、角メッシュは node 名 `Stag_Horns`・マテリアル名 `Material.001`（GLB 解析で確認）→ 一度もマッチしない
- 修正: メッシュ名＋マテリアル名で判定

### C-07 [B] 到着したシカ・QA配置のシカが 180° くるっと振り向く
- 場所: animals.js graze / events.js triggerEvent('deer')
- 原因: graze 中も steer(target) で向きを合わせるが、target が現在地（通り過ぎた点）なので atan2 が不定/逆向き
- 修正: 向いている方向の 3m 先を target にする holdHeading

### C-08 [A] クマの前回の状態が残る（2回目のクマが最初から窓を覗く位置へ直行 / QA固定のまま）
- 場所: animals.js spawnBear
- 原因: sniffAt / qaHold / rear / hitCd を初期化していない
- 修正: spawn 時にリセット

### C-09 [A] 攻撃性 0.3〜0.45 のクマが永遠にうろつく
- 場所: animals.js prowl
- 原因: 帰る条件 aggro<0.3、突進条件 t>60&&aggro>0.45 のすき間
- 修正: t>70 で aggro<=0.45 なら帰る、150秒で必ず帰る

### C-10 [B] 群れの一部が残っていると次の出現で瞬間移動する
- 場所: animals.js spawnDeer / spawnWolves
- 原因: 先頭個体 [0] だけで active を判定
- 修正: 全個体で判定（threat 判定のオオカミも同様 → events.js）

### C-11 [B] 沢の水音がほぼ無音
- 場所: audio.js updateAudio creek
- 原因: 平常水位 -2.05 なのに旧基準 -1.55 で `1+(level+1.55)*2` = 0 → 平常時の沢の音量 0（洪水後だけ鳴る）
- 修正: WATER_BASE 基準に

### C-12 [C] クマが立ち止まって覗いている間も足音が鳴る
- 修正: 速度 0.15m/s 未満では足音タイマーを進めない

### C-13 [A] 洪水で車体ゲージが 6% に「回復」する
- 場所: events.js updateFlood
- 原因: `hull = max(hull, 6)` がクマ等で既に 6% 未満の車体を 6% に引き上げる
- 修正: 下限は「浸水前の値」と 6 の小さい方

### C-14 [A] 土砂崩れが一度起きると10分間二度と起きない / 撤去時に別の泥ゾーンを消す
- 場所: events.js startLandslide / updateSlide
- 原因: s.on が 600 秒 true のまま（収まった後も）。撤去時 indexOf(m) が -1 だと splice(-1) で**最後の泥ゾーン**を削除
- 修正: 収束済みなら片付けて再発可能に。endSlide() で安全に削除

### C-15 [B] 土砂崩れの泥メッシュを収束後も10分間毎フレーム再計算（重い）
- 原因: 961頂点×heightAt＋computeVertexNormals を毎フレーム
- 修正: 泥が止まったら更新停止。塵は透明になったら非表示＆更新停止

### C-16 [B] 倒木が一度倒れると 400 秒間次の倒木が起きない
- 修正: 着地から15秒後以降は次の倒木を許可

### C-17 [C] 2回目以降のヒットで窓のヒビの中心が飛び回る
- 修正: 新規ヒビのときだけ中心を決める

### C-18 [B] 嵐→雨で「嵐になりそうだ」と表示される / 霧→霧で「霧が森を包み込んでいく」
- 場所: events.js EVENTS.stormroll / clearup
- 修正: 遷移元に応じた文言。霧からは必ず晴れへ

### C-19 [C] バッテリー切れでもヒーターが動き続ける
- 修正: バッテリー切れで heater も停止

### C-20 [C] 未使用の G.rockV を毎回加算（デッドコード）→ 削除
