# Bugs found/fixed by Agent B
（書式は collab/README.md §3）

### B-01 [A] 林道外から発進すると、林道に戻った後も目的地まで最後まで約9km/hで這い続ける
- 場所: js/autopilot.js updateAutopilot（経路追従部）/ plan()
- 症状: 森の中（道路から離れた場所）で目的地を選ぶと、道路に合流した後も `AP.offroad`/`AP.slow` が解除されず、全行程が 2.6m/s 上限。`tools/agents/b/offroad.mjs 20 10 meadow` で道路走行中の最高速 10km/h
- 原因: `AP.offroad` を false に戻す処理が存在せず、`slow` 解除条件 `!AP.offroad` が永久に成立しない
- 修正: 経路上の道路ノード（n>=0）に 4m 以内で到達したら offroad を解除し、そこから約40m 後に通常速度へ
- 検証: offroad.mjs → 道路上最高速 28km/h、到着 41s→33s。drive_test 全PASS

### B-02 [S] 道が完全にふさがれると、前後に揺するだけで永久に再計画・ウインチへ進まない（詰み）
- 場所: js/autopilot.js stuck 判定
- 症状: 前方を障害物で完全封鎖（`tools/agents/b/block.mjs`）すると 240 秒間 stuckN=0 のまま前進→後退を繰り返す
- 原因: stuckT>4 で後退(揺すり)を始めると後退速度 |spd|>0.35 で stuckT が逆に減り、6.5s に届かない
- 修正: 揺すり中(stuckT>4)は速度に関係なく stuckT を進める
- 検証: block.mjs → 「進めない…別の道を探す」→ウインチへ段階的に移行

### B-03 [A] 横倒し・裏返しで地面に静止していても「空中」扱い（落下警告・赤い危険パルスが出続ける）
- 場所: js/vehicle.js updateVehicle（airT）/ step()
- 症状: 横転して静止中も `VEH.airT` が増え続け、main.js の赤パルス(airT>0.5)が点滅し続け、autopilot が「うわっ…！落ちる！」を出す（A 報告）
- 原因: airT が車輪接地(grounded)だけで判定され、車体(hull 点)の地面接触を見ていない
- 修正: step() で hull-地面接触数 `VEH.hullGround` を数え、車輪か車体どちらかが接地していれば airT=0
- 検証: `tools/agents/b/side.mjs` → 横倒し8秒後 airT=0.00、fall イベント0

### B-04 [C] K ターンの「両方向ふさがれ」判定が死にコード（前後とも壁で挟まれると 15 往復ムダに空転）
- 場所: js/autopilot.js K-turn（A 報告）
- 原因: `K.dist=0; K.t=0` にリセットした後で `K.dist<0.5 && K.t>3` を判定しており絶対に真にならない
- 修正: リセット前に判定し、連続2回ふさがれたら stuck→ウインチの経路へ即引き継ぐ
- 検証: drive_test 全PASS（下記）

### B-05 [A] 「浅瀬の渡し」が浅瀬ではなく高さ4.5mの土手（沢をせき止め、増水で渡れない判定も永久に無効）
- 場所: js/roads.js build（E 報告）/ js/autopilot.js nodeCost
- 症状: ford サンプル i=11..16 の路床 +2.07〜+3.10m、沢床 −2.5m。水は絶対に届かず「増水時は渡れない」「地図の赤破線」が実態と矛盾。沢の水流も土手で断ち切られて見える
- 原因: 両岸 raw +4〜5m を60回平滑化＋勾配制限で結んだため沢を跨いで高さが保たれた
- 修正: 沢の中心 ±3.5m のサンプルを `WATER_BASE-0.15` に pin してから勾配制限 → 取り付けが 19.4% の切り通しで自動生成。回避コストも固定値 `waterLevel>-1.2` から「そのノードの路床+0.45m（車軸）」基準に
- 検証: `tools/agents/b/ford.mjs`（最低路床 −2.20 / 水面 −2.05 = 水深15cm）、`fordrun.mjs`：平常水位で渡河OK(水没1%)、水位−1.4 では迂回ルート選択

### B-06 [A] 浅瀬の渡しの取り付け（本線との分岐）で車体の角が路肩の尾根に乗り上げて立ち往生
- 場所: js/roads.js DEF 'ford' 先頭の制御点
- 症状: B-05 後、swEnd→fordE で本線に上がる直前に左前輪が浮き、全開でも 0km/h（71s→201s、進めない→再計画）
- 原因: 分岐が本線に鋭角（約35°）で取り付き、2本の路床の間の地形が 0.58m の尾根になっていた（`fordeval.mjs` の worst side ridge）
- 修正: 取り付け制御点を本線に沿わせて引き直し（[7,-112],[2,-118],[-4,-122] → [8,-111],[1,-113],[-5,-118]）。尾根 0.58→0.17m、勾配 19.5%（上限内）
- 検証: swEnd→fordE 76s（再計画なし）、fordW→creekS 163s→42s、drive/physics/fall/npm test 全PASS

