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
