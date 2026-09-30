# Bugs found/fixed by Agent E
（書式は collab/README.md §3）

### E-01 [A] 地図タブレットの自車アイコンが進行方向と逆（180°反転）を指す
- 場所: js/tablet.js draw() 自車アイコン `ctx.rotate(Math.PI - yaw)`
- 症状: 南を向いて停まっている窪地で矢印が北を指す。北ほとりでは南を指す。地図で進行方向が分からない
- 原因: 画面座標は +y=南（world -z）。矢印(-y向き)を θ 回転すると (sinθ, -cosθ) を指すので θ=atan2(fwd.x, fwd.z) が正解。`π - yaw` は z 成分が反転
- 修正: `ctx.rotate(yaw)`
- 検証: node で全36スポットに setPose → 矢印方向と VEH の前方ベクトルが一致（/tmp/e/arrow.mjs PASS）

### E-02 [B] 雑草・イラクサ（weed/nettle）が道路の路面上に124本生える
- 場所: js/forest.js buildUnderstory() weeds の配置条件
- 症状: 目的地パッドは道路上にあるため「パッドから 5〜15m」の条件だけで路面にも雑草が生え、走行時にタイヤを貫通して見える
- 原因: 道路距離のチェックが無い
- 修正: `trackDist < 3.2` を除外
- 検証: node で同じ seed を再現 → 路面上 124 → 0

### E-03 [B] 小石(rock_07)が浅瀬の渡しで路面上に置かれる
- 場所: js/forest.js small rocks 条件 `creek<5.5 || (2.8<td<5)`
- 症状: 沢と道路が交差する浅瀬で、`creek<5.5` 側の条件だけで路面中央に小石が置かれる（5個）
- 修正: 常に `td > 2.8` を要求
- 検証: node 再現 5 → 0

### E-04 [C] 枯れ枝(dry_branches)が路肩（路面端 2.0〜2.6m）に置かれる
- 場所: js/forest.js `clearOf(x, z, 5, 2, 3)` の trackR=2 < ROAD_HALF(2.6)
- 修正: trackR 3.2
- 検証: node 再現で路面近傍 1 → 0

### E-05 [C] 窓を縁取る手置きの木が Math.random() でスケール → QA 撮影が非決定的
- 場所: js/forest.js framing `r: Math.random()`
- 症状: `qa=1` の決定論フレームでも起動毎に木の大きさ・向き・色が変わり、撮影の比較ができない
- 修正: インデックスから決定的に生成

### E-06 [B] 木橋の橋脚が床板を 8cm 突き抜けて路面に角材が見える／車輪がめり込んで見える
- 場所: js/terrain.js buildBridges() pier
- 症状: 橋脚の上端が `p.h + 0.1`、床板上面は `p.h + 0.02`。各サンプル点(2m毎)で幅 4.4m の角材が路面から突き出る
- 原因: `scale.y = top-gy+0.4`, `y=(top+gy)/2-0.1` → 上端 top+0.1
- 修正: 橋脚は地面-0.3m 〜 床板下面(p.h-0.17)、床板が地面より十分高い区間(p.bridge)のみ

### E-07 [B] 木橋の両端スパンの床板が水平のまま → 片側が浮き、片側が地面に埋まる
- 場所: js/terrain.js buildBridges() deck
- 症状: 取り付けスパン(p.h≠q.h, 最大 19cm 差)でも床板を平均高さの水平板で置くため段差が見える（物理は斜面なので車輪と板がずれる）
- 修正: 床板と欄干を区間勾配でピッチ（YXZ）し長さも斜距離に
