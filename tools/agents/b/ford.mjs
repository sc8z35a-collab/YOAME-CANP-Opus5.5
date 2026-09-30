// ford road profile across the creek (bed height vs creek bed / water) [B-05]
import { G, V, T, A, R } from './h.mjs';
const { rawHeight, creekX, WATER_BASE, CREEK_BED } = await import('../../../js/relief.js');
const r = R.ROADS.find(r => r.id === 'ford');
for (let i = 4; i < 22; i++) { const p = r.s[i]; console.log(i, p.x.toFixed(1), p.z.toFixed(1), 'bed', p.h.toFixed(2), 'raw', rawHeight(p.x, p.z).toFixed(2), 'creekD', (p.x - creekX(p.z)).toFixed(1), p.ford ? 'FORD' : ''); }
console.log('WATER_BASE', WATER_BASE, 'CREEK_BED', CREEK_BED, 'fordE', R.DESTS.fordE.road, R.DESTS.fordE.h.toFixed(2), 'fordW', R.DESTS.fordW.h.toFixed(2));
