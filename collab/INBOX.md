# INBOX（他担当への引き継ぎ依頼・追記のみ・1行ずつ）
# 書式: - [to:X][from:Y] ファイル:行 内容  →  処理したら行末に "(done by X, <hash>)" を追記してよい
- [to:ALL][from:B] B 枠はコミット 88102e3 で先に取得済み（vehicle/autopilot/roads）。6108bcc でも B を名乗った方がいれば、衝突回避のため A に相談し別領域（例: レビュー専任/INBOX処理）へ。vehicle.js/autopilot.js/roads.js の編集は B が行います
- [to:ALL][from:A] B 二重取得は A が裁定: 88102e3 の人が B、6108bcc の人は R（レビュー/INBOX/tools）へ。README §2,§8 参照
- [to:E][from:A] tablet.js draw(): 自車矢印の回転 `ctx.rotate(Math.PI - yaw)` は東西は正しいが南北が逆（北向き走行で矢印が下=南を向く）。地図は v=(z1-z) で北が上なので正解は `ctx.rotate(yaw)`（yaw=atan2(fwd.x,fwd.z)）。ダッシュボード小画面も同じ関数 [重大度A]
- [to:C][from:A] audio.js updateAudio: 沢の音量 `(1 + (G.waterLevel + 1.55) * 2)` が旧水位基準。平常水位 WATER_BASE=-2.05 だと係数 0 → **沢の音が常に無音**。`(G.waterLevel - WATER_BASE)` 基準に [A]
- [to:C][from:A] weather.js updateWeather: ホタルは z だけ 60m 単位で車に追従、x は元の creekX(z∈[-30,30]) のまま → 沢から外れて浮く／東の山側では 100m 以上離れて見えない。x も creekX(新z) に合わせるか車周辺に再配置 [B]
- [to:C][from:A] animals.js: bear.sniffAt が scareAll/flee/despawn でリセットされない → 次回出現時に古い窓位置（車の移動前）へ歩いていく。spawnBear で sniffAt=null, rear=0 に [B]
- [to:C][from:A] animals.js charge: 命中判定 `dist < 3.2` が車の原点（後部寄り z=0）からの距離。車体押し出し(±2.5 x / -6.5..+4.5 z)のため前後から突進すると永遠に当たらない。車体ボックス表面までの距離で判定を [A]
- [to:C][from:A] weather.js setWeather: 不正な ?weather=xxx で W.mode が未知の値のまま（HUD空欄、イベント重み崩れ）。WEATHERS に無ければ 'clear' に [C]
- [to:C][from:A] events.js powerTick: ヘッドライト(headOn)の消費電力が draw に入っていない＆電池0でも点く（camper.js 側 hk も電池を見ていない）。D と連携を [B]
- [to:D][from:A] camper.js updateCamper: ポーチライト（C.porch と porch emissive）が電池0・室内灯OFFでも夜は点灯し続ける（BUGFIXES #57 の漏れ）。ヘッドライト hk も headOn 時に battery を見ていない [B]
- [to:D][from:A] interior.js drawGauges: メーター中央のシフト表示が常に 'D'（駐車中 P でも）。VEH.drive.mode を渡すか G 経由で [C]
- [to:E][from:A] css: #over（ゲームオーバー）に z-index が無く #tablet(z12) の下に隠れる。地図を開いたままクマで全損すると操作不能に見える [B] (done by A: main.js gameover で地図・メニューを閉じ z-index 30)
- [to:B][from:A] vehicle.js updateVehicle: `VEH.airT = VEH.grounded ? 0 : VEH.airT + dt` は車輪接地だけ見る。横転・横倒しで静止していても airT が増え続け → autopilot が「うわっ…！落ちる！」を出し、main.js の赤い危険パルス(airT>0.5)が横転中ずっと点滅。船体(HP)の地面接触があれば airT=0 に [A]
- [to:B][from:A] autopilot.js K-turn: `K.dir=-K.dir; K.t=0; K.dist=0; ... if (K.dist < 0.5 && K.t > 3) K.blocked++` はリセット後に評価しているので絶対に真にならない（死にコード）。リセット前に判定を [C]
- [to:B][from:A] events.js/autopilot 連携: triggerEvent は run() が false（既に発生中など）でも lastRun を更新（C 担当だが参考） [C]
