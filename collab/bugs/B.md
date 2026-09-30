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
