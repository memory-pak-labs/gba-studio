import { describe, expect, it } from "vitest";

import { deriveProjectProblems } from "./projectProblems.js";

describe("deriveProjectProblems", () => {
  it("uses measured compiler budgets instead of retaining estimated overflow warnings", () => {
    const data = { scenas: [{ name: "storm", width: 50, height: 20, sceneType: "topdown",
      tilemap: Array.from({ length: 1000 }, (_, i) => i + 1) }] };
    const report = { schema: 11, group_pressure_report: [{ name: "scene_storm", asset_count: 1, assets: ["floor"], resources: {
      bg_tiles: { requested: 745, capacity: 896, percent_of_pool: 83 }
    } }], production_summary: { ready_for_large_project: true, blocking_overflow_count: 0 } };
    expect(deriveProjectProblems(data).some(p => p.code === "asset.budget.blocked")).toBe(true);
    const measured = deriveProjectProblems(data, { assetPackReport: report });
    expect(measured.some(p => p.code === "asset.budget.blocked")).toBe(false);
    expect(measured).toEqual(expect.arrayContaining([expect.objectContaining({ code: "asset.budget.warning",
      severity: "warning", detail: expect.stringContaining("745/896") })]));
    report.group_pressure_report[0]!.resources.bg_tiles.requested = 900;
    report.group_pressure_report[0]!.resources.bg_tiles.percent_of_pool = 101;
    report.production_summary.ready_for_large_project = false;
    report.production_summary.blocking_overflow_count = 1;
    expect(deriveProjectProblems(data, { assetPackReport: report })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "asset.budget.blocked", severity: "error" })
    ]));
  });

  it("preserva cena e contexto do orçamento para distinguir avisos iguais", () => {
    const problems = deriveProjectProblems({
      scenas: [{ name: "porto", sceneType: "topdown", width: 50, height: 20,
        tilemap: Array.from({ length: 1000 }, (_, index) => index + 1), backgroundAssetName: "porto.png" }],
      assets: [{ name: "porto.png", kind: "Background", metadata: { width: 240, height: 160, tileCount: 1000 } }]
    });
    expect(problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "asset.budget.blocked", targetName: "porto", detail: expect.stringContaining("Tiles BG: 1000/896 (112%)") })
    ]));
  });

  it("centraliza pendencias navegaveis de todos os workspaces", () => {
    const project = {
      assets: [{ id: "asset-bg", name: "missing.png", kind: "Tileset" }],
      scenas: [{ id: "room-1", name: "start", backgroundAssetName: "room_missing.png", music: "" }],
      actors: [{ id: "actor-1", name: "Player", spriteSheet: "missing.png" }],
      animations: [{ id: "anim-1", name: "idle", spriteSheet: "ghost.png", frameCount: 0 }],
      events: [
        { id: "event-1", name: "boot", steps: [{ command: "call_event missing_event" }] },
        { id: "event-2", name: "unused", command: "noop" }
      ],
      dialogues: [{ key: "intro", portrait: "portrait_missing.png", text: "Oi" }],
      audioItems: [{ id: "audio-1", name: "unused.mod", kind: "SFX", format: "MOD" }],
      settings: {
        general: { startScene: "missing_room" },
        build: { engineBackend: "gbastudio_engine", enginePackPath: "", exportFolder: "" }
      }
    };

    const problems = deriveProjectProblems(project);
    const workspaces = new Set(problems.map((problem) => problem.workspace));

    expect(workspaces).toEqual(new Set([
      "Arquivos",
      "Editor",
      "Sprites",
      "Dialogos",
      "Audio",
      "Exportar",
      "Ajustes"
    ]));
    expect(problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ workspace: "Arquivos", targetID: "asset-bg" }),
      expect.objectContaining({ workspace: "Editor", targetName: "start" }),
      expect.objectContaining({ workspace: "Editor", targetName: "boot", severity: "error" }),
      expect.objectContaining({ workspace: "Dialogos", targetName: "intro" }),
      expect.objectContaining({ workspace: "Audio", targetName: "unused.mod" })
    ]));
  });

  it("mantem apenas problemas acionaveis e ordena erros antes de avisos", () => {
    const problems = deriveProjectProblems({
      assets: [],
      scenas: [{ id: "room-1", name: "start" }],
      settings: { general: { startScene: "start" } }
    });

    expect(problems.every((problem) => problem.severity !== "info")).toBe(true);
    const firstWarning = problems.findIndex((problem) => problem.severity === "warning");
    const lastError = problems.reduce((lastIndex, problem, index) => problem.severity === "error" ? index : lastIndex, -1);
    expect(firstWarning === -1 || lastError < firstWarning).toBe(true);
  });

  it("exibe divergencias de projecao de atores e eventos na central", () => {
    const problems = deriveProjectProblems({
      scenas: [
        { name: "porto", width: 20, height: 18 },
        { name: "mercado", width: 20, height: 18 }
      ],
      actors: [{
        id: "actor-guide",
        name: "Guia",
        room: "missing",
        eventBindings: "invalid"
      }],
      events: [{ id: "event-boot", name: "boot", category: "Cena", eventKind: "legacy", command: "noop" }]
    });

    expect(problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ workspace: "Editor", targetName: "Guia", severity: "warning", id: "projection-actors-0" }),
      expect.objectContaining({ workspace: "Editor", targetName: "boot", severity: "warning", id: "projection-events-0" })
    ]));
  });
});
