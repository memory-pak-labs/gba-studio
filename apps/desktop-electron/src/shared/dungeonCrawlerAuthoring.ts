export interface DungeonCrawlerAuthoringEntity {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface DungeonCrawlerAuthoringInput {
  actors: readonly DungeonCrawlerAuthoringEntity[];
  background?: string | null;
  collisionTypes?: readonly unknown[];
  height: number;
  triggers: readonly DungeonCrawlerAuthoringEntity[];
  viewDistance: number;
  width: number;
}

export interface DungeonCrawlerAuthoringIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface DungeonCrawlerAuthoringSummary {
  actorCount: number;
  blockedCellCount: number;
  freeCellCount: number;
  hasAuthoredBackground: boolean;
  issues: DungeonCrawlerAuthoringIssue[];
  triggerCount: number;
}

function positiveInteger(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function entityFitsRoom(entity: DungeonCrawlerAuthoringEntity, width: number, height: number): boolean {
  const entityWidth = positiveInteger(entity.width);
  const entityHeight = positiveInteger(entity.height);
  return entity.x >= 0
    && entity.y >= 0
    && entity.x + entityWidth <= width
    && entity.y + entityHeight <= height;
}

export function deriveDungeonCrawlerAuthoringSummary(
  input: DungeonCrawlerAuthoringInput
): DungeonCrawlerAuthoringSummary {
  const width = positiveInteger(input.width);
  const height = positiveInteger(input.height);
  const cellCount = width * height;
  const collisionTypes = input.collisionTypes ?? [];
  const freeCellCount = collisionTypes.slice(0, cellCount).filter((type) => type === "free").length;
  const blockedCellCount = collisionTypes.slice(0, cellCount).filter((type) => type !== "free").length;
  const issues: DungeonCrawlerAuthoringIssue[] = [];
  const hasAuthoredBackground = typeof input.background === "string" && input.background.trim().length > 0;

  if (collisionTypes.length !== cellCount) {
    issues.push({
      code: "collision_layer_size",
      message: `A grade lógica precisa conter exatamente ${cellCount} células.`,
      severity: "error"
    });
  }

  if (!hasAuthoredBackground) {
    issues.push({
      code: "background_missing",
      message: "Sem fundo frontal: o preview usa a visualização procedural do Dungeon Crawler.",
      severity: "warning"
    });
  }

  if (width < 30 || height < 20) {
    issues.push({
      code: "room_below_gba_grid",
      message: "A grade é menor que 30×20 células, o espaço lógico recomendado para um viewport GBA.",
      severity: "warning"
    });
  }

  if (input.viewDistance > 8) {
    issues.push({
      code: "view_distance_runtime_cap",
      message: "A distância visual exportada atualmente é limitada a 8 profundidades; valores maiores não aparecem no viewport.",
      severity: "warning"
    });
  }

  if (collisionTypes.length === cellCount && freeCellCount === 0) {
    issues.push({
      code: "no_walkable_cells",
      message: "A grade não tem células livres para o jogador avançar.",
      severity: "warning"
    });
  }

  const actorsOutside = input.actors.filter((entity) => !entityFitsRoom(entity, width, height)).length;
  if (actorsOutside > 0) {
    issues.push({
      code: "actor_out_of_bounds",
      message: `${actorsOutside} ator(es) está(ão) fora dos limites da grade lógica.`,
      severity: "warning"
    });
  }

  const triggersOutside = input.triggers.filter((entity) => !entityFitsRoom(entity, width, height)).length;
  if (triggersOutside > 0) {
    issues.push({
      code: "trigger_out_of_bounds",
      message: `${triggersOutside} gatilho(s) ultrapassa(m) os limites da grade lógica.`,
      severity: "warning"
    });
  }

  return {
    actorCount: input.actors.length,
    blockedCellCount,
    freeCellCount,
    hasAuthoredBackground,
    issues,
    triggerCount: input.triggers.length
  };
}
