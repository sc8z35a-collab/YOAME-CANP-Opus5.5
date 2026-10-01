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

### E-08 [B] 地図の道路名ラベルが南北に走る道路の「上」に重なって描かれ、道路・ピン名と重なる
- 場所: js/tablet.js draw() 道路名 `translate(x0, y0 - rw*1.4)`
- 症状: 画面の上方向に固定オフセットしていたため、縦向きの道路（沢沿いの林道・峠道の大半）では文字が路面の真上に乗る。また目的地ラベルとの衝突判定が無く「第一ヘアピン」等と重なる
- 修正: 道路の法線方向にオフセット。目的地ラベルの後に描き、衝突/画面外なら道路上の別位置（7候補）を試す
- 検証: tools/page_shot.py map_test.html?zoom=3 667x375 で目視（道路脇に表示・重なり無し）

### E-09 [B] 狭い横画面(≤820px)でトーストが右下の「キッチンに立つ」等の操作ボタンを覆い隠す＆タップを奪う
- 場所: css/style.css #toasts
- 症状: 667x375 でトースト列(48vw)が #ctxBtn(150px) に重なる。トーストはポインタイベントも受けるのでボタンが押せない
- 修正: `pointer-events:none`、幅820px以下では bottom:74px に持ち上げる
- 検証: ui_test.html?sheet=1 667x375 撮影で重なり解消

### E-10 [B] 斜面の木の根元が谷側で宙に浮く（1250本中926本が10cm以上、最大7.1m）
- 場所: js/forest.js buildForest() 幹の配置 `y = heightAt(中心) - 0.15`
- 症状: 根張り(半径≈0.8s)の谷側が地面から浮き、崖沿いの峠道で「浮いた杉」が並んで見える
- 修正: 根張り円周8点の最低地面に据える＋斜度 1.25 超（崖面）には植えない
- 検証: node で同じ seed を再現 → 浮き 926 → 0（山側の埋まりは最大 2m で根張りが土に入るだけ）

### E-11 [B] 倒木(dead_tree_trunk, 長さ≈3m×1.2〜2.2倍)が斜面で片端が宙に浮く/埋まる（160端中124端が30cm以上、最大15m）
- 場所: js/forest.js instanceGLB() logs
- 症状: 倒木を水平に置くため、斜面では片側が空中に突き出す
- 修正: `align` オプションで丸太を斜面方向にピッチ、両端の地面平均に据える。急斜面(>0.9)は除外
- 検証: three.js の行列で両端を実計算 → 30cm超 124 → 0（最大 0.20m）。符号は ± 両方試して確認

### E-12 [A] 苔岩セット・倒木・切り株の当たり判定が見た目とずれる（岩の「隣」に見えない壁、岩そのものは素通り）
- 場所: js/forest.js instanceGLB() `colliders.push({x:p.x, z:p.z, r:colliderR})`
- 症状: rock_moss_set_01 は6個の巨岩を ±3m・±2m の位置に持つ GLB（ノード translation）。当たり判定はインスタンス原点に r=1.1 の円1つだけなので、実際の岩（原点から最大3.6m×scale）には車も人も動物も当たらず、何も無い中心に壁がある。倒木（長さ 3〜6.7m）も中心 r=1 の円だけで、両端は素通り
- 修正: パーツ毎のジオメトリ bbox × インスタンス行列から、長軸に沿った円の列を collider に登録（partColliders）
- 検証: node で合成ジオメトリ → rock01 はワールド (8.3, 18.4〜19.1) に r0.6×2、2倍スケール・90°回転の倒木は z=±2.77 まで r0.3×5 の円列

### E-13 [B] 走行中の目的地に「ここへ自動運転」を押すと経路・進捗バー・残り距離がリセットされる
- 場所: js/tablet.js refreshPanel() `go.disabled = false`（文言は「走行中」なのに押せる）
- 症状: 選択中＝現在の目的地のとき「走行中」ボタンが有効。押すと engage() が再計画し進捗が0%に戻り、切り返し中なら中断
- 修正: 現在の目的地なら disabled

