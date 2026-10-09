import type { IsoTacticalAudioCue } from "./isometricTacticalPresentation.js";

export type IsometricTacticalTeam = "player" | "enemy";
export type IsometricTacticalPhase = "select" | "target";
export type IsometricTacticalVisualEventKind =
  | "cursor"
  | "select"
  | "cancel"
  | "move"
  | "attack"
  | "hurt"
  | "defeat"
  | "blocked"
  | "turn"
  | "victory";

export interface IsometricTacticalActorPosition {
  actorIndex: number;
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export interface IsometricTacticalUnitConfig {
  actorIndex: number;
  team: IsometricTacticalTeam;
  moveRange: number;
  attackRange: number;
  maxHp: number;
  hp?: number;
  attackPower: number;
}

export interface IsometricTacticalConfig {
  enabled: boolean;
  activeTeam: IsometricTacticalTeam;
  activeUnitIndex?: number;
  units: IsometricTacticalUnitConfig[];
}

export interface IsometricTacticalUnitState extends IsometricTacticalUnitConfig {
  hp: number;
}

export interface IsometricTacticalState {
  enabled: boolean;
  phase: IsometricTacticalPhase;
  turnNumber: number;
  activeTeam: IsometricTacticalTeam;
  activeUnitIndex: number | null;
  selectedUnitIndex: number | null;
  units: IsometricTacticalUnitState[];
  notice: string | null;
  outcome: "inProgress" | "victory" | "defeat";
}

export interface IsometricTacticalTile {
  x: number;
  y: number;
  z: number;
}

export interface IsometricTacticalMove {
  actorIndex: number;
  tile: IsometricTacticalTile;
}

export interface IsometricTacticalAttack {
  attackerIndex: number;
  targetIndex: number;
  damage: number;
}

export interface IsometricTacticalVisualEvent {
  kind: IsometricTacticalVisualEventKind;
  tile: IsometricTacticalTile;
  actorIndex?: number;
  targetIndex?: number;
}

export interface IsometricTacticalActionResult {
  state: IsometricTacticalState;
  moves: IsometricTacticalMove[];
  attacks: IsometricTacticalAttack[];
  defeatedActorIndexes: number[];
  visualEvents: IsometricTacticalVisualEvent[];
  audioCues: IsoTacticalAudioCue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const next = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, next));
}

function teamValue(value: unknown, fallback: IsometricTacticalTeam): IsometricTacticalTeam {
  return value === "enemy" || value === "player" ? value : fallback;
}

export function normalizeIsometricTacticalConfig(value: unknown, actorCount: number): IsometricTacticalConfig | null {
  if (!isRecord(value) || value.enabled !== true || !Array.isArray(value.units)) return null;
  const units = value.units.flatMap((candidate): IsometricTacticalUnitConfig[] => {
    if (!isRecord(candidate)) return [];
    const actorIndex = boundedInteger(candidate.actorIndex, -1, -1, Math.max(-1, actorCount - 1));
    if (actorIndex < 0) return [];
    const maxHp = boundedInteger(candidate.maxHp, 1, 1, 255);
    return [{
      actorIndex,
      team: teamValue(candidate.team, "player"),
      moveRange: boundedInteger(candidate.moveRange, 1, 1, 15),
      attackRange: boundedInteger(candidate.attackRange, 1, 1, 15),
      maxHp,
      hp: boundedInteger(candidate.hp, maxHp, 0, maxHp),
      attackPower: boundedInteger(candidate.attackPower, 1, 1, 255)
    }];
  });
  const uniqueUnits = units.filter((unit, index) => units.findIndex((candidate) => candidate.actorIndex === unit.actorIndex) === index);
  if (uniqueUnits.length === 0 || !uniqueUnits.some((unit) => unit.team === "player") || !uniqueUnits.some((unit) => unit.team === "enemy")) {
    return null;
  }
  const activeTeam = teamValue(value.activeTeam, "player");
  const activeUnitIndex = boundedInteger(value.activeUnitIndex, 0, 0, uniqueUnits.length - 1);
  const activeUnit = uniqueUnits[activeUnitIndex]?.team === activeTeam
    ? activeUnitIndex
    : uniqueUnits.findIndex((unit) => unit.team === activeTeam);
  return {
    enabled: true,
    activeTeam,
    activeUnitIndex: activeUnit >= 0 ? activeUnit : undefined,
    units: uniqueUnits
  };
}

