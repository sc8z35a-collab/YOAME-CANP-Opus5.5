# 森の奥のキャンプカー (Forest Camper 3D)

森の奥に停めたキャンプカーの中で過ごす、**秘密基地感 × サバイバル**の3Dゲーム。
窓の外の景色を眺め、雨音を聞き、シカを見守り、クマから身を隠し、土砂崩れや鉄砲水から逃げる。

- **プレイ環境**: スマホ横画面・全画面専用（高性能Android想定）。縦向きでは「横向きにしてください」を表示
- **エンジン**: three.js r180（ビルド不要の ES Modules）
- **アセット**: Poly Haven CC0 フォトスキャン素材 / Quaternius CC0 動物 / Poly by Google CC-BY（`CREDITS.md`）

## 起動

```bash
python3 -m http.server 8080
# → http://<host>:8080/index.html
```

初回タップで全画面＋横向きロック＋サウンド開始。

## 遊び方（v2：自由移動 × 物理自動運転）

| 操作 | 内容 |
|---|---|
| 画面左半分をドラッグ | 仮想スティックで**車内を自由に歩く**（外にも出られる） |
| 画面右半分をドラッグ / ピンチ | 見回す / ズーム（窓の外を覗く） |
| 右下の丸ボタン | 近くの物に応じて「ソファに座る」「ベッドで横になる」「運転席に座る」「外に出る」「タブレットを見る」… |
| 🗺 タブレット | ダッシュボードのタブレットを手元に持ち帰り、**地図から目的地（36か所）を選んで自動運転** |
| 🎥 | 車内視点 ⇔ 外から見る追従カメラ |
| 🧰 | 室内灯 / カーテン / 息をひそめる / 投光器 / クラクション / お湯 / ヒーター / 発電機 / ラジオ / ライト |
| PC | WASD 移動・E 決定・M 地図 |

### 自動運転と物理
- 車は**剛体物理**（4輪サスペンション・車体と地面/木/岩の衝突・浮力と水流）。経路には貼り付けていない
- 自動運転は道路網をルート計算し、カーブ・勾配・雨霧・水・障害物に合わせて速度を決めて走る
- 土砂崩れの岩や倒木は**道路上の物理障害物**として残る。押しのけるか、止まって迂回ルートを探す
- 突風・落石・クマの体当たり・曲がり損ねで崖から落ちたら、**そのまま物理演算で転がり落ちる**
- 落ちても詰まない：タブレットで目的地を選び直すと、起き上がり→林道へ戻る→ゆっくり再発進。
  自力で出られない場所ではウインチで林道まで引き上げる。沢には約55mごとに上がり口、世界の端は山で閉じている
- 車体ゲージは転落・洪水では0にならない（クマ・倒木の直撃のみ危険）

### マップ
沢沿いの林道・峠道（崖）・西の木橋ルート・浅瀬の渡し・西尾根道・中腹トラバース・北の森道・南の伐採道。
目的地36か所（山頂の展望台・断崖テラス・木橋のたもと・浅瀬の東岸/西岸・西の果ての台地 …）

## URL パラメータ（QA・撮影用）
`?t=23` 時刻 / `weather=storm` / `view=driver|lounge|bed|kitchen|passenger|outside` / `spot=<目的地id>` / `dest=<id>&sim=<秒>`（自動運転を事前シミュ）/ `cam=chase` / `tablet=1&sel=<id>` / `event=bear|deer|flood|landslide|tree|wolves` / `q=m`（軽量画質）/ `qa=1`（決定論フレーム撮影）/ `noevents` / `nopost`

## ファイル構成
```
index.html  css/style.css  manifest.webmanifest
js/core.js      共有状態・イベントバス・ノイズ
js/assets.js    テクスチャ/GLB ローダ（q=m で tex_m 使用）
js/terrain.js   高さ関数・沢・林道・スプラットPBR地面（濡れ/水たまり）
js/forest.js    手続き針葉樹(インスタンス+風)・下草・岩・キャンプ小物、チャンク&距離カリング
js/camper.js    外装(塗装/泥)・内装一式・照明・電飾・カーテン・時計・ラジオ
js/glass.js     透過ガラス＋手続き雨粒/結露/ヒビ
js/weather.js   空・月・星・雲・霧・雨・波紋・雷・ホタル・水面
js/animals.js   シカ/クマ/オオカミ AI
js/events.js    イベントディレクター・土砂崩れ・洪水・倒木・電力
js/audio.js     完全手続き WebAudio サウンドスケープ
js/view.js      視点・タッチ操作
js/ui.js        HUD・アクション・メニュー
js/main.js      レンダラ・ポストFX（Bloom/グレーディング/グレイン）・ループ
js/relief.js    素の起伏（崖・沢・上がり口・外周の山）
js/roads.js     道路網・橋・浅瀬・目的地36か所・経路探索
js/vehicle.js   キャンピングカー剛体物理
js/autopilot.js 自動運転（追従・速度計画・切り返し・起き上がり・ウインチ）
js/player.js    車内/車外の自由歩行・座る/寝る/ドア
js/tablet.js    ダッシュボードのタブレット＋全画面地図
```

## テスト（WebGL不要・node）
```bash
npm test            # 道路網/目的地/詰み防止の不変条件・各席の視線・import/export整合
npm run test:drive  # 物理＋自動運転で9ルートを実走（WebGL不要）
npm run test:fall   # 崖から突き落として転落→再発進→到着まで
```
- `tools/agents/logic_test.mjs` … 駐車場の平坦性、高台と窪地の高低差、洪水ピークが高台に届かない、林道の最大勾配(23%)、沢を横切らない、往復経路の連続性・到着向き・小物との離隔
- `tools/agents/view_test.mjs` … 全視点の目線が意図した窓（ダイネット窓・フロントガラス・天窓・キッチン窓・後部窓）を通過すること
- `tools/facing.html` … 動物モデルの向き(+Z)目視チェック
- `tools/qa_shot.py` / `tools/qa_batch.sh` … 決定論フレームの画面撮影（1ブラウザずつロック実行）
- `tools/bootstrap.sh` … サンドボックスリセット後の環境再構築

## 6エージェント自動ビルドパイプライン
```bash
python3 tools/agents/pipeline.py              # 6エージェント並列実行
python3 tools/agents/pipeline.py --preflight  # LLM API 疎通のみ確認
python3 tools/agents/pipeline.py --autosave   # 実行後に自動コミット&プッシュ
python3 tools/agents/pipeline.py --autosave --deploy  # 全エージェント合格時のみ本番(gh-pages)へ反映
tools/autosave.sh 240                         # 240秒ごとのWIP自動保存ループ
```
| Agent | 役割 | LLM(オンライン時) |
|---|---|---|
| A1 architect | 構文チェック・import解決・export照合 | gpt-5.3-codex |
| A2 assets | 参照アセット存在・容量・未使用検出 | gpt-5-mini |
| A3 render | 昼/夕/追従カメラ走行/タブレット地図のヘッドレス描画 | gpt-5.2 |
| A4 scenario | 夜嵐+クマ / 洪水 / 土砂崩れ / 霧のシカ / 崖転落 ＋ 物理実走9ルート・転落復帰テスト（並列） | gpt-5.1 |
| A5 mobile | 横画面ビューポート・タッチ領域44px・縦向きガード | gpt-5 |
| A6 reviewer | 静的レビュー（update内アロケーション等） | gpt-5.2-codex |

LLM プロキシが応答しない（クレジット不足など）場合は自動で**オフライン（決定論エージェントのみ）**に切り替わります。
結果は `build/reports/*.json`、スクリーンショットは `build/shots/`。
