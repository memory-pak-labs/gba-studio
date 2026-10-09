import type { GBAProjectData } from "../projectFile.js";
import {
  nextPaletteFamilyID,
  nextPaletteFamilyName,
  readPaletteFamilies,
  setColorSelectionInEditorState,
  type PaletteFamilyRecord,
  type PaletteSlot
} from "./core.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function getPaletteFamilies(data: GBAProjectData): PaletteFamilyRecord[] {
  const records = Array.isArray(data.paletteFamilies) ? data.paletteFamilies.filter(isRecord) : [];
  const seen = new Set<string>();
  const families: PaletteFamilyRecord[] = [];
  for (const record of records) {
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const parsePalette = (value: unknown): number[] =>
      (Array.isArray(value) ? value : [])
        .filter((e): e is number => Number.isInteger(e) && e >= 0 && e <= 0x7fff)
        .slice(0, 16);
    families.push({
      id,
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : id,
      background: parsePalette(record.background),
      objects: parsePalette(record.objects)
    });
  }
  return families;
}

function setPaletteFamilies(data: GBAProjectData, families: PaletteFamilyRecord[]): GBAProjectData {
  const next = cloneProjectData(data);
  next.paletteFamilies = families;
  return next;
}

function makeDefaultPalette(): number[] {
  return Array.from({ length: 16 }, () => 0);
}

export function createPaletteFamilyInProject(
  data: GBAProjectData,
  name?: string
): GBAProjectData {
  const id = nextPaletteFamilyID(data);
  const familyName = name ?? nextPaletteFamilyName(data);
  const family: PaletteFamilyRecord = {
    id,
    name: familyName,
    background: makeDefaultPalette(),
    objects: makeDefaultPalette()
  };
  const families = getPaletteFamilies(data);
  const next = setPaletteFamilies(data, [...families, family]);
  return setColorSelectionInEditorState(next, id);
}

export function duplicatePaletteFamilyInProject(
  data: GBAProjectData,
  sourceFamilyID: string
): GBAProjectData {
  const families = getPaletteFamilies(data);
  const source = families.find((f) => f.id === sourceFamilyID);
  if (!source) return data;

  const newID = nextPaletteFamilyID(data);
  const duplicate: PaletteFamilyRecord = {
    id: newID,
    name: `${source.name} (cópia)`,
    background: [...source.background],
    objects: [...source.objects]
  };

  const sourceIndex = families.findIndex((f) => f.id === sourceFamilyID);
  const nextFamilies = [...families];
  nextFamilies.splice(sourceIndex + 1, 0, duplicate);

  const next = setPaletteFamilies(data, nextFamilies);
  return setColorSelectionInEditorState(next, newID);
}

export function renamePaletteFamilyInProject(
  data: GBAProjectData,
  familyID: string,
  newName: string
): GBAProjectData {
  const trimmed = newName.trim();
  if (!trimmed) return data;

  const families = getPaletteFamilies(data);
  const index = families.findIndex((f) => f.id === familyID);
  if (index < 0) return data;

  const nextFamilies = [...families];
  nextFamilies[index] = { ...nextFamilies[index], name: trimmed };
  return setPaletteFamilies(data, nextFamilies);
}

export function removePaletteFamilyInProject(
  data: GBAProjectData,
  familyID: string
): GBAProjectData {
  const families = getPaletteFamilies(data);
  const filtered = families.filter((f) => f.id !== familyID);
  if (filtered.length === families.length) return data;

  let next = setPaletteFamilies(data, filtered);

  const rooms = Array.isArray(next.rooms) ? [...next.rooms] : [];
  const scenas = Array.isArray(next.scenas) ? [...next.scenas] : [];
  let changed = false;

  for (const collection of [rooms, scenas]) {
    for (let i = 0; i < collection.length; i++) {
      const room = collection[i];
      if (!isRecord(room)) continue;
      if (typeof room.paletteFamilyID === "string" && room.paletteFamilyID === familyID) {
        collection[i] = { ...room };
        delete (collection[i] as Record<string, unknown>).paletteFamilyID;
        changed = true;
      }
    }
  }

  if (changed) {
    next = cloneProjectData(next);
    if (rooms.length > 0) next.rooms = rooms;
    if (scenas.length > 0) next.scenas = scenas;
  }

  const currentSelection = typeof next.editorState === "object"
    && next.editorState !== null
    && !Array.isArray(next.editorState)
    && typeof (next.editorState as Record<string, unknown>).colorsSelectedFamilyID === "string"
    ? (next.editorState as Record<string, unknown>).colorsSelectedFamilyID as string
    : null;

  if (currentSelection === familyID) {
    next = setColorSelectionInEditorState(next, filtered[0]?.id ?? null);
  }

  return next;
}

export function setPaletteColorInProject(
  data: GBAProjectData,
  familyID: string,
  slot: PaletteSlot,
  colorIndex: number,
  rgb555Value: number
): GBAProjectData {
  if (colorIndex < 0 || colorIndex > 15) return data;
  const clampedValue = rgb555Value & 0x7fff;

  const families = getPaletteFamilies(data);
  const index = families.findIndex((f) => f.id === familyID);
  if (index < 0) return data;

  const family = families[index];
  const palette = slot === "background" ? [...family.background] : [...family.objects];

  while (palette.length <= colorIndex) {
    palette.push(0);
  }
  palette[colorIndex] = clampedValue;

  const nextFamilies = [...families];
  nextFamilies[index] = {
    ...family,
    [slot]: palette
  };
  return setPaletteFamilies(data, nextFamilies);
}

export function resetPaletteColorInProject(
  data: GBAProjectData,
  familyID: string,
  slot: PaletteSlot,
  colorIndex: number
): GBAProjectData {
  return setPaletteColorInProject(data, familyID, slot, colorIndex, 0);
}