### B-07 [B]（調査のみ・E へ引き継ぎ）西の木橋の入口で欄干の柱に引っかかり、毎回「進めない」→遠回り
- 場所: js/terrain.js RAILS（柱が橋台の陸上区間 a-1..b+1 まで伸びる）× js/roads.js 'west' 取り付け（半径5.5m）
- 症状: hollow→westEnd 166s（うち約100s は迂回）、bridgeE→bridgeW 140s、bridgeW→meadow 168s。`tools/agents/b/railhit.mjs` で当たるのは陸上の柱 #6/#19 と端の #18
- B で試したこと: 道路線形の引き直し4案・北口の別分岐・look-ahead 短縮と橋前減速・柱の外側オフセット → いずれも根治せず。INBOX で E に柱の撤去/朝顔形を依頼

### B-08 [B] レッカー（キャンプ地へ戻す）/再配置の後も、前の状態が残る（ハンドル切ったまま・TCS/スリップ警告が点灯）
- 場所: js/vehicle.js setPose
- 症状: 事故直後に「キャンプ地へ戻す」で移送すると、ハンドルが切れたまま、TCS ブレーキ・skid/stuck/submerged が残り HUD に「スリップ」「スタック」「渡河」が出続ける。ロックアップ/トルク値も残る
- 原因: setPose が位置・速度・一部の車輪値しかリセットしていない
- 修正: steer/ctrl.steer/throttle、車輪 tcs/slip/sat/steer、drive lock/torque/abs/tcs、skid/stuck/submerged/latG/lonG、scrapes キューをクリア
- 検証: `tools/agents/b/rescue.mjs`（直後に全て 0、1秒後も前輪角 0）

### B-09 [B] ウインチの固定点に到達できないと 120 秒間同じ方向に引っ張り続ける／ブロック中は固定点 -1 でクラッシュし得る
- 場所: js/autopilot.js startWinch / winch
- 原因: 最寄りノードが全て一時ブロック中だと best=-1 のまま `NODES[-1].x` で TypeError。固定点が木の裏などで到達不能でも 120 秒タイムアウトまで待つ
- 修正: best<0 ならブロックを忘れて選び直し。60 秒で届かなければその固定点をブロックして別の固定点へ 1 回だけ切り替え
- 検証: block.mjs（ウインチ3回で脱出）、drive/fall PASS

### B-10 [A] B-02 の副作用：雨天で「揺すり」が効く前に即再計画→遠回り／ウインチ（雨の hollow→westEnd が FAIL, ウインチ7回）
- 場所: js/autopilot.js stuck 判定
- 症状: WET=1 の drive_test で hollow→westEnd FAIL（600s, winch 7）、cliff→wr2 484s（winch 3）。元コードは 92s/160s
- 原因: 揺すり中の後退を「前進なし」と数える修正により、ぬかるみで1回揺すれば抜けられる場面でも毎回すぐ再計画→ブロック→遠回り
- 修正: 揺すり後に前進で抜けたら stuckT を戻す。揺すりは2回まで許し、それでも駄目なら再計画（完全封鎖では従来どおりウインチへ）
- 検証: 晴れ drive_test 全PASS（hollow→westEnd 80s, cliff→wr2 139s。元コードより速い）、WET=1 全PASS（93s / 162s）、block.mjs でウインチまで段階的に移行、physics 8/8、fall PASS

### B-11 [B] 冠水した林道・駐車パッドが「沢（川底）」扱いになり、HUD の路面表示が「沢」、グリップも川底値
- 場所: js/vehicle.js surfaceAt
- 症状: 増水で窪地や草地パッドが水をかぶると、路面が一律 `stream`（μ0.42・柔らかさ0.4）に変わり HUD が「沢」と表示。舗装済みの浅瀬(ford)も「沢」
- 原因: 判定が「水面より低い＝沢」だけで、場所（沢の流路かどうか）を見ていない
- 修正: 沢の流路(±6.5m)かつ道路でない所だけ stream。それ以外の冠水地点は元の路面のまま wetness=1（完全に濡れた砂利道など）
- 検証: `tools/agents/b/surf.mjs`（水位 −0.3 で窪地/草地/浅瀬=road μ0.56、沢の中=stream）、physics 8/8、floodesc/fordrun OK

