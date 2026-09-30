# Bugs found/fixed by Agent E
（書式は collab/README.md §3）

### E-01 [A] 地図タブレットの自車アイコンが進行方向と逆（180°反転）を指す
- 場所: js/tablet.js draw() 自車アイコン `ctx.rotate(Math.PI - yaw)`
- 症状: 南を向いて停まっている窪地で矢印が北を指す。北ほとりでは南を指す。地図で進行方向が分からない
- 原因: 画面座標は +y=南（world -z）。矢印(-y向き)を θ 回転すると (sinθ, -cosθ) を指すので θ=atan2(fwd.x, fwd.z) が正解。`π - yaw` は z 成分が反転
- 修正: `ctx.rotate(yaw)`
- 検証: node で全36スポットに setPose → 矢印方向と VEH の前方ベクトルが一致（/tmp/e/arrow.mjs PASS）
