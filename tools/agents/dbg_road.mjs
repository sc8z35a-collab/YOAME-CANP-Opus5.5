// Debug: bed profile of a road vs the ground physics sees. node tools/agents/dbg_road.mjs <road> [from] [to]
const T = await import('../../js/terrain.js'); const R = await import('../../js/roads.js');
const [id, a = 0, b = 999] = process.argv.slice(2);
const r = R.ROADS.find(r => r.id === id);
for (let i = +a; i < Math.min(r.s.length, +b); i++) { const p = r.s[i]; console.log(i, p.x.toFixed(1), p.z.toFixed(1), 'bed', p.h.toFixed(2), 'terr', T.heightAt(p.x, p.z).toFixed(2), 'gnd', T.groundAt(p.x, p.z, p.h + 1).toFixed(2), p.bridge ? 'BR' : '', p.ford ? 'FORD' : ''); }
