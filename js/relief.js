// Raw landscape shape (no roads / pads). Shared by the runtime terrain and the offline
// road generator (tools/gen_roads.mjs) so both always agree on the ground.
import { fbm, noise2, smooth, lerp } from './core.js';

// World extent (square, metres). Mesh, physics grid and map all use this.
export const WORLD = { x0: -220, z0: -250, size: 480 };
WORLD.x1 = WORLD.x0 + WORLD.size; WORLD.z1 = WORLD.z0 + WORLD.size;
export const CREEK_BED = -2.45;
export const WATER_BASE = -2.05;           // normal creek surface (≈40cm deep: fordable)
export const HOLLOW = { x: 0, z: 0 };      // original camp (terrain amplitude is calm around it)

export function creekX(z) { return -14 + 6 * Math.sin(z * 0.028) + 3 * Math.sin(z * 0.071 + 1.3); }

// Gentle "exit ramps" out of the creek channel every ~55m so a van that ended up in the
// water can always drive out again (anti soft-lock map design).
export function creekRamp(z) { const p = ((z % 55) + 55) % 55; return 1 - smooth(4, 12, Math.abs(p - 27.5)); }

export function rawHeight(x, z) {
  const dH = Math.hypot(x - HOLLOW.x, z - HOLLOW.z);
  const amp = smooth(10, 60, dH);
  let h = fbm(x * 0.011 + 3.1, z * 0.011 - 7.7, 5) * (2 + 7 * amp) + fbm(x * 0.06, z * 0.06, 3) * 0.6;
  // valley: mountain side to the east (+x), gentler hills to the west beyond the creek
  const east = Math.max(0, x - 9);
  h += east * 0.36 + Math.pow(east, 1.3) * 0.012;
  h += Math.max(0, -x - 24) * 0.3;
  // cliff band on the east slope (rock steps: the dramatic drops along the mountain road)
  h += smooth(0.35, 0.6, noise2(x * 0.018 + 11, z * 0.018)) * smooth(40, 70, x) * 6;
  // keep flat ground from turning into random ponds (keeps flood water readable)
  h = Math.max(h, -0.9 + noise2(x * 0.05, z * 0.05) * 0.3);
  // creek channel (wider, gentler banks at the ramps)
  const cd = Math.abs(x - creekX(z));
  const bank = 1 - smooth(2.2, 7.5 + 9 * creekRamp(z), cd);
  h = lerp(h, CREEK_BED + fbm(x * 0.2, z * 0.2, 2) * 0.25, bank);
  // world rim: mountains close the map so nothing can drive/fall off the edge of the world
  const e = Math.min(x - WORLD.x0, WORLD.x1 - x, z - WORLD.z0, WORLD.z1 - z);
  h += Math.pow(Math.max(0, 22 - e), 1.6) * 0.9;
  return h;
}
