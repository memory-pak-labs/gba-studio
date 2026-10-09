export interface SaveMenuBuilderConfig {
  enabled: boolean;
  profileId?: string;
  customLabels?: boolean;
  slotCount: number;
  selectedSlot: number;
  layout: "cards" | "list";
  confirmDelete: boolean;
  actions: { continue: string; load: string; delete: string };
  metadata: { playerName: boolean; playTime: boolean; location: boolean };
}
export interface SaveMenuSlotMetadata {
  slot: number;
  present: boolean;
  playerName?: string;
  playTimeFrames?: number;
  location?: string;
}

export interface SaveMenuSlotCard {
  slot: number;
  present: boolean;
  selected: boolean;
  playerName: string;
  playTime: string;
  location: string;
}

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function label(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function deriveSaveMenuBuilder(settings: Record<string, unknown> | null | undefined): SaveMenuBuilderConfig {
  const source = settings ?? {};
  const slotCount = Math.max(1, Math.min(8, integer(source.slots, 3)));
  return {
    enabled: flag(source.manualSave, true),
    ...(label(source.profileId, "") ? { profileId: label(source.profileId, "") } : {}),
    ...(Object.hasOwn(source, "customLabels") ? { customLabels: flag(source.customLabels, false) } : {}),
    slotCount,
    selectedSlot: Math.max(1, Math.min(slotCount, integer(source.selectedSlot, 1))),
    layout: source.menuLayout === "list" ? "list" : "cards",
    confirmDelete: flag(source.confirmDelete, true),
    actions: {
      continue: label(source.continueLabel, "Continuar"),
      load: label(source.loadLabel, "Carregar"),
      delete: label(source.deleteLabel, "Apagar")
    },
    metadata: {
      playerName: flag(source.showPlayerName, true),
      playTime: flag(source.showPlayTime, true),
      location: flag(source.showLocation, true)
    }
  };
}

export function formatSavePlayTime(playTimeFrames: number): string {
  const seconds = Math.max(0, Math.floor(playTimeFrames / 60));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function saveMenuSlotCards(config: SaveMenuBuilderConfig, metadata: SaveMenuSlotMetadata[] = []): SaveMenuSlotCard[] {
  const bySlot = new Map(metadata.map((entry) => [entry.slot, entry]));
  return Array.from({ length: config.slotCount }, (_, index) => {
    const slot = index + 1;
    const entry = bySlot.get(slot);
    return {
      slot,
      present: entry?.present === true,
      selected: config.selectedSlot === slot,
      playerName: entry?.playerName?.trim() || "Sem nome",
      playTime: formatSavePlayTime(entry?.playTimeFrames ?? 0),
      location: entry?.location?.trim() || "Slot vazio"
    };
  });
}
