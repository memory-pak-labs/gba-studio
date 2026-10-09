export type HudElementState = "normal" | "selected" | "disabled" | "hidden";
export type HudEventTrigger = "appear" | "valueChanged" | "focus" | "confirm";
export interface HudStateCondition { variable: string; value: number; text?: string }
export interface HudEventAction { op: "set_variable" | "add_variable"; variable: string; value: number }
export interface HudElementEvent { trigger: HudEventTrigger; watchVariable?: string; actions: HudEventAction[] }
export interface HudElementBehavior { states: Partial<Record<Exclude<HudElementState, "normal">, HudStateCondition>>; events: HudElementEvent[] }
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const integer = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.max(-2147483648, Math.min(2147483647, Math.round(v))) : 0;
export function normalizeHudBehavior(value: unknown): HudElementBehavior {
  const raw = record(value), states: HudElementBehavior["states"] = {};
  for (const state of ["selected", "disabled", "hidden"] as const) {
    const condition = record(record(raw.states)[state]);
    if (typeof condition.variable !== "string" || !condition.variable.trim()) continue;
    states[state] = { variable: condition.variable.trim(), value: integer(condition.value), ...(typeof condition.text === "string" ? { text: condition.text } : {}) };
  }
  const events = (Array.isArray(raw.events) ? raw.events : []).slice(0, 8).flatMap(entry => {
    const event = record(entry);
    if (!["appear", "valueChanged", "focus", "confirm"].includes(String(event.trigger))) return [];
    const actions: HudEventAction[] = (Array.isArray(event.actions) ? event.actions : []).slice(0, 16).flatMap(entry => {
      const action = record(entry);
      return (action.op === "set_variable" || action.op === "add_variable") && typeof action.variable === "string" && action.variable.trim()
        ? [{op: action.op, variable: action.variable.trim(), value: integer(action.value)}] : [];
    });
    const watchVariable = typeof event.watchVariable === "string" ? event.watchVariable.trim() : "";
    if (!actions.length || (event.trigger === "valueChanged" && !watchVariable)) return [];
    return [{ trigger: event.trigger as HudEventTrigger, ...(watchVariable ? { watchVariable } : {}), actions }];
  });
  return { states, events };
}
export function resolveHudComponentState(behavior: HudElementBehavior | undefined, values: Record<string, number>): HudElementState {
  for (const state of ["hidden", "disabled", "selected"] as const) {
    const condition = behavior?.states[state];
    if (condition && values[condition.variable] === condition.value) return state;
  }
  return "normal";
}
