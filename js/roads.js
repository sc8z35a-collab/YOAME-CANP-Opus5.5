// Road network + destinations. Roads are hand-laid control polylines; the road bed (cut & fill)
// is generated from the raw relief with a grade limit, so every road is drivable. The graph
// (samples every ~2m, junctions, both directions) is what the autopilot routes on.
import { THREE, clamp, lerp, smooth } from './core.js';
import { rawHeight, creekX } from './relief.js';

export const GRADE_MAX = 0.2;   // steepest road grade (20%)
export const ROAD_HALF = 2.6;   // flat bed half width (m)
export const STEP = 2;          // sample spacing (m)

// kind: 'bridge' spans (from..to control index) are carried on a deck over the creek.
const DEF = [
  { id: 'valley', name: '沢沿いの林道', pts: [[7, -205], [10, -170], [5, -135], [9, -100], [5, -65], [3, -32], [1, -12], [0, 0], [2, 25], [8, 60], [4, 100], [9, 140], [6, 185]] },
  { id: 'mount', name: '峠道', pts: [[3, -32], [16, -48], [34, -42], [44, -26], [40, -12], [50, -6], [62, -12], [64, -26], [58, -40], [54, -58], [64, -76], [84, -82], [102, -72], [114, -56], [130, -50], [142, -64], [146, -86], [138, -104], [148, -122], [168, -122]] },
  { id: 'west', name: '西の橋ルート', pts: [[8, 60], [-2, 61], [-12, 62], [-24, 63], [-36, 70], [-48, 84], [-62, 96], [-80, 100], [-96, 88], [-110, 72], [-130, 74], [-152, 86]], bridge: [1, 3] },
  { id: 'ford', name: '浅瀬の渡し', pts: [[5, -135], [-8, -124], [-18, -121], [-32, -120], [-52, -133], [-78, -140], [-100, -126], [-120, -110], [-142, -118]] },
  { id: 'ridgeW', name: '西尾根道', pts: [[-110, 72], [-104, 42], [-112, 4], [-105, -36], [-113, -78], [-120, -110]] },
  { id: 'north', name: '北の森道', pts: [[9, 140], [32, 146], [52, 140], [72, 154], [92, 168]] },
  { id: 'traverse', name: '中腹トラバース', pts: [[50, -6], [58, 18], [52, 50], [58, 82], [48, 112], [32, 146]] },
  { id: 'south', name: '南の伐採道', pts: [[10, -170], [30, -176], [54, -166], [76, -180], [98, -170]] },
];

// Destinations (snapped to the nearest road sample; the pad is flattened there).
const DEST = [
  ['hollow', '沢沿いの窪地', 0, 0, 'キャンプ地。風雨を避けられる / 増水に弱い', 'flip'],
  ['ridge', '林道脇の高台', 58, -40, '水は来ない / 土砂崩れ・倒木に注意'],
  ['creekS', '沢の南ほとり', 5, -65, 'せせらぎが近い。雨の日は増水注意'],
  ['creekN', '沢の北ほとり', 2, 25, '窪地のすぐ北。朝はシカが来る'],
  ['bridgeE', '木橋のたもと', 8, 58, '西へ渡る木橋の手前'],
  ['meadow', '北の草地', 4, 100, '開けた草地。星がよく見える'],
  ['northEnd', '林道の北端', 6, 184, 'どん詰まりの静かな森'],
  ['southEnd', '林道の南端', 7, -204, '南の行き止まり'],
  ['fordE', '浅瀬の東岸', 6, -134, '渡し場。増水時は渡れない'],
  ['fordW', '浅瀬の西岸', -32, -120, '沢を渡った先の窪み'],
  ['switch1', '第一ヘアピン', 34, -42, '峠道の最初のカーブ'],
  ['lookout', '中腹の見晴らし', 44, -26, '谷を見下ろすカーブ'],
  ['pass', '峠の曲がり角', 64, -76, '崖沿いの狭い道'],
  ['cliff', '断崖テラス', 102, -72, '足元は切り立った崖'],
  ['pine', '一本松の肩', 130, -50, '強風に注意'],
  ['saddle', '峠の鞍部', 146, -86, '尾根を越える風の道'],
  ['summit', '山頂の展望台', 168, -122, '森全体を見渡せる頂'],
  ['trav1', '中腹の湧き水', 58, 18, '冷たい湧き水が出る'],
  ['trav2', '白樺の斜面', 52, 50, '明るい斜面'],
  ['trav3', '苔の岩場', 58, 82, '苔むした巨岩'],
  ['trav4', '東の台地', 48, 112, '平らな台地'],
  ['north1', '北の分かれ道', 32, 146, '道が三つに分かれる'],
  ['north2', '古い炭焼き窯', 52, 140, '昔の炭焼き跡'],
  ['north3', '北東の奥地', 92, 168, '人の気配がない奥地'],
  ['south1', '伐採跡地', 30, -176, '切り株が並ぶ空き地'],
  ['south2', '南の沢筋', 54, -166, '小さな沢の音'],
  ['south3', '南東の果て', 98, -170, '地図の端'],
  ['bridgeW', '木橋の西', -36, 70, '橋を渡った先'],
  ['westHill', '西の丘', -62, 96, 'なだらかな丘'],
  ['westPond', '西の窪地', -96, 88, '霧がたまる窪地'],
  ['westEnd', '西の果ての台地', -152, 86, '夕日が沈む台地'],
  ['wr1', '西尾根の北', -104, 42, '尾根道の北側'],
  ['wr2', '西尾根の中央', -112, 4, '尾根の真ん中'],
  ['wr3', '西尾根の南', -113, -78, '尾根の南寄り'],
  ['fordFar', '渡しの奥', -78, -140, '西の沢筋の奥'],
  ['swEnd', '南西の奥', -142, -118, '最果ての森'],
];

