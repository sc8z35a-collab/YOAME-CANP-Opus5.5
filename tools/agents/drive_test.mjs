// Headless autopilot drive test: real vehicle physics + autopilot, no WebGL.
// node tools/agents/drive_test.mjs [-q] [from to ...]
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) }; globalThis.location = { search: '' };
globalThis.window = { addEventListener() {} }; globalThis.localStorage = { getItem() { return null; } };
const { G, bus } = await import("../../js/core.js"); G.waterLevel = -2.05; if (process.env.WET) { G.wet = +process.env.WET; G.rain = +process.env.WET; }
const V = await import('../../js/vehicle.js');
const T = await import('../../js/terrain.js');
const A = await import('../../js/autopilot.js');
const quiet = process.argv.includes('-q');
bus.on('toast', t => !quiet && console.log('   toast:', t.msg));
const args = process.argv.slice(2).filter(a => a[0] !== '-');
const pairs = [];
for (let i = 0; i + 1 < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
if (!pairs.length) pairs.push(['hollow', 'ridge'], ['ridge', 'summit'], ['summit', 'hollow'], ['hollow', 'westEnd'], ['westEnd', 'swEnd'], ['swEnd', 'fordE'], ['hollow', 'north3'], ['north3', 'south3'], ['cliff', 'wr2']);
let fail = 0;
for (const [from, to] of pairs) {
  const d = T.SPOTS[from]; V.setPose(d.x, d.z, d.rot); A.disengage();
  for (let i = 0; i < 90; i++) { G.t += 1 / 60; A.updateAutopilot(1 / 60); V.updateVehicle(1 / 60, null); }
  A.engage(to);
  let minUp = 1, t = 0, ok = false, winch = 0; const lim = +(process.env.LIM || 600);
  const onW = on => on && winch++; bus.on('winch', onW);
  for (let i = 0; i < lim * 30; i++) {
    G.t += 1 / 30; A.updateAutopilot(1 / 30); V.updateVehicle(1 / 30, null); t += 1 / 30;
    minUp = Math.min(minUp, V.VEH.up.y);
    if (!quiet && i % 900 === 0) { const p = V.originOf(); console.log(`  ${t.toFixed(0)}s`, p.x.toFixed(1), p.z.toFixed(1), 'spd', V.VEH.fwdSpeed.toFixed(1), A.AP.mode, A.AP.idx + '/' + A.AP.path.length); }
    if (!A.AP.on) { ok = A.AP.at === to; break; }
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${from} -> ${to}: ${t.toFixed(0)}s minUp ${minUp.toFixed(2)} winch ${winch}`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
