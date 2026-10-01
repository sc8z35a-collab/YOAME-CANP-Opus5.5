// log every rail contact during a drive: which bridge sample/side the post belongs to, van heading/steer
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const [from, to] = process.argv.slice(2);
const B = T.BRIDGES[0], s = B.r.s;
const postInfo = c => { let bi = -1, bd = 1e9; for (let i = B.a; i <= B.b; i++) { const d = Math.hypot(c.x - s[i].x, c.z - s[i].z); if (d < bd) { bd = d; bi = i; } } return `#${bi}${s[bi].bridge ? 'deck' : 'land'}`; };
bus.on('dent', e => { if (e.cause !== 'rail') return; const w = V.localToWorld(e.lp.clone(), new THREE.Vector3()); let best = null, bd = 9; for (const c of T.RAILS) { const d = Math.hypot(c.x - w.x, c.z - w.z); if (d < bd) { bd = d; best = c; } }
  console.log(`[${G.t.toFixed(1)}] rail hit local(${e.lp.x.toFixed(2)},${e.lp.z.toFixed(2)}) post ${best ? postInfo(best) : '?'} hdg ${(Math.atan2(V.VEH.fwd.x, V.VEH.fwd.z) * 57.3).toFixed(0)} steer ${V.VEH.steer.toFixed(2)} v ${V.VEH.fwdSpeed.toFixed(1)} bd=${A.AP.path[A.AP.idx] ? Math.hypot(A.AP.path[A.AP.idx].x - V.originOf().x, A.AP.path[A.AP.idx].z - V.originOf().z).toFixed(1) : '-'}`); });
const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); run(3); A.engage(to); run(300, () => { if (!A.AP.on) return false; });
console.log('arrived', A.AP.at === to, G.t.toFixed(0));
