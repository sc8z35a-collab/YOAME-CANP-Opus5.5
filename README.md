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

## 遊び方

| 操作 | 内容 |
|---|---|
| ドラッグ | 見回す |
| ピンチ / ホイール | ズーム（窓の外を覗く） |
| 左の視点ボタン | ソファ・運転席・ベッド・キッチン・後部窓・ロフト・外 |
| 右のアクション | 室内灯 / カーテン / 息をひそめる / 投光器 / クラクション / お湯 / ヒーター / 発電機 / ラジオ / 移動 |
| ☰ メニュー | 天気・時間・イベントを手動で発生（デバッグ／鑑賞用） |

### ゲームシステム
- **車体🛻 / バッテリー🔋 / 安心度💗** の3ゲージ。車体が0でゲームオーバー
- **昼夜サイクル**（1時間=40秒）。夜は星空・月・天の川・ホタル、室内の暖色照明と電飾で秘密基地感アップ
- **天気**: 晴れ / くもり / 霧 / 雨 / 嵐（落雷）。雨は窓ガラスを伝う水滴（実シーンを屈折）、屋根を叩く音、地面の濡れと水たまり
- **駐車場所**: 「沢沿いの窪地」は風雨をしのげるが洪水に弱い / 「林道脇の高台」は水は来ないが土砂崩れ・倒木の直撃リスク
- **イベントディレクター**: 時間帯・天気・累積雨量・料理の匂い・光・音で次の出来事が決まる
  - 🦌 シカの群れ（朝夕）…音や光で逃げる
  - 🐻 クマ（夜・匂い）…徘徊→突進→体当たり（窓にヒビ）。息をひそめる・投光器・クラクションで対処
  - 🐺 オオカミ…周囲を回る
  - ⛰ 土砂崩れ（長雨）…岩と泥が斜面を流れ下る物理シミュ
  - 🌊 鉄砲水（長雨）…沢が増水し窪地が浸水
  - 🌲 倒木（嵐）…屋根に倒れかかる

## URL パラメータ（QA・撮影用）
`?t=23` 時刻 / `weather=storm` / `view=driver` / `spot=ridge` / `event=bear|deer|flood|landslide|tree|wolves` / `q=m`（軽量画質）/ `qa=1`（決定論フレーム撮影）/ `noevents` / `nopost`

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
js/main.js      レンダラ・ポストFX（Bloom/グレーディング/グレイン）・運転・ループ
```

## テスト（WebGL不要・node）
```bash
npm test      # 地形/林道/洪水の設計不変条件・運転経路・各席の視線が窓を通るか・import/export整合
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
| A3 render | 昼/夕シーンのヘッドレス描画・エラー収集 | gpt-5.2 |
| A4 scenario | 夜嵐+クマ / 洪水 / 土砂崩れ / 霧のシカ | gpt-5.1 |
| A5 mobile | 横画面ビューポート・タッチ領域44px・縦向きガード | gpt-5 |
| A6 reviewer | 静的レビュー（update内アロケーション等） | gpt-5.2-codex |

LLM プロキシが応答しない（クレジット不足など）場合は自動で**オフライン（決定論エージェントのみ）**に切り替わります。
結果は `build/reports/*.json`、スクリーンショットは `build/shots/`。