export function createIsometricTacticalState(
  config: IsometricTacticalConfig | null,
  actorCount: number
): IsometricTacticalState {
  const normalized = normalizeIsometricTacticalConfig(config, actorCount) ?? {
    enabled: false,
    activeTeam: "player" as const,
    activeUnitIndex: undefined,
    units: []
  };
  const units = normalized.units.map((unit) => ({ ...unit, hp: unit.hp ?? unit.maxHp }));
  return {
    enabled: normalized.enabled,
    phase: "select",
    turnNumber: 1,
    activeTeam: normalized.activeTeam,
    activeUnitIndex: normalized.activeUnitIndex ?? null,
    selectedUnitIndex: null,
    units,
    notice: null,
    outcome: "inProgress"
  };
}

export function isometricTacticalDistance(from: IsometricTacticalTile, to: IsometricTacticalTile): number {
  return from.z === to.z ? Math.abs(from.x - to.x) + Math.abs(from.y - to.y) : Number.POSITIVE_INFINITY;
}

function isometricTacticalMoveReachable(
  start: IsometricTacticalTile,
  target: IsometricTacticalTile,
  moveRange: number,
  actors: readonly IsometricTacticalActorPosition[],
  movingActorIndex: number,
  isBlocked: (tile: IsometricTacticalTile) => boolean,
  heightAt?: (x: number, y: number) => number,
  canTraverse?: (from: IsometricTacticalTile, to: IsometricTacticalTile) => boolean
): boolean {
  if (start.x === target.x && start.y === target.y || isBlocked(target)) return false;
  const queue: { tile: IsometricTacticalTile; depth: number }[] = [{ tile: start, depth: 0 }];
  const visited = new Set([`${start.x},${start.y},${start.z}`]);
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.depth >= moveRange) continue;
    for (const [dx, dy] of directions) {
      const x = current.tile.x + dx;
      const y = current.tile.y + dy;
      const next = { x, y, z: heightAt?.(x, y) ?? current.tile.z };
      const key = `${x},${y},${next.z}`;
      if (visited.has(key) || isBlocked(next) || Math.abs(next.z - current.tile.z) > 1 ||
          (canTraverse ? !canTraverse(current.tile, next) : next.z !== current.tile.z) ||
          actors.some((actor) => actor.visible && actor.actorIndex !== movingActorIndex &&
            actor.x === x && actor.y === y && actor.z === next.z)) continue;
      if (x === target.x && y === target.y && next.z === target.z) return true;
      visited.add(key);
      if (queue.length < 64) queue.push({ tile: next, depth: current.depth + 1 });
    }
  }
  return false;
}

function unitStateForActor(state: IsometricTacticalState, actorIndex: number): IsometricTacticalUnitState | null {
  return state.units.find((unit) => unit.actorIndex === actorIndex && unit.hp > 0) ?? null;
}

function unitStateAtIndex(state: IsometricTacticalState, unitIndex: number): IsometricTacticalUnitState | null {
  const unit = state.units[unitIndex];
  return unit && unit.hp > 0 ? unit : null;
}

function unitAt(actors: readonly IsometricTacticalActorPosition[], tile: IsometricTacticalTile): IsometricTacticalActorPosition | null {
  return actors.find((actor) => actor.visible && actor.x === tile.x && actor.y === tile.y && actor.z === tile.z) ?? null;
}