export const ROADS = [];   // { id, name, s:[{x,z,h,d,bridge}] }
export const DESTS = {};   // id -> { id, name, desc, x, z, h, rot, road, i }
export const NODES = [];   // graph nodes { x, z, h, road, i, nb:[{n,c}] }

function resample(pts) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = c.getLength(), n = Math.max(2, Math.round(L / STEP));
  // map control index -> sample index (for bridge spans)
  const ctrlS = pts.map(([x, z]) => { let best = 0, bd = 1e9; c.getSpacedPoints(n).forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }); return best; });
  return { s: c.getSpacedPoints(n).map(p => ({ x: p.x, z: p.z })), ctrlS };
}

function limitGrade(h, pinned, grade = GRADE_MAX) {
  const n = h.length, g = grade * STEP * 0.97;
  for (let it = 0; it < 30; it++) {
    for (let i = 1; i < n; i++) if (!pinned[i]) h[i] = clamp(h[i], h[i - 1] - g, h[i - 1] + g);
    for (let i = n - 2; i >= 0; i--) if (!pinned[i]) h[i] = clamp(h[i], h[i + 1] - g, h[i + 1] + g);
  }
}

function nearestSample(x, z, roads = ROADS) {
  let best = null, bd = 1e18;
  for (const r of roads) r.s.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = { r, i, d: Math.sqrt(d) }; } });
  return best;
}
export { nearestSample };

