import { validateRoomEntitySchemaCoverage } from "../../../../packages/project-contract/src/index.js";
import type { GBAProjectData } from "./projectFile.js";
import { roomEntityFieldValidation, type EntityGeometryField } from "./roomEntityFieldValidation.js";

/** Only replace aggregate errors when every reported field has a concrete explanation. */
export function roomEntityProblems(data: GBAProjectData) {
  const scenes = [data.scenas, data.rooms].flatMap(value => Array.isArray(value) ? value : []);
  return validateRoomEntitySchemaCoverage(data).flatMap(issue => {
    if (issue.missingFields.length || issue.invalidFields.some(field => !["x", "y", "width", "height"].includes(field))) return [];
    const source = data[issue.source];
    const entity = Array.isArray(source) ? source[issue.itemIndex] : null;
    const room = scenes.find(item => item.name === entity?.roomName);
    if (!entity || !room || typeof entity.id !== "string" || typeof room.width !== "number" || typeof room.height !== "number") return [];
    const validation = roomEntityFieldValidation({ kind: issue.source === "actors" ? "actor" : "trigger", name: issue.itemName, x: Number(entity.x ?? 0), y: Number(entity.y ?? 0), width: Number(entity.width ?? 1), height: Number(entity.height ?? 1) }, { width: room.width, height: room.height, sceneType: String(room.sceneType ?? "") });
    if (issue.invalidFields.some(field => !validation.errors[field as EntityGeometryField])) return [];
    return [{ issue, entity, room, field: issue.invalidFields[0] as EntityGeometryField, message: issue.invalidFields.map(field => validation.errors[field as EntityGeometryField]).join(" ") }];
  });
}
