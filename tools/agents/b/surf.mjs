// surface classification sanity: deck / road / creek / pads, with and without flood water
import { G, V, T, A, R } from './h.mjs';
const { creekX } = await import('../../../js/relief.js');
const S = {}, show = (lbl, x, z) => { const g = T.groundAt(x, z, 99); V.surfaceAt(x, z, g, S); console.log(lbl.padEnd(34), S.kind.padEnd(7), 'mu', S.mu.toFixed(2), 'soft', S.soft.toFixed(2)); };
const br = R.ROADS.find(r => r.id === 'west'), mid = br.s[Math.round((br.bridge[0] + br.bridge[1]) / 2)];
for (const wl of [-2.05, -0.3]) { G.waterLevel = wl; G.wet = G.rain = 0; console.log('--- water', wl);
  show('bridge deck middle', mid.x, mid.z); show('hollow pad', R.DESTS.hollow.x, R.DESTS.hollow.z); show('valley road z=-60', R.ROADS[0].s[70].x, R.ROADS[0].s[70].z);
  show('creek centre z=30', creekX(30), 30); show('creek bank 4m z=30', creekX(30) + 4, 30); show('meadow pad', R.DESTS.meadow.x, R.DESTS.meadow.z);
  const f = R.ROADS.find(r => r.id === 'ford').s.find(p => p.ford); show('ford crossing', f.x, f.z); }
