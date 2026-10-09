export interface ParticleEmitterBudget {
  maxParticles: number;
  maxPerScanline: number;
}

export function budgetParticleEmitter(
  emitter: ParticleEmitterBudget,
  usage: { reservedOam: number; reservedPerScanline: number }
): ParticleEmitterBudget & { clamped: boolean; warnings: string[] } {
  const availableOam = Math.max(0, 128 - Math.max(0, usage.reservedOam));
  const availableScanline = Math.max(0, 128 - Math.max(0, usage.reservedPerScanline));
  const maxParticles = Math.min(Math.max(0, Math.floor(emitter.maxParticles)), availableOam);
  const maxPerScanline = Math.min(Math.max(0, Math.floor(emitter.maxPerScanline)), availableScanline, maxParticles);
  const warnings: string[] = [];
  if (maxParticles !== emitter.maxParticles) warnings.push(`Particulas limitadas a ${maxParticles} pelo orçamento de OAM.`);
  if (maxPerScanline !== emitter.maxPerScanline) warnings.push(`Particulas por scanline limitadas a ${maxPerScanline}.`);
  return { maxParticles, maxPerScanline, clamped: warnings.length > 0, warnings };
}

export interface ActorStateMachine {
  id: string;
  actor?: string;
  initialState: string;
  states: Array<{
    id: string;
    animation?: string;
    onAnimationComplete?: string[];
    onEnter?: string[];
    onUpdate?: string[];
    onExit?: string[];
  }>;
  transitions: Array<{ from: string; to: string; condition: string; event?: string }>;
}

export interface CompiledStateEvent {
  id: string;
  name: string;
  category: "Máquina de estado";
  steps: Array<{ command: string }>;
}

export function compileActorStateMachine(machine: ActorStateMachine): CompiledStateEvent[] {
  const stateIDs = new Set(machine.states.map((state) => state.id));
  if (!stateIDs.has(machine.initialState)) throw new Error(`Estado inicial inexistente: ${machine.initialState}`);
  for (const transition of machine.transitions) {
    if (!stateIDs.has(transition.from) || !stateIDs.has(transition.to)) {
      throw new Error(`Transicao invalida: ${transition.from} -> ${transition.to}`);
    }
  }
  return machine.states.map((state) => {
    const transitions = machine.transitions
      .filter((transition) => transition.from === state.id)
      .flatMap((transition) => {
        const call = { command: `call_event ${transition.event?.trim() || `state_${machine.id}_${transition.to}`}` };
        const condition = transition.condition.trim();
        return condition === "always" || condition === "if_true"
          ? [call]
          : [{ command: condition }, call];
      });
    return {
      id: `state-${machine.id}-${state.id}`,
      name: `state_${machine.id}_${state.id}`,
      category: "Máquina de estado" as const,
      steps: [
        ...(machine.actor && state.animation
          ? [{ command: `set_actor_animation ${machine.actor} ${state.animation}` }]
          : []),
        ...(state.onEnter ?? []).map((command) => ({ command })),
        ...(state.onUpdate ?? []).map((command) => ({ command })),
        ...transitions,
        ...(state.onExit ?? []).map((command) => ({ command })),
        ...(state.onAnimationComplete ?? []).map((event) => ({ command: `call_event ${event}` }))
      ]
    };
  });
}

export interface TimelineKeyframe {
  frame: number;
  command: string;
}

export interface CinematicTimeline {
  id: string;
  tracks: Array<{ kind: string; keyframes: TimelineKeyframe[] }>;
}

export function compileCinematicTimeline(timeline: CinematicTimeline): Array<TimelineKeyframe & { track: string }> {
  return timeline.tracks
    .flatMap((track) => track.keyframes.map((keyframe) => ({
      frame: Math.max(0, Math.floor(keyframe.frame)),
      track: track.kind,
      command: keyframe.command
    })))
    .sort((left, right) => left.frame - right.frame || left.track.localeCompare(right.track));
}

export interface GraphicEffectSequence {
  id: string;
  tracks: Array<{ kind: string; keyframes: Array<{ frame: number; value: number | string }> }>;
}

const graphicEffectCommands: Record<string, string> = {
  palette: "palette_flash",
  blend: "palette_flash",
  mosaic: "mosaic",
  wave: "wave",
  scanline: "parallax_line_scroll"
};