### E-14 [C] 地図を開いたまま走行すると目的地リストの距離が開いた時の値のまま
- 場所: js/tablet.js refreshPanel() 1秒毎の更新は rebuild=false でリストの距離を更新しない
- 修正: 非 rebuild 時も各行の距離テキストを更新

### E-15 [C] ピンチ中に pointercancel（OSジェスチャ・通知等）が来ると以後のタップが全て無視される
- 場所: js/tablet.js pointercancel ハンドラ
- 原因: pointerup でしか `TAB.pinched=false` に戻さない → 次のタップが `!TAB.pinched` で弾かれ続ける（次のピンチ→離すまで）
- 修正: cancel でも指が0本になったら解除

### E-16 [C] ホイール/＋－ボタンでズームすると地図の中心がマップ外に出て真っ黒になる
- 場所: js/tablet.js zoomAt() — ドラッグ時のみ cu/cv を [0,MAP] にクランプしていた
- 修正: zoomAt でもクランプ

### E-17 [C] 等高線の標高ラベルが隣の 25m 線の値になることがある
- 場所: js/tablet.js bakeStep() `Math.round(h/25)*25`
- 原因: 例: h=37 → 50 と表示されるが、そこを通るのは 25m 線（floor 境界）
- 修正: 跨いでいる境界 `max(floor(h/25), floor(h'/25))*25`

### E-18 [B] 地図の目的地ラベルが他のピン（●）の上に重なって描かれる・画面端で切れる
- 場所: js/tablet.js draw() ラベル配置（ラベル同士の衝突しか見ていない）
- 症状: 「第一ヘアピン」「沢の北ほとり」等のラベル文字が隣の●を覆い、どの●の名前か分からない／タップ対象が隠れる。右端のラベルが画面外にはみ出して切れる（「一本松の肩」など）
- 修正: 全ピンの円を先に障害物として登録し、候補位置が画面外なら次候補へ
- 検証: map_test.html zoom=1 / zoom=3 撮影でラベルとピンの重なり 0（選択ピンは強制表示のまま）

