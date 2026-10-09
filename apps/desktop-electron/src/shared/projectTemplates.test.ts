import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditExportEventCommandCoverage, buildEngineExportProjectContract, prepareEngineProjectExport } from "../main/exportEngineProject.js";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { deriveDialoguesWorkspacePresentation, deriveDialoguesWorkspaceValidationIssues } from "./dialoguesWorkspace.js";
import { buildAssetcAudioPackGeneration, buildAssetcSpritePackGeneration } from "./engineProjectExport.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { gbaActorSpriteRoomPlacementFromFrame, resolveGbaActorSprite } from "./gbaRendering.js";
import { parseManifestDataTable } from "./gbaStudioPluginDataTables.js";
import { buildProjectPluginRegistry } from "./gbaStudioPlugins.js";
import { deriveHudPresetsWorkspacePresentation, resolveHudPresetForRoom } from "./hudPresets.js";
import { buildProjectFromTemplate, projectTemplateDefinitions } from "./projectTemplates.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { deriveSpritesWorkspacePresentation } from "./spritesWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "./projectFile.js";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";

function exemploGBAPluginRegistry() {
  const manifest = JSON.parse(readFileSync(
    new URL("../../default-assets/templates/exemplo-gba/plugins/farol-data/plugin.json", import.meta.url),
    "utf8"
  )) as { id: string; dataTables: unknown[] };
  const dataTables = manifest.dataTables.map((table) => {
    const parsed = parseManifestDataTable(table, manifest.id);
    if ("error" in parsed) throw new Error(parsed.error);
    return parsed;
  });
  return buildProjectPluginRegistry([], [], { dataTables });
}