function nextActiveUnit(state: IsometricTacticalState, team: IsometricTacticalTeam): number | null {
  const unitIndex = state.units.findIndex((candidate) => candidate.team === team && candidate.hp > 0);
  return unitIndex >= 0 ? unitIndex : null;
}

function advanceTurn(state: IsometricTacticalState): IsometricTacticalState {
  const nextTeam: IsometricTacticalTeam = state.activeTeam === "player" ? "enemy" : "player";
  const nextUnit = nextActiveUnit(state, nextTeam);
  if (nextUnit !== null) {
    return {
      ...state,
      phase: "select",
      turnNumber: state.turnNumber + 1,
      activeTeam: nextTeam,
      activeUnitIndex: nextUnit,
      selectedUnitIndex: null,
      notice: null,
      outcome: "inProgress"
    };
  }
  return {
    ...state,
    phase: "select",
    turnNumber: state.turnNumber + 1,
    activeUnitIndex: null,
    selectedUnitIndex: null,
    notice: "Todos os alvos foram derrotados.",
    outcome: state.activeTeam === "player" ? "victory" : "defeat"
  };
}

function result(
  state: IsometricTacticalState,
  notice: string | null = state.notice,
  visualEvents: IsometricTacticalVisualEvent[] = [],
  audioCues: IsoTacticalAudioCue[] = []
): IsometricTacticalActionResult {
  return {
    state: { ...state, notice },
    moves: [],
    attacks: [],
    defeatedActorIndexes: [],
    visualEvents,
    audioCues
  };
}

