import { describe, expect, it } from "vitest";

import {
  assertUserScenePlayProject,
  auditUserScenePlayEvidence,
  buildUserScenePlayProject
} from "./smoke-exemplo-scene-user-contract.mjs";

describe("contrato do smoke de play por cena para usuário final", () => {
  it("desativa somente o modo desenvolvedor na cópia efêmera", () => {
    const source = {
      id: "exemplo-gba",
      settings: {
        debug: {
          developerMode: true,
          showCollisionBoxes: true
        },
        general: {
          startScene: "titulo"
        }
      },
      scenas: [{ name: "porto_lumen" }]
    };

    const prepared = buildUserScenePlayProject(source);

    expect(prepared).not.toBe(source);
    expect(prepared.settings).not.toBe(source.settings);
    expect(prepared.settings.debug).not.toBe(source.settings.debug);
    expect(prepared.settings.debug).toEqual({ developerMode: false, showCollisionBoxes: true });
    expect(prepared.settings.general).toBe(source.settings.general);
    expect(prepared.scenas).toBe(source.scenas);
    expect(source.settings.debug.developerMode).toBe(true);
  });

  it("cria blocos ausentes sem alterar a forma do projeto", () => {
    const prepared = buildUserScenePlayProject({ id: "minimal" });

    expect(prepared).toEqual({
      id: "minimal",
      settings: { debug: { developerMode: false } }
    });
    expect(assertUserScenePlayProject(prepared)).toBe(prepared);
    expect(() => assertUserScenePlayProject({ settings: { debug: { developerMode: true } } }))
      .toThrow(/developerMode=false/);
  });

  it("exige todas as cenas e cada runtime avançado no modo agregado", () => {
    const project = {
      settings: { debug: { developerMode: false } },
      scenas: [{ name: "intro" }, { name: "porto" }]
    };
    const childEvidence = {
      audit: { ok: true },
      ok: true,
      requestedSceneName: null,
      results: [
        { name: "intro", playerUrl: "file:///player/runtime.html", runtimeState: { frame: 12 } },
        { name: "porto", playerUrl: "file:///player/runtime.html", runtimeState: { frame: 9 } }
      ]
    };

    expect(auditUserScenePlayEvidence({
      childEvidence,
      childExitCode: 0,
      project,
      runAll: true,
      sceneName: null,
      exerciseBattleInput: false
    })).toMatchObject({
      checks: {
        childSmokePassed: true,
        developerModeDisabled: true,
        playWindowsOpened: true,
        requestedSceneSelected: true,
        runtimeAdvanced: true,
        sceneAuditsPassed: true,
        playWindowsClosed: true
      },
      runtimeFrames: [12, 9],
      sceneNames: ["intro", "porto"]
    });
  });

  it("exige a rodada de input quando o smoke de batalha foi solicitado", () => {
    const project = {
      settings: { debug: { developerMode: false } },
      scenas: [{ name: "guardiao_rele" }]
    };
    const baseEvidence = {
      audit: { ok: true },
      ok: true,
      requestedSceneName: "guardiao_rele",
      results: [{
        battleInput: { ok: true },
        name: "guardiao_rele",
        playerUrl: "file:///player/runtime.html",
        runtimeState: { frame: 12 }
      }]
    };

    expect(auditUserScenePlayEvidence({
      childEvidence: baseEvidence,
      childExitCode: 0,
      exerciseBattleInput: true,
      project,
      runAll: false,
      sceneName: "guardiao_rele"
    })).toMatchObject({ checks: { battleInputPassed: true } });

    expect(auditUserScenePlayEvidence({
      childEvidence: {
        ...baseEvidence,
        results: [{ ...baseEvidence.results[0], battleInput: { ok: false } }]
      },
      childExitCode: 0,
      exerciseBattleInput: true,
      project,
      runAll: false,
      sceneName: "guardiao_rele"
    })).toMatchObject({ checks: { battleInputPassed: false } });
  });
});
