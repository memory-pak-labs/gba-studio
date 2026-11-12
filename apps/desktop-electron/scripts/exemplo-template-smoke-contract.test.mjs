import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { activeBuildRomPaths, fullProjectRuntimeEvidence, exemploSceneBuildTimeoutMs, captureMovingSceneVisualBaseline, intelRemainingFunctionalEvidence } from "./exemplo-template-smoke-contract.mjs";

describe('Intel functional evidence with the original presentation gate retained', () => {
  const names = ['arena_arrancada','circuito_final','arena_tatica','circuito_perspectiva'];
  function fixture() {
    return { ok: false, audit: { ok: false, counts: { expected: 4, passed: 0, failed: 4 },
      visualGate: { ok: true }, thresholds: { minEmulationFps: 55, minPresentationFps: 55, maxDroppedFrameRatio: 0.1 },
      issues: names.map(name => `${name}: cadencia do Player fora dos limites esperados.`) },
      results: names.map(name => ({ name, runtimeState: { frame: 100, audio: { pcmUnderrunCount: 0 } },
        audio: { audioUnderrunCount: 0 }, performance: { emulationFps: 60, presentationFps: 30, droppedFrameRatio: 0,
          observedSamples: Array.from({length:4}, () => ({ runtimeState: { audio: { pcmUnderrunCount: 0 } } })) } })) };
  }
  it('records functional checks separately without changing failed raw results or approving publication', () => {
    const evidence = fixture(), before = JSON.stringify(evidence);
    const result = intelRemainingFunctionalEvidence(evidence);
    expect(result).toMatchObject({ functionalPassed: true, presentationGatePassed: false, publicationApproved: false });
    expect(result.sceneNames).toEqual(names);
    expect(JSON.stringify(evidence)).toBe(before);
  });
  it.each(['pixels','emulation','drop','host-audio','engine-audio','engine-audio-before-reset','missing-audio-window','coverage','thresholds','visual'])('rejects a functional failure: %s', failure => {
    const evidence = fixture();
    if (failure === 'pixels') evidence.audit.issues.push('circuito_final: pixels opacos do player nao correspondem exatamente ao PNG na ROM.');
    if (failure === 'emulation') evidence.results[0].performance.emulationFps = 40;
    if (failure === 'drop') evidence.results[0].performance.droppedFrameRatio = 0.5;
    if (failure === 'host-audio') evidence.results[0].audio.audioUnderrunCount = 1;
    if (failure === 'engine-audio') evidence.results[0].runtimeState.audio.pcmUnderrunCount = 1;
    if (failure === 'engine-audio-before-reset') evidence.results[0].performance.observedSamples[1].runtimeState.audio.pcmUnderrunCount = 1;
    if (failure === 'missing-audio-window') evidence.results[0].performance.observedSamples = [];
    if (failure === 'coverage') evidence.results.pop();
    if (failure === 'thresholds') evidence.audit.thresholds.minPresentationFps = 30;
    if (failure === 'visual') evidence.audit.visualGate.ok = false;
    expect(intelRemainingFunctionalEvidence(evidence).functionalPassed).toBe(false);
  });
});

describe('independent moving-scene pixel baseline', () => {
  const scope = { runtimeKind: 7, currentRoom: 0 };
  const evidence = frame => ({ ok: true, framebufferRgbaBase64: 'actual pixels',
    runtimeState: { ...scope, frame }, presentedRuntimeState: { ...scope, frame } });
  it.each(['shmup', 'racing'])('captures %s at startup only after the completed cadence window', async runtime => {
    const calls = [];
    const result = await captureMovingSceneVisualBaseline({ runtime, scope,
      performance: { observedSamples: [{ runtimeState: { frame: 8 } }, { runtimeState: { frame: 140 } }] },
      reset: async () => calls.push('reset'),
      capture: async () => { calls.push('capture'); return evidence(10); } });
    expect(calls).toEqual(['reset', 'capture']);
    expect(result.runtimeState.frame).toBe(10);
    expect(result.visualBaseline).toEqual({ source: 'independent-startup-after-cadence', cadenceFinalFrame: 140, capturedFrame: 10 });
  });
  it.each([0, 7, 61, 140])('rejects a stale, unready or late visual frame: %s', async frame => {
    await expect(captureMovingSceneVisualBaseline({ runtime: 'racing', scope,
      performance: { observedSamples: [{ runtimeState: { frame: 140 } }] },
      reset: async () => {}, capture: async () => evidence(frame) })).rejects.toThrow(/visual baseline/);
  });
  it('rejects a different scene and requires real pixel data', async () => {
    for (const bad of [{ ...evidence(10), framebufferRgbaBase64: null },
      { ...evidence(10), presentedRuntimeState: { ...scope, frame: 10, currentRoom: 1 } }]) {
      await expect(captureMovingSceneVisualBaseline({ runtime: 'shmup', scope,
        performance: { observedSamples: [{ runtimeState: { frame: 140 } }] },
        reset: async () => {}, capture: async () => bad })).rejects.toThrow(/visual baseline/);
    }
  });
  it('does not reset or recapture other runtimes or an unfinished cadence measurement', async () => {
    let called = false;
    const reset = async () => { called = true; };
    await expect(captureMovingSceneVisualBaseline({ runtime: 'topdown', reset })).rejects.toThrow(/moving runtime/);
    await expect(captureMovingSceneVisualBaseline({ runtime: 'shmup', reset, performance: { observedSamples: [] } })).rejects.toThrow(/completed cadence/);
    expect(called).toBe(false);
  });
});