export function applyIsometricTacticalAction(
  state: IsometricTacticalState,
  actors: readonly IsometricTacticalActorPosition[],
  cursor: IsometricTacticalTile,
  action: "confirm" | "cancel" | "end_turn",
  isBlocked: (tile: IsometricTacticalTile) => boolean,
  heightAt?: (x: number, y: number) => number,
  canTraverse?: (from: IsometricTacticalTile, to: IsometricTacticalTile) => boolean
): IsometricTacticalActionResult {
  if (!state.enabled || state.activeUnitIndex === null || state.outcome !== "inProgress") return result(state, "Modo tático indisponível.");
  if (action === "cancel") {
    return state.phase === "target"
      ? result(
          { ...state, phase: "select", selectedUnitIndex: null },
          null,
          [{ kind: "cancel", tile: cursor }],
          ["cancel"]
        )
      : {
          ...result(state, state.notice, [{ kind: "turn", tile: cursor }], ["turn"]),
          state: advanceTurn(state)
        };
  }
  if (action === "end_turn") {
    return {
      ...result(state, state.notice, [{ kind: "turn", tile: cursor }], ["turn"]),
      state: advanceTurn(state)
    };
  }

  const active = unitStateAtIndex(state, state.activeUnitIndex);
  if (!active || active.team !== state.activeTeam) {
    return result(state, "Unidade ativa indisponível.", [{ kind: "blocked", tile: cursor }], ["cancel"]);
  }
  if (state.phase === "select") {
    const selectedActor = unitAt(actors, cursor);
    if (!selectedActor || selectedActor.actorIndex !== active.actorIndex) {
      return result(state, "Selecione a unidade ativa.", [{ kind: "blocked", tile: cursor }], ["cancel"]);
    }
    return result(
      { ...state, phase: "target", selectedUnitIndex: state.activeUnitIndex },
      null,
      [{ kind: "select", tile: cursor, actorIndex: active.actorIndex }],
      ["select"]
    );
  }

  const selected = state.selectedUnitIndex === null ? null : unitStateAtIndex(state, state.selectedUnitIndex);
  if (!selected) {
    return result(
      { ...state, phase: "select", selectedUnitIndex: null },
      "Unidade selecionada indisponível.",
      [{ kind: "blocked", tile: cursor }],
      ["cancel"]
    );
  }
  const selectedActor = actors.find((actor) => actor.actorIndex === selected.actorIndex && actor.visible);
  if (!selectedActor) return result(state, "Unidade selecionada indisponível.", [{ kind: "blocked", tile: cursor }], ["cancel"]);
  const targetActor = unitAt(actors, cursor);
  const distance = isometricTacticalDistance(selectedActor, cursor);
  if (targetActor) {
    const target = unitStateForActor(state, targetActor.actorIndex);
    if (target && target.team !== selected.team && distance <= selected.attackRange) {
      const damage = Math.min(target.hp, selected.attackPower);
      const nextHp = Math.max(0, target.hp - damage);
      const defeated = nextHp === 0 ? [target.actorIndex] : [];
      const updatedUnits = state.units.map((unit) => unit.actorIndex === target.actorIndex ? { ...unit, hp: nextHp } : unit);
      const targetTeamStillAlive = updatedUnits.some((unit) => unit.team === target.team && unit.hp > 0);
      const outcome = targetTeamStillAlive
        ? "inProgress" as const
        : selected.team === "player" ? "victory" as const : "defeat" as const;
      const nextState = targetTeamStillAlive
        ? advanceTurn({
        ...state,
        units: updatedUnits
      })
        : {
            ...state,
            units: updatedUnits,
            phase: "select" as const,
            turnNumber: state.turnNumber + 1,
            activeUnitIndex: null,
            selectedUnitIndex: null,
            outcome,
            notice: outcome === "victory" ? "Vitória." : "Derrota."
          };
      const visualEvents: IsometricTacticalVisualEvent[] = [
        { kind: "attack", tile: targetActor, actorIndex: selected.actorIndex, targetIndex: target.actorIndex },
        { kind: "hurt", tile: targetActor, actorIndex: target.actorIndex, targetIndex: selected.actorIndex }
      ];
      if (defeated.length > 0) {
        visualEvents.push({ kind: "defeat", tile: targetActor, actorIndex: target.actorIndex });
      }
      if (outcome === "victory") {
        visualEvents.push({ kind: "victory", tile: targetActor, actorIndex: selected.actorIndex });
      }
      if (outcome === "defeat") {
        visualEvents.push({ kind: "defeat", tile: selectedActor, actorIndex: selected.actorIndex });
      }
      if (targetTeamStillAlive) {
        visualEvents.push({ kind: "turn", tile: targetActor });
      }
      const audioCues: IsoTacticalAudioCue[] = [
        "attack",
        "hit",
        ...(targetTeamStillAlive ? ["turn" as const] : [outcome === "victory" ? "victory" as const : "defeat" as const])
      ];
      return {
        state: { ...nextState, notice: nextHp === 0 ? "Alvo derrotado." : "Ataque aplicado." },
        moves: [],
        attacks: [{ attackerIndex: selected.actorIndex, targetIndex: target.actorIndex, damage }],
        defeatedActorIndexes: defeated,
        visualEvents,
        audioCues
      };
    }
    return result(state, "Casa ocupada.", [{ kind: "blocked", tile: cursor }], ["cancel"]);
  }
  if (!isometricTacticalMoveReachable(
    selectedActor, cursor, selected.moveRange, actors, selected.actorIndex,
    isBlocked, heightAt, canTraverse
  )) return result(state, "Trajeto bloqueado ou fora do alcance.", [{ kind: "blocked", tile: cursor }], ["cancel"]);
  const nextState = advanceTurn(state);
  return {
    state: { ...nextState, notice: "Movimento aplicado." },
    moves: [{ actorIndex: selected.actorIndex, tile: cursor }],
    attacks: [],
    defeatedActorIndexes: [],
    visualEvents: [
      { kind: "move", tile: cursor, actorIndex: selected.actorIndex },
      { kind: "turn", tile: cursor }
    ],
    audioCues: ["move", "turn"]
  };
}