export function optimizeDuplicateColorsInFamily(
  data: GBAProjectData,
  familyID: string
): GBAProjectData {
  const families = getPaletteFamilies(data);
  const index = families.findIndex((f) => f.id === familyID);
  if (index < 0) return data;

  const family = families[index];
  const deduplicate = (palette: number[]): number[] => {
    const seen = new Set<number>();
    const result: number[] = [];
    for (const color of palette) {
      if (!seen.has(color)) {
        seen.add(color);
        result.push(color);
      }
    }
    return result;
  };

  const nextFamilies = [...families];
  nextFamilies[index] = {
    ...family,
    background: deduplicate(family.background),
    objects: deduplicate(family.objects)
  };
  return setPaletteFamilies(data, nextFamilies);
}

export function setSelectedColorsFamilyIDInProject(
  data: GBAProjectData,
  familyID: string | null
): GBAProjectData {
  return setColorSelectionInEditorState(data, familyID);
}

export function reorderPaletteFamiliesInProject(
  data: GBAProjectData,
  fromIndex: number,
  toIndex: number
): GBAProjectData {
  const families = getPaletteFamilies(data);
  if (
    fromIndex < 0 || fromIndex >= families.length ||
    toIndex < 0 || toIndex >= families.length ||
    fromIndex === toIndex
  ) return data;

  const nextFamilies = [...families];
  const [moved] = nextFamilies.splice(fromIndex, 1);
  nextFamilies.splice(toIndex, 0, moved);
  return setPaletteFamilies(data, nextFamilies);
}

export function reorderPaletteColorInProject(
  data: GBAProjectData,
  familyID: string,
  slot: PaletteSlot,
  fromIndex: number,
  toIndex: number
): GBAProjectData {
  if (
    fromIndex < 0 || fromIndex > 15 ||
    toIndex < 0 || toIndex > 15 ||
    fromIndex === toIndex
  ) return data;

  const families = getPaletteFamilies(data);
  const index = families.findIndex((f) => f.id === familyID);
  if (index < 0) return data;

  const family = families[index];
  const palette = [...(slot === "background" ? family.background : family.objects)];

  while (palette.length <= Math.max(fromIndex, toIndex)) {
    palette.push(0);
  }

  const [moved] = palette.splice(fromIndex, 1);
  palette.splice(toIndex, 0, moved);

  const nextFamilies = [...families];
  nextFamilies[index] = { ...family, [slot]: palette };
  return setPaletteFamilies(data, nextFamilies);
}

export function copyPaletteSlotInProject(
  data: GBAProjectData,
  sourceFamilyID: string,
  sourceSlot: PaletteSlot,
  targetFamilyID: string,
  targetSlot: PaletteSlot
): GBAProjectData {
  const families = getPaletteFamilies(data);
  const sourceFamily = families.find((f) => f.id === sourceFamilyID);
  const targetIndex = families.findIndex((f) => f.id === targetFamilyID);
  if (!sourceFamily || targetIndex < 0) return data;

  const sourcePalette = sourceSlot === "background" ? sourceFamily.background : sourceFamily.objects;
  const nextFamilies = [...families];
  nextFamilies[targetIndex] = {
    ...families[targetIndex],
    [targetSlot]: [...sourcePalette]
  };
  return setPaletteFamilies(data, nextFamilies);
}

export function pastePaletteSlotFromClipboard(
  data: GBAProjectData,
  clipboardPalette: number[],
  targetFamilyID: string,
  targetSlot: PaletteSlot
): GBAProjectData {
  const families = getPaletteFamilies(data);
  const targetIndex = families.findIndex((f) => f.id === targetFamilyID);
  if (targetIndex < 0) return data;

  const clamped = clipboardPalette
    .filter((e): e is number => Number.isInteger(e) && e >= 0 && e <= 0x7fff)
    .slice(0, 16);

  const nextFamilies = [...families];
  nextFamilies[targetIndex] = {
    ...families[targetIndex],
    [targetSlot]: clamped
  };
  return setPaletteFamilies(data, nextFamilies);
}

export function generateAutomaticFamiliesFromAssets(
  data: GBAProjectData
): GBAProjectData {
  const existingFamilies = getPaletteFamilies(data);
  const nonAuto = existingFamilies.filter((f) => !f.id.startsWith("auto_"));

  const tilesets = Array.isArray(data.tilesets) ? data.tilesets : [];
  const sprites = Array.isArray(data.spriteSheets) ? data.spriteSheets : [];
  const newFamilies: PaletteFamilyRecord[] = [];
  let autoIndex = 0;

  for (const asset of [...tilesets, ...sprites]) {
    if (!isRecord(asset)) continue;
    const pixels = Array.isArray(asset.pixels) ? asset.pixels : [];
    if (pixels.length === 0) continue;

    const colorSet = new Set<number>();
    for (const pixel of pixels) {
      if (Number.isInteger(pixel) && pixel >= 0 && pixel <= 0x7fff) {
        colorSet.add(pixel);
      }
    }

    const uniqueColors = Array.from(colorSet);
    if (uniqueColors.length === 0) continue;

    const bgColors = uniqueColors.slice(0, 16);
    const objColors = uniqueColors.slice(0, 16);

    const assetName = typeof asset.name === "string" && asset.name.trim()
      ? asset.name.trim()
      : `Asset ${autoIndex + 1}`;

    newFamilies.push({
      id: `auto_${++autoIndex}`,
      name: `Auto: ${assetName}`,
      background: bgColors,
      objects: objColors
    });
  }

  if (newFamilies.length === 0) return data;

  const next = setPaletteFamilies(data, [...nonAuto, ...newFamilies]);
  return next;
}
