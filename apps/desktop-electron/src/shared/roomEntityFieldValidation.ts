export type EntityGeometryField = "x" | "y" | "width" | "height";
export function roomEntityFieldValidation(entity: { kind: "actor" | "trigger"; name: string; x: number; y: number; width: number; height: number }, room: { width: number; height: number; sceneType?: string }) {
  const unit = room.sceneType === "dungeonCrawler" || room.sceneType === "isometric" ? "células" : "tiles";
  const limits = {
    x: { min: 0, max: room.width - (entity.kind === "trigger" ? entity.width : 1) },
    y: { min: 0, max: room.height - (entity.kind === "trigger" ? entity.height : 1) },
    width: { min: 1, max: room.width }, height: { min: 1, max: room.height }
  };
  const labels = { x: "X", y: "Y", width: "Largura", height: "Altura" };
  const errors: Partial<Record<EntityGeometryField, string>> = {};
  for (const field of Object.keys(limits) as EntityGeometryField[]) {
    if (entity.kind === "actor" && (field === "width" || field === "height")) continue;
    const { min, max } = limits[field], value = entity[field];
    if (!Number.isFinite(value) || value < min || value > max) errors[field] = `${entity.name}: ${labels[field]} = ${value}. Use um valor de ${min} a ${Math.max(min, max)} ${unit}${max < min ? "; reduza a área para caber na cena" : ""}.`;
  }
  return { limits, errors, unit };
}
