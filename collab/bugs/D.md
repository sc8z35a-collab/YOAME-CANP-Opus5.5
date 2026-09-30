# Bugs found/fixed by Agent D
（書式は collab/README.md §3）

### D-01 [B] 泥はね・リバリー（緑帯/ピンストライプ）が車体パーツごとにずれる／ボンネット全体が泥色
- 場所: js/camper.js paintMaterial() onBeforeCompile
- 症状: ボンネット・ノーズ・コーナーポスト・ルーフトリム等、`mesh.position` でオフセットされた塗装メッシュでは泥の高さ判定が崩れ、ボンネット一面が泥色、帯が側面とつながらない
- 原因: `vOP = position`（オブジェクト空間）を車体ローカル高さとして使っていた。rbox は中心原点のジオメトリ＋position 配置なので y≈0 → 全面が泥判定
- 修正: `vOP = (uCamInv * modelMatrix * position)` で車体ローカル座標に統一（damage.js の uCamInv を共有）
- 検証: cshot view=ext 前後比較（ボンネットが白＋帯が連続）

### D-02 [B] ハンドルが前輪と逆方向に回る
- 場所: js/interior.js updateInterior()
- 症状: 左に曲がると（steer>0 = left, autopilot.js L209）ハンドルが時計回りに回る
- 原因: `rotation.z` に `-steerAngle*9` を入れていた。ドライバー側を向くホイールでは +z 回転が反時計回り（左）
- 修正: 符号を反転
- 検証: cshot view=cab&steer=0.4（左舵でリムが反時計回り）

### D-03 [B] ルーフのエアコンユニットが天窓 sky1 を塞いでいた
- 場所: js/camper.js buildCamper() roof A/C
- 症状: 前側天窓（z -1.5..-0.8）の真上に A/C 箱（z -1.4..-0.5）が載り、室内から天窓が真っ暗
- 修正: A/C を z=-2.1 へ移設（天窓・ソーラーパネル・ルーフラックと非干渉）

### D-04 [C] フロントガラスのゴム枠が前壁の中へ押し出されて見えない
- 場所: js/camper.js 前後窓 frameRing
- 原因: ExtrudeGeometry は +z に押し出す。後窓(+z外向き)は正しいが前窓は壁内側へ
- 修正: F 壁のみ rotation.y = π

### D-05 [B] カーテンの上端（レール側）まで揺れ・たるみが出ていた
- 場所: js/camper.js curtain vertex shader
- 原因: `hemY = 0.5 - uv.y` は PlaneGeometry の uv(0..1) に対し -0.5..0.5。上端が 0 にならず hemY² で上端も下端と同量揺れた
- 修正: `hemY = 1.0 - uv.y`（0 上端 .. 1 裾）

### D-06 [C] 傷・擦れでクリアコートが剥げる処理が一切効いていなかった
- 場所: js/damage.js patchPaint()
- 原因: `#include <clearcoat_fragment>` は three.js に存在しないチャンク → replace が無言で no-op
- 修正: `<lights_physical_fragment>` 直後で `material.clearcoat` を減衰（USE_CLEARCOAT ガード付き）
- 検証: シェーダーコンパイルエラーなし（cshot dmg=1 errors:[]）

### D-07 [A] 大きな凹みが車体外から「黒い円盤」に見える
- 場所: js/damage.js GLSL_DENT dentDisp()
- 症状: dmg=1（岩/倒木の凹み）で側面に直径1m級の黒い丸が表示（プレビュー d_ext2.jpg）
- 原因: 変位が最大 14cm。外板(2cm)のすぐ裏に内装パネル(10cm)があり、外板が内装を突き抜けて裏面/内装が見える
- 修正: 幾何変位を tanh で 1.7cm にソフトクランプ（見た目の凹みはシェーディング勾配＋しわで表現）
- 検証: cshot side dmg=1 で黒円消失（d_dent.jpg）

### D-08 [B] ポーチライトが電池切れ・室内灯OFFでも夜じゅう点灯（INBOX from A）
- 場所: js/camper.js updateCamper()（C.porch と porch emissive）
- 修正: `porchOn = !hiding && lightsOn && battery>0.5 && night>0.3` で光源とエミッシブの両方を制御。ダッシュ照明も電池0なら消灯

### D-09 [B] 駐車中のヘッドライトが電池0でも点く（INBOX from A）
- 修正: `hk = driving || (headOn && battery>0.5)`（走行中はオルタネーター扱いで常時可）

### D-10 [C] メーター中央のシフト表示が常に 'D'（INBOX from A）
- 場所: js/interior.js drawGauges / updateInterior
- 修正: gear 引数を追加し、停車=P / 後退=R / 走行=D を表示

### D-12 [C] フロントガラス用カーテンレールがカーテンから 25cm 前（ガラス側）に浮いていた
- 原因: F 壁のカーテンは `z += 0.25, y -= 0.02` でずらしているのに、レール(rp)は未補正
- 修正: レールにも同じオフセット

### D-13 [A] ガラスのヒビが小窓では窓の外に出て見えない／大窓では隅にしか出ない
- 場所: js/glass.js crackLines / camper.js glass UV
- 原因: UV を `w/0.8, h/0.8` 倍に拡大しているのに uCrackAt(0.3..0.7) は 0..1 前提。door 窓(0.42x0.46)は UV 最大 0.53 → 中心 0.7 は窓外
- 修正: `uUvScale` uniform を追加し `uCrackAt * uUvScale` で窓内の相対位置に
- 検証: cshot crack=1 で全窓の中央付近にヒビ（v_crack.jpg）

