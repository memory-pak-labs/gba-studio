import { describe, expect, it } from "vitest";
import {
  applySettingsGameplayPresetInProject,
  deriveSettingsPathValidationTargets,
  deriveSettingsSectionChangeSummary,
  deriveSettingsSectionsForScope,
  deriveVisibleSettingsSections,
  deriveSettingsWorkspaceSearchResults,
  deriveSettingsWorkspacePresentation,
  resetSettingsSectionInProject,
  updateSettingsFieldInProject
} from "./settingsWorkspace.js";
import type { SettingsSectionID } from "./settingsWorkspace.js";
import { SCENE_TYPE_OPTIONS } from "./sceneTypes.js";

describe("Settings workspace presentation", () => {
  it("keeps every scene type available in the continuous settings page", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        sceneTypes: {
          defaultSceneType: "topdown",
          enabled: {
            topdown: true,
            platformer: false,
            pointAndClick: true
          }
        }
      }
    });

    const visibleSectionIDs = deriveVisibleSettingsSections(presentation).map((section) => section.id);

    expect(visibleSectionIDs).toContain("general");
    expect(visibleSectionIDs).toContain("sceneTypes");
    expect(visibleSectionIDs).toContain("topdown");
    expect(visibleSectionIDs).toContain("pointAndClick");
    expect(visibleSectionIDs).toContain("platformer");
    expect(visibleSectionIDs).toContain("shmup");
  });

  it("separates scene, export and global settings by workspace scope", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        sceneTypes: {
          enabled: { topdown: true, platformer: false }
        }
      }
    });

    const sceneSectionIDs = deriveSettingsSectionsForScope(presentation, "scene").map((section) => section.id);
    const globalSectionIDs = deriveSettingsSectionsForScope(presentation, "global").map((section) => section.id);

    expect(sceneSectionIDs).toEqual(expect.arrayContaining(["sceneTypes", "topdown", "transitions"]));
    expect(sceneSectionIDs).not.toContain("general");
    expect(sceneSectionIDs).not.toContain("preview");
    expect(sceneSectionIDs).toContain("platformer");
    expect(sceneSectionIDs).toContain("shmup");
    expect(globalSectionIDs).not.toContain("general");
    expect(globalSectionIDs).not.toContain("build");
    expect(globalSectionIDs).not.toContain("hardware");
    expect(globalSectionIDs).not.toContain("sprites");
    expect(globalSectionIDs).not.toContain("backgrounds");
    expect(globalSectionIDs).not.toContain("preview");
    expect(globalSectionIDs).not.toContain("runtimeCapabilities");
    expect(globalSectionIDs).not.toContain("projectiles");
    expect(globalSectionIDs).not.toContain("debug");
    expect(globalSectionIDs).not.toContain("sceneTypes");
    expect(globalSectionIDs).not.toContain("topdown");
    expect(globalSectionIDs).not.toContain("transitions");
    expect(globalSectionIDs).not.toContain("audio");
    expect(globalSectionIDs).not.toContain("save");

    const exportSectionIDs = deriveSettingsSectionsForScope(presentation, "export").map((section) => section.id);
    expect(exportSectionIDs).toEqual([
      "general",
      "build",
      "hardware",
      "audio",
      "save",
      "runtimeCapabilities",
      "debug"
    ]);
    expect(exportSectionIDs).not.toContain("interface");
    expect(exportSectionIDs).not.toContain("sceneTypes");
  });

  it("searches settings across sections, fields and intent cards", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    expect(deriveSettingsWorkspaceSearchResults(presentation, "emulador")).toEqual([]);
    expect(deriveSettingsWorkspaceSearchResults(presentation, "ritmo rapido")).toEqual(
      expect.arrayContaining([expect.objectContaining({ sectionID: "topdown", title: "Top-down" })])
    );
  });

  it("exposes MCP as an editor-only opt-in setting", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });
    const mcp = presentation.sections.find((section) => section.id === "mcp");
    const enabled = updateSettingsFieldInProject({ settings: {} }, "mcp", "enabled", true);

    expect(mcp).toMatchObject({
      group: "Avancado",
      title: "MCP local",
      exportScope: "editor-only",
      editableFields: [{ key: "enabled", value: false, defaultValue: false }]
    });
    expect(enabled.settings).toMatchObject({ mcp: { enabled: true } });
  });

  it("exposes scene editor shortcuts as persistent editor-only settings", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: { shortcuts: { select: "x", paint: "p" } }
    });
    const shortcuts = presentation.sections.find((section) => section.id === "shortcuts");

    expect(shortcuts).toMatchObject({ group: "Projeto", title: "Atalhos", exportScope: "editor-only" });
    expect(shortcuts?.editableFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "select",
        label: "Selecionar",
        description: "Selecionar e mover entidades",
        type: "text",
        value: "x",
        defaultValue: "v"
      }),
      expect.objectContaining({ key: "paint", label: "Pintura", type: "text", value: "p", defaultValue: "b" })
    ]));

    const globalSectionIDs = deriveSettingsSectionsForScope(presentation, "global").map((section) => section.id);
    expect(globalSectionIDs).toContain("shortcuts");
    expect(deriveSettingsSectionsForScope(presentation, "export").map((section) => section.id)).not.toContain("shortcuts");

    const updated = updateSettingsFieldInProject({ settings: {} }, "shortcuts", "collision", "k");
    expect(updated.settings).toMatchObject({ shortcuts: { collision: "k" } });
  });

  it("includes shortcut descriptions in settings search", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    expect(deriveSettingsWorkspaceSearchResults(presentation, "mover entidades").map((result) => result.sectionID)).toEqual([
      "shortcuts"
    ]);
  });

  it("exposes universal runtime capabilities as project-level opt-ins", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });
    const runtimeCapabilities = presentation.sections.find((section) => section.id === "runtimeCapabilities");
    const enabled = updateSettingsFieldInProject({ settings: {} }, "runtimeCapabilities", "rtc.enabled", true);

    expect(runtimeCapabilities).toMatchObject({
      group: "Exportacao",
      title: "Runtime Universal",
      exportScope: "both",
      editableFields: [
        { key: "rtc.enabled", value: false, defaultValue: false },
        { key: "link.enabled", value: false, defaultValue: false }
      ],
      runtimeCapabilityUsage: { enabled: false, projectDefault: false, sceneCount: 0 }
    });
    expect(enabled.settings).toMatchObject({ runtimeCapabilities: { rtc: { enabled: true } } });
  });

  it("reports changed fields and exposes the changes behind intent cards", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: { general: { gameTitle: "Meu jogo", author: "OpenAI" } }
    });
    const general = presentation.sections.find((section) => section.id === "general");
    const topdown = presentation.sections.find((section) => section.id === "topdown");

    expect(deriveSettingsSectionChangeSummary(general ?? null)).toEqual({
      changedCount: 2,
      changedFields: ["Titulo", "Autor"]
    });
    expect(topdown?.intentGroups[0]?.options[0]?.changes).toEqual([
      { fieldKey: "walkSpeed", value: 0.75 }
    ]);
  });
  it("derives core project settings sections and summary metrics", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        general: {
          gameTitle: "Schema Game",
          author: "Tester",
          version: "2.0.0",
          startScene: "start",
          startSceneType: "platformer",
          startPlayer: "Hero",
          defaultLanguage: "pt-BR",
          exportFolder: "/tmp/gba-settings"
        },
        build: {
          romFileName: "schema.gba",
          exportFormat: "gba_rom",
          engineBackend: "gbastudio_engine",
          enginePackPath: "/tmp/GBAStudioEnginePack",
          toolchain: "devkitARM",
          compilerPath: "/tmp/devkitARM",
          generateDebugFiles: true,
          runEmulatorAfterBuild: true
        },
        sceneTypes: {
          defaultSceneType: "topdown",
          enabled: {
            topdown: true,
            platformer: true,
            shmup: false
          }
        },
        preview: {
          defaultMode: "quick_preview",
          scale: 3,
          showCollisions: true,
          showTriggers: true,
          showHitboxes: false,
          showGrid: false,
          showFps: true,
          showVariables: true,
          showEventLog: true,
          emulator: "mgba",
          emulatorPath: "/tmp/mgba",
          runAfterBuild: true,
          muteRoomAudio: false
        },
        audio: {
          defaultMusicFormat: "gba_studio_chiptune",
          audioEngine: "gbastudio_engine_audio",
          audioMode: "chiptune_pcm",
          sampleRate: 0,
          masterVolume: 100,
          musicVolume: 80,
          sfxVolume: 90,
          enablePsgChannels: true,
          enableDirectSoundA: true,
          enableDirectSoundB: false,
          keepMusicBetweenScenes: true
        },
        save: {
          saveType: "sram",
          slots: 4,
          autoSave: false,
          manualSave: true,
          resetSaveInDebug: true
        },
        debug: {
          showCpuUsage: true,
          showVramUsage: true,
          showOamUsage: false,
          enableEventLogs: true,
          enableAudioLogs: true,
          enableCollisionLogs: false,
          preserveTempFiles: true,
          developerMode: true
        }
      }
    });

    expect(presentation.summary).toEqual({
      hasSettings: true,
      sectionCount: 27,
      configuredPathCount: 2,
      availableSceneTypeCount: SCENE_TYPE_OPTIONS.length,
      enabledPreviewOverlayCount: 0,
      enabledDebugFlagCount: 2,
      engineBackend: "gbastudio_engine",
      audioMode: "chiptune_pcm",
      startScene: "start",
      exportFolder: "/tmp/gba-settings",
      diagnosticWarningCount: 0,
      warnings: []
    });
    expect(presentation.sections.map((section) => section.title)).toEqual([
      "Geral",
      "Atalhos",
      "Créditos",
      "Build",
      "Hardware GBA",
      "Controles",
      "Players e backgrounds",
      "Top-down",
      "Plataforma",
      "Isometrico",
      "Dungeon Crawler",
      "Corrida",
      "Batalha RPG",
      "Luta",
      "Mapa Mundial",
      "Visual Novel",
      "Cutscene",
      "Shoot em Up",
      "Apontar e Clicar",
      "Sprites",
      "Backgrounds",
      "UI / Dialogos",
      "Audio",
      "Save Data",
      "Runtime Universal",
      "Transicoes",
      "Projeteis",
      "Preview",
      "Orçamentos",
      "MCP local"
    ]);
    expect(presentation.sections.find((section) => section.id === "sceneTypes")).toMatchObject({
      group: "Cenas",
      title: "Players e backgrounds",
      exportScope: "editor-only",
      items: [{ label: "Players configuráveis", value: `${SCENE_TYPE_OPTIONS.length} tipos de cena`, tone: "ok" },
        { label: "Backgrounds configuráveis", value: "16 tipos e variações", tone: "ok" }]
    });
    expect(presentation.sections.find((section) => section.id === "platformer")).toMatchObject({
      group: "Cenas",
      detail: "Fisica lateral · Export ROM",
      exportScope: "export"
    });
    expect(presentation.sections.find((section) => section.id === "preview")).toMatchObject({
      exportScope: "preview-only",
      detail: expect.stringContaining("So preview")
    });
    expect(presentation.sections.find((section) => section.id === "dungeonCrawler")).toMatchObject({
      exportScope: "both",
      detail: expect.not.stringContaining("So preview")
    });
    expect(presentation.sections.find((section) => section.id === "racing")).toMatchObject({
      exportScope: "both",
      detail: expect.not.stringContaining("So preview")
    });
    expect(presentation.sections.find((section) => section.id === "battleRpg")).toMatchObject({
      exportScope: "both",
      detail: expect.not.stringContaining("So preview"),
      items: expect.arrayContaining([
        expect.objectContaining({ label: "Máximo no grupo", value: "6" }),
        expect.objectContaining({ label: "Máximo de inimigos", value: "1" }),
        expect.objectContaining({ label: "Intervalo entre turnos", value: "30" }),
        expect.objectContaining({ label: "Multiplicador de XP", value: "1" }),
        expect.objectContaining({ label: "Regras da batalha", value: "5 mecânicas configuráveis" }),
        expect.objectContaining({ label: "HUD da batalha", value: "Configurada no editor de HUD", tone: "muted" }),
        expect.objectContaining({ label: "Ouro da vitória", value: "100" }),
        expect.objectContaining({ label: "Experiência da vitória", value: "50" })
      ])
    });
    const battleSection = presentation.sections.find((section) => section.id === "battleRpg");
    expect(battleSection?.editableFields.map((field) => field.label)).toEqual(expect.arrayContaining([
      "Permitir fuga",
      "Tipos elementais",
      "Golpes críticos",
      "Condições de status",
      "Habilidades"
    ]));
    expect(battleSection?.editableFields.map((field) => field.label)).not.toEqual(expect.arrayContaining([
      "Barra de experiência",
      "Barras de HP"
    ]));
    expect(presentation.sections.find((section) => section.id === "sprites")).toMatchObject({
      group: "Exportacao",
      detail: "Empacotamento, paleta e OAM"
    });
    expect(presentation.sections.find((section) => section.id === "backgrounds")).toMatchObject({
      group: "Cenas",
      detail: "Padrões gráficos e composição"
    });
    expect(presentation.sections.find((section) => section.id === "debug")).toMatchObject({
      group: "Exportacao",
      title: "Orçamentos",
      detail: "Métricas do editor e Play · So editor"
    });
    expect(presentation.sections.find((section) => section.id === "transitions")).toMatchObject({
      group: "Cenas",
      detail: "Padrões do projeto para trocas de cena"
    });
    expect(presentation.sections.find((section) => section.id === "general")?.items).toContainEqual({ label: "Titulo", value: "Schema Game", tone: "default" });
    expect(presentation.sections.find((section) => section.id === "build")?.items).toContainEqual({ label: "Backend", value: "gbastudio_engine", tone: "ok" });
    expect(presentation.sections.find((section) => section.id === "general")?.editableFields.find((field) => field.key === "exportFolder")).toMatchObject({
      pathPicker: "directory"
    });
    expect(presentation.sections.find((section) => section.id === "build")?.editableFields.find((field) => field.key === "enginePackPath")).toMatchObject({
      label: "Engine Pack",
      pathPicker: "directory",
      value: "/tmp/GBAStudioEnginePack"
    });
    expect(presentation.sections.find((section) => section.id === "build")?.items).toContainEqual({ label: "Engine Pack", value: "/tmp/GBAStudioEnginePack", tone: "default" });
    expect(presentation.sections.find((section) => section.id === "preview")?.editableFields).toEqual([]);
    expect(presentation.sections.find((section) => section.id === "controls")?.editableFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "up", label: "Cima", defaultValue: "ArrowUp,w" }),
        expect.objectContaining({ key: "down", label: "Baixo", defaultValue: "ArrowDown,s" }),
        expect.objectContaining({ key: "left", label: "Esquerda", defaultValue: "ArrowLeft,a" }),
        expect.objectContaining({ key: "right", label: "Direita", defaultValue: "ArrowRight,d" }),
        expect.objectContaining({ key: "aButton", label: "A", defaultValue: "Alt,z,j" }),
        expect.objectContaining({ key: "bButton", label: "B", defaultValue: "Control,k,x" }),
        expect.objectContaining({ key: "lButton", label: "Botao L", defaultValue: "Q" }),
        expect.objectContaining({ key: "rButton", label: "Botao R", defaultValue: "E" })
      ])
    );
    expect(presentation.sections.find((section) => section.id === "preview")?.items).toContainEqual({ label: "Overlays", value: "5 ativos", tone: "ok" });
    expect(presentation.sections.find((section) => section.id === "audio")?.items).toContainEqual({ label: "Canais", value: "PSG, Direct A", tone: "ok" });
    const saveSection = presentation.sections.find((section) => section.id === "save");
    expect(saveSection?.items).toContainEqual({ label: "Slots", value: "4", tone: "default" });
    expect(saveSection?.items).toContainEqual({ label: "Checksum", value: "Ativo (obrigatório)", tone: "ok" });
    expect(saveSection?.editableFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "saveType",
        options: expect.arrayContaining([
          expect.objectContaining({ value: "sram" }),
          expect.objectContaining({ value: "flash1m" })
        ])
      })
    ]));
    expect(saveSection?.editableFields.map((field) => field.key)).not.toContain("useChecksum");
    expect(presentation.sections.find((section) => section.id === "debug")?.items).toContainEqual({ label: "Flags debug", value: "2 ativas", tone: "warning" });
    expect(presentation.gameplayPresets.map((preset) => preset.id)).toEqual(["topdown", "platformer", "debug"]);
  });

  it("persists comma-separated alternatives for GBA controls", () => {
    const updated = updateSettingsFieldInProject(
      { settings: { controls: {} } },
      "controls",
      "up",
      "ArrowUp,w"
    );

    expect(updated.settings).toMatchObject({ controls: { up: "ArrowUp,w" } });
  });

  it("exposes scalable project storage and persistent incremental build controls", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        build: {
          splitProjectResources: true,
          compactTilemaps: true,
          persistentBuildCache: true
        }
      }
    });
    const build = presentation.sections.find((section) => section.id === "build");

    expect(build?.editableFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "splitProjectResources", type: "boolean", value: true }),
      expect.objectContaining({ key: "compactTilemaps", type: "boolean", value: true }),
      expect.objectContaining({ key: "persistentBuildCache", type: "boolean", value: true })
    ]));

    const updated = updateSettingsFieldInProject(
      { settings: { build: {} } },
      "build",
      "splitProjectResources",
      true
    );
    expect(updated).toMatchObject({ settings: { build: { splitProjectResources: true } } });
  });

  it("ignores legacy top-level paths and reports missing current settings groups", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        butanoPath: "/legacy/butano",
        devkitARMPath: "/legacy/devkit",
        emulatorPath: "/legacy/mgba",
        exportDirectory: "/legacy/export",
        autoOpenEmulator: true
      }
    });

    expect(presentation.summary).toMatchObject({
      hasSettings: true,
      configuredPathCount: 0,
      availableSceneTypeCount: SCENE_TYPE_OPTIONS.length,
      enabledPreviewOverlayCount: 0,
      enabledDebugFlagCount: 0,
      engineBackend: "Nao definido",
      audioMode: "Nao definido",
      startScene: "Nao definida",
      exportFolder: "Nao definido",
      diagnosticWarningCount: 3,
      warnings: ["Settings incompletos: alguns grupos serao exibidos com fallbacks."]
    });
    expect(presentation.sections.find((section) => section.id === "build")?.items).toContainEqual({ label: "Compiler", value: "Nao definido", tone: "muted" });
    expect(presentation.sections.find((section) => section.id === "preview")?.items).toContainEqual({ label: "Emulador path", value: "Nao definido", tone: "muted" });
    expect(presentation.sections.find((section) => section.id === "preview")?.items).toContainEqual({ label: "Rodar apos build", value: "nao", tone: "muted" });
  });

  it("diagnoses settings coherence for build, preview, audio and start scene", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      scenas: [{ name: "overworld" }],
      settings: {
        general: {
          startScene: "missing_room",
          exportFolder: ""
        },
        build: {
          engineBackend: "butano",
          runEmulatorAfterBuild: true
        },
        preview: {
          runAfterBuild: true,
          emulatorPath: ""
        },
        audio: {
          enablePsgChannels: false,
          enableDirectSoundA: false,
          enableDirectSoundB: false
        }
      }
    });

    expect(presentation.summary.diagnosticWarningCount).toBe(3);
    expect(presentation.diagnostics).toEqual([
      {
        id: "start-scene",
        label: "Cena inicial",
        detail: "Cena inicial não existe no projeto: missing_room.",
        tone: "warning"
      },
      {
        id: "engine-backend",
        label: "Backend",
        detail: "Backend atual nao aponta para GBAStudioEngine: butano.",
        tone: "warning"
      },
      {
        id: "engine-pack",
        label: "Engine Pack",
        detail: "Engine Pack nao exigido pelo backend atual.",
        tone: "muted"
      },
      {
        id: "export-folder",
        label: "Export",
        detail: "Pasta de exportacao nao definida.",
        tone: "warning"
      }
    ]);
  });

  it("explains automatic Engine Pack detection without reporting a missing override as an error", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      scenas: [{ name: "overworld" }],
      settings: {
        general: {
          startScene: "overworld",
          exportFolder: "build"
        },
        build: {
          engineBackend: "gbastudio_engine"
        },
        audio: {
          enablePsgChannels: true
        }
      }
    });

    expect(presentation.summary.diagnosticWarningCount).toBe(0);
    expect(presentation.diagnostics.find((diagnostic) => diagnostic.id === "engine-pack")).toEqual({
      id: "engine-pack",
      label: "Engine Pack",
      detail: "Engine Pack usa detecção automática; confirme o pack detectado no diagnóstico.",
      tone: "muted"
    });
    expect(presentation.sections.find((section) => section.id === "build")?.items).toContainEqual({ label: "Engine Pack", value: "Nao definido", tone: "warning" });
  });

  it("derives configured path validation targets from editable fields", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        general: {
          exportFolder: "build"
        },
        build: {
          enginePackPath: "/packs/GBAStudioEnginePack",
          compilerPath: "/opt/devkitARM"
        },
        preview: {
          emulatorPath: "/Applications/mGBA.app"
        }
      }
    });

    expect(deriveSettingsPathValidationTargets(presentation)).toEqual([
      {
        id: "general.exportFolder",
        label: "Export",
        path: "build",
        mode: "directory",
        allowCreate: true,
        expectedTools: undefined,
        expectedFiles: undefined
      },
      {
        id: "build.enginePackPath",
        label: "Engine Pack",
        path: "/packs/GBAStudioEnginePack",
        mode: "directory",
        expectedTools: ["assetc", "gbsdoctor", "gbsbuild"],
        expectedFiles: ["enginepack.json", "schemas/gbastudio_project.schema.json", "templates/Makefile.gba", "lib/libgbastudio_engine.a"]
      }
    ]);
  });

  it("uses the detected Engine Pack only as an explicit validation fallback", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        build: { enginePackPath: "GBAStudioEnginePack" }
      }
    });

    expect(deriveSettingsPathValidationTargets(presentation, "export", {
      enginePackFallbackPath: "/workspace/packages/GBAStudioEngine/dist/GBAStudioEnginePack"
    })).toContainEqual({
      id: "build.enginePackPath",
      label: "Engine Pack",
      path: "GBAStudioEnginePack",
      validationPath: "/workspace/packages/GBAStudioEngine/dist/GBAStudioEnginePack",
      mode: "directory",
      expectedTools: ["assetc", "gbsdoctor", "gbsbuild"],
      expectedFiles: ["enginepack.json", "schemas/gbastudio_project.schema.json", "templates/Makefile.gba", "lib/libgbastudio_engine.a"]
    });
  });

  it("exposes editable fields for gameplay, asset and system settings sections", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        topdown: {
          walkSpeed: 1.25,
          allowDiagonal: true
        },
        platformer: {
          gravity: 0.5,
          doubleJump: true
        },
        isometric: {
          maxHeight: 6,
          depthSort: false
        },
        shmup: {
          scrollSpeed: 2,
          autoFire: false
        },
        pointAndClick: {
          cursorSpeed: 1.75,
          snapHotspots: true
        },
        backgrounds: {
          parallax: false,
          mapCompression: "None"
        },
        uiDialogs: {
          textSpeed: "Rapida",
          showPortrait: true
        },
        transitions: {
          duration: "0.75 s",
          onOpenMenu: true
        },
        projectiles: {
          activeProjectiles: 24,
          destroyOnCollision: false
        }
      }
    });

    for (const sectionID of ["topdown", "platformer", "isometric", "visualNovel", "cutscene", "shmup", "pointAndClick", "backgrounds", "uiDialogs", "transitions"] as const) {
      expect(presentation.sections.find((section) => section.id === sectionID)?.editableFields.length).toBeGreaterThan(0);
    }

    expect(presentation.sections.find((section) => section.id === "topdown")?.editableFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "walkSpeed", label: "Velocidade caminhada", type: "number", value: 1.25 })
      ])
    );
    expect(presentation.sections.find((section) => section.id === "projectiles")?.editableFields).toEqual([]);

    expect(presentation.sections.find((section) => section.id === "audio")?.editableFields.find((field) => field.key === "masterVolume")).toBeUndefined();
    expect(presentation.sections.find((section) => section.id === "audio")?.editableFields.find((field) => field.key === "sampleRate")?.options).toEqual([
      { value: 0, label: "Automático" },
      { value: 11025, label: "11.025 Hz" },
      { value: 16000, label: "16.000 Hz" },
      { value: 22050, label: "22.050 Hz" },
      { value: 32000, label: "32.000 Hz" },
      { value: 32768, label: "32.768 Hz" }
    ]);
  });

  it("exposes scene constraints, semantic options and project transition defaults", () => {
    const project = {
      settings: {
        topdown: { walkSpeed: 1.25, movementBehavior: "Tile", gridSize: "16 px" },
        isometric: { tileWidth: "24 px", tileHeight: "8 px" },
        platformer: { dropThrough: "down_hold", dashStyle: "air" },
        transitions: { style: "wipe", durationFrames: 48, fadeOut: false, fadeIn: true }
      }
    };
    const presentation = deriveSettingsWorkspacePresentation(project);
    const topdown = presentation.sections.find((section) => section.id === "topdown");
    const isometric = presentation.sections.find((section) => section.id === "isometric");
    const transitions = presentation.sections.find((section) => section.id === "transitions");

    expect(topdown?.editableFields.find((field) => field.key === "walkSpeed")).toMatchObject({
      maximum: 16,
      minimum: 0,
      range: true,
      step: 0.05,
      unit: "tiles/frame",
      value: 1.25
    });
    expect(topdown?.editableFields.find((field) => field.key === "movementBehavior")).toBeUndefined();
    expect(isometric?.editableFields.find((field) => field.key === "tileHeight")).toMatchObject({
      readOnly: true,
      value: "12 px"
    });
    expect(transitions?.editableFields.find((field) => field.key === "style")?.options).toHaveLength(7);
    expect(transitions?.editableFields.find((field) => field.key === "durationFrames")).toMatchObject({
      maximum: 600,
      minimum: 0,
      unit: "frames",
      value: 48
    });
    expect(transitions?.items).toEqual(expect.arrayContaining([
      { label: "Estilo", value: "Máscara lateral", tone: "default" },
      { label: "Duracao", value: "48", tone: "ok" },
      { label: "Ao sair", value: "nao", tone: "muted" },
      { label: "Ao entrar", value: "sim", tone: "ok" }
    ]));

    expect(updateSettingsFieldInProject(project, "topdown", "walkSpeed", 99).settings).toMatchObject({
      topdown: { walkSpeed: 16 }
    });
  });

  it("exposes named options for scene, background and world-map references", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      assets: [{ id: "bg", name: "forest.png", kind: "Tileset" }],
      scenas: [
        { id: "vn-a", name: "chapter_a", sceneType: "visualNovel" },
        { id: "vn-b", name: "chapter_b", sceneType: "visualNovel" },
        { id: "level", name: "forest_level", sceneType: "platformer", backgroundAssetName: "forest.png" },
        { id: "cut", name: "intro_cutscene", sceneType: "cutscene" }
      ],
      settings: { visualNovel: { nextSceneIndex: 1, backgroundIndex: 0 } }
    });
    const visualNovel = presentation.sections.find((section) => section.id === "visualNovel");
    expect(visualNovel?.editableFields.find((field) => field.key === "nextSceneIndex")?.options).toEqual([
      { value: -1, label: "Sequencial" },
      { value: 0, label: "chapter_a" },
      { value: 1, label: "chapter_b" }
    ]);
    expect(visualNovel?.editableFields.find((field) => field.key === "backgroundIndex")?.options).toEqual([
      { value: -1, label: "Sem fundo" },
      { value: 0, label: "forest.png" }
    ]);
  });

  it("does not expose global scene type toggles as editable fields", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        sceneTypes: {
          defaultSceneType: "topdown",
          enabled: {
            topdown: true,
            platformer: false,
            isometric: true,
            shmup: false,
            pointAndClick: true
          }
        }
      }
    });

    const fields = presentation.sections.find((section) => section.id === "sceneTypes")?.editableFields ?? [];
    expect(fields.some((field) => field.key.startsWith("enabled."))).toBe(false);
    expect(fields.find((field) => field.key === "defaultSceneType")).toBeUndefined();
    expect(fields.filter(field => field.key.startsWith("defaultPlayerSprites."))).toHaveLength(SCENE_TYPE_OPTIONS.length);
    expect(fields.filter(field => field.key.startsWith("defaultBackgrounds."))).toHaveLength(16);
  });

  it("exposes a default player sprite picker for every scene type", () => {
    const project = {
      assets: [
        { name: "hero-topdown.png", kind: "Sprite" },
        { name: "hero-platformer.png", kind: "Sprite" },
        { name: "dialogue-box.png", kind: "UI" }
      ],
      settings: {
        sceneTypes: {
          defaultPlayerSprites: {
            topdown: "hero-topdown.png",
            platformer: "hero-platformer.png",
            cutscene: ""
          }
        }
      }
    };

    const presentation = deriveSettingsWorkspacePresentation(project);
    const fields = presentation.sections.find((section) => section.id === "sceneTypes")?.editableFields ?? [];
    const topdown = fields.find((field) => field.key === "defaultPlayerSprites.topdown");
    const platformer = fields.find((field) => field.key === "defaultPlayerSprites.platformer");
    const cutscene = fields.find((field) => field.key === "defaultPlayerSprites.cutscene");

    expect(topdown).toMatchObject({
      label: "Player padrão · Aventura / Top-down",
      type: "text",
      value: "hero-topdown.png"
    });
    expect(topdown?.options).toEqual([
      { value: "", label: "Sem player automático" },
      { value: "hero-platformer.png", label: "hero-platformer.png" },
      { value: "hero-topdown.png", label: "hero-topdown.png" }
    ]);
    expect(platformer?.value).toBe("hero-platformer.png");
    expect(cutscene?.value).toBe("");

    const updated = updateSettingsFieldInProject(
      project,
      "sceneTypes",
      "defaultPlayerSprites.platformer",
      "hero-topdown.png"
    );
    expect(updated.settings).toMatchObject({
      sceneTypes: {
        defaultPlayerSprites: {
          topdown: "hero-topdown.png",
          platformer: "hero-topdown.png",
          cutscene: ""
        }
      }
    });
  });

  it("exposes sliders for advanced numeric scene settings while keeping semantic destinations as selects", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });
    const field = (sectionID: SettingsSectionID, fieldKey: string) => presentation.sections
      .find((section) => section.id === sectionID)?.editableFields.find((item) => item.key === fieldKey);

    for (const [sectionID, fieldKeys] of [
      ["platformer", ["jumpMinHeight", "jumpFrames", "coyoteTime", "jumpBuffer", "cameraDeadzoneX", "dashRechargeFrames"]],
      ["dungeonCrawler", ["stepDurationMs", "turnDurationMs", "viewDistance"]],
      ["battleRpg", ["maxPartySize", "maxEnemies", "turnDelayFrames", "experienceMultiplier", "rewardGold", "rewardExperience"]],
      ["luta", ["roundTime", "roundsToWin", "maxSuperGauge", "superGaugeGainOnHit", "superGaugeGainOnReceive", "guardPowerRecovery", "throwEscapeWindow", "parryWindow", "hitstunDecay", "comboLimit", "vismCustomComboGauge"]],
      ["worldMap", ["requiredVariable", "requiredValue", "targetLevel"]],
      ["cutscene", ["stepDurationFrames"]],
      ["shmup", ["fireRate"]],
      ["pointAndClick", ["hotspotPadding"]],
      ["transitions", ["durationFrames"]]
    ] as const) {
      for (const fieldKey of fieldKeys) {
        expect(field(sectionID, fieldKey)).toMatchObject({ range: true, minimum: expect.any(Number), maximum: expect.any(Number) });
      }
    }

    expect(field("visualNovel", "nextSceneIndex")?.options?.length).toBeGreaterThan(0);
    expect(field("cutscene", "nextSceneIndex")?.options?.length).toBeGreaterThan(0);
  });

  it("derives intent cards for dense movement settings sections", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        topdown: {
          movementBehavior: "Continuo",
          movementType: "8 direcoes",
          allowDiagonal: true,
          runSpeed: 1.75
        },
        platformer: {
          gravity: 0.44,
          airControl: true,
          coyoteTime: 6
        },
        isometric: {
          tileWidth: "16 px",
          movement: "4 direcoes projetadas",
          maxHeight: 7
        },
        shmup: {
          scrollSpeed: 1,
          playerSpeed: 2,
          autoFire: true
        },
        pointAndClick: {
          cursorSpeed: 1.5,
          highlightInteractives: true,
          hotspotPadding: 4
        }
      }
    });

    expect(presentation.sections.find((section) => section.id === "topdown")?.intentGroups).toEqual([
      {
        title: "Ritmo",
        options: [
          expect.objectContaining({ id: "topdown.rhythm.calm", title: "Calmo", fieldCount: 1, applied: false }),
          expect.objectContaining({ id: "topdown.rhythm.normal", title: "Normal", fieldCount: 1, applied: true }),
          expect.objectContaining({ id: "topdown.rhythm.fast", title: "Rapido", fieldCount: 1, applied: false })
        ]
      }
    ]);
    expect(presentation.sections.find((section) => section.id === "platformer")?.intentGroups.map((group) => group.title)).toEqual([
      "Sensacao do pulo",
      "Controle no ar",
      "Tolerancia do pulo"
    ]);
    expect(presentation.sections.find((section) => section.id === "isometric")?.intentGroups.map((group) => group.title)).toEqual([
      "Grade"
    ]);
    expect(presentation.sections.find((section) => section.id === "shmup")?.intentGroups.map((group) => group.title)).toEqual([
      "Ritmo do scroll",
      "Agilidade",
      "Disparo"
    ]);
    expect(presentation.sections.find((section) => section.id === "pointAndClick")?.intentGroups.map((group) => group.title)).toEqual([
      "Cursor",
      "Hotspot"
    ]);
    expect(presentation.sections.find((section) => section.id === "audio")?.intentGroups).toEqual([]);
  });
});

