import { tileReplacementCollisionFields } from "./tileReplacement.js";

export interface MapStateTile {
  x: number;
  y: number;
  tile: number;
  count: number;
  layer: string;
  collision: string;
}
export interface MapStateVariant {
  id: string;
  name: string;
  value: number;
  tiles: MapStateTile[];
}
export interface MapStateDefinition {
  id: string;
  name: string;
  variable: string;
  variants: MapStateVariant[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Estado de mapa inválido.");
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(value)) throw new Error("Estado de mapa requer identificador sem espaços.");
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`Estado de mapa requer inteiro entre ${min} e ${max}.`);
  return value;
}

/** Complete variants restore the same ground cells, keeping visual/collision/save in sync. */
export function readMapStates(value: unknown, width: number, height: number): MapStateDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error("A cena aceita até 8 estados de mapa.");
  const occupied = new Set<string>(), ids = new Set<string>(), variables = new Set<string>();
  let commandCount = 0;
  const states = value.map((raw) => {
    const state = record(raw), id = identifier(state.id), variable = identifier(state.variable);
    if (ids.has(id) || variables.has(variable)) throw new Error("Estados de mapa requerem IDs e variáveis distintos na cena.");
    ids.add(id); variables.add(variable);
    if (!Array.isArray(state.variants) || state.variants.length < 2 || state.variants.length > 8) throw new Error("Um estado de mapa requer entre 2 e 8 variantes.");
    const variantIDs = new Set<string>(), values = new Set<number>();
    let footprint: string[] | undefined;
    const variants = state.variants.map((rawVariant) => {
      const variant = record(rawVariant), variantID = identifier(variant.id), variantValue = integer(variant.value, 0, 32767);
      if (variantIDs.has(variantID) || values.has(variantValue)) throw new Error("Variantes requerem IDs e valores distintos.");
      variantIDs.add(variantID); values.add(variantValue);
      if (!Array.isArray(variant.tiles) || variant.tiles.length < 1 || variant.tiles.length > 8) throw new Error("Uma variante requer entre 1 e 8 operações de tiles.");
      const cells = new Set<string>();
      const tiles = variant.tiles.map((rawTile) => {
        const tile = record(rawTile);
        const x = integer(tile.x, 0, Math.min(511, width - 1)), y = integer(tile.y, 0, Math.min(511, height - 1));
        const count = integer(tile.count, 1, Math.min(64, width - x));
        const tileIndex = integer(tile.tile, 0, 1024 - count);
        if (tile.layer !== "bg2" || typeof tile.collision !== "string" || tile.collision === "keep") throw new Error("Estado de mapa requer piso BG2 e colisão explícita.");
        tileReplacementCollisionFields(tile.collision, "bg2");
        for (let dx = 0; dx < count; ++dx) {
          const key = `${x + dx},${y}`;
          if (cells.has(key)) throw new Error("Operações de um estado de mapa não podem sobrepor células.");
          cells.add(key);
        }
        return { x, y, count, tile: tileIndex, layer: "bg2", collision: tile.collision };
      });
      const keys = [...cells].sort();
      if (footprint && JSON.stringify(footprint) !== JSON.stringify(keys)) throw new Error("As variantes devem cobrir as mesmas células.");
      footprint = keys;
      return { id: variantID, name: typeof variant.name === "string" ? variant.name : variantID, value: variantValue, tiles };
    });
    if (!values.has(0)) throw new Error("Estado de mapa requer uma variante inicial de valor 0.");
    for (const key of footprint ?? []) {
      if (occupied.has(key)) throw new Error("Estados de mapa diferentes não podem sobrepor células.");
      occupied.add(key);
    }
    commandCount += Math.max(...variants.map(variant => variant.tiles.length));
    return { id, name: typeof state.name === "string" ? state.name : id, variable, variants };
  });
  if (commandCount > 8 || occupied.size > 256) throw new Error("Estados de mapa excedem o limite por cena: 8 operações e 256 células.");
  return states;
}

export function roomMapStates(room: Record<string, unknown>): MapStateDefinition[] {
  const states = readMapStates(room.mapStates, Number(room.width), Number(room.height));
  if (states.length && !["topdown", "platformer"].includes(String(room.sceneType ?? "topdown"))) throw new Error("Estados de mapa são suportados em Topdown e Platformer.");
  return states;
}

export function mapStateTileCommands(variant: MapStateVariant): string[] {
  return variant.tiles.map(tile => `replace_tile_sequence ${tile.x} ${tile.y} ${tile.tile} ${tile.count} ${tile.layer} ${tile.collision}`);
}

export function resolveMapState(rooms: Record<string, unknown>[], id: string, variantID: string) {
  const matches = rooms.flatMap(room => roomMapStates(room).filter(state => state.id === id).map(state => ({ room, state })));
  if (matches.length !== 1) throw new Error(`Estado de mapa inexistente ou ambíguo: ${id}`);
  const match = matches[0]!;
  const variant = match.state.variants.find(item => item.id === variantID);
  if (!variant) throw new Error(`Variante de mapa inexistente: ${id}/${variantID}`);
  return { ...match, variant };
}
