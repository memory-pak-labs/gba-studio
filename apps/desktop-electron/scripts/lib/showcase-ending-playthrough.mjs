import assert from 'node:assert/strict';
/** Full canonical project, explicit development start at the final race. */
export async function playShowcaseEnding(driver, project, manifest, path) {
  const points=manifest.scenes.find(s=>s.name==='circuito_final').pathPoints;
  const target=r=>{
    let best;
    for(let i=0;i<points.length;i++) {
      const p=points[i],q=points[(i+1)%points.length],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);
      const t=Math.max(0,Math.min(1,((r.x-p.x)*dx+(r.y-p.y)*dy)/(len*len))),x=p.x+dx*t,y=p.y+dy*t,d=(r.x-x)**2+(r.y-y)**2;
      if(!best||d<best.d)best={i,t,len,d};
    }
    let i=best.i,d=best.t*best.len+44;
    for(let n=0;n<points.length;n++){const p=points[i],q=points[(i+1)%points.length],len=Math.hypot(q.x-p.x,q.y-p.y);if(d<=len)return{x:p.x+(q.x-p.x)*d/len,y:p.y+(q.y-p.y)*d/len};d-=len;i=(i+1)%points.length;}
    return points[0];
  };
  await driver.run(600,0);assert.equal((await driver.state()).runtimeKind,7);assert.equal((await driver.state()).variables[project.variables.findIndex(v=>v.name==='var_council_path')],path,'Explicit fixture pact reaches native racing state');await driver.capture('ending-race-start');
  let victory=false;
  for(let frame=0;frame<18000;frame++) {
    const r=await driver.race();
    if(r.result!==0){assert.equal(r.result,1);assert.equal(r.laps,3);assert.equal(r.gates,12);victory=true;break;}
    const p=target(r),desired=(Math.atan2(p.x-r.x,-(p.y-r.y))*8/Math.PI+16)%16,error=(desired-r.heading+24)%16-8;
    await driver.run(1,1|(Math.abs(error)>.35?(error>0?16:32):0));
  }
  assert.ok(victory,'Three laps through the actual ordered gates');
  await driver.run(20,0);await driver.capture('ending-race-victory');
  const key=path===1?'showcase_epilogue_community':'showcase_epilogue_exploration';let seen=false;
  for(let n=0;n<160;n++) {
    const ui=await driver.ui();
    if(ui.dialogue?.key===key&&!seen){await driver.run(400,0);await driver.capture('ending-branch-'+path);seen=true;}
    const state=await driver.state();
    if(seen&&state.runtimeKind===3){await driver.run(180,0);await driver.capture('ending-title-'+path);return{passed:true,endingPath:path,scope:'Whole canonical ROM; development start at final race with explicit initial council decision. Three laps and ending are driven by buttons.'};}
    await driver.run(4,1);await driver.run(35,0);
  }
  assert.fail('Conditional ending appears and returns to title');
}