describe("Settings workspace editing", () => {
  it("updates typed nested settings fields without dropping unknown project data", () => {
    const project = {
      name: "Editable Settings",
      customTopLevel: { keep: true },
      settings: {
        general: {
          gameTitle: "Old Title",
          startScene: "old-room",
          unknownGeneral: "preserve"
        },
        build: {
          generateDebugFiles: false
        }
      }
    };

    const withTitle = updateSettingsFieldInProject(project, "general", "gameTitle", "New Title");
    const withDebug = updateSettingsFieldInProject(withTitle, "build", "generateDebugFiles", true);

    expect(withDebug).not.toBe(project);
    expect(withDebug.customTopLevel).toEqual({ keep: true });
    expect(withDebug.settings).toMatchObject({
      general: {
        gameTitle: "New Title",
        startScene: "old-room",
        unknownGeneral: "preserve"
      },
      build: {
        generateDebugFiles: false
      }
    });
  });

  it("creates missing settings groups when a field is edited", () => {
    const next = updateSettingsFieldInProject({ name: "Empty" }, "audio", "sampleRate", 16000);

    expect(next.settings).toMatchObject({
      audio: {
        sampleRate: 16000
      }
    });
  });

  it("updates and resets rich gameplay settings fields", () => {
    const project = {
      settings: {
        topdown: {
          walkSpeed: 1,
          customTopdown: "keep"
        }
      }
    };

    const updated = updateSettingsFieldInProject(project, "topdown", "walkSpeed", 1.75);
    const reset = resetSettingsSectionInProject(updated, "topdown");

    expect(updated.settings).toMatchObject({
      topdown: {
        walkSpeed: 1.75,
        customTopdown: "keep"
      }
    });
    expect(reset.settings).toMatchObject({
      topdown: {
        walkSpeed: 1,
        customTopdown: "keep"
      }
    });
  });

  it("ignores legacy scene type toggles while preserving them during reset", () => {
    const project = {
      settings: {
        sceneTypes: {
          defaultSceneType: "topdown",
          enabled: {
            topdown: true,
            platformer: false
          },
          customSceneTypeKey: "keep"
        }
      }
    };

    const updated = updateSettingsFieldInProject(project, "sceneTypes", "enabled.platformer", true);
    const reset = resetSettingsSectionInProject(updated, "sceneTypes");

    expect(updated).toBe(project);
    expect(reset.settings).toMatchObject({
      sceneTypes: {
        defaultSceneType: "topdown",
        enabled: {
          topdown: true,
          platformer: false
        },
        customSceneTypeKey: "keep"
      }
    });
  });

  it("resets editable fields in a section to defaults while preserving extra keys", () => {
    const project = {
      settings: {
        preview: {
          defaultMode: "custom",
          scale: 5,
          showCollisions: true,
          customPreviewFlag: "keep"
        }
      }
    };

    const next = resetSettingsSectionInProject(project, "preview");

    expect(next.settings).toMatchObject({
      preview: {
        defaultMode: "custom",
        scale: 5,
        showCollisions: true,
        customPreviewFlag: "keep"
      }
    });
  });

  it("applies gameplay presets without dropping unrelated settings", () => {
    const project = {
      customTopLevel: { keep: true },
      settings: {
        general: {
          gameTitle: "Keep Title",
          startSceneType: "custom",
          startPlayer: "Hero",
          customGeneral: "preserve"
        },
        preview: {
          scale: 5,
          showCollisions: false,
          showGrid: false,
          customPreview: "preserve"
        },
        debug: {
          showCpuUsage: false,
          developerMode: false,
          customDebug: "preserve"
        }
      }
    };

    const topdown = applySettingsGameplayPresetInProject(project, "topdown");
    const debug = applySettingsGameplayPresetInProject(topdown, "debug");

    expect(debug.customTopLevel).toEqual({ keep: true });
    expect(debug.settings).toMatchObject({
      general: {
        gameTitle: "Keep Title",
        startSceneType: "custom",
        startPlayer: "Player",
        customGeneral: "preserve"
      },
      preview: {
        scale: 5,
        showCollisions: false,
        showGrid: false,
        customPreview: "preserve"
      },
      debug: {
        showCpuUsage: true,
        showVramUsage: true,
        developerMode: false,
        customDebug: "preserve"
      }
    });
    expect(project.settings.general.startSceneType).toBe("custom");
    expect(applySettingsGameplayPresetInProject(project, "missing")).toBe(project);
  });
});
