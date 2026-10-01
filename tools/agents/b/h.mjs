// shared headless harness for Agent B probes (no WebGL)
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) }; globalThis.location = { search: '' };
globalThis.window = { addEventListener() {} }; globalThis.localStorage = { getItem() { return null; } };
export const { G, bus } = await import('../../../js/core.js'); G.waterLevel = -2.05;
export const V = await import('../../../js/vehicle.js');
export const T = await import('../../../js/terrain.js');
export const A = await import('../../../js/autopilot.js');
export const R = await import('../../../js/roads.js');
export const THREE = await import('../../../js/lib/three.module.js');
export function run(sec, f, ap = true) { for (let i = 0; i < sec * 30; i++) { G.t += 1 / 30; if (ap) A.updateAutopilot(1 / 30); V.updateVehicle(1 / 30, null); if (f && f(i / 30) === false) return false; } return true; }
