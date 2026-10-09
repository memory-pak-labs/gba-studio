import { describe, expect, it } from 'vitest';
import { validatePlan, auditTrace, confirmFindings, runExploration } from './lib/gameplay-exploration.mjs';
const plan = { schema: 1, scene: 'test', bootFrames: 2, steps: 2, framesPerStep: 3, strategies: ['right', 'idle'], scope: { currentRoom: 0, runtimeKind: 1 }, bounds: { minX: 0, maxX: 20, minY: 0, maxY: 20 } };
const state = (frame, x = 1) => ({ frame, currentRoom: 0, runtimeKind: 1, player: { x, y: 2 }, variables: [0] });
describe('bounded gameplay exploration', () => {
  it('rejects impossible budgets and unknown input strategies', () => {
    expect(validatePlan(plan)).toEqual(plan);
    for (const patch of [{steps: 0}, {steps: 21}, {framesPerStep: 1.5}, {bootFrames: 601}, {strategies:['erase']}, {scope:null}, {bounds:{minX:20,maxX:0,minY:0,maxY:1}}]) expect(() => validatePlan({...plan,...patch})).toThrow();
  });
  it('separates missing telemetry, stale frames and immobility from proven invariants', () => {
    expect(auditTrace(plan, [null, null], [16]).findings[0].kind).toBe('suspected');
    const audit = auditTrace(plan, [state(1), state(1)], [16]);
    expect(audit.findings.every(f => f.kind === 'suspected')).toBe(true);
    expect(auditTrace(plan, [state(1), state(2, 21)], [16]).findings.some(f => f.code === 'player-bounds' && f.kind === 'violation')).toBe(true);
    expect(auditTrace(plan, [state(1), {...state(2, 21), currentRoom:1}], [16]).findings.some(f=>f.code==='player-bounds')).toBe(false);
  });
  it('only confirms deterministic violations repeated at the same frame', () => {
    const first = auditTrace(plan, [state(1), state(2, 21)], [16]);
    expect(confirmFindings(first, first, true)[0].status).toBe('confirmed-invariant');
    expect(confirmFindings(first, first, false)[0].status).toBe('suspected');
    expect(confirmFindings(first, {findings:[]}, true)[0].status).toBe('suspected');
  });
  it('does not invent collision or objective checks without a contract', () => {
    const audit = auditTrace(plan, [state(1), state(2)], [0]);
    expect(audit.coverage.collision).toBe('not-configured');
    expect(audit.objectiveReached).toBe(null);
  });
  it('records actual inputs and reproduces from the same state without a second provider call', async () => {
    let frame=0,x=1,keys=0,calls=0;
    const adapter={snapshot:()=>({frame,x}),restore:s=>{frame=s.frame;x=s.x;},read:()=>state(frame,x),keys:k=>{keys=k;},step:()=>{frame++;if(keys===16)x++;}};
    const report=await runExploration(plan,adapter,{choose:async()=>{calls++;return {strategy:'right',source:'test'};}});
    expect(calls).toBe(2); expect(report.inputs).toEqual([16,16,16,16,16,16]);
    expect(report.reproduced).toBe(true); expect(report.trace).toEqual(report.replayTrace);
  });
  it('rejects incorrect initial scene before sending state or inputs', async () => {
    let called=false;
    const adapter={snapshot:()=>0,read:()=>({...state(1),currentRoom:2}),keys:()=>{},step:()=>{},restore:()=>{}};
    await expect(runExploration(plan,adapter,{choose:()=>{called=true;}})).rejects.toThrow('initial-scope');
    expect(called).toBe(false);
  });
});
it('records the attempted input and partial trace when emulator execution throws', async () => {
 let frame=0,keys=0;
 const adapter={snapshot:()=>0,restore:()=>{frame=0;},read:()=>state(frame),keys:k=>{keys=k;},step:()=>{if(frame===1)throw Error('native crash');frame++;}};
 const r=await runExploration(plan,adapter);
 expect(r.executionError).toBe('emulator-exception');expect(r.reproduced).toBe(false);
 expect(r.inputs).toEqual([16,16]);expect(r.trace).toHaveLength(2);expect(keys).toBe(0);
});
it('checks declared objectives and forbidden collision flags only within scope',()=>{
 const p={...plan,objective:{variable:0,equals:1},forbiddenCollisionFlags:4};
 const a=auditTrace(p,[{...state(1),variables:[1],collision:{currentFlags:4}}],[]);
 expect(a.objectiveReached).toBe(true);expect(a.findings[0].code).toBe('forbidden-collision-flags');
});
