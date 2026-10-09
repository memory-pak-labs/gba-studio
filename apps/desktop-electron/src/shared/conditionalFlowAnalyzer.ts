import type { GBAProjectData } from "./projectFile.js";

export interface ConditionalFlowState {
  variables?: Record<string, boolean | number | string>;
  inventory?: Record<string, number>;
  save?: Record<string, boolean | number | string>;
}

export interface ConditionalSceneTransition {
  from: string;
  to: string;
  eventName: string | null;
}

export interface ConditionalSceneFlowReport {
  startScene: string | null;
  reachableScenes: string[];
  unreachableScenes: string[];
  deadEnds: string[];
  loops: string[][];
  invalidTransitions: ConditionalSceneTransition[];
  blockedTransitions: Array<ConditionalSceneTransition & { reason: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(data: GBAProjectData, key: string): Record<string, unknown>[] {
  return Array.isArray(data[key]) ? (data[key] as unknown[]).filter(isRecord) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventCommands(event: Record<string, unknown> | undefined): string[] {
  if (!event) return [];
  const values = Array.isArray(event.steps) ? event.steps : Array.isArray(event.commands) ? event.commands : [];
  return values.flatMap((value) => {
    if (typeof value === "string") return [value];
    return isRecord(value) && typeof value.command === "string" ? [value.command] : [];
  });
}

function menuTargetEdges(
  rooms: Record<string, unknown>[],
  sceneSet: Set<string>,
  validEdges: Map<string, string[]>
): Set<string> {
  const menuNames = new Set(rooms.map((room) => text(room.name) ?? text(room.id)).filter((name): name is string => Boolean(name)));
  const targetName = (target: string): string | null => {
    const targetRoom = rooms.find((room) => (text(room.name) ?? text(room.id)) === target || text(room.id) === target);
    const name = targetRoom ? text(targetRoom.name) ?? text(targetRoom.id) : null;
    return name && sceneSet.has(name) ? name : null;
  };
  const interfaceScenes = new Set<string>();
  for (const room of rooms) {
    const name = text(room.name) ?? text(room.id);
    const runtime = isRecord(room.runtime) ? room.runtime : {};
    const config = isRecord(runtime.config) ? runtime.config : {};
    if (!name || runtime.type !== "menu") continue;
    if (config.role && config.role !== "title" && config.role !== "start") interfaceScenes.add(name);
    const automaticTarget = targetName(text(config.nextScreenID) ?? "");
    if (automaticTarget) {
      const edges = validEdges.get(name);
      if (edges && !edges.includes(automaticTarget)) edges.push(automaticTarget);
    }
    const screens = Array.isArray(config.screens) ? config.screens : [config];
    for (const screen of screens.filter(isRecord)) {
      const items = Array.isArray(screen.items) ? screen.items : [];
      for (const item of items.filter(isRecord)) {
        const target = text(item.targetScreenID);
        const destination = target ? targetName(target) : null;
        if (!destination || !menuNames.has(destination)) continue;
        const edges = validEdges.get(name);
        if (edges && !edges.includes(destination)) edges.push(destination);
      }
    }
  }
  return interfaceScenes;
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  if (operator === "==" || operator === "=") return String(left) === String(right);
  if (operator === "!=") return String(left) !== String(right);
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  if (operator === ">=") return leftNumber >= rightNumber;
  if (operator === "<=") return leftNumber <= rightNumber;
  if (operator === ">") return leftNumber > rightNumber;
  if (operator === "<") return leftNumber < rightNumber;
  return false;
}

function transitionBlockReason(commands: string[], state: ConditionalFlowState): string | null {
  for (const command of commands) {
    const parts = command.trim().split(/\s+/);
    const [verb, key, operator, rawValue] = parts;
    let values: Record<string, unknown> | undefined;
    if (verb === "if_variable") values = state.variables;
    if (verb === "if_inventory" || verb === "has_item") values = state.inventory;
    if (verb === "if_save" || verb === "if_save_value") values = state.save;
    if (!values || !key || !operator) continue;
    const expected = rawValue === "true" ? true : rawValue === "false" ? false : Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
    if (!compare(values[key], operator, expected)) return `${verb} ${key} ${operator} ${String(expected)}`;
  }
  return null;
}

function stronglyConnected(nodes: string[], edges: Map<string, string[]>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indexes = new Map<string, number>();
  const low = new Map<string, number>();
  const components: string[][] = [];
  const visit = (node: string): void => {
    indexes.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of edges.get(node) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node)!, low.get(target)!));
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node)!, indexes.get(target)!));
      }
    }
    if (low.get(node) !== indexes.get(node)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
      if (current === node) break;
    }
    if (component.length > 1 || (edges.get(node) ?? []).includes(node)) components.push(component.sort());
  };
  nodes.forEach((node) => { if (!indexes.has(node)) visit(node); });
  return components.sort((left, right) => left.join().localeCompare(right.join()));
}

