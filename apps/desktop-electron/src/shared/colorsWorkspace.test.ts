import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import {
  deriveColorsWorkspacePresentation,
  readPaletteFamilies,
  colorsSelectionInEditorState,
  nextPaletteFamilyID,
  nextPaletteFamilyName,
  type PaletteFamilyRecord
} from "./colorsWorkspace/core.js";
import {
  createPaletteFamilyInProject,
  duplicatePaletteFamilyInProject,
  renamePaletteFamilyInProject,
  removePaletteFamilyInProject,
  setPaletteColorInProject,
  resetPaletteColorInProject,
  optimizeDuplicateColorsInFamily,
  setSelectedColorsFamilyIDInProject,
  reorderPaletteFamiliesInProject,
  reorderPaletteColorInProject,
  copyPaletteSlotInProject,
  pastePaletteSlotFromClipboard,
  generateAutomaticFamiliesFromAssets
} from "./colorsWorkspace/mutations.js";

function addPaletteFamily(data: ReturnType<typeof createBlankProjectData>, family: PaletteFamilyRecord): ReturnType<typeof createBlankProjectData> {
  const next = { ...data };
  next.paletteFamilies = [...(Array.isArray(next.paletteFamilies) ? next.paletteFamilies : []), family];
  return next;
}

describe("colorsWorkspace", () => {
  describe("readPaletteFamilies", () => {
    it("reads palette families from project data", () => {
      const project = createBlankProjectData({ name: "Teste" });
      project.paletteFamilies = [
        { id: "family-1", name: "Família 1", background: [0x0000, 0x7fff], objects: [0x01e0] }
      ];

      const families = readPaletteFamilies(project);
      expect(families).toHaveLength(1);
      expect(families[0]).toEqual({
        id: "family-1",
        name: "Família 1",
        background: [0x0000, 0x7fff],
        objects: [0x01e0]
      });
    });

    it("deduplicates families by ID keeping first", () => {
      const project = createBlankProjectData({ name: "Teste" });
      project.paletteFamilies = [
        { id: "family-1", name: "Primeira", background: [0x0000], objects: [] },
        { id: "family-1", name: "Duplicata", background: [0x7fff], objects: [] }
      ];

      const families = readPaletteFamilies(project);
      expect(families).toHaveLength(1);
      expect(families[0].name).toBe("Primeira");
    });

    it("clamps colors to RGB555 range", () => {
      const project = createBlankProjectData({ name: "Teste" });
      project.paletteFamilies = [
        { id: "family-1", name: "Test", background: [0x8000, -1, 0x7fff, 99999], objects: [] }
      ];

      const families = readPaletteFamilies(project);
      expect(families[0].background).toEqual([0x7fff]);
    });

    it("limits palette to 16 colors", () => {
      const project = createBlankProjectData({ name: "Teste" });
      project.paletteFamilies = [
        { id: "family-1", name: "Test", background: Array.from({ length: 20 }, (_, i) => i), objects: [] }
      ];

      const families = readPaletteFamilies(project);
      expect(families[0].background).toHaveLength(16);
    });
  });

  describe("deriveColorsWorkspacePresentation", () => {
    it("derives empty presentation for project without families", () => {
      const project = createBlankProjectData({ name: "Vazio" });
      const presentation = deriveColorsWorkspacePresentation(project);

      expect(presentation.families).toHaveLength(0);
      expect(presentation.selectedFamilyID).toBeNull();
      expect(presentation.summary).toBe("0 famílias");
    });

    it("derives families with usage counts from rooms", () => {
      let project = createBlankProjectData({ name: "Com uso" });
      project = addPaletteFamily(project, {
        id: "forest",
        name: "Floresta",
        background: [0x0000, 0x01e0],
        objects: [0x0000]
      });
      project = addPaletteFamily(project, {
        id: "cave",
        name: "Caverna",
        background: [0x7fff],
        objects: []
      });
      (project.scenas as Record<string, unknown>[])[0].paletteFamilyID = "forest";

      const presentation = deriveColorsWorkspacePresentation(project);
      expect(presentation.families).toHaveLength(2);

      const forest = presentation.families.find((f) => f.id === "forest")!;
      expect(forest.usageCount).toBe(1);
      expect(forest.usageLabels).toContain("cena_1");

      const cave = presentation.families.find((f) => f.id === "cave")!;
      expect(cave.usageCount).toBe(0);
    });

    it("selects first family by default", () => {
      let project = createBlankProjectData({ name: "Seleção" });
      project = addPaletteFamily(project, {
        id: "family-a",
        name: "A",
        background: [0x0000],
        objects: []
      });
      project = addPaletteFamily(project, {
        id: "family-b",
        name: "B",
        background: [0x7fff],
        objects: []
      });

      const presentation = deriveColorsWorkspacePresentation(project);
      expect(presentation.selectedFamilyID).toBe("family-a");
      expect(presentation.selectedFamily?.name).toBe("A");
    });

    it("respects explicit selectedFamilyID", () => {
      let project = createBlankProjectData({ name: "Seleção" });
      project = addPaletteFamily(project, {
        id: "family-a",
        name: "A",
        background: [0x0000],
        objects: []
      });
      project = addPaletteFamily(project, {
        id: "family-b",
        name: "B",
        background: [0x7fff],
        objects: []
      });

      const presentation = deriveColorsWorkspacePresentation(project, "family-b");
      expect(presentation.selectedFamilyID).toBe("family-b");
    });

    it("marks families with empty palettes as having problems", () => {
      let project = createBlankProjectData({ name: "Problemas" });
      project = addPaletteFamily(project, {
        id: "empty",
        name: "Vazia",
        background: [],
        objects: []
      });
      project = addPaletteFamily(project, {
        id: "ok",
        name: "OK",
        background: [0x0000],
        objects: []
      });

      const presentation = deriveColorsWorkspacePresentation(project);
      expect(presentation.families.find((f) => f.id === "empty")?.hasProblems).toBe(true);
      expect(presentation.families.find((f) => f.id === "ok")?.hasProblems).toBe(false);
    });

    it("computes bank usage", () => {
      let project = createBlankProjectData({ name: "Bancos" });
      project = addPaletteFamily(project, {
        id: "f1",
        name: "F1",
        background: [0x0000],
        objects: [0x0000]
      });
      project = addPaletteFamily(project, {
        id: "f2",
        name: "F2",
        background: [0x7fff],
        objects: []
      });
      (project.scenas as Record<string, unknown>[])[0].paletteFamilyID = "f1";
      (project.scenas as Record<string, unknown>[]).push({
        id: "cena_2",
        name: "cena_2",
        sceneType: "topdown",
        paletteFamilyID: "f2"
      });

      const presentation = deriveColorsWorkspacePresentation(project);
      expect(presentation.bankUsage.bgOccupied).toBe(2);
      expect(presentation.bankUsage.objOccupied).toBe(1);
      expect(presentation.bankUsage.assignedRoomCount).toBe(2);
      expect(presentation.bankUsage.unassignedRoomCount).toBe(0);
      expect(presentation.bankUsage.consumers.map((consumer) => consumer.familyID)).toEqual(["f1", "f2"]);
    });

    it("reports rooms without a family and shared assets crossing palette families", () => {
      let project = createBlankProjectData({ name: "Diagnóstico" });
      project = addPaletteFamily(project, {
        id: "forest",
        name: "Floresta",
        background: [0x0000],
        objects: [0x0000]
      });
      project = addPaletteFamily(project, {
        id: "cave",
        name: "Caverna",
        background: [0x7fff],
        objects: [0x7fff]
      });
      project.scenas = [
        { id: "porto", name: "Porto", sceneType: "topdown", paletteFamilyID: "forest", backgroundAssetName: "shared-bg.png" },
        { id: "dungeon", name: "Dungeon", sceneType: "dungeonCrawler", paletteFamilyID: "cave", backgroundAssetName: "shared-bg.png" },
        { id: "menu", name: "Menu", sceneType: "menu", backgroundAssetName: "menu.png" }
      ];
      project.rooms = [];
      project.actors = [{ name: "Nara", spriteSheet: "nara.png", roomName: "Porto" }, { name: "Nara", spriteSheet: "nara.png", roomName: "Dungeon" }];

      const presentation = deriveColorsWorkspacePresentation(project);
      expect(presentation.bankUsage.unassignedRoomCount).toBe(1);
      expect(presentation.paletteConflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          assetName: "nara.png",
          kind: "sprite",
          reason: "multiple-families",
          resolution: "sprite-variant",
          references: expect.arrayContaining([
            expect.objectContaining({ roomName: "Porto", source: "family", familyID: "forest" }),
            expect.objectContaining({ roomName: "Dungeon", source: "family", familyID: "cave" })
          ])
        }),
        expect.objectContaining({ assetName: "shared-bg.png", kind: "tileset", reason: "multiple-families", resolution: "background-repack-or-policy" })
      ]));
    });

    it("reports when a background budget is reduced by the scene policy", () => {
      const project = createBlankProjectData({ name: "Orçamento de paleta" });
      project.scenas = [{
        id: "dialogue",
        name: "Dialogue",
        sceneType: "cutscene",
        backgroundAssetName: "wide.png",
        paletteBankPolicy: "shared-ui"
      }];
      project.rooms = [];
      project.assets = [{
        name: "wide.png",
        kind: "Background",
        metadata: { backgroundPaletteBankBudget: 16, paletteBankCount: 16 }
      }];

      const presentation = deriveColorsWorkspacePresentation(project);
      expect(presentation.paletteBudgetWarnings).toEqual([{
        assetName: "wide.png",
        requestedBanks: 16,
        detectedBanks: 16,
        effectiveBanks: 14,
        policy: "shared-ui",
        roomNames: ["Dialogue"]
      }]);
    });

    it("does not warn when the measured bank count fits the scene policy", () => {
      const project = createBlankProjectData({ name: "Bancos medidos" });
      project.scenas = [{
        id: "platformer",
        name: "Platformer",
        sceneType: "platformer",
        backgroundAssetName: "layers.png",
        paletteBankPolicy: "shared-ui"
      }];
      project.rooms = [];
      project.assets = [{
        name: "layers.png",
        kind: "Background",
        metadata: { backgroundPaletteBankBudget: 16, paletteBankCount: 1 }
      }];

      expect(deriveColorsWorkspacePresentation(project).paletteBudgetWarnings).toEqual([]);
    });
  });

  describe("mutations", () => {
    it("creates a new palette family", () => {
      const project = createBlankProjectData({ name: "Criar" });
      const next = createPaletteFamilyInProject(project);

      const families = readPaletteFamilies(next);
      expect(families).toHaveLength(1);
      expect(families[0].name).toMatch(/^Nova família/);
      expect(families[0].background).toHaveLength(16);
      expect(families[0].objects).toHaveLength(16);
    });

    it("creates a palette family with custom name", () => {
      const project = createBlankProjectData({ name: "Criar" });
      const next = createPaletteFamilyInProject(project, "Minha Paleta");

      const families = readPaletteFamilies(next);
      expect(families[0].name).toBe("Minha Paleta");
    });

    it("duplicates a palette family", () => {
      let project = createBlankProjectData({ name: "Duplicar" });
      project = addPaletteFamily(project, {
        id: "original",
        name: "Original",
        background: [0x0000, 0x7fff],
        objects: [0x01e0]
      });

      const next = duplicatePaletteFamilyInProject(project, "original");
      const families = readPaletteFamilies(next);
      expect(families).toHaveLength(2);
      expect(families[1].name).toBe("Original (cópia)");
      expect(families[1].background).toEqual([0x0000, 0x7fff]);
      expect(families[1].objects).toEqual([0x01e0]);
    });

    it("renames a palette family", () => {
      let project = createBlankProjectData({ name: "Renomear" });
      project = addPaletteFamily(project, {
        id: "family-1",
        name: "Antigo",
        background: [],
        objects: []
      });

      const next = renamePaletteFamilyInProject(project, "family-1", "Novo Nome");
      const families = readPaletteFamilies(next);
      expect(families[0].name).toBe("Novo Nome");
    });

    it("removes a palette family", () => {
      let project = createBlankProjectData({ name: "Remover" });
      project = addPaletteFamily(project, {
        id: "family-1",
        name: "Para remover",
        background: [],
        objects: []
      });

      const next = removePaletteFamilyInProject(project, "family-1");
      const families = readPaletteFamilies(next);
      expect(families).toHaveLength(0);
    });

    it("removes paletteFamilyID from rooms when family is removed", () => {
      let project = createBlankProjectData({ name: "Remover" });
      project = addPaletteFamily(project, {
        id: "family-1",
        name: "Para remover",
        background: [],
        objects: []
      });
      (project.scenas as Record<string, unknown>[])[0].paletteFamilyID = "family-1";

      const next = removePaletteFamilyInProject(project, "family-1");
      const room = (next.scenas as Record<string, unknown>[])[0];
      expect(room.paletteFamilyID).toBeUndefined();
    });

    it("sets a palette color", () => {
      let project = createBlankProjectData({ name: "Cor" });
      project = addPaletteFamily(project, {
        id: "family-1",
        name: "Test",
        background: [0x0000],
        objects: []
      });

      const next = setPaletteColorInProject(project, "family-1", "background", 0, 0x7fff);
      const families = readPaletteFamilies(next);
      expect(families[0].background[0]).toBe(0x7fff);
    });

    it("resets a palette color to black", () => {
      let project = createBlankProjectData({ name: "Reset" });
      project = addPaletteFamily(project, {
        id: "family-1",
        name: "Test",
        background: [0x7fff],
        objects: []
      });

      const next = resetPaletteColorInProject(project, "family-1", "background", 0);
      const families = readPaletteFamilies(next);
      expect(families[0].background[0]).toBe(0);
    });

    it("optimizes duplicate colors", () => {
      let project = createBlankProjectData({ name: "Otimizar" });
      project = addPaletteFamily(project, {
        id: "family-1",
        name: "Test",
        background: [0x0000, 0x7fff, 0x0000, 0x7fff, 0x01e0],
        objects: []
      });

      const next = optimizeDuplicateColorsInFamily(project, "family-1");
      const families = readPaletteFamilies(next);
      expect(families[0].background).toEqual([0x0000, 0x7fff, 0x01e0]);
    });

    it("sets selected family ID in editor state", () => {
      const project = createBlankProjectData({ name: "Seleção" });
      const next = setSelectedColorsFamilyIDInProject(project, "family-1");

      expect(colorsSelectionInEditorState(next)).toBe("family-1");
    });

    it("clears selected family ID", () => {
      const project = createBlankProjectData({ name: "Seleção" });
      let next = setSelectedColorsFamilyIDInProject(project, "family-1");
      next = setSelectedColorsFamilyIDInProject(next, null);

      expect(colorsSelectionInEditorState(next)).toBeNull();
    });

    it("reorders palette families", () => {
      let project = createBlankProjectData({ name: "Reorder" });
      project = addPaletteFamily(project, {
        id: "f1",
        name: "Primeira",
        background: [0x0000],
        objects: []
      });
      project = addPaletteFamily(project, {
        id: "f2",
        name: "Segunda",
        background: [0x7fff],
        objects: []
      });
      project = addPaletteFamily(project, {
        id: "f3",
        name: "Terceira",
        background: [0x01e0],
        objects: []
      });

      const next = reorderPaletteFamiliesInProject(project, 0, 2);
      const families = readPaletteFamilies(next);
      expect(families[0].id).toBe("f2");
      expect(families[1].id).toBe("f3");
      expect(families[2].id).toBe("f1");
    });

    it("returns same data when reordering with same index", () => {
      let project = createBlankProjectData({ name: "Reorder" });
      project = addPaletteFamily(project, {
        id: "f1",
        name: "Primeira",
        background: [0x0000],
        objects: []
      });

      const next = reorderPaletteFamiliesInProject(project, 0, 0);
      expect(next).toBe(project);
    });

    it("reorders palette colors within a slot", () => {
      let project = createBlankProjectData({ name: "Color Reorder" });
      project = addPaletteFamily(project, {
        id: "f1",
        name: "Test",
        background: [0x0000, 0x7fff, 0x01e0],
        objects: []
      });

      const next = reorderPaletteColorInProject(project, "f1", "background", 0, 2);
      const families = readPaletteFamilies(next);
      expect(families[0].background).toEqual([0x7fff, 0x01e0, 0x0000]);
    });

    it("copies palette slot from one family to another", () => {
      let project = createBlankProjectData({ name: "Copy" });
      project = addPaletteFamily(project, {
        id: "source",
        name: "Origem",
        background: [0x0000, 0x7fff],
        objects: [0x01e0]
      });
      project = addPaletteFamily(project, {
        id: "target",
        name: "Destino",
        background: [],
        objects: []
      });

      const next = copyPaletteSlotInProject(project, "source", "background", "target", "objects");
      const families = readPaletteFamilies(next);
      expect(families[1].objects).toEqual([0x0000, 0x7fff]);
    });

    it("paste palette slot from clipboard", () => {
      let project = createBlankProjectData({ name: "Paste" });
      project = addPaletteFamily(project, {
        id: "f1",
        name: "Test",
        background: [],
        objects: []
      });

      const clipboard = [0x0000, 0x7fff, 0x01e0];
      const next = pastePaletteSlotFromClipboard(project, clipboard, "f1", "background");
      const families = readPaletteFamilies(next);
      expect(families[0].background).toEqual([0x0000, 0x7fff, 0x01e0]);
    });

    it("generates automatic families from assets", () => {
      let project = createBlankProjectData({ name: "Auto" });
      project.tilesets = [
        { name: "Tileset 1", pixels: [0x0000, 0x7fff, 0x01e0] },
        { name: "Tileset 2", pixels: [0x0000, 0x7c00] }
      ];

      const next = generateAutomaticFamiliesFromAssets(project);
      const families = readPaletteFamilies(next);
      expect(families).toHaveLength(2);
      expect(families[0].id).toMatch(/^auto_/);
      expect(families[0].name).toBe("Auto: Tileset 1");
      expect(families[0].background).toEqual([0x0000, 0x7fff, 0x01e0]);
    });

    it("removes existing auto families when regenerating", () => {
      let project = createBlankProjectData({ name: "Auto" });
      project = addPaletteFamily(project, {
        id: "auto_1",
        name: "Auto: Antiga",
        background: [0x0000],
        objects: []
      });
      project.tilesets = [
        { name: "Novo", pixels: [0x7fff] }
      ];

      const next = generateAutomaticFamiliesFromAssets(project);
      const families = readPaletteFamilies(next);
      expect(families).toHaveLength(1);
      expect(families[0].name).toBe("Auto: Novo");
    });
  });

  describe("nextPaletteFamilyID", () => {
    it("generates sequential IDs", () => {
      const project = createBlankProjectData({ name: "IDs" });
      expect(nextPaletteFamilyID(project)).toBe("palette-family-000");

      const withFamily = addPaletteFamily(project, {
        id: "palette-family-000",
        name: "Test",
        background: [],
        objects: []
      });
      expect(nextPaletteFamilyID(withFamily)).toBe("palette-family-001");
    });
  });

  describe("nextPaletteFamilyName", () => {
    it("generates sequential names", () => {
      const project = createBlankProjectData({ name: "Nomes" });
      expect(nextPaletteFamilyName(project)).toBe("Nova família 1");

      const withFamily = addPaletteFamily(project, {
        id: "f1",
        name: "Nova família 1",
        background: [],
        objects: []
      });
      expect(nextPaletteFamilyName(withFamily)).toBe("Nova família 2");
    });
  });
});
