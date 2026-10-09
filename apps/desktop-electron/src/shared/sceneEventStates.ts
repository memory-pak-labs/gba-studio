import type { EventBindingCapability } from "./eventBindingCapabilities.js";

type RecordValue = Record<string, unknown>;
export interface NativeEventField { key: string; label: string; value: string | number | boolean; }
export interface NativeEventAction { title: string; fields: NativeEventField[]; }
export interface RuntimeEventState {
  bindingKey: string;
  label: string;
  group: string;
  eventName: string | null;
  actions: NativeEventAction[];
}
function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function list(value: unknown): RecordValue[] { return Array.isArray(value) ? value.map(record) : []; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function field(source: RecordValue, key: string, label: string, fallback: string | number | boolean = ""): NativeEventField {
  const value = source[key];
  return { key, label, value: typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : fallback };
}
function state(source: RecordValue, path: string[], label: string, group: string, actions: NativeEventAction[] = [], eventField = "eventName"): RuntimeEventState {
  return { bindingKey: `runtime:/${[...path, eventField].join("/")}`, label, group, eventName: text(source[eventField]) || null, actions };
}

/** States are pointers to the native runtime contract, never duplicate scripts. */
export function runtimeEventStates(entity: unknown): RuntimeEventState[] {
  const runtime = record(record(entity).runtime);
  const config = record(runtime.config);
  const output: RuntimeEventState[] = [];
  if (runtime.type === "menu") {
    const screens = list(config.screens);
    const containers = screens.length ? screens.map((screen, index) => ({ screen, path: ["screens", String(index)] })) : [{ screen: config, path: [] }];
    for (const { screen, path } of containers) {
      const name = text(screen.title) || text(screen.id) || "Menu";
      output.push(state(screen, path, `Entrar · ${name}`, "Telas", [], "onEnterEventName"));
      output.push(state(screen, path, `Voltar · ${name}`, "Telas", [], "onBackEventName"));
      list(screen.items).forEach((item, index) => {
        const action = text(item.action) || "select";
        const fields: NativeEventField[] = [];
        const titles: Record<string, string> = { push_screen: "Abrir tela", open_screen: "Trocar tela", pop_screen: "Voltar à tela anterior", toggle_variable: "Alternar variável", adjust_variable: "Ajustar variável", select: "Confirmar opção" };
        if (action === "push_screen" || action === "open_screen") {
          fields.push(field(item, "targetScreenID", "Destino"));
          if (item.targetItemID) fields.push(field(item, "targetItemID", "Opção inicial"));
        }
        if (action === "toggle_variable" || action === "adjust_variable") {
          fields.push(field(item, "variableIndex", "Variável", -1), field(item, "minValue", "Mínimo", 0), field(item, "maxValue", "Máximo", 100));
          fields.push(action === "adjust_variable" ? field(item, "step", "Incremento", 1) : field(item, "checkedValue", "Valor ligado", 1));
        }
        if (item.dialogueKey) fields.push(field(item, "dialogueKey", "Diálogo"));
        if (item.requiresSave !== undefined) fields.push(field(item, "requiresSave", "Exigir save", false));
        output.push(state(item, [...path, "items", String(index)], `Selecionar · ${text(item.label) || text(item.id)}`, screen.carousel ? "Slider" : "Opções", [{ title: titles[action] ?? action, fields }]));
      });
    }
  }
  if (runtime.type === "cutscene") {
    list(config.steps).forEach((step, index) => {
      const path = ["steps", String(index)];
      const actions: NativeEventAction[] = [];
      if (step.backgroundAssetName) actions.push({ title: "Exibir fundo", fields: [field(step, "backgroundAssetName", "Imagem")] });
      if (step.dialogueKey) actions.push({ title: "Exibir diálogo", fields: [field(step, "dialogueKey", "Fala"), field(step, "waitForDialogue", "Aguardar diálogo", false)] });
      for (const [motionIndex, motion] of list(step.actorMotions).entries()) {
        actions.push({ title: `Mover ator ${Number(motion.actorIndex ?? 0) + 1}`, fields: [
          { ...field(motion, "durationFrames", "Duração (quadros)", 1), key: `actorMotions/${motionIndex}/durationFrames` },
          ...["fromPosition", "toPosition"].flatMap((position) => ["x", "y"].map((axis) => ({ ...field(record(motion[position]), axis, `${position === "fromPosition" ? "Origem" : "Destino"} ${axis.toUpperCase()}`, 0), key: `actorMotions/${motionIndex}/${position}/${axis}` })))
        ] });
      }
      actions.push({ title: "Duração e avanço", fields: [field(step, "durationFrames", "Duração (quadros)", 120), field(step, "autoAdvance", "Avançar automaticamente", true), field(step, "skippable", "Permitir pular", true)] });
      if (typeof step.targetSceneIndex === "number" && step.targetSceneIndex >= 0) actions.push({ title: "Trocar cena", fields: [field(step, "targetSceneIndex", "Índice da cena", -1)] });
      output.push(state(step, path, `Quadro ${index + 1}`, "Sequência", actions));
      if (step.skippable !== false) output.push(state(step, path, `Pular quadro ${index + 1}`, "Ao pular", [], "onSkipEventName"));
    });
  }
  if (runtime.type === "worldMap") {
    list(config.nodes).forEach((node, index) => output.push(state(node, ["nodes", String(index)], `Viajar · ${text(node.name) || text(node.id)}`, "Destinos", [{ title: "Disponibilidade da rota", fields: [field(node, "unlocked", "Liberada", true), field(node, "requiredVariable", "Variável exigida", -1), field(node, "requiredValue", "Valor exigido", 0)] }])));
  }
  return output;
}

export function runtimeEventGroups(entity: unknown): EventBindingCapability[] {
  const groups = new Map<string, RuntimeEventState[]>();
  for (const state of runtimeEventStates(entity)) groups.set(state.group, [...(groups.get(state.group) ?? []), state]);
  return [...groups].map(([label, states]) => ({ bindingKey: `runtime-group:${label}`, label, section: null, requiresFrequency: false, groupedBindingKeys: states.map(({ bindingKey, label }) => ({ bindingKey, label })) }));
}

function pointer(entity: unknown, bindingKey: string): { owner: RecordValue; property: string } | null {
  if (!bindingKey.startsWith("runtime:/")) return null;
  const parts = bindingKey.slice("runtime:/".length).split("/");
  let value: unknown = record(record(entity).runtime).config;
  for (const part of parts.slice(0, -1)) {
    if (["__proto__", "constructor", "prototype"].includes(part)) return null;
    if (Array.isArray(value)) value = value[Number(part)];
    else value = record(value)[part];
    if (value === undefined) return null;
  }
  const property = parts.at(-1)!;
  if (["__proto__", "constructor", "prototype"].includes(property) || !value || typeof value !== "object") return null;
  return { owner: value as RecordValue, property };
}

export function runtimeEventValue(entity: unknown, bindingKey: string): string | null {
  const ref = pointer(entity, bindingKey);
  return ref ? text(ref.owner[ref.property]) || null : null;
}

export function updateRuntimeEventState<T extends RecordValue>(entity: T, bindingKey: string, fieldKey: string, value: unknown): T {
  const state = runtimeEventStates(entity).find((state) => state.bindingKey === bindingKey);
  if (!state) return entity;
  const field = state.actions.flatMap((action) => action.fields).find((field) => field.key === fieldKey);
  if (fieldKey !== "eventName" && (!field || typeof field.value !== typeof value)) return entity;
  if (fieldKey === "eventName" && typeof value !== "string") return entity;
  if (typeof value === "number" && !Number.isFinite(value)) return entity;
  const next = structuredClone(entity);
  const destination = fieldKey === "eventName" ? bindingKey : `${bindingKey.slice(0, bindingKey.lastIndexOf("/"))}/${fieldKey}`;
  const ref = pointer(next, destination);
  if (!ref) return entity;
  ref.owner[ref.property] = value;
  return next;
}

export function menuActorRuntimeState(scene: unknown, actor: RecordValue): RuntimeEventState | null {
  const id = text(actor.menuItemID) || (actor.menuActorRole === "start" || actor.inputBinding === "Start" ? "start" : "");
  if (!id) return null;
  return runtimeEventStates(scene).find((state) => {
    const ref = pointer(scene, state.bindingKey);
    return ref?.owner.id === id;
  }) ?? null;
}
