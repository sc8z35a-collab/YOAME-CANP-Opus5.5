globalThis.document={createElement:()=>({getContext:()=>({})})}; globalThis.location={search:''}; globalThis.window={addEventListener(){}};globalThis.localStorage={getItem(){return null}};
const {G,bus}=await import('../js/core.js'); G.waterLevel=-2.05;
const V=await import('../js/vehicle.js'); const T=await import('../js/terrain.js'); const A=await import('../js/autopilot.js');
bus.on('toast',t=>console.log('  toast',t.msg));
const [from,to,t0,t1,every=15]=process.argv.slice(2); const d=T.SPOTS[from]; V.setPose(d.x,d.z,d.rot);
for(let i=0;i<90;i++){G.t+=1/60;A.updateAutopilot(1/60);V.updateVehicle(1/60,null);} A.engage(to);
for(let i=0;i<+t1*30;i++){G.t+=1/30;A.updateAutopilot(1/30);V.updateVehicle(1/30,null);
 if(i>=+t0*30 && i%+every==0){const p=V.originOf(); console.log((i/30).toFixed(1),p.x.toFixed(1),p.y.toFixed(2),p.z.toFixed(1),'spd',V.VEH.fwdSpeed.toFixed(2),'thr',V.VEH.ctrl.throttle.toFixed(2),'st',V.VEH.ctrl.steer.toFixed(2),'vt',A.AP.speedT.toFixed(1),'idx',A.AP.idx+'/'+A.AP.path.length,'wh',V.VEH.wheels.map(w=>w.contact?1:0).join(''),'m',A.AP.mode,A.AP.kturn?'K':'','up',V.VEH.up.y.toFixed(2),'sub',V.VEH.submerged.toFixed(2));}}