### B-12 [B] 落石・倒木（物理障害物）が木橋の床板をすり抜けて沢に落ちる
- 場所: js/vehicle.js stepObstacles
- 症状: 橋の上に落ちた岩が床板(0.20m)を抜けて −1.54m（沢底）まで沈む → 橋をふさぐはずの障害物が消える／橋下で車体と干渉
- 原因: 障害物の接地が `heightAt`（地形）だけで、橋床 `groundAt` を見ていない
- 修正: `groundAt(x,z,y)` と同じ fromY 付き法線で接地
- 検証: `tools/agents/b/debris.mjs`（床上 0.65m で静止、斜面の12個も40秒で全て停止・NaNなし）
- 補足: `tools/agents/b/alldest.mjs` で窪地から全35目的地へ到達・パッド上 4m 以内・傾き 8°未満で停車を確認（全PASS）

### B-13 [C] 洪水で流される／押し出されて駐車地点から離れても「ここに停車中」扱いのまま
- 場所: js/autopilot.js updateAutopilot（非走行時）
- 症状: 沢の北ほとりに停車→洪水で流されても `AP.at='creekN'` のまま。tablet.js は `AP.at===d.id` で「現在地」表示を出し続ける
- 修正: 停車中に目的地から 7m 以上離れたら AP.at を解除し `leftSpot` イベントを発火
- 検証: `tools/agents/b/stale.mjs`（流された後 AP.at=null）

### B-14 [B] 下り急勾配の手前で減速せず、急坂に入ってから急ブレーキ（ABS 作動、目標+17km/h 超過）
- 場所: js/autopilot.js 速度計画
- 症状: summit→hollow の峠道終端（mount#0-7, 下り22%）で 23km/h のまま突入し、目標 5km/h に対して ABS フルブレーキ（`speedtrack.mjs`/`overspeed2.mjs`）
- 原因: 勾配制限が「今の車体の向き(f.y)」だけで決まり、経路上の先の急坂を見ていない（カーブは先読みしているのに）
- 修正: 経路の各区間の路床勾配を先読みし、カーブと同様に「その地点の上限速度＋減速距離」で目標速度を制限
- 検証: cliff→lookout の超過時間 0.9s→0.0s、summit→hollow 2.6s→1.6s。drive/wet/physics 全PASS

### B-15 [A] 分岐の取り付けで2本の路床が並んで尾根・横傾斜ができ、車が大きく傾く／腹を擦る
- 場所: js/roads.js build（joins）
- 症状: `tools/agents/b/ridges.mjs`：本線 valley#84.5 に高さ 0.33m・横断差 0.37m の尾根（峠道の取り付け）。summit→hollow で車体が 28° 傾き(minUp 0.88)、横滑り skid 5.6m/s
- 原因: 分岐は端点だけ本線の高さに固定され、本線の路床内を並走する数サンプルは自分の勾配で上下するため、地形（近い方の路床に従う）に段差ができる
- 修正: 分岐が本線の路床内（中心間 ≤ ROAD_HALF×1.3）を走る区間は本線の路床高さに合わせて固定
- 検証: 全道路の最大凸凹 0.33→0.20m、最大勾配はすべて 20% 以内。drive_test summit→hollow minUp 0.88→0.97、cliff→wr2 0.88→0.97、WET も全PASS、physics 8/8、fall PASS、全35目的地 PASS

### B-16 [B] 駐車パッドが車体の下で傾いている（「平らな駐車場」に停めても斜め：中腹の見晴らし 0.71m、北東の奥地 0.41m）
- 場所: js/roads.js build（パッド平坦化）/ DEST 'lookout'（E 報告）
- 症状: 停車した車体 6.5×2.4m の四隅の高低差 lookout 0.71m / north3 0.41m / south1 0.27m。停車後も車が傾き（alldest で lookout tilt 6.2°）、室内の歩行・就寝が斜め
- 原因: パッド中心の1サンプルしか固定しておらず、最後の勾配制限で前後サンプルが引き戻される。lookout はヘアピンの頂点上にあり平坦化の余地がない
- 修正: 前後の固定点まで勾配予算が足りる範囲で ±2 サンプル（車体の長さ）を水平に固定。lookout をヘアピン直後の直線（42.6,−20.4）へ移設
- 検証: `tools/agents/b/padflat.mjs` 最大 0.71→0.28m（north3 0.26, 他は ≤0.12）、勾配超過 0。alldest 全35 PASS（全パッド tilt ≤ 数度）、npm test 62/62、drive/wet 18/18、physics 8/8、fall PASS
