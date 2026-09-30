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