describe("projectTemplates", () => {
  it("includes the approved modular purple HUD without enabling it on blank scenes", () => {
    const project = buildProjectFromTemplate("blank", { name: "HUD roxa" });
    const hud = deriveHudPresetsWorkspacePresentation(project).activePreset;
    expect(hud).toMatchObject({ id: "hud-default", mode: "advanced", backgroundImage: "neutral-hud-skin.png" });
    expect(hud.components.filter(c => c.kind === "frame")).toHaveLength(2);
    expect(hud.components.some(c => c.runtimeText && c.kind === "text")).toBe(true);
    const boundProject = structuredClone(project);
    (boundProject.rooms as Record<string,unknown>[])[0].hudPresetId = hud.id;
    const pack = buildAssetcSpritePackGeneration(boundProject)!;
    expect(pack.assetsBySheet["neutral-hud-frame-wide.png"]).toMatchObject({sprite_width:96,sprite_height:32});
    expect(pack.assetsBySheet["neutral-hud-bar-half.png"]).toMatchObject({sprite_width:72,sprite_height:8});
    expect(deriveSpritesWorkspacePresentation(project).spriteSheets.some(sheet => sheet.name.startsWith("neutral-hud-"))).toBe(false);
    expect(prepareEngineProjectExport(boundProject).generated!.assets.find(asset => asset.name === "neutral-hud-bar-half.png")?.output).toBe("assets/sprite/neutral_hud_bar_half.png");
    const assets = project.assets as Record<string, any>[];
    for (const component of hud.components.filter(c => c.asset)) {
      expect(assets.some(a => a.name === component.asset)).toBe(true);
    }
    expect((project.rooms as Record<string, unknown>[])[0].hudPresetId).toBeUndefined();
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({data:project,summary:summarizeGBAProject(project)})).data;
    expect(deriveHudPresetsWorkspacePresentation(reopened).activePreset.components).toEqual(hud.components);
    hud.components[0].x = 120;
    expect(deriveHudPresetsWorkspacePresentation(buildProjectFromTemplate("blank", {name:"Outro"})).activePreset.components[0].x).toBe(8);
  });
  it("offers the example and an empty project in the public catalog", () => {
    expect(projectTemplateDefinitions.map((template) => template.id)).toEqual(["exemplo-gba", "blank"]);
  });

  it("creates and reopens a blank project without example content or dangling asset references", () => {
    const created = buildProjectFromTemplate("blank", { name: "  Meu jogo  " });
    const project = parseGBAProjectFile(serializeGBAProjectFile({ data: created, summary: summarizeGBAProject(created) })).data;
    expect(project.name).toBe("Meu jogo");
    expect(validateGBAProjectMigrationContract(project)).toEqual([]);
    for (const collection of ["triggers", "dialogues", "events", "audioItems"]) {
      expect(project[collection]).toEqual([]);
    }
    expect((project.assets as Record<string, any>[]).every(asset => asset.metadata.bundledDefaultAsset.startsWith("template:blank/"))).toBe(true);
    const rooms = deriveRoomsWorkspacePresentation(project);
    expect(rooms.rooms).toHaveLength(1);
    expect(rooms.rooms[0]).toMatchObject({ name: "cena_1", width: 30, height: 20 });
    expect((project.rooms as Array<Record<string, unknown>>)[0].backgroundAssetName).toBe("neutral-background-topdown.png");
    expect(rooms.rooms[0]?.tileCells).toHaveLength(600);
    expect(rooms.entities).toHaveLength(1);
    expect(rooms.entities[0]).toMatchObject({ name: "Player", spriteSheet: "neutral-player-topdown.png" });
    expect(project.settings).toMatchObject({
      general: { gameTitle: "Meu jogo", startScene: "cena_1", startPlayer: "Player", exportFolder: "build" },
      build: { romFileName: "meu_jogo.gba" },
      sceneTypes: { defaultPlayerSprites: { topdown: "neutral-player-topdown.png" } },
      topdown: { playerSprite: "neutral-player-topdown.png" },
      pointAndClick: { font: "", cursorImage: "neutral-cursor-hand.png" },
      uiDialogs: { boxImage: "neutral-dialogue-skin.png", font: "", selectorImage: "neutral-dialogue-selector.png", defaultPortrait: "neutral-portrait.png", portraitLayout: "fixed_slots" }
    });
    (created.rooms as Array<Record<string, unknown>>)[0].name = "Editada";
    expect((buildProjectFromTemplate("blank", { name: "Outro" }).rooms as Array<Record<string, unknown>>)[0].name).toBe("cena_1");
  });

  it("apresenta O Último Farol como identidade do template", () => {
    expect(projectTemplateDefinitions[0]).toMatchObject({
      id: "exemplo-gba",
      title: "O Último Farol",
      detail: expect.stringContaining("runtimes nativos")
    });
    expect(buildProjectFromTemplate("exemplo-gba", { name: "O Último Farol" }).name)
      .toBe("O Último Farol");
  });

  it("expande os tilemaps compactos ao criar o template e preserva as duas camadas de Penedos", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Camadas completas" });
    const scenes = project.scenas as Array<Record<string, unknown>>;
    const rooms = project.rooms as Array<Record<string, unknown>>;
    const scene = scenes.find((room) => room.name === "penedos_vento")!;
    const layers = scene.tileLayers as Array<Record<string, unknown>>;

    expect(Array.isArray(scene.tilemap)).toBe(true);
    expect(scene.tilemap).toHaveLength(600);
    expect(layers.map((layer) => layer.mapping)).toEqual(["BG3", "BG2"]);
    expect(layers.map((layer) => layer.tilemap)).toEqual([Array(600).fill(0), Array(600).fill(0)]);
    expect(layers.map((layer) => layer.tileSourceAssetNames)).toEqual([
      Array(600).fill("penedos-v13-fundo-240x160.png"),
      Array(600).fill("penedos-v13-terreno-240x160.png")
    ]);
    expect(rooms.find((room) => room.name === "penedos_vento")?.tileLayers).toEqual(layers);
    expect(deriveRoomsWorkspacePresentation(project).rooms.find((room) => room.name === "penedos_vento")?.backgroundLayers)
      .toEqual([
        expect.objectContaining({ mapping: "BG3", assetName: "penedos-v13-fundo-240x160.png", source: "Assets/backgrounds/penedos-v13-fundo-240x160.png" }),
        expect.objectContaining({ mapping: "BG2", assetName: "penedos-v13-terreno-240x160.png", source: "Assets/backgrounds/penedos-v13-terreno-240x160.png" })
      ]);
  });

  it("builds the self-contained Exemplo GBA template with bundled project assets", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Minha Aventura GBA" });
    const assets = Array.isArray(project.assets) ? project.assets as Array<Record<string, unknown>> : [];
    const scenes = Array.isArray(project.scenas) ? project.scenas as Array<Record<string, unknown>> : [];
    const rooms = Array.isArray(project.rooms) ? project.rooms as Array<Record<string, unknown>> : [];

    expect(project.name).toBe("Minha Aventura GBA");
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.map((scene) => scene.name)).toEqual(rooms.map((room) => room.name));
    const sceneNames = scenes.map((scene) => scene.name);
    expect(sceneNames).toEqual(expect.arrayContaining(["armazem_das_mares", "observatorio_do_farol"]));
    expect(sceneNames).not.toContain("oficina");
    expect(sceneNames).not.toContain("idioma");
    expect(sceneNames).not.toContain("configuracoes_audio");
    expect(sceneNames).not.toContain("configuracoes_controles");
    expect(assets.length).toBeGreaterThan(0);
    expect(project.settings).toMatchObject({
      debug: {
        developerMode: true
      }
    });
    expect(assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "opening-v4-per-tile-14-banks.png",
        metadata: expect.objectContaining({
          source: "Assets/backgrounds/opening-v4-per-tile-14-banks.png",
          bundledDefaultAsset: "template:exemplo-gba/Assets/backgrounds/opening-v4-per-tile-14-banks.png"
        })
      })
    ]));
    const events = deriveEventsWorkspacePresentation(project);
    expect(events.summary.missingReferenceCount).toBe(0);
    expect(project.gbStudioImport).toMatchObject({ unsupportedEventCount: 0 });
    expect(auditExportEventCommandCoverage(project)).toEqual({ ok: true, unsupported: [] });
    const exportContract = buildEngineExportProjectContract(project, {
      pluginRegistry: exemploGBAPluginRegistry()
    });
    expect(exportContract.export_warnings ?? []).toEqual([]);
    expect(exportContract.export_notices?.length).toBeGreaterThan(0);
    expect(exportContract.export_notices?.every((notice) => notice.startsWith("VRAM:"))).toBe(true);
    expect((exportContract.export_warnings ?? []).some((warning) => warning.startsWith("Palette:"))).toBe(false);
    const tacticalExportRoom = exportContract.isometric_project?.rooms.find((room) => room.name === "arena_tatica");
    expect(tacticalExportRoom?.world_mode).toBe("scrollable_tiled_world");
    expect(tacticalExportRoom).not.toHaveProperty("authored_background");
    const tacticalScene = scenes.find((scene) => scene.name === "arena_tatica");
    const tacticalGridConfig = (tacticalScene?.runtime as {
      config?: {
        originX?: number;
        originY?: number;
        tacticalPresentation?: {
          surfacePages?: Array<{ id: string; bankGroup: string; world: Record<string, number> }>;
          surfaceResidency?: {
            exclusiveBankGroups: string[];
            maxResidentGroups: number;
            prefetchMarginPixels: number;
          };
        };
      };
    } | undefined)?.config;
    const tacticalPages = tacticalGridConfig?.tacticalPresentation?.surfacePages ?? [];
    const tacticalResidency = tacticalGridConfig?.tacticalPresentation?.surfaceResidency;
    expect(tacticalExportRoom?.grid?.origin).toEqual({
      x: tacticalGridConfig?.originX,
      y: tacticalGridConfig?.originY
    });
    expect(tacticalExportRoom?.camera?.bounds).toEqual(tacticalScene?.cameraBounds);
    const tacticalPresentation = tacticalExportRoom?.tactical_presentation;
    expect(tacticalPresentation?.surface_pages).toHaveLength(tacticalPages.length);
    expect(tacticalPresentation?.surface_pages).toEqual(tacticalPages.map((page) => expect.objectContaining({
      id: page.id,
      bank_group: page.bankGroup,
      world: page.world
    })));
    expect(tacticalPresentation?.surface_residency).toEqual({
      exclusive_bank_groups: tacticalResidency?.exclusiveBankGroups,
      max_resident_groups: tacticalResidency?.maxResidentGroups,
      prefetch_margin_pixels: tacticalResidency?.prefetchMarginPixels
    });
    expect(exportContract.asset_pack?.resident_sets).toEqual([
      {
        id: `${tacticalScene?.name}_surface_pages`,
        room: "arena_tatica",
        groups: tacticalResidency?.exclusiveBankGroups,
        max_resident_groups: tacticalResidency?.maxResidentGroups
      }
    ]);
    const dialogues = deriveDialoguesWorkspacePresentation(project);
    const dialogueIssues = deriveDialoguesWorkspaceValidationIssues(dialogues);
    expect(dialogues.localization).toEqual({
      sourceLocale: "en",
      defaultLocale: "pt-BR",
      enabledLocales: ["pt-BR", "en", "es"]
    });
    expect(dialogues.summary.translationCompletion).toBe("100%");
    expect(dialogueIssues.filter((issue) => issue.id.startsWith("translation-") || issue.id.startsWith("choice-translation-"))).toEqual([]);
    const localizedDialogues = Array.isArray(project.dialogues)
      ? project.dialogues as Array<Record<string, unknown>>
      : [];
    expect(localizedDialogues.find((dialogue) => dialogue.key === "prologo_frame_1")?.translations).toMatchObject({
      "pt-BR": "Os faróis da costa se apagam um a um. O último clarão ainda recorta o cais.",
      es: "Os faróis da costa se apagam um a um. O último clarão ainda recorta o cais."
    });
    const audio = deriveAudioWorkspacePresentation(project);
    const audioPack = buildAssetcAudioPackGeneration(project);
    expect(audio.items).toHaveLength(29);
    expect(audio.items.flatMap(item => item.errors)).toEqual([]);
    // The bundled SFX explicitly author their effective Pulse 1 voice.
    // New projects should start without legacy channel warnings.
    expect(audio.items.flatMap(item => item.warnings)).toEqual([]);
    expect(audioPack).not.toBeNull();
    const authoredAudio = Array.isArray(project.audioItems)
      ? project.audioItems as Array<Record<string, unknown>>
      : [];
    expect(authoredAudio).toHaveLength(29);
    expect(JSON.stringify(project)).not.toContain("gb_builtin_crash");
    const audioNames = new Set(authoredAudio.map((item) => String(item.name)));
    const eventAudio = (project.events as Array<Record<string, unknown>>).flatMap((event) => (
      (event.steps as Array<Record<string, unknown>> | undefined) ?? []
    )).flatMap((step) => {
      const [verb, name] = String(step.command ?? "").split(/\s+/);
      return ["play_music", "play_sfx", "set_text_sfx"].includes(verb) && name ? [name] : [];
    });
    const roomAudio = (project.rooms as Array<Record<string, unknown>>).flatMap((room) => (
      typeof room.music === "string" && room.music ? [room.music] : []
    ));
    const dialogueAudio = (project.dialogues as Array<Record<string, unknown>>).flatMap((dialogue) => (
      [dialogue.textSound, dialogue.confirmSound].filter((name): name is string => typeof name === "string" && name.length > 0)
    ));
    const tacticalAudio = (project.scenas as Array<Record<string, unknown>>).flatMap((scene) => {
      const runtime = scene.runtime as Record<string, unknown> | undefined;
      const config = runtime?.config as Record<string, unknown> | undefined;
      const presentation = config?.tacticalPresentation as Record<string, unknown> | undefined;
      const audio = presentation?.audio as Record<string, unknown> | undefined;
      if (!audio) return [];
      return [
        audio.music,
        ...Object.values((audio.cues as Record<string, unknown> | undefined) ?? {})
      ].filter((name): name is string => typeof name === "string" && name.length > 0);
    });
    const referencedAudio = [...new Set([...eventAudio, ...roomAudio, ...dialogueAudio, ...tacticalAudio])];
    expect(referencedAudio.every((name) => audioNames.has(name))).toBe(true);
    expect(referencedAudio).toHaveLength(29);
    expect(referencedAudio).toEqual(expect.arrayContaining([
      "farol_tema_principal",
      "farol_sfx_texto",
      "farol_sfx_dialogo",
      "farol_sfx_vitoria"
    ]));
    expect(JSON.stringify(project)).not.toMatch(/\/Users|\.cache/);
  });

  it("configura os retratos fixos nas falas autoradas de cutscene", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Retratos de cutscene" });
    const settings = project.settings as Record<string, unknown>;
    const uiDialogs = settings.uiDialogs as Record<string, unknown>;
    const dialogues = project.dialogues as Array<Record<string, unknown>>;

    expect(uiDialogs).toMatchObject({
      portraitLayout: "fixed_slots",
      showPortrait: true
    });
    expect(dialogues.find((dialogue) => dialogue.key === "prologo_frame_3")).toMatchObject({
      character: "Nara",
      portrait: "nara-portrait.png",
      portraitSlot: "Esquerda"
    });
    expect(dialogues.find((dialogue) => dialogue.key === "conselho")).toMatchObject({
      character: "Guardiã",
      portrait: "council-v5-guardian.png",
      portraitSlot: "right"
    });
  });

  it("mantém o background aprovado da cena isométrica no preview do editor", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Preview futuro" });
    const room = deriveRoomsWorkspacePresentation(project).rooms.find((candidate) => candidate.name === "mercado_suspenso");

    expect(room).toMatchObject({
      background: "mercado-adventure-surface.png",
      backgroundTileWidth: 8,
      backgroundTileHeight: 8
    });
  });

  it("vincula a HUD avançada somente à cena isométrica do Mercado Suspenso", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "HUD Mercado" });
    const scenes = project.scenas as Array<Record<string, unknown>>;
    const market = scenes.find((scene) => scene.name === "mercado_suspenso");
    const presentation = deriveHudPresetsWorkspacePresentation(project);
    const marketHud = resolveHudPresetForRoom(project, market);

    expect(presentation.activePresetId).toBe("hud-tempestade-score");
    expect(presentation.presets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hud-default", mode: "standard" }),
      expect.objectContaining({
        id: "hud-mercado-avancada",
        name: "HUD Mercado",
        mode: "advanced",
        width: 240,
        height: 24,
        components: expect.arrayContaining([
          expect.objectContaining({ kind: "frame", x: 0, y: 0, width: 240, height: 24 }),
          expect.objectContaining({ kind: "icon", asset: "dialogue-sigil.png", x: 8, y: 8, width: 16, height: 16 }),
          expect.objectContaining({ kind: "text", text: "NARA", x: 32, y: 8 }),
          expect.objectContaining({ kind: "text", text: "A INTERAGIR", x: 136, y: 8, width: 88 })
        ])
      })
    ]));
    expect(market).toMatchObject({ hudPresetId: "hud-mercado-avancada" });
    expect(marketHud).toMatchObject({ id: "hud-mercado-avancada", mode: "advanced", ready: true });
    expect(scenes.filter((scene) => scene.hudPresetId === "hud-mercado-avancada")).toHaveLength(1);
    expect(scenes.find((scene) => scene.name === "nome_jogador")).not.toHaveProperty("hudPresetId");
  });

  it("vincula HUDs de exemplo à Usina, à Tempestade e ao Guardião do Relé", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "HUDs por cena" });
    const scenes = project.scenas as Array<Record<string, unknown>>;
    const settings = project.settings as Record<string, unknown>;
    const hudPresets = settings.hudPresets as Array<Record<string, unknown>>;
    const presetByID = new Map(hudPresets.map((preset) => [preset.id, preset]));
    const expectedBindings = [
      ["usina_submersa", "hud-usina-exploration-v3"],
      ["usina_combate", "hud-usina-combat-v3"],
      ["usina_saida", "hud-usina-exit-v3"],
      ["tempestade", "hud-tempestade-score"],
      ["guardiao_rele", "hud-guardiao-rele"]
    ];

    for (const [sceneName, presetID] of expectedBindings) {
      expect(scenes.find((scene) => scene.name === sceneName)).toMatchObject({ hudPresetId: presetID });
      const expectedFrame = presetID.startsWith("hud-usina-")
        ? { kind: "frame", x: 176, y: 0, width: 64, height: 112 }
        : { kind: "frame", width: 240, height: 24 };
      expect(presetByID.get(presetID)).toMatchObject({
        mode: "advanced",
        components: expect.arrayContaining([expect.objectContaining(expectedFrame)])
      });
    }

    expect(presetByID.get("hud-usina-lateral")?.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hud-usina-lateral-map-row-1", kind: "text", x: 184, y: 8, width: 48, height: 8 }),
      expect.objectContaining({ id: "hud-usina-lateral-hp", kind: "text", x: 184, y: 56, width: 48, height: 8 }),
      expect.objectContaining({ id: "hud-usina-lateral-item", kind: "text", x: 184, y: 64, width: 48, height: 8 }),
      expect.objectContaining({ id: "hud-usina-lateral-count", kind: "text", x: 184, y: 72, width: 48, height: 8 })
    ]));

    expect(presetByID.get("hud-tempestade-score")?.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hud-tempestade-score-value", kind: "text", text: "" }),
      expect.objectContaining({ id: "hud-tempestade-score-lives", kind: "text", text: "" }),
      expect.objectContaining({ id: "hud-tempestade-score-wave", kind: "text", text: "" })
    ]));

    expect(scenes.find((scene) => scene.name === "mapa_menu")).toHaveProperty("hudPresetId", "hud-neutral-mapa_menu");
    expect(presetByID.get("hud-menu-map-controls")).toMatchObject({
      mode: "advanced",
      components: expect.arrayContaining([
        expect.objectContaining({ id: "hud-menu-controls-dpad", text: "D MOVER", x: 0, y: 8 }),
        expect.objectContaining({ id: "hud-menu-map-controls-top-left-frame", anchor: "top-left", x: 8, y: 24 }),
        expect.objectContaining({ id: "hud-menu-map-controls-bottom-left-text", anchor: "bottom-left", x: 16, y: 136 })
      ])
    });

    const exported = buildEngineExportProjectContract(project);
    expect(exported.topdown_project?.dialogue_ui?.hud_scene_bindings).toEqual(expect.arrayContaining([
      ...expectedBindings.map(([scene_name, preset_id]) => ({ scene_name, preset_id }))
    ]));
  });

  it("preserva a HUD na biblioteca e libera a composição aprovada de plataforma", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "HUD Plataforma" });
    const scenes = project.scenas as Array<Record<string, unknown>>;
    const settings = project.settings as Record<string, unknown>;
    const hudPresets = settings.hudPresets as Array<Record<string, unknown>>;
    const platformerScene = scenes.find((scene) => scene.name === "penedos_vento");
    const platformerHud = hudPresets.find((preset) => preset.id === "hud-penedos-platformer");
    const components = platformerHud?.components as Array<Record<string, unknown>>;

    expect(platformerScene).toMatchObject({ width: 30, height: 20, cameraMode: "fixed_center" });
    expect(platformerScene).not.toHaveProperty("hudPresetId");
    expect(platformerHud).toMatchObject({
      mode: "advanced",
      description: "Duas áreas superiores para vida e itens durante a fase de plataforma."
    });
    expect(components).toHaveLength(4);
    expect(components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hud-penedos-platformer-top-left-frame", anchor: "top-left", width: 96 }),
      expect.objectContaining({ id: "hud-penedos-platformer-top-left-text", label: "Vida", text: "VIDA 03" }),
      expect.objectContaining({ id: "hud-penedos-platformer-top-right-frame", anchor: "top-right", width: 96 }),
      expect.objectContaining({ id: "hud-penedos-platformer-top-right-text", label: "Itens", text: "ITENS 00" })
    ]));
    expect(components.some((component) => String(component.anchor ?? "").startsWith("bottom"))).toBe(false);
  });

  it("mantém os atores e assets aprovados das cenas isométrica e Dungeon Crawler", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Assets por perspectiva" });
    const actors = project.actors as Array<Record<string, unknown>>;
    const assets = new Set((project.assets as Array<Record<string, unknown>>).map((asset) => String(asset.name)));

    expect(actors.filter((actor) => String(actor.roomName) === "mercado_suspenso")).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Aventureiro · Mercado", spriteSheet: "tactical-nara-v5.png", animationStateID: "market-adventure-player-state" }),
      expect.objectContaining({ name: "Mercador suspenso", spriteSheet: "market-adventure-merchant.png", animationStateID: "market-adventure-merchant-state" }),
      expect.objectContaining({ name: "Guarda do mercado", spriteSheet: "market-adventure-guard.png", animationStateID: "market-adventure-guard-state" })
    ]));
    expect(actors.filter((actor) => String(actor.roomName) === "usina_submersa")).toEqual([]);
    expect(actors.filter((actor) => String(actor.roomName) === "usina_combate")).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Sentinela da Usina", spriteSheet: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png" })
    ]));
    expect(actors.filter((actor) => String(actor.roomName) === "usina_saida")).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Célula de energia", spriteSheet: "usina-energy-cell-v3-4bpp.png" })
    ]));
    expect(assets.has("tactical-nara-v5.png")).toBe(true);
    expect(assets.has("market-adventure-merchant.png")).toBe(true);
    expect(assets.has("market-adventure-guard.png")).toBe(true);
    expect(assets.has("mercado-adventure-surface.png")).toBe(true);
    expect(assets.has("mercado-adventure-foreground.png")).toBe(true);
    expect(assets.has("sentinel-depth-far-mid-near-192x64-v3-4bpp.png")).toBe(true);
  });

  it("loads the official Exemplo GBA project from bundled template assets instead of fixtures", () => {
    const source = readFileSync(new URL("./projectTemplates.ts", import.meta.url), "utf8");

    expect(source).toContain("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project?raw");
    expect(source).not.toContain("../../fixtures/");
  });

  it("keeps one settings HUD and focuses Idioma through the title carousel", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Menu" });
    const scenes = project.scenas as Array<{ name: string; runtime?: { config?: { items?: Array<{ id: string; targetScreenID?: string; targetItemID?: string }>; screens?: Array<{ id: string; items?: Array<{ id: string; targetScreenID?: string; targetItemID?: string }> }> } } }>;
    const initial = scenes.find((scene) => scene.name === "titulo")?.runtime?.config?.screens?.find((screen) => screen.id === "title_options");
    const settings = scenes.find((scene) => scene.name === "configuracoes");
    expect(settings?.runtime?.config?.items?.[4]?.id).toBe("language");
    expect(initial?.items?.find((item) => item.id === "language")).toMatchObject({
      targetScreenID: "configuracoes", targetItemID: "language"
    });
    expect(initial?.items?.find((item) => item.id === "settings")).not.toHaveProperty("targetItemID");
    const exportContract = buildEngineExportProjectContract(project, {
      pluginRegistry: exemploGBAPluginRegistry()
    });
    const exportedInitial = exportContract.menu_project?.screens.find((screen) => screen.name === "title_options");
    expect(exportedInitial?.items.find((item) => item.label === "Idioma")).toMatchObject({ target_item: 4 });
    expect(exportedInitial?.items.find((item) => item.label === "Configurações")).not.toHaveProperty("target_item");
    const obsolete = new Set(["settings-v2-240x160-4bpp.png", "audio-v2-240x160-4bpp.png", "controls-v2-240x160-4bpp.png"]);
    const assets = project.assets as Array<{ name: string; metadata?: { reviewStatus?: string; visualStatus?: string } }>;
    expect(assets.filter((asset) => obsolete.has(asset.name))).toEqual([]);
    for (const asset of assets.filter((entry) => obsolete.has(entry.name))) {
      expect(asset.metadata).toMatchObject({ reviewStatus: "superseded", visualStatus: "superseded" });
    }
  });

  it("keeps the title carousel sprites inside the viewport", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Menu layout" });
    const actors = (project.actors as Array<{ name: string; roomName: string; x: number; y: number; animationName: string; menuScreenIDs?: string[]; menuItemID?: string }>)
      .filter((actor) => actor.roomName === "titulo" && actor.menuScreenIDs?.includes("title_options"));
    const animations = project.animations as Array<{ name: string; frameWidth: number; frameHeight: number }>;
    const rects = actors.map((actor) => {
      const animation = animations.find((item) => item.name === actor.animationName);
      expect(animation, actor.name).toBeDefined();
      return { name: actor.name, x: actor.x * 8, y: actor.y * 8, width: animation!.frameWidth, height: animation!.frameHeight };
    });
    for (const rect of rects) {
      expect(rect.x + rect.width, rect.name).toBeLessThanOrEqual(240);
      expect(rect.y + rect.height, rect.name).toBeLessThanOrEqual(160);
    }
    expect(actors.filter((actor) => actor.menuItemID).map((actor) => actor.menuItemID))
      .toEqual(["new-game", "load-game", "language", "settings", "credits"]);
    expect(new Set(actors.filter((actor) => actor.menuItemID).map((actor) => `${actor.x},${actor.y}`)).size).toBe(1);
  });

  it("mantém os sprites dos atores ancorados na caixa de colisão dos pés", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Atores GBA" });
    const actors = project.actors as Array<Record<string, unknown>>;
    const animations = project.animations as Array<Record<string, unknown>>;
    const assets = new Set((project.assets as Array<Record<string, unknown>>).map((asset) => String(asset.name)));
    const scenes = new Map((project.scenas as Array<Record<string, unknown>>).map((scene) => [String(scene.name), scene]));
    const placements = actors.map((actor) => {
      const scene = scenes.get(String(actor.roomName));
      expect(scene, `cena ausente para ${String(actor.name)}`).toBeDefined();
      expect(assets.has(String(actor.spriteSheet)), `sprite ausente para ${String(actor.name)}`).toBe(true);
      expect(Number(actor.x)).toBeGreaterThanOrEqual(0);
      expect(Number(actor.y)).toBeGreaterThanOrEqual(0);
      expect(Number(actor.x)).toBeLessThan(Number(scene?.width));
      expect(Number(actor.y)).toBeLessThan(Number(scene?.height));

      const animation = animations.find((candidate) => (
        candidate.spriteSheet === actor.spriteSheet && candidate.name === actor.animationName
      ));
      expect(animation, `animacao ausente para ${String(actor.name)}`).toBeDefined();
      const hasHitbox = ["hitboxX", "hitboxY", "hitboxWidth", "hitboxHeight"]
        .every((key) => typeof animation?.[key] === "number");
      if (hasHitbox) {
        expect(Number(animation?.hitboxWidth)).toBeGreaterThan(0);
        expect(Number(animation?.hitboxHeight)).toBeGreaterThan(0);
        expect(Number(animation?.hitboxWidth)).toBeLessThanOrEqual(Number(animation?.frameWidth));
        expect(Number(animation?.hitboxHeight)).toBeLessThanOrEqual(Number(animation?.frameHeight));
      } else {
        expect(animation).toEqual(expect.objectContaining({
          originX: expect.any(Number),
          originY: expect.any(Number)
        }));
      }

      const frame = resolveGbaActorSprite(project, actor)?.frame;
      expect(frame, `frame ausente para ${String(actor.name)}`).not.toBeNull();
      const x = Number(actor.x);
      const y = Number(actor.y);
      const placement = gbaActorSpriteRoomPlacementFromFrame(x, y, frame!);
      return {
        // Platformer scene coordinates identify the collision anchor 8px before the box.
        collisionOffsetX: x - placement.leftTiles + (actor.roomName === "penedos_vento" ? 1 : 0),
        collisionOffsetY: y - placement.topTiles,
        placement
      };
    });

    expect(placements).toHaveLength(actors.length);
    for (const item of placements) {
      expect(item.collisionOffsetX).toBeGreaterThanOrEqual(0);
      expect(item.collisionOffsetX).toBeLessThanOrEqual(item.placement.widthTiles);
      expect(item.collisionOffsetY).toBeGreaterThanOrEqual(0);
      expect(item.collisionOffsetY).toBeLessThanOrEqual(item.placement.heightTiles);
    }

    const encodedLength = (value: unknown): number => {
      if (Array.isArray(value)) return value.length;
      if (typeof value === "object" && value !== null && "length" in value) {
        return Number((value as { length: unknown }).length);
      }
      return 0;
    };

    for (const scene of scenes.values()) {
      const cellCount = Number(scene.width) * Number(scene.height);
      expect(encodedLength(scene.collisionTypes), `tipos de colisao ausentes em ${String(scene.name)}`).toBe(cellCount);
      if (scene.collisions !== undefined) {
        expect(encodedLength(scene.collisions), `colisoes incompletas em ${String(scene.name)}`).toBe(cellCount);
      }
    }
  });

  it("preserva a politica de cores aprovada no projeto completo", () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Cores GBA" });
    const assets = project.assets as Array<Record<string, unknown>>;
    const approved8bppAssets = assets
      .filter((asset) => (asset.metadata as Record<string, unknown> | undefined)?.colorMode === "8bpp")
      .map((asset) => asset.name)
      .sort();

    expect(approved8bppAssets).toEqual([]);
    expect(assets.filter((asset) => (
      (asset.metadata as Record<string, unknown> | undefined)?.visualProfile === "cohesive-lighthouse-adventure-v2"
    ))).toEqual([]);
    expect(assets.filter((asset) => (
      (asset.metadata as Record<string, unknown> | undefined)?.visualProfile === "diesel-fantasy-v2"
    ))).toEqual([]);
    const affineAssets = assets.filter((asset) => (
      (asset.metadata as Record<string, unknown> | undefined)?.kind === "affine_bg"
    ));
    expect(affineAssets.every((asset) => (
      (asset.metadata as Record<string, unknown> | undefined)?.colorMode === "8bpp-affine"
    ))).toBe(true);
    const indexedIsometricAssets = assets.filter((asset) => (
      (asset.metadata as Record<string, unknown> | undefined)?.kind === "indexed_bg"
    ));
    expect(indexedIsometricAssets.every((asset) => (
      (asset.metadata as Record<string, unknown> | undefined)?.colorMode === "8bpp-indexed"
    ))).toBe(true);
    const pagedAssets = assets.filter(asset => (asset.metadata as Record<string, unknown> | undefined)?.kind === "paged_bg");
    expect(pagedAssets.map(asset => asset.name)).toEqual(expect.arrayContaining([
      "route-map-paged-v2.png",
      "mercado-adventure-surface.png",
      "mercado-adventure-foreground.png"
    ]));
    expect(pagedAssets[0]?.metadata).toMatchObject({colorMode:"8bpp-indexed", backgroundPaletteBankBudget:14});
    expect(pagedAssets.slice(1).every((asset) => (asset.metadata as Record<string, unknown>)?.colorMode === "8bpp-indexed")).toBe(true);
    expect(assets.filter((asset) => (
      !affineAssets.includes(asset) && !indexedIsometricAssets.includes(asset) && !pagedAssets.includes(asset)
    )).every((asset) => (
      ((asset.metadata as Record<string, unknown> | undefined)?.colorMode === undefined
        || (asset.metadata as Record<string, unknown> | undefined)?.colorMode === "4bpp")
    ))).toBe(true);
    expect(assets.filter((asset) => asset.kind === "Sprite").every((asset) => {
      const visualProfile = (asset.metadata as Record<string, unknown> | undefined)?.visualProfile;
      return visualProfile === undefined || (typeof visualProfile === "string" && (
        visualProfile.startsWith("gba_neutral_cohesive_pixel_art")
        || visualProfile === "diesel-fantasy-v1"
        || visualProfile === "user_supplied_farm_player_pixel_art"
      ));
    })).toBe(true);
  });

});