// ---------------------------------------------------------------- build (runs at import)
for (const d of DEF) {
  const { s, ctrlS } = resample(d.pts);
  const road = { id: d.id, name: d.name, s };
  const n = s.length, pinned = new Array(n).fill(false);
  let h = s.map(p => rawHeight(p.x, p.z));
  // creek crossings: never dip the bed into the channel (bridge deck / ford ramp handled below)
  // endpoints joining an existing road take its bed height (junction)
  const joins = [];
  for (const end of [0, n - 1]) {
    const hit = nearestSample(s[end].x, s[end].z);
    if (hit && hit.d < 4) { h[end] = hit.r.s[hit.i].h; pinned[end] = true; joins.push([end, hit]); }
  }
  // destination pads on this road: flat windows
  const pads = [];
  for (const [id, , x, z] of DEST) {
    if (DESTS[id]) continue;
    let bi = -1, bd = 1e9; s.forEach((p, i) => { const dd = Math.hypot(p.x - x, p.z - z); if (dd < bd) { bd = dd; bi = i; } });
    if (bd < 3) pads.push([id, bi]);
  }
  // smooth heavily (road beds are long gentle curves)
  for (let it = 0; it < 60; it++) {
    const nh = h.slice();
    for (let i = 1; i < n - 1; i++) if (!pinned[i]) nh[i] = (h[i - 1] + 2 * h[i] + h[i + 1]) / 4;
    h = nh;
  }
  limitGrade(h, pinned, GRADE_MAX * 0.7); // leave slack so the flat pads below stay feasible
  // bridge span: straight deck between the bank samples
  if (d.bridge) {
    const a = ctrlS[d.bridge[0]], b = ctrlS[d.bridge[1]];
    const top = Math.max(h[a], h[b], rawHeight(s[a].x, s[a].z), rawHeight(s[b].x, s[b].z), 0.2);
    for (let i = a; i <= b; i++) { h[i] = top; pinned[i] = true; s[i].bridge = true; }
    road.bridge = [a, b];
  }
  // pads: flatten ±4 samples around the pad (height taken from the already graded profile)
  for (const [, i] of pads) { const ph = h[i]; for (let k = -3; k <= 3; k++) if (h[i + k] !== undefined && !pinned[i + k]) h[i + k] = ph; if (!pinned[i]) pinned[i] = true; }
  limitGrade(h, pinned);
  s.forEach((p, i) => { p.h = h[i]; p.fill = h[i] - rawHeight(p.x, p.z); });
  // arc length
  let acc = 0; s.forEach((p, i) => { if (i) acc += Math.hypot(p.x - s[i - 1].x, p.z - s[i - 1].z); p.d = acc; });
  road.len = acc;
  // ford: where the road crosses the creek channel without a bridge
  s.forEach(p => { p.ford = !p.bridge && Math.abs(p.x - creekX(p.z)) < 6; });
  ROADS.push(road);
  road.joins = joins;
  for (const [id, i] of pads) {
    const def = DEST.find(x => x[0] === id), a = s[Math.max(0, i - 2)], b = s[Math.min(n - 1, i + 2)];
    DESTS[id] = { id, name: def[1], desc: def[4], x: s[i].x, z: s[i].z, h: s[i].h, rot: Math.atan2(-(b.x - a.x), -(b.z - a.z)) + (def[5] === 'flip' ? Math.PI : 0), road: road.id, i };
  }
}

// ---------------------------------------------------------------- graph
for (const r of ROADS) {
  r.base = NODES.length;
  r.s.forEach((p, i) => NODES.push({ x: p.x, z: p.z, h: p.h, road: r.id, i, ford: p.ford, bridge: !!p.bridge, nb: [] }));
  for (let i = 1; i < r.s.length; i++) {
    const a = NODES[r.base + i - 1], b = NODES[r.base + i], c = Math.hypot(a.x - b.x, a.z - b.z);
    a.nb.push({ n: r.base + i, c }); b.nb.push({ n: r.base + i - 1, c });
  }
}
for (const r of ROADS) for (const [end, hit] of r.joins) {
  const a = r.base + end, b = hit.r.base + hit.i;
  if (a === b) continue;
  const c = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z) + 0.1;
  NODES[a].nb.push({ n: b, c }); NODES[b].nb.push({ n: a, c });
}
for (const d of Object.values(DESTS)) d.node = ROADS.find(r => r.id === d.road).base + d.i;

/** Dijkstra over the road graph. blocked(nodeIndex) -> extra cost (Infinity = impassable). */
export function route(from, to, blocked = () => 0) {
  const N = NODES.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const open = [[0, from]]; dist[from] = 0;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, u] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (d > dist[u]) continue;
    if (u === to) break;
    for (const { n, c } of NODES[u].nb) {
      const extra = blocked(n); if (extra === Infinity) continue;
      const nd = d + c + extra;
      if (nd < dist[n]) { dist[n] = nd; prev[n] = u; open.push([nd, n]); }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = []; for (let u = to; u !== -1; u = prev[u]) path.push(u);
  return { nodes: path.reverse(), cost: dist[to] };
}

export function nearestNode(x, z, maxD = 1e9) {
  let best = -1, bd = maxD * maxD;
  for (let i = 0; i < NODES.length; i++) { const n = NODES[i], d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

export const _lerp = lerp; export const _smooth = smooth;
