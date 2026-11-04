import type { GBAProjectData } from "./projectFile.js";

const records = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(row => row && typeof row === "object") : [];

export function assertSpriteScaleBudget(data: GBAProjectData): void {
  const animations = records(data.animations);
  const rooms = records(data.rooms).length ? records(data.rooms) : records(data.scenas);
  for (const room of rooms) {
    const sheets = new Set(records(data.actors).filter(actor => (actor.roomName ?? actor.sceneName) === room.name).map(actor => actor.spriteSheet));
    const scales = new Set<string>();
    for (const animation of animations.filter(row => sheets.has(row.spriteSheet))) {
      const x = animation.scaleX ?? 1, y = animation.scaleY ?? 1;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0.5 || x > 2 || y < 0.5 || y > 2)
        throw new Error(`Escala inválida na animação ${animation.name}: use 0,5 a 2 em cada eixo.`);
      if (x !== 1 || y !== 1) scales.add(`${Math.round(x * 256)}:${Math.round(y * 256)}`);
    }
    // Four flip combinations per pair; 16 automatic slots, 16 for native effects.
    if (scales.size > 4) throw new Error(`Cena ${room.name}: use até quatro pares de escala de sprites; as matrizes OBJ também atendem espelhamentos e efeitos nativos.`);
    if (scales.size) {
      const runtime = room.runtime as { config?: { capabilities?: Array<{ id: string; enabled?: boolean; settings?: { matrixIndex?: number } }> } } | undefined;
      const affine = runtime?.config?.capabilities?.find(row => row.id === "affine_obj" && row.enabled);
      if ((affine?.settings?.matrixIndex ?? 0) >= 16) throw new Error(`Cena ${room.name}: reserve as matrizes OBJ 16–31 para a escala das animações; use 0–15 no Affine OBJ da cena.`);
    }
  }
}