### E-19 [A] 西の木橋の欄干の当たり判定が陸上の取り付け部まで伸び、車が見えない柱に引っかかって大回りする（B からの引き継ぎ）
- 場所: js/terrain.js RAILS（B.a=a-1..B.b=b+1 の全区間に1m毎の柱）
- 症状: 本線から 55° 曲がる急な取り付けで、6.5m の車体前角が陸上区間の柱(#6/#19)に当たり「進めない」→ 再計画で遠回り。bridgeW→meadow 178s, meadow→bridgeW 171s
- 修正: 柱は床板区間（両端サンプルが bridge）のみ＋両端 1m を 0.4m 外へ広げる（朝顔形）。描画の欄干も同じ区間に揃えた（見えない柱/柱の無い欄干の不一致も解消）
- 検証: tools/agents/b/bridgeeval.mjs 修正前→後: bridgeW→meadow 178s→52s (rail3→0, stuck3→0), meadow→bridgeW 171s→53s, 他4ルートは同等（165/140/150/47s）。npm test 全 PASS

### E-20 [B] 下草・岩の GLB「バリエーション詰め合わせ」を丸ごと1点に配置 → 植物が整列した列/格子で生え、描画数が3〜6倍
- 場所: js/forest.js instanceGLB()（glbParts の全パーツを各点にインスタンス）
- 症状: Poly Haven の fern_02 は 2×2 格子(1m間隔)、weed_plant_02 は 0.5m 間隔で5本一列、nettle 6本一列、shrub_03 4本一列、rock_moss_set_01 は6個の巨岩が 6m×4m に並ぶ。各配置点にこれが丸ごと置かれ、森の地面に「定規で並べた」ような植物の列・岩の隊列が見える。インスタンス数も 3〜6 倍（q=m でシダだけ 732点×4=2928）
- 修正: `variants:true` で各点にバリエーションを1つだけ（原点に再センタリング）割当て。密度を保つためシダ・雑草の点数は約2倍に（それでも描画数は約 1/2〜1/3）
- 検証: GLB のノード translation を解析（fern 4 / weed 5 / nettle 6 / shrub_03 4 / moss 6 / branches 3 バリエーション）、node で import 成功、npm test

### E-21 [B] 地図の「ここへ自動運転」が拒否されても何も起きない（理由が見えない）
- 場所: js/tablet.js #tabGo onclick
- 症状: 現在地を選ぶ／車体が壊れている／ルート無しで押すと engage() が false。理由はトーストで出るが、トーストは #ui(z無し) 内で地図 #tablet(z12, 暗幕) の下に隠れて見えない → ボタンが壊れているように見える
- 修正: 拒否時は AP.msg を地図パネル内に警告表示。現在地は最初から「現在地」表示で無効化
- 検証: map_test.html で hollow 選択 → disabled=True「現在地」。強制クリックで「⚠ もう「沢沿いの窪地」にいる」がパネルに出る

### E-22 [C] キャンバス #c が 100vw×100vh 指定で、モバイルのアドレスバー表示中に縦に引き伸ばされる
- 場所: css/style.css #c
- 原因: renderer は innerWidth/innerHeight で描画、CSS は 100vh（URLバーを含む大きい方の高さ）→ 縦方向に拡大表示＋下端が切れる。デスクトップでは 100vw がスクロールバー幅を含む
- 修正: `width:100%;height:100%`（position:fixed; inset:0 と一致）。パネルの max-height も 92dvh を併記

tools/dash_test.html を追加（車内ダッシュボード小画面の撮影用）

### E-23 [C] 車内ダッシュボードの地図で、自車が下の帯（ステータス表示 54px）の近くに描かれ、南へ走ると前方の道が帯に隠れる
- 場所: js/tablet.js draw()（full=false）の中心 = 自車
- 修正: 帯を除いた領域の中央に自車を置く
- 検証: tools/dash_test.html?route=summit で撮影

### E-24 [C] PWA アイコン 512 が "any maskable" なのにセーフゾーン外に絵がある → Android のホーム画面で月と車の角が切れる
- 場所: manifest.webmanifest / assets/icons/icon-512.png
- 症状: maskable は中心から半径 40%（204.8px）がセーフゾーン。月・車の端が中心から最大 236px にあり、円形/角丸マスクで欠ける。また1枚を any と maskable 兼用にすると "any" 表示時は余白不足、の両方で問題
- 修正: 絵を 76% に縮小し背景を延長した icon-maskable-512.png を追加（最大半径≈180px）。any と maskable を別エントリに
- 検証: PIL で内容の最大半径 236→約180px を計測、画像を目視

### E-25 [C] QA 撮影（6フレーム）では森のチャンク距離カリングが一度も実行されず、遠景の下草まで描画される
- 場所: js/forest.js updateForest() `if (G.frame % 10) return;`
- 症状: G.frame は 1 から始まるので最初の実行は 10 フレーム目。qa=1 の撮影(frames=6)や起動直後は全チャンク可視 → 撮影が重く、本番と見た目も違う
- 修正: 最初の2フレームも実行

### E-26 [C] キャンプ地の発電機・携行缶に当たり判定が無く、プレイヤーや動物が素通りする
- 場所: js/forest.js buildProps()（焚き火とテーブルだけ collider）
- 修正: 発電機 r0.45・携行缶 r0.3 を追加

### E-27 [B] 小さい横画面(568x320 = iPhone SE)で地図の「ここへ自動運転」が2行に折り返しボタンが崩れる／選択中の目的地名が画面右端で切れる
- 場所: css/style.css .chip.go, js/tablet.js 選択ラベルの強制表示
- 修正: ボタンは nowrap+ellipsis、低い画面では 12.5px。選択ラベルは衝突してでも「画面内に収まる候補」を優先
- 検証: page_shot map_test.html?sel=ridge&route=summit 568x320 で目視

### E-28 [B] iPhone（ノッチ/ホームインジケータ付き）の横画面で下端・上端のボタンがセーフエリアに食い込む
- 場所: css/style.css（左右の safe-area だけ考慮）
- 症状: viewport-fit=cover なのに bottom/top の inset を見ていない。横画面の iPhone ではホームバー(下 21px)に #ctxBtn・🧰・🏃・アクションシート・トーストが重なり、スワイプでホームへ戻る誤操作が起きる。全画面地図の上下も同様
- 修正: `--safe-b/--safe-t` を追加し、下端/上端に固定した全要素と #tablet の padding に加算
- 検証: ui_test.html 915x412 の撮影でレイアウト不変（inset=0 環境）

### E-29 [B] 風で揺れるシェーダが強さ違い・カード有無で同じプログラムに共有され、揺れ方が混ざる
- 場所: js/forest.js windify()
- 原因: three.js の既定 customProgramCacheKey は `onBeforeCompile.toString()`。windify の onBeforeCompile は毎回同じソース文字列（strength はクロージャ）なので、機能フラグが同じ材質（GLB 由来のシダ 1.2・低木 1.2・雑草 1.6・イラクサ 1.6 等）は最初にコンパイルされた GLSL を共有する。GLSL はキャッシュ命中で共有されるため、strength が GLSL 定数として焼き込まれている本実装では、後からの材質も最初の材質の strength で揺れる（コンパイル順依存）
- 修正: `customProgramCacheKey = 'wind'+strength+card`

### E-30 [B] 木の影が風で揺れない（木は揺れているのに影は静止し、根元から影がずれる）
- 場所: js/forest.js（InstancedMesh に customDepthMaterial 無し）
- 原因: シャドウパスは既定の MeshDepthMaterial で描かれ、onBeforeCompile の揺れが入らない。強風時(uWind 大)は梢で 1m 以上ずれる
- 修正: 同じ揺れコードを持つ windDepth()（alphaMap/alphaTest 付き RGBA depth）を幹・枝カードの customDepthMaterial に
- 検証: node で import 成功・npm test PASS（WebGL 撮影は1GB環境で不可、env/E.md §3）

### E-31 [B] 車内ダッシュボードのタブレット画面がバッテリー0でも「息をひそめる」中でも煌々と光る
- 場所: js/tablet.js updateTablet() `emissiveIntensity = 0.55 + night*0.2`
- 症状: 電池切れで真っ暗になっても、クマから隠れて全消灯しても、運転席の地図画面だけが夜ほど明るく光り続ける（BUGFIXES #57 の漏れ）
- 修正: 走行中以外は battery>0.5 のときだけ点灯、hiding 中は 15% に減光

### E-32 [C] 地図の洪水表示が 4m 幅の横縞の積み重ねで、岸線がギザギザの階段状
- 場所: js/tablet.js draw() 洪水（行ごと fillRect、x 探索ステップも粗い）
- 修正: 岸線を 1m 刻み＋二分法で求め、連続区間を1つのポリゴンで塗る。水位が 2cm 以上変わった時だけ再計算（キャッシュ）
- 検証: map_test.html?water=0.1&zoom=2 で修正前後を撮影（なめらかな岸線）。キャッシュ有無で画素差 0。計算 ~1.3ms/回 → 水位変化時のみ
tools/map_test.html に `water=` パラメータを追加

### E-33 [C] 地図のベース画像の外周1pxが透明（黒枠）／起動直後に地図を開くと未描画の行が黒いまま説明なし
- 場所: js/tablet.js bakeStep()（i,j=0 と MAP-1 の行列は近傍が無いのでスキップ → 透明のまま）
- 症状: ズームアウトすると地図の縁に黒い線。起動〜約11秒（swiftshader計測 680フレーム）はベイク途中で、地図の下半分が真っ黒なのに何の表示も無い
- 修正: 完成時に隣接行・列を外周へコピー。ベイク中は「地図を描いています… n%」を表示
- 検証: ヘッドレスでベイク所要を計測（6ms/フレーム予算で 680 フレーム）、map_test.html 撮影