export function compileGraphicEffectSequence(
  sequence: GraphicEffectSequence
): Array<{ frame: number; track: string; command: string }> {
  return sequence.tracks
    .flatMap((track) => track.keyframes.map((keyframe) => {
      const intensity = Math.max(0, Math.min(100, Math.floor(Number(keyframe.value) || 0)));
      const command = track.kind === "fade"
        ? `${intensity <= 0 ? "fade_in" : "fade_out"} 30`
        : `visual_effect ${graphicEffectCommands[track.kind] ?? "clear"} all 30 ${intensity}`;
      return {
        frame: Math.max(0, Math.floor(keyframe.frame)),
        track: track.kind,
        command
      };
    }))
    .sort((left, right) => left.frame - right.frame || left.track.localeCompare(right.track));
}

export interface SaveLabSnapshot {
  id: string;
  name: string;
  slot: number;
  variables: Record<string, number | string | boolean>;
  inventory: Record<string, number>;
  checksum?: number;
  truncated?: boolean;
  corruption?: string;
}

export function duplicateSaveLabSnapshot(
  snapshot: SaveLabSnapshot,
  id: string,
  name: string
): SaveLabSnapshot {
  return structuredClone({ ...snapshot, id, name });
}

export function corruptSaveLabSnapshot(
  snapshot: SaveLabSnapshot,
  mode: "checksum" | "truncate" | "missing-slot"
): SaveLabSnapshot {
  const next = structuredClone(snapshot);
  next.corruption = mode;
  if (mode === "checksum") next.checksum = (next.checksum ?? 0) + 1;
  if (mode === "truncate") {
    next.truncated = true;
    const firstVariable = Object.keys(next.variables)[0];
    if (firstVariable) delete next.variables[firstVariable];
  }
  if (mode === "missing-slot") next.slot = -1;
  return next;
}

export interface LinkCableTransfer {
  frame: number;
  from: number;
  to: number;
  value: number;
  dropped?: boolean;
}

export function simulateLinkCableSession(session: {
  players: number;
  latencyFrames: number;
  timeoutFrames: number;
  transfers: LinkCableTransfer[];
}): {
  delivered: Array<LinkCableTransfer & { deliveredFrame: number }>;
  timeouts: Array<LinkCableTransfer & { timeoutFrame: number }>;
  errors: string[];
} {
  const errors: string[] = [];
  const validTransfers = session.transfers.filter((transfer) => {
    const valid = transfer.from >= 0 && transfer.from < session.players
      && transfer.to >= 0 && transfer.to < session.players
      && transfer.from !== transfer.to;
    if (!valid) errors.push(`Transferencia invalida no frame ${transfer.frame}.`);
    return valid;
  });
  return {
    delivered: validTransfers
      .filter((transfer) => !transfer.dropped)
      .map((transfer) => ({ ...transfer, deliveredFrame: transfer.frame + Math.max(0, session.latencyFrames) })),
    timeouts: validTransfers
      .filter((transfer) => transfer.dropped)
      .map((transfer) => ({ ...transfer, timeoutFrame: transfer.frame + Math.max(1, session.timeoutFrames) })),
    errors
  };
}

const allowedPluginPermissions = new Set([
  "project.read",
  "project.write",
  "assets.read",
  "assets.write",
  "commands.register",
  "workspace.register"
]);

export function validatePluginDevelopmentManifest(manifest: {
  id?: string;
  version?: string;
  sdkVersion?: string;
  developmentEntry?: string;
  permissions?: string[];
}): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!manifest.id?.trim()) errors.push("ID do plugin ausente.");
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.version ?? "")) errors.push("Versao semver invalida.");
  if (manifest.sdkVersion !== undefined && !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.sdkVersion)) errors.push("Versao do SDK semver invalida.");
  if (!manifest.developmentEntry?.trim()) errors.push("Entrypoint de desenvolvimento ausente.");
  for (const permission of manifest.permissions ?? []) {
    if (!allowedPluginPermissions.has(permission)) errors.push(`Permissao nao declaravel: ${permission}`);
  }
  if ((manifest.permissions ?? []).includes("project.write")) warnings.push("O plugin pode alterar o projeto.");
  return { ok: errors.length === 0, errors, warnings };
}
