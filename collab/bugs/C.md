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

### C-21 [B] 雷の閃光ライトが常にワールド原点方向を照らす
- 場所: weather.js buildWeather（boltLight）
- 原因: DirectionalLight.target をシーンに追加しておらず matrixWorld が更新されない → strike() で target.position を動かしても無効
- 修正: scene.add(bolt, bolt.target)

### C-22 [B] 月が西から昇り東に沈む（太陽と逆）
- 場所: weather.js updateWeather moonDir
- 原因: 太陽は x=+cos（6時に +x=東）、月は x=-cos（18:30 に -x=西から出る）。node で時刻ごとの x を確認
- 修正: 符号を揃え東から昇るように

### C-23 [B] 星・ホタル・雨の波紋のシェーダが GLSL 未定義動作（smoothstep(edge0>edge1)）
- 場所: weather.js starDome / buildFireflies / buildRain splash
- 原因: GLSL ES 仕様では edge0>=edge1 の smoothstep は undefined。ANGLE/一部モバイルGPUで星やホタルが消える/四角くなる
- 修正: 1.-smoothstep(0.,.5,d) 形式に

### C-24 [A] ホタルが沢から外れた場所・地中・空中に出る
- 場所: weather.js fireflies
- 原因: キャンプ地付近の固定配置を z 方向にだけ 60m 刻みでずらしていた。蛇行する沢の x も地面の高さも追従しない
- 修正: チャンクごとに creekX(z)/heightAt でワールド座標に再配置

### C-25 [B] 車の真下（床下）に雨の波紋が出る
- 場所: weather.js placeSplashes
- 修正: 車体の足跡内の波紋を非表示

### C-26 [B] 起動直後に沢が 50cm 増水していて1分かけて引く
- 場所: core.js G.waterLevel=-1.55（旧仕様）→ 平常 WATER_BASE=-2.05
- 修正: buildWeather で平常水位に初期化（core.js は A 担当なので weather 側で吸収）

### C-27 [C] 不明な ?weather= で W.mode が不正値になり天気表示が空欄・target が崩れる
- 修正: 未知の天気は clear に

### C-28 [C] 霧の晴れ上がり文言が「雨が上がった」になる（C-18 と別経路: 霧→晴れ）
- 修正: 遷移元ごとの文言（C-18 と同コミット系列）

### C-29 [B] 駐車中のヘッドライトが電池を消費しない（一晩中点けっぱなしでも無料）
- 場所: events.js powerTick
- 修正: 駐車中は 0.15 消費。電池切れで消灯

### C-30 [B] くもりが二度と晴れない
- 場所: events.js EVENTS.clearup
- 原因: cloudy の重み 0、stormroll は cloudy→rain のみ → くもりからは雨にしか行けない
- 修正: cloudy も clearup 対象に

### C-31 [B] メニューから発生させたイベントが拒否（発生中）でもクールダウンを消費
- 場所: events.js triggerEvent（A が INBOX で指摘）
- 修正: run() が false のときは lastRun を更新しない

### C-32 [B] 走行中にシカ/クマ/オオカミの訪問イベントが起き、車の周囲の「輪」に出現→すぐ置いていかれる
- 修正: 2m/s 超で走行中は動物イベントの重み 0

### C-33 [B] 車外（歩行・追跡カメラ）でも屋根を叩く雨音とこもった外音のまま
- 場所: audio.js updateAudio / tick
- 修正: G.camInside で屋根音を絞り外の雨音を上げ、ローパスを開放

### C-34 [B] 倒木メッシュの使い回しで、目の前の倒木が消えて別の場所に瞬間移動
- 場所: events.js startTreeFall（C-16 の再修正）
- 修正: 前の倒木から 60m 以上離れてから再利用

### C-35 [B] 星が雲の上に描かれる（くもり/雨の夜でも雲を透かして星が見える）
- 場所: weather.js starDome
- 原因: 星 Points(renderOrder -8) は雲ドーム(-9)の後に加算描画され、星側は一様な (1-uCloud) でしか減衰しない
- 修正: ドームと同じ雲被覆関数 cloudCov を星のシェーダでも評価して隠す

### C-36 [B] 洪水の水面がマップ南北端に届かない
- 場所: weather.js buildWater
- 原因: 水面 420m 四方（中心 20,-10）＜ワールド 480m（z -250..230）。z<-220 / z>200 では沢が干上がって見える・洪水が来ない
- 修正: WORLD から大きさと中心を計算

### C-37 [C] タブを隠している間の雷がたまり、復帰時にまとめて鳴る
- 修正: A.on のときだけ予約・発火

### C-38 [B] 早送り中はイベント種別ごとのクールダウンが 30 倍長い
- 場所: events.js updateEvents（lastRun は実時間 G.t、全体クールダウンはゲーム時間）
- 修正: ゲーム時間 E.gt で統一

### C-39 [B] 早送りしてもバッテリー・ソーラー充電・野外修理が等倍
- 場所: events.js powerTick
- 症状: 30倍で一晩を早送りしても電池がほぼ減らない
- 修正: dt に timeMul を掛ける

### C-40 [B] 逃げるオオカミ/クマが外周の山や木に引っかかると永遠に消えない（threat が続きイベント停止）
- 場所: animals.js wolves leave / bear leave・flee
- 修正: leave 40秒 / 60秒でタイムアウトして退場

### C-41 [C] 雷の閃光でシカは逃げるのにオオカミは無反応
- 修正: G.flash>0.5 でオオカミも退散

### C-42 [C] クラクション連打で「クマが森の奥へ走り去った」トーストが毎回出て、帰りかけのクマが再び flee に戻る
- 修正: 既に flee のクマには再発火しない（leave 中なら flee に上げる）

### C-43 [B] メスジカが小さすぎる（見えない角込みの高さで 1.55m に合わせていた）
- 場所: animals.js Skinned / buildAnimals
- 原因: 角を visible=false にしただけなので fitModel の Box3 に角が入ったまま
- 修正: fitModel 前に角メッシュを除去して体高 1.3m に

### C-44 [C] 長いノイズ効果音（うなり 1.6s 等）が途中で途切れる
- 場所: audio.js burst
- 原因: 1秒のノイズバッファをランダム位置から非ループ再生
- 修正: loop=true

### C-45 [C] 横転したまま・ゲームオーバー後も車体が「野外修理」で回復していく
- 場所: events.js powerTick
- 修正: 正立（up.y>0.8）かつ未ゲームオーバー時のみ修理

### C-46 検証: 天気専用軽量ページ tools/weather_check.html + tools/wshot.py を追加
- 晴れ夜: 星・月OK / くもり夜: 星が雲に隠れる（C-35）/ 嵐+落雷: シェーダ8本エラーなし。水位初期値 -2.05（C-26）
