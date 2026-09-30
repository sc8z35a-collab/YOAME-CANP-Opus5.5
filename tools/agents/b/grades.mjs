// max grade per road + pad flatness (no road may exceed GRADE_MAX)
import { R } from './h.mjs';
for (const r of R.ROADS) { let mg = 0, at = 0; for (let i = 1; i < r.s.length; i++) { const g = Math.abs(r.s[i].h - r.s[i - 1].h) / Math.hypot(r.s[i].x - r.s[i - 1].x, r.s[i].z - r.s[i - 1].z); if (g > mg) { mg = g; at = i; } } console.log(r.id.padEnd(9), 'max grade', mg.toFixed(3), '@', at, mg > R.GRADE_MAX + 1e-3 ? 'OVER' : ''); }
