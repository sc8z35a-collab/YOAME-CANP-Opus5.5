// AP.at must be cleared once the van leaves the spot by other means (flood current, shove, being towed by winch)
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const d = T.SPOTS.creekN; V.setPose(d.x, d.z, d.rot); run(2); A.AP.at = 'creekN';
// flood carries the van downstream 60m
G.waterLevel = -0.3; G.floodK = 1; run(25, null); G.waterLevel = -2.05; G.floodK = 0; run(5);
const p = V.originOf(); console.log(`van moved ${Math.hypot(p.x - d.x, p.z - d.z).toFixed(0)}m from creekN; AP.at=${A.AP.at}; parkedAt()=${A.parkedAt()}`);