describe("Exemplo template full-project smoke contract", () => {
  it('bounds cold scene compilation separately from ROM performance and fidelity', () => {
    expect(exemploSceneBuildTimeoutMs()).toBe(300_000);
    expect(exemploSceneBuildTimeoutMs('600000')).toBe(600_000);
    expect(exemploSceneBuildTimeoutMs('900000')).toBe(900_000);
  });
  it.each(['0', '-1', '299999', '900001', 'Infinity', '300000.5', 'not-a-timeout'])('rejects invalid compilation budgets: %s', value => {
    expect(() => exemploSceneBuildTimeoutMs(value)).toThrow(/compilation timeout/);
  });
  it("seleciona a ROM ativa sem contar cópias de variantes em cache", () => {
    expect(activeBuildRomPaths([
      "/export/mixed/build/project.gba",
      "/export/mixed/.gba-cache/gbsbuild/identity/variant/project.gba",
      "/export/mixed/build/project.elf",
      "C:\\export\\mixed\\.gba-cache\\gbsbuild\\variant\\project.gba"
    ])).toEqual(["/export/mixed/build/project.gba"]);
    expect(activeBuildRomPaths(["/export/.gba-cache/gbsbuild/variant/project.gba"])).toEqual([]);
  });

  it("mantém duas ROMs ativas visíveis para rejeitar uma exportação incompleta", () => {
    expect(activeBuildRomPaths([
      "/export/topdown/build/topdown.gba",
      "/export/luta/build/luta.gba",
      "/export/.gba-cache/gbsbuild/variant/cached.gba"
    ])).toHaveLength(2);
    expect(activeBuildRomPaths(["/export/.gba-cache-backup/build/project.gba"]))
      .toEqual(["/export/.gba-cache-backup/build/project.gba"]);
  });

  it("requires all template runtimes in one mixed project", () => {
    expect(fullProjectRuntimeEvidence({
      kind: "mixed",
      runtime_dispatch: {
        initial_runtime: "cutscene",
        initial_room: 1,
        initial_scene: "logo",
        runtimes: ["menu", "topdown", "platformer", "isometric", "dungeon_crawler", "racing", "point_click", "shmup", "cutscene", "visual_novel", "world_map", "battle_rpg", "luta"]
      }
    })).toEqual({
      kind: "mixed",
      initialRuntime: "cutscene",
      initialRoom: 1,
      initialScene: "logo",
      runtimes: ["menu", "topdown", "platformer", "isometric", "dungeon_crawler", "racing", "point_click", "shmup", "cutscene", "visual_novel", "world_map", "battle_rpg", "luta"]
    });
  });

  it("rejects a scene-only or incomplete runtime contract", () => {
    expect(() => fullProjectRuntimeEvidence({
      kind: "topdown",
      runtime_dispatch: { initial_runtime: "topdown", initial_room: 0, runtimes: ["topdown"] }
    })).toThrow(/projeto completo/i);
  });

  it("rejeita o projeto completo quando o Play ignora o menu inicial", () => {
    expect(() => fullProjectRuntimeEvidence({
      kind: "mixed",
      runtime_dispatch: {
        initial_runtime: "topdown",
        initial_room: 0,
        initial_scene: "porto_lumen",
        runtimes: ["menu", "topdown", "platformer", "isometric", "dungeon_crawler", "racing", "point_click", "shmup", "cutscene", "visual_novel", "world_map", "battle_rpg", "luta"]
      }
    })).toThrow(/Cena Logo/i);
  });

  it("keeps the packaged smoke focused on the full project", async () => {
    const source = await readFile(new URL("./smoke-electron-exemplo-template.mjs", import.meta.url), "utf8");
    expect(source).not.toContain("runtimeSceneBuilds");
    expect(source).not.toContain("representativeRuntimes");
    expect(source.match(/clickButtonByAriaLabel\(cdp, "Executar ROM", 15_000\)/g)).toHaveLength(1);
    expect(source).toContain('"play-full-project"');
    expect(source).toContain('"single-canonical-example-project"');
    expect(source).toContain('"mixed-runtime-all-13-scene-types"');
    expect(source).toContain('const eventEdited = await editEventInWorkspace(cdp);');
    expect(source).toContain('Chave do novo diálogo indisponível');
    expect(source).toContain('"editor-events-focus-inspector"');
    expect(source).not.toContain("editPaletteInWorkspace");
    expect(source).toContain('const duplicatedAsset = await duplicateAssetInWorkspace(cdp, activeBackground.name);');
    expect(source).not.toContain("runSceneButtonCount !== 17");
    expect(source).not.toContain("saved.counts.scenes !== 17");
    expect(source).not.toContain("saved.materializedAssetCount !== 74");
    expect(source).not.toContain('"41 sheets"');
    expect(source).not.toContain('"92 animacoes"');
    expect(source).toContain("runSceneButtonCount !== initial.counts.scenes");
    expect(source).toContain("saved.materializedAssetCount !== saved.counts.assets");
    expect(source).toContain("async function assertSpritesWorkspace(cdp, expectedSheetName, expectedSheetCount)");
    expect(source).toContain('?.textContent?.trim() === "Sprites"');
    expect(source).toContain('?.textContent?.trim() === "Animações"');
    expect(source).toContain("sheetCount === ${JSON.stringify(expectedSheetCount)}");
    expect(source).toContain("sheetRows.length === sheetCount");
    expect(source).toContain("animationRows.length === animationCount");
    expect(source).toContain("sheetNames.includes(${JSON.stringify(expectedSheetName)})");
    expect(source).not.toContain("`${initial.counts.spriteSheets} sheets`");
    expect(source).not.toContain("`${initial.counts.animations} animações`");
    expect(source).not.toContain("`${initial.counts.animations} animacoes`");
    expect(source).toContain('assertWorkspace(cdp, "Diálogos"');
    expect(source).toContain('assertWorkspace(cdp, "Áudio"');
    expect(source).not.toContain('assertWorkspace(cdp, "Cores"');
    expect(source).not.toContain('"colors-workspace-edit"');
    expect(source).toContain('assertWorkspace(cdp, "Editor"');
    expect(source).toContain('assertWorkspace(cdp, "Arquivos"');
    expect(source).toContain('assertWorkspace(cdp, "Exportar"');
    expect(source).toContain('const projectHealth = await evaluate(cdp');
    expect(source).toContain('projectHealth.scenes !== saved.counts.scenes');
    expect(source).toContain('"project-health-workspace"');
    expect(source).not.toContain('assertWorkspace(cdp, "Eventos"');
    expect(source).not.toContain('assertWorkspace(cdp, "Dialogos"');
    expect(source).not.toContain('assertWorkspace(cdp, "Audio"');
    expect(source).toContain('text.includes("Informações do jogo")');
    expect(source).toContain('clickButtonByAriaLabel(cdp, "Seção de ajustes: Compilação")');
    expect(source).toContain('fillInputNearLabel(cdp, "Título"');
    expect(source).not.toContain('fillInputNearLabel(cdp, "Titulo"');
  });

  it("edita a folha e os assets ativos das cenas já produzidas", async () => {
    const source = await readFile(new URL("./smoke-electron-exemplo-template.mjs", import.meta.url), "utf8");

    expect(source).toContain('const editedSpriteSheet = "nara-topdown-walk-run-v1.png";');
    expect(source).toContain('expectedSceneImage("mapa_rota"');
    expect(source).toContain('expectedSceneImage("mercado_suspenso"');
    expect(source).toContain('farol_tema_principal');
    expect(source).toContain('farol_sfx_texto');
    expect(source).not.toContain('emote-surprise-gba.png');
  });

  it("usa o rótulo acessível atual ao localizar uma célula livre para colisão", async () => {
    const source = await readFile(new URL("./smoke-electron-exemplo-template.mjs", import.meta.url), "utf8");

    expect(source).toContain('startsWith("Pintar colisão ")');
    expect(source).not.toContain('startsWith("Pintar colisao")');
  });

  it("usa o rótulo acessível atual ao abrir a Central de pendências", async () => {
    const source = await readFile(new URL("./smoke-electron-exemplo-template.mjs", import.meta.url), "utf8");

    expect(source).toContain('button[aria-label="Abrir central de pendências"]');
    expect(source).not.toContain('button[aria-label="Abrir central de pendencias"]');
  });

  it("valida a corrida top-down promovida, sem exigir a prévia pseudo-3D futura", async () => {
    const source = await readFile(new URL("./smoke-electron-exemplo-template.mjs", import.meta.url), "utf8");

    expect(source).toContain('topdownRacingFocus?.viewportWidth !== "240"');
    expect(source).toContain('"topdown-racing-focus-viewport"');
    expect(source).not.toContain('"pseudo3d-racing-focus-camera-and-minimap"');
  });

  it("deriva a espera do smoke de cenas a partir do plano selecionado", async () => {
    const source = await readFile(new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url), "utf8");

    expect(source).toContain("const expectedSceneNames = [...new Set(plan.map((scene) => scene.name))];");
    expect(source).toContain("editorProjectReadyForScenePlaytest(text, expectedSceneLabels)");
    expect(source).not.toContain('text.includes("prologo") && text.includes("tempestade")');
  });

  it("deriva a máscara de atores do tamanho da animação quando o nome do PNG não o declara", async () => {
    const source = await readFile(new URL("./smoke-electron-exemplo-scenes.mjs", import.meta.url), "utf8");

    expect(source).toContain("candidate?.name === actor?.animationName");
    expect(source).toContain("candidate?.spriteSheet === spriteSheet");
    expect(source).toContain("runtime === \"cutscene\"");
    expect(source).toContain("animations: template.animations");
  });
});
