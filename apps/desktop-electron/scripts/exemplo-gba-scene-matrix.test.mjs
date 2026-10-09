import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildExemploGbaSceneMatrix,
  combineExemploScenePlaytestEvidence,
  EXEMPLO_SCENE_BATCHES,
  renderExemploGbaSceneMatrixMarkdown
} from "./exemplo-gba-scene-matrix.mjs";
import { EXEMPLO_GB_STUDIO_SCENE_TYPES } from "./exemplo-gba-scene-types.mjs";

const projectURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);

function project() {
  return JSON.parse(readFileSync(projectURL, "utf8"));
}

describe("matriz de execução do Exemplo GBA", () => {
  it("atribui cada cena canônica a exatamente um lote de desenvolvimento", () => {
    const matrix = buildExemploGbaSceneMatrix(project());
    const assignedScenes = EXEMPLO_SCENE_BATCHES.flatMap((batch) => batch.scenes);

    const expectedSceneCount = Object.keys(EXEMPLO_GB_STUDIO_SCENE_TYPES).length;
    expect(matrix.sceneCount).toBe(expectedSceneCount);
    expect(matrix.assignedSceneCount).toBe(expectedSceneCount);
    expect(new Set(assignedScenes).size).toBe(expectedSceneCount);
    expect(matrix.rows.map((row) => row.sceneName).sort()).toEqual([...assignedScenes].sort());
  });

  it("mantém as três cenas do Dungeon Crawler no mesmo lote", () => {
    const matrix = buildExemploGbaSceneMatrix(project());
    const dungeonRows = matrix.rows.filter((row) => row.sceneType === "dungeonCrawler");

    expect(dungeonRows).toHaveLength(3);
    expect(new Set(dungeonRows.map((row) => row.batchID))).toEqual(new Set(["dungeon-crawler"]));
    expect(dungeonRows.map((row) => row.sceneName)).toEqual([
      "usina_submersa",
      "usina_combate",
      "usina_saida"
    ]);
  });

  it("mantém as novas cenas point-and-click no lote da campanha", () => {
    const matrix = buildExemploGbaSceneMatrix(project());
    const pointAndClickRows = matrix.rows.filter((row) => row.sceneType === "pointAndClick");

    expect(pointAndClickRows).toHaveLength(2);
    expect(pointAndClickRows).toMatchObject([
      {
        sceneName: "armazem_das_mares",
        batchID: "campaign-world",
        functionalStatus: "estrutura pronta",
        visualStatus: "promoção visual aprovada",
        manualStatus: "mGBA nativo/AGB-001 pendente",
        nextAction: "validar Editor, Play, hotspots e saída da campanha"
      },
      {
        sceneName: "observatorio_do_farol",
        batchID: "campaign-world",
        functionalStatus: "estrutura pronta",
        visualStatus: "promoção visual aprovada",
        manualStatus: "mGBA nativo/AGB-001 pendente",
        nextAction: "validar Editor, Play, hotspots e saída da campanha"
      }
    ]);
  });

  it("separa estrutura funcional, revisão visual e validação manual", () => {
    const matrix = buildExemploGbaSceneMatrix(project());
    const title = matrix.rows.find((row) => row.sceneName === "titulo");

    expect(title).toMatchObject({
      functionalStatus: "estrutura pronta",
      visualStatus: "revisão visual em lote",
      runtimeStatus: "Play/mGBA Web pendente",
      manualStatus: "mGBA nativo/AGB-001 pendente",
      nextAction: "confirmar Play, troca de frames e entrada no menu"
    });
    expect(title.functionalChecks.every((check) => check.passed)).toBe(true);
    expect(matrix.rows.find((row) => row.sceneName === "mapa_rota")).toMatchObject({
      functionalStatus: "estrutura pronta"
    });
  });

  it("distingue evidência por cena do Play/mGBA Web da validação manual", () => {
    const matrix = buildExemploGbaSceneMatrix(project(), {
      playtestEvidence: {
        audit: {
          ok: true,
          issues: []
        },
        results: [{ name: "titulo" }]
      }
    });
    const title = matrix.rows.find((row) => row.sceneName === "titulo");

    expect(title).toMatchObject({
      runtimeStatus: "Play/mGBA Web validado",
      manualStatus: "mGBA nativo/AGB-001 pendente"
    });
    expect(matrix.runtimeEvidence).toMatchObject({
      status: "Play/mGBA Web com evidência parcial",
      sceneCount: 1
    });
  });

  it("combina evidências de runtime e interfaces para cobrir o template completo", () => {
    const combined = combineExemploScenePlaytestEvidence({
      audit: { ok: true, issues: [], counts: { expected: 17, passed: 17, failed: 0 } },
      results: [{ name: "titulo" }]
    }, {
      audit: { ok: true, issues: [], counts: { expected: 17, passed: 17, failed: 0 } },
      results: [{ name: "escolha_genero" }]
    });
    const matrix = buildExemploGbaSceneMatrix(project(), { playtestEvidence: combined });

    expect(combined).toMatchObject({
      audit: { ok: true, counts: { expected: 34, passed: 34, failed: 0 } },
      results: [{ name: "titulo" }, { name: "escolha_genero" }]
    });
    expect(matrix.runtimeEvidence).toMatchObject({
      status: "Play/mGBA Web com evidência parcial",
      sceneCount: 2
    });
  });

  it("renderiza um relatório curto que pode ser revisado sem abrir o JSON", () => {
    const markdown = renderExemploGbaSceneMatrixMarkdown(buildExemploGbaSceneMatrix(project()));

    expect(markdown).toContain("# Matriz de execução do Exemplo GBA");
    expect(markdown).toContain("| P0 | Startup e entrada | 5 |");
    expect(markdown).toContain("| P1 | Campanha e mundo | 7 |");
    expect(markdown).toContain("`usina_combate`");
    expect(markdown).toContain("npm run gate:complete-project");
  });
});