### D-14 [B] 非同期ロードの小物(GLB: ケトル・ティーセット・かご等)だけ室内の環境光減衰が掛からず発光して見える
- 場所: js/camper.js occludeInterior()
- 原因: occludeInterior は buildInterior 時に1回だけ。props は IN.ready 後に追加されるため未パッチ
- 修正: `IN.ready.then(() => occludeInterior(I))`。二重パッチ防止に `userData.intOcc`

### D-15 [B] テールランプが一切点灯しない（C.tailMat が未使用）
- 修正: ヘッドライト点灯時に emissiveIntensity 2.2、消灯時 0.25
- 検証: cshot rear night head=1（v_rear.jpg で赤く点灯）

### D-16 [C] 運転席上のかご(wicker_basket)が棚から 20cm 宙に浮いていた
- 原因: 配置 y=2.38 だがキャブのヘッダートリム天面は y=2.175
- 修正: y=2.175

### D-17 [C] 外側ミラーが車体から 7cm 離れて宙に浮いていた
- 原因: アーム(0.06幅, x=±1.3)が外板(x=±1.2)まで届いていない
- 修正: アームを外板〜ミラーヘッドまで延長

### D-18 [B] 後部ハシゴが後窓の上を横切り、窓を塞いでいた
- 原因: ハシゴ x=0.55..0.9 が後窓 x=-0.65..0.65 と重なる
- 修正: x=0.74..1.0（窓とテールランプの間）へ移設（v_rear.jpg）

### D-19 [C] ルーフ投光器のハウジングがルーフラックから 4cm 浮いていた
- 修正: ハウジング y=ROOF+0.14（ラック天面 ROOF+0.06 に接地）、光源位置をレンズ前面へ

### D-20 [C] 壁時計が洗面所の鏡に重なって Z ファイト
- 原因: 時計 z=0.9 / x=-0.179、鏡 z=0.77..1.07 / x=-0.1795 → ほぼ同一平面
- 修正: 時計を z=1.2 へ（鏡の横）

### D-21 [C] 冷蔵庫の操作パネルが白い発光帯に見える
- 原因: emissive=白・emissiveMap=null → 面全体が白く発光して文字/LED が見えない
- 修正: emissiveMap にパネルテクスチャを使い、強度 0.35

### D-22 [C] ベッド上の電飾が両側の吊り戸棚を貫通／電線が1本目の列にしか無い
- 原因: x=-1.0..1.0 は後部ロッカー(|x|>0.74)の内部。wire は pts.slice(0,22) のみ
- 修正: x=±0.72 に短縮、全ての列に個別の電線を生成（v_bed.jpg）

### D-23 [C] assets.js: tex() キャッシュキーに flipY が無い／pbr() が color=0x000000（黒）を無視
- 修正: キーに flip を追加、`if (color != null)`

### D-24 [A] 前面（フロントガラス高さ・キャブオーバー）への衝突で凹みが空中に置かれ表示されない
- 場所: js/damage.js toSkin()/skinNormal()
- 症状: 正面衝突・倒木でフロント上部を打つと DMG.dents は増える（HUD の凹み数は増える）のに車体に何も出ない
- 原因: 車体を1つの箱(z0=-5.35)で近似。キャブ前面は z=-4.3、ボンネットは y<1.4 だけなので、y=1.9 の前面ヒットはガラスの 1m 前の空中に置かれた
- 修正: 居住箱＋キャブ／ボンネット／キャブオーバーノーズの3箱に分け、最も近い露出面へスナップ、その面の内向き法線を返す
- 検証: node で (0.2,1.9,-5.4) → ボンネット上面 (0.2,1.41,-5.35)、(0.5,2.6,-5.2) → ノーズ前面 z=-4.93 など

### D-25 [B] 室内の金属/光沢反射（ベイク済みキューブマップ）が車の向きで逆側を映す
- 場所: js/interior.js bakeInteriorEnv()/updateInterior()
- 原因: CubeCamera を車体グループの子にしたため面が車体ローカル向きでベイクされるが、envMap は world 反射ベクトルで引く。キャンプ地の向き≠0・走行中は反射が回転してずれる
- 修正: CubeCamera を world 軸でベイクし、ベイク時の車体姿勢からの相対回転を毎フレーム material.envMapRotation に反映

### D-26 [C] bakeInteriorEnv を再実行するたび PMREM テクスチャがリーク
- 修正: 旧 IN.env を dispose

### D-27 [B] ラジオ表示の警報文がはみ出して切れる（「大雨警報 土砂災害に警戒」等）
- 場所: js/camper.js drawRadio()
- 原因: 26px 固定・slice(0,14)。CJK は 1字≒1em なので 12字で 312px > 256px キャンバス
- 修正: measureText で幅に合わせて縮小（最小12px）＋ maxWidth 指定

### D-28 [C] ラジオOFF（初期状態）でも "FM 81.3 森" が常時発光表示・電池0でも光る
- 修正: 初期表示は state.radio に従う。ラジオ画面を emissives に登録し ON=1 / OFF=0.25 / 電池0=0
- 検証: cshot でヘッドユニット撮影（v_radio.jpg: OFF 時 "---" が暗く表示）
  - 追記: D-20 の編集で `clk.rotation.y` が行末コメント内に入って無効化（時計が裏向き＝文字盤が見えない）という自己退行を起こしていたので修正（v_clock2.jpg で確認）
