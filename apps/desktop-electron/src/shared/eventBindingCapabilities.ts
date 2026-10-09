export type EventBindingCapabilityTargetKind = "room" | "actor" | "trigger";
export type EventBindingCapabilityActorRole = "actor" | "player";

export interface EventBindingCapabilityInput {
  targetKind: EventBindingCapabilityTargetKind;
  actorRole?: EventBindingCapabilityActorRole | null;
  sceneType?: string | null;
  runtimeType?: string | null;
  collisionGroup?: number | null;
  menuActorRole?: string | null;
  menuItemID?: string | null;
}

export interface EventBindingCapability {
  bindingKey: string;
  label: string;
  section: string | null;
  requiresFrequency: boolean;
  groupedBindingKeys?: Array<{
    bindingKey: string;
    label: string;
  }>;
}

const triggerCapabilities: EventBindingCapability[] = [
  { bindingKey: "onEnter", label: "Ao entrar", section: null, requiresFrequency: false },
  { bindingKey: "onLeave", label: "Ao sair", section: null, requiresFrequency: false }
];

const pointClickTriggerCapabilities: EventBindingCapability[] = [
  { bindingKey: "onInteract", label: "Ao clicar / pressionar A", section: null, requiresFrequency: false }
];

const standardActorCapabilities: EventBindingCapability[] = [
  { bindingKey: "onInit", label: "Ao iniciar", section: null, requiresFrequency: false },
  { bindingKey: "onInteract", label: "Ao interagir", section: null, requiresFrequency: false },
  { bindingKey: "onUpdate", label: "Ao atualizar", section: null, requiresFrequency: true }
];

const playerCapabilities: EventBindingCapability[] = [
  { bindingKey: "onInit", label: "Ao iniciar", section: null, requiresFrequency: false },
  { bindingKey: "onUpdate", label: "Ao atualizar", section: null, requiresFrequency: true }
];

const actorHitCapability: EventBindingCapability = {
  bindingKey: "onHit",
  label: "Ao acertar",
  section: null,
  requiresFrequency: false
};

const standardRoomCapabilities: EventBindingCapability[] = [
  { bindingKey: "onInit", label: "Ao iniciar", section: null, requiresFrequency: false },
  {
    bindingKey: "onHitPlayer",
    label: "Ao acertar Player",
    section: null,
    requiresFrequency: false,
    groupedBindingKeys: [
      { bindingKey: "onHitGroup1", label: "Grupo 1" },
      { bindingKey: "onHitGroup2", label: "Grupo 2" },
      { bindingKey: "onHitGroup3", label: "Grupo 3" }
    ]
  }
];

function normalizedRuntime(input: EventBindingCapabilityInput): string {
  return (input.runtimeType ?? input.sceneType ?? "topdown")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function resolveEventBindingCapabilities(input: EventBindingCapabilityInput): EventBindingCapability[] {
  const runtime = normalizedRuntime(input);
  if (input.targetKind === "trigger") {
    return runtime === "pointandclick" ? pointClickTriggerCapabilities : triggerCapabilities;
  }
  if (input.targetKind === "actor") {
    // A selected actor always owns the same event lifecycle, regardless of the
    // scene runtime. Menu metadata describes visual composition and selection;
    // it must not remove the actor's editable event states.
    if (input.actorRole === "player") return playerCapabilities;
    return Number.isFinite(input.collisionGroup) && Number(input.collisionGroup) > 0
      ? [...standardActorCapabilities, actorHitCapability]
      : standardActorCapabilities;
  }

  const lifecycle = [standardRoomCapabilities[0]!];
  if (["topdown", "platformer", "isometric"].includes(runtime)) {
    lifecycle.push(standardRoomCapabilities[1]!);
    lifecycle.push({ bindingKey: "onExit", label: "Ao sair", section: null, requiresFrequency: false });
    lifecycle.push(runtime === "topdown"
      ? { bindingKey: "onInteract", label: "Ao interagir", section: null, requiresFrequency: false }
      : { bindingKey: "onUpdate", label: "Ao atualizar", section: null, requiresFrequency: true });
  }
  if (["racing", "luta", "battlerpg"].includes(runtime)) {
    lifecycle.push(
      { bindingKey: "onVictory", label: "Ao vencer", section: null, requiresFrequency: false },
      { bindingKey: "onDefeat", label: "Ao perder", section: null, requiresFrequency: false }
    );
  }
  if (runtime === "battlerpg") lifecycle.push({ bindingKey: "onEscape", label: "Ao fugir", section: null, requiresFrequency: false });
  if (runtime === "shmup") lifecycle.push({ bindingKey: "onClear", label: "Ao concluir ondas", section: null, requiresFrequency: false });
  return lifecycle;
}
