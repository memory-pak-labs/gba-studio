// Local testing contract. No engine coordinates or collision semantics are inferred.
export const STRATEGIES = Object.freeze({ idle: 0, right: 16, left: 32, up: 64, down: 128, a: 1, b: 2, right_a: 17, left_a: 33 });
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
export function validatePlan(plan) {
  if (!plan || plan.schema !== 1 || typeof plan.scene !== 'string' || !plan.scene.trim() || plan.scene.length > 128
    || !integer(plan.bootFrames, 0, 600) || !integer(plan.steps, 1, 20) || !integer(plan.framesPerStep, 1, 120)
    || !Array.isArray(plan.strategies) || !plan.strategies.length || plan.strategies.length > 9
    || plan.strategies.some(s => !Object.hasOwn(STRATEGIES, s)) || new Set(plan.strategies).size !== plan.strategies.length
    || !integer(plan.scope?.currentRoom, 0, 65535) || !integer(plan.scope?.runtimeKind, 0, 255)) throw new Error('invalid-plan');
  if (plan.bounds && (!['minX','maxX','minY','maxY'].every(k => Number.isFinite(plan.bounds[k])) || plan.bounds.minX > plan.bounds.maxX || plan.bounds.minY > plan.bounds.maxY)) throw new Error('invalid-bounds');
  if (plan.objective && (!integer(plan.objective.variable, 0, 15) || !Number.isSafeInteger(plan.objective.equals))) throw new Error('invalid-objective');
  if (plan.forbiddenCollisionFlags !== undefined && !integer(plan.forbiddenCollisionFlags, 1, 0xffffffff)) throw new Error('invalid-collision-mask');
  return plan;
}
const sameScope = (p, s) => s?.currentRoom === p.scope.currentRoom && s?.runtimeKind === p.scope.runtimeKind;
export function auditTrace(plan, trace, inputs) {
  const findings = [];
  const add = (code, frame, kind) => { if (!findings.some(f => f.code === code)) findings.push({code,frame,kind}); };
  let objectiveReached = plan.objective ? false : null;
  let stagnant = 0, idleClock = 0;
  for (let i = 0; i < trace.length; i++) {
    const s = trace[i], before = trace[i-1];
    if (!s || !Number.isFinite(s.frame) || !Number.isFinite(s.player?.x) || !Number.isFinite(s.player?.y)) { add('telemetry-unavailable',i,'suspected'); continue; }
    if (!sameScope(plan,s)) { add('scene-changed',i,'suspected'); continue; }
    if (plan.bounds && (s.player.x < plan.bounds.minX || s.player.x > plan.bounds.maxX || s.player.y < plan.bounds.minY || s.player.y > plan.bounds.maxY)) add('player-bounds',i,'violation');
    if (plan.forbiddenCollisionFlags !== undefined) {
      if (!Number.isInteger(s.collision?.currentFlags)) add('collision-telemetry-unavailable',i,'suspected');
      else if ((s.collision.currentFlags & plan.forbiddenCollisionFlags) !== 0) add('forbidden-collision-flags',i,'violation');
    }
    if (plan.objective) {
      if (!Array.isArray(s.variables) || !Number.isFinite(s.variables[plan.objective.variable])) add('objective-telemetry-unavailable',i,'suspected');
      else if (s.variables[plan.objective.variable] === plan.objective.equals) objectiveReached = true;
    }
    if (before?.player && sameScope(plan,before)) {
      idleClock = s.frame === before.frame ? idleClock+1 : 0;
      stagnant = (inputs[i-1] & 240) && s.player.x === before.player.x && s.player.y === before.player.y ? stagnant+1 : 0;
      // Deliberate blocking at a wall/menu is not a confirmed bug.
      if (idleClock >= plan.framesPerStep) add('runtime-clock-stalled',i,'suspected');
      if (stagnant >= plan.framesPerStep) add('player-not-moving',i,'suspected');
    }
  }
  return {findings, objectiveReached, coverage:{bounds:plan.bounds?'configured':'not-configured',collision:plan.forbiddenCollisionFlags!==undefined?'configured':'not-configured',objective:plan.objective?'configured':'not-configured'}};
}
export function confirmFindings(first, repeated, identical) {
  return first.findings.map(f => ({...f,status: f.kind === 'violation' && identical && repeated.findings.some(r => r.code === f.code && r.frame === f.frame && r.kind === 'violation') ? 'confirmed-invariant' : 'suspected'}));
}
export async function replayInputs(adapter, initial, inputs) {
  adapter.restore(initial);
  const trace = [adapter.read()];
  try { for (const mask of inputs) { adapter.keys(mask); adapter.step(); trace.push(adapter.read()); } }
  finally { adapter.keys(0); }
  return trace;
}
export async function runExploration(plan, adapter, provider) {
  validatePlan(plan);
  const initial = adapter.snapshot(), trace = [adapter.read()], inputs = [], decisions = [];
  let executionError = null;
  if (!sameScope(plan, trace[0])) throw new Error('initial-scope-mismatch');
  try {
    for (let step = 0; step < plan.steps; step++) {
      if (!sameScope(plan,trace.at(-1))) break;
      const local = plan.strategies[step % plan.strategies.length];
      const decision = provider ? await provider.choose({latest:trace.at(-1), previous:trace[Math.max(0,trace.length-1-plan.framesPerStep)], step},plan.strategies,local) : {strategy:local,source:'local'};
      const strategy = plan.strategies.includes(decision?.strategy) ? decision.strategy : local;
      decisions.push({...decision,strategy,step});
      for (let frame=0;frame<plan.framesPerStep;frame++) {
        inputs.push(STRATEGIES[strategy]); adapter.keys(STRATEGIES[strategy]); adapter.step(); trace.push(adapter.read());
        if (!sameScope(plan,trace.at(-1))) break;
      }
    }
  } catch { executionError = 'emulator-exception'; }
  finally { adapter.keys(0); }
  let replayTrace = [];
  try { replayTrace = await replayInputs(adapter,initial,inputs); }
  catch { executionError = 'emulator-exception'; }
  const reproduced = !executionError && JSON.stringify(trace) === JSON.stringify(replayTrace);
  const audit = auditTrace(plan,trace,inputs);
  return {inputs,trace,replayTrace,decisions,reproduced,executionError,coverage:audit.coverage,objectiveReached:audit.objectiveReached,findings:confirmFindings(audit,auditTrace(plan,replayTrace,inputs),reproduced)};
}
