// tow / respawn (setPose) right after a crash: nothing from the old pose may leak into the new one [B-08]
import { G, V, T, A, R, run, bus, THREE } from './h.mjs';
const VEH = V.VEH, d = T.SPOTS.hollow;
V.setPose(40, 40, 0); VEH.wheels.forEach(W => { W.dig = 0.3; W.sink = 0.2; W.tcs = 4000; W.abs = 0.05; }); VEH.ingress = 0.8; VEH.skid = 5; VEH.submerged = 0.7;
VEH.steer = 0.6; VEH.ctrl.steer = 0.6; VEH.drive.lock = true; VEH.drive.torque = 5000; VEH.airT = 3; VEH.latG = 0.8; VEH.stuck = 4;
V.setPose(d.x, d.z, d.rot, 0.05); V.updateVehicle(0, null);
const left = { steer: VEH.steer, tcs: VEH.wheels.map(W => W.tcs || 0), skid: VEH.skid, submerged: VEH.submerged, lock: VEH.drive.lock, torque: VEH.drive.torque, latG: VEH.latG, stuck: VEH.stuck };
console.log('right after setPose:', JSON.stringify(left));
run(1, null, false); console.log('1s later: steer', VEH.steer.toFixed(2), 'front wheel angle', VEH.wheels[0].steer.toFixed(2), 'speed', VEH.speed.toFixed(2));