export function analyzeConditionalSceneFlow(
  data: GBAProjectData,
  state: ConditionalFlowState = {}
): ConditionalSceneFlowReport {
  const rooms = records(data, "rooms").length > 0 ? records(data, "rooms") : records(data, "scenas");
  const sceneNames = rooms.map((room) => text(room.name) ?? text(room.id)).filter((name): name is string => Boolean(name));
  const sceneSet = new Set(sceneNames);
  const settings = isRecord(data.settings) ? data.settings : {};
  const general = isRecord(settings.general) ? settings.general : {};
  const startScene = text(general.startScene) ?? sceneNames[0] ?? null;
  const editorState = isRecord(data.editorState) ? data.editorState : {};
  const connections = Array.isArray(editorState.scenaConnections)
    ? editorState.scenaConnections.filter(isRecord)
    : [];
  const events = new Map(records(data, "events").map((event) => [text(event.name) ?? text(event.id) ?? "", event]));
  const validEdges = new Map<string, string[]>(sceneNames.map((name) => [name, []]));
  const invalidTransitions: ConditionalSceneTransition[] = [];
  const blockedTransitions: ConditionalSceneFlowReport["blockedTransitions"] = [];

  for (const connection of connections) {
    const transition = {
      from: text(connection.from) ?? "",
      to: text(connection.to) ?? "",
      eventName: text(connection.eventName)
    };
    if (!sceneSet.has(transition.from) || !sceneSet.has(transition.to)) {
      invalidTransitions.push(transition);
      continue;
    }
    const reason = transitionBlockReason(eventCommands(transition.eventName ? events.get(transition.eventName) : undefined), state);
    if (reason) {
      blockedTransitions.push({ ...transition, reason });
      continue;
    }
    validEdges.get(transition.from)!.push(transition.to);
  }

  const interfaceScenes = menuTargetEdges(rooms, sceneSet, validEdges);

  const startMenuScenes = new Set(
    rooms.flatMap((room) => {
      const name = text(room.name) ?? text(room.id);
      const runtime = isRecord(room.runtime) ? room.runtime : {};
      const config = isRecord(runtime.config) ? runtime.config : {};
      return name && runtime.type === "menu" && config.role === "start" ? [name] : [];
    })
  );
  const topdownScenes = rooms.flatMap((room) => {
    const name = text(room.name) ?? text(room.id);
    const runtime = isRecord(room.runtime) ? room.runtime : {};
    return name && (room.sceneType === "topdown" || runtime.type === "topdown") ? [name] : [];
  });
  for (const topdownScene of topdownScenes) {
    const edges = validEdges.get(topdownScene);
    if (!edges) continue;
    for (const startMenuScene of startMenuScenes) {
      if (!edges.includes(startMenuScene)) edges.push(startMenuScene);
    }
  }

  const reachable = new Set<string>();
  const pending = startScene && sceneSet.has(startScene) ? [startScene] : [];
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(validEdges.get(current) ?? []));
  }

  return {
    startScene,
    reachableScenes: [...reachable].sort(),
    unreachableScenes: sceneNames.filter((name) => !reachable.has(name)).sort(),
    deadEnds: [...reachable]
      .filter((name) => !startMenuScenes.has(name) && !interfaceScenes.has(name) && (validEdges.get(name) ?? []).length === 0)
      .sort(),
    loops: stronglyConnected(sceneNames, validEdges),
    invalidTransitions,
    blockedTransitions
  };
}
