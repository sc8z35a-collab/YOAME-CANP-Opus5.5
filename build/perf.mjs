globalThis.document={createElement:()=>({getContext:()=>({})})}; globalThis.location={search:''}; globalThis.window={addEventListener(){}};globalThis.localStorage={getItem(){return null}};
const {G}=await import('../js/core.js'); G.waterLevel=-2.05;
const V=await import('../js/vehicle.js'); const T=await import('../js/terrain.js'); const A=await import('../js/autopilot.js');
const F=await import('../js/forest.js'); for(let i=0;i<2000;i++) F.colliders.push({x:Math.random()*400-200,z:Math.random()*400-200,r:0.6});
const d=T.SPOTS.hollow; V.setPose(d.x,d.z,d.rot); A.engage('ridge');
const t0=performance.now(); for(let i=0;i<600;i++){G.t+=1/60;A.updateAutopilot(1/60);V.updateVehicle(1/60,null);} console.log('ms/frame', ((performance.now()-t0)/600).toFixed(3));
