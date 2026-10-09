import { describe, expect, it } from "vitest";
import {
  appendImportedAssetsToProject,
  deriveFilesWorkspaceFilterChips,
  deriveFilesWorkspaceFolders,
  deriveFilesWorkspacePresentation,
  deriveFilesWorkspaceValidation,
  duplicateAssetInProject,
  filterFilesWorkspaceAssets,
  groupFilesWorkspaceAssetsByKind,
  makeImportedAssetRecord,
  moveAssetsToGroupInProject,
  removeAssetsFromProject,
  removeAssetFromProject,
  renameAssetsWithPatternInProject,
  renameAssetInProject,
  repairAssetGroupReferencesInProject,
  replaceAssetFileInProject,
  resolveAssetSourcePath,
  updateAssetKindsInProject
} from "./filesWorkspace.js";
import { createBlankProjectData } from "./newProject.js";
import { deriveSpritesWorkspacePresentation } from "./spritesWorkspace.js";

describe("Files workspace presentation", () => {
  it("applies batch organization, conversion and rename while preserving references", () => {
    const project = {
      assets: [
        { id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } },
        { id: "npc", name: "npc.png", kind: "Sprite", metadata: { source: "Assets/npc.png" } }
      ],
      assetGroups: [
        { id: "old", name: "Antigos", assetIDs: ["hero", "npc"], children: [] },
        { id: "characters", name: "Personagens", assetIDs: [], children: [] }
      ],
      animations: [{ name: "idle", spriteSheet: "hero.png" }],
      dialogues: [{ key: "hello", portrait: "npc.png", text: "Oi" }]
    };

    const moved = moveAssetsToGroupInProject(project, ["hero", "npc"], "characters");
    const converted = updateAssetKindsInProject(moved, ["hero", "npc"], "Ator");
    const renamed = renameAssetsWithPatternInProject(converted, ["hero", "npc"], { prefix: "char_", suffix: "_v2" }) as typeof project;

    expect(renamed.assets).toEqual([
      { id: "hero", name: "char_hero_v2.png", kind: "Ator", metadata: { source: "Assets/hero.png" } },
      { id: "npc", name: "char_npc_v2.png", kind: "Ator", metadata: { source: "Assets/npc.png" } }
    ]);
    expect(renamed.assetGroups).toEqual([
      { id: "old", name: "Antigos", assetIDs: [], children: [] },
      { id: "characters", name: "Personagens", assetIDs: ["hero", "npc"], children: [] }
    ]);
    expect(renamed.animations[0].spriteSheet).toBe("char_hero_v2.png");
    expect(renamed.dialogues[0].portrait).toBe("char_npc_v2.png");
  });

  it("removes several assets and repairs dangling group references", () => {
    const project = {
      assets: [
        { id: "keep", name: "keep.png", kind: "Sprite" },
        { id: "remove-a", name: "a.png", kind: "Sprite" },
        { id: "remove-b", name: "b.png", kind: "Sprite" }
      ],
      assetGroups: [{
        id: "root",
        name: "Raiz",
        assetIDs: ["keep", "remove-a", "missing"],
        children: [{ id: "nested", name: "Filho", assetIDs: ["remove-b", "also-missing"], children: [] }]
      }]
    };

    const removed = removeAssetsFromProject(project, ["remove-a", "remove-b"]);
    const repaired = repairAssetGroupReferencesInProject(removed);

    expect(repaired.assets).toEqual([{ id: "keep", name: "keep.png", kind: "Sprite" }]);
    expect(repaired.assetGroups).toEqual([{
      id: "root",
      name: "Raiz",
      assetIDs: ["keep"],
      children: [{ id: "nested", name: "Filho", assetIDs: [], children: [] }]
    }]);
  });

  it("replaces the physical file while preserving asset identity, name and references", () => {
    const project = {
      assets: [{ id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png", note: "principal" } }],
      animations: [{ name: "idle", spriteSheet: "hero.png" }]
    };

    const next = replaceAssetFileInProject(project, "hero", {
      id: "imported-temp",
      name: "hero-remastered.png",
      relativePath: "Assets/sprites/hero-remastered.png",
      kind: "Sprite",
      systemImage: "photo"
    }) as typeof project;

    expect(next.assets).toEqual([{
      id: "hero",
      name: "hero.png",
      kind: "Sprite",
      systemImage: "photo",
      metadata: { source: "Assets/sprites/hero-remastered.png", note: "principal" }
    }]);
    expect(next.animations[0].spriteSheet).toBe("hero.png");
  });
  it("derives assets, type counts and group membership from current .gba-project fields", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        {
          id: "sprite-1",
          name: "hero.png",
          kind: "Sprite",
          systemImage: "person.crop.square",
          metadata: { source: "Assets/hero.png" }
        },
        {
          id: "tiles-1",
          name: "village.png",
          kind: "Tileset",
          systemImage: "square.grid.3x3"
        },
        {
          id: "music-1",
          name: "theme.mod",
          kind: "Musica",
          systemImage: "music.note"
        }
      ],
      assetGroups: [
        {
          id: "characters",
          name: "Personagens",
          assetIDs: ["sprite-1"],
          children: [
            {
              id: "maps",
              name: "Mapas",
              assetIDs: ["tiles-1"],
              children: []
            }
          ]
        }
      ]
    });

    expect(presentation.kindCounts).toEqual([
      { kind: "Musica", count: 1 },
      { kind: "Sprite", count: 1 },
      { kind: "Tileset", count: 1 }
    ]);
    expect(presentation.assets[0]).toMatchObject({
      id: "sprite-1",
      name: "hero.png",
      kind: "Sprite",
      source: "Assets/hero.png",
      previewKind: "image",
      groupNames: ["Personagens"],
      usageLabels: [],
      isUsed: false,
      primaryAction: { label: "Abrir no Animador", workspace: "Sprites" }
    });
    expect(presentation.assets[1]).toMatchObject({
      name: "village.png",
      previewKind: "generic"
    });
    expect(presentation.assets[1].primaryAction).toEqual({ label: "Usar no Editor", workspace: "Editor" });
    expect(presentation.assets[2].primaryAction).toEqual({ label: "Abrir no Áudio", workspace: "Audio" });
    expect(presentation.assets[1].groupNames).toEqual(["Mapas"]);
    expect(presentation.groups).toEqual([
      { id: "characters", name: "Personagens", assetCount: 1, depth: 0, missingAssetIDs: [] },
      { id: "maps", name: "Mapas", assetCount: 1, depth: 1, missingAssetIDs: [] }
    ]);
    expect(presentation.ungroupedAssets).toBe(1);
    expect(presentation.missingGroupAssetReferenceCount).toBe(0);
  });

  it("marks menu background animation frames as used in the Files workspace", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "title-bg", name: "title-bg.png", kind: "Background" },
        { id: "title-frame-1", name: "title-frame-1.png", kind: "Background" },
        { id: "title-frame-2", name: "title-frame-2.png", kind: "Background" }
      ],
      rooms: [{
        id: "title-room",
        name: "Title Screen",
        backgroundAssetName: "title-bg.png",
        runtime: {
          type: "menu",
          config: {
            backgroundAnimation: {
              frameAssetNames: ["title-bg.png", "title-frame-1.png", "title-frame-2.png"],
              frameDuration: 18,
              loop: true
            }
          }
        }
      }]
    });

    expect(presentation.assets.filter((asset) => asset.isUsed).map((asset) => asset.name))
      .toEqual(["title-bg.png", "title-frame-1.png", "title-frame-2.png"]);
    expect(presentation.assets.find((asset) => asset.name === "title-frame-1.png")?.usageLinks)
      .toEqual([expect.objectContaining({ usageKind: "menu-background-animation" })]);
  });

  it("marks assets as used from room, sprite, audio and event references", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "tiles-1", name: "village.png", kind: "Tileset" },
        { id: "sprite-1", name: "hero.png", kind: "Sprite" },
        { id: "music-1", name: "theme.mod", kind: "Audio" },
        { id: "unused-1", name: "unused.png", kind: "Sprite" }
      ],
      scenas: [
        {
          name: "room_1",
          backgroundAssetName: "village.png",
          referenceImages: [{ assetName: "village.png" }],
          music: "theme.mod"
        }
      ],
      animations: [{ name: "idle_down", spriteSheet: "hero.png" }],
      animationStates: [{ name: "idle", spriteSheet: "hero.png" }],
      spriteReferenceImages: [{ title: "Hero ref", assetName: "hero_ref.png", generatedSpriteAssetName: "hero.png" }],
      audioItems: [{ name: "theme.mod", kind: "Musica", assignedScene: "room_1" }],
      events: [{ name: "room_boot", command: "play_music theme.mod", steps: [{ command: "play_sfx theme.mod" }] }]
    });

    expect(presentation.assets.find((asset) => asset.name === "village.png")).toMatchObject({
      isUsed: true,
      usageLabels: ["Cena: room_1", "Referencia da cena: room_1"],
      usageLinks: [
        { label: "Cena: room_1", workspace: "Editor", targetName: "room_1", usageKind: "room-background" },
        { label: "Referencia da cena: room_1", workspace: "Editor", targetName: "room_1", usageKind: "room-reference" }
      ],
      primaryAction: { label: "Abrir no Editor", workspace: "Editor", targetName: "room_1" }
    });
    expect(presentation.assets.find((asset) => asset.name === "hero.png")).toMatchObject({
      isUsed: true,
      usageLabels: ["Animacao: idle_down", "Estado de animacao: idle", "Sprite gerado: Hero ref"],
      usageLinks: [
        { label: "Animacao: idle_down", workspace: "Sprites", targetName: "hero.png", usageKind: "sprite-animation" },
        { label: "Estado de animacao: idle", workspace: "Sprites", targetName: "hero.png", usageKind: "sprite-state" },
        { label: "Sprite gerado: Hero ref", workspace: "Sprites", targetName: "hero.png", usageKind: "sprite-generated-reference" }
      ],
      primaryAction: { label: "Abrir no Animador", workspace: "Sprites", targetName: "hero.png" }
    });
    expect(presentation.assets.find((asset) => asset.name === "theme.mod")).toMatchObject({
      isUsed: true,
      usageLabels: ["Audio da cena: room_1", "Evento: room_boot"],
      usageLinks: [
        { label: "Audio da cena: room_1", workspace: "Audio", targetName: "theme.mod", usageKind: "audio-item" },
        { label: "Evento: room_boot", workspace: "Eventos", targetName: "room_boot", usageKind: "event-command" }
      ],
      primaryAction: { label: "Abrir no Áudio", workspace: "Audio", targetName: "theme.mod" }
    });
    expect(presentation.assets.find((asset) => asset.name === "unused.png")).toMatchObject({
      isUsed: false,
      usageLabels: [],
      usageLinks: []
    });
  });

  it("marks authored background layer assets as used by the room", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "bg-3", name: "sky.png", kind: "Background" },
        { id: "bg-2", name: "terrain.png", kind: "Background" },
        { id: "bg-1", name: "details.png", kind: "Background" }
      ],
      rooms: [{
        id: "room-layered",
        name: "platformer_layered",
        backgroundAssetName: "terrain.png",
        tileLayers: [
          { mapping: "BG3", tileSourceAssetNames: ["sky.png", "sky.png"] },
          { mapping: "BG2", tileSourceAssetNames: ["terrain.png", "terrain.png"] },
          { mapping: "BG1", tileSourceAssetNames: ["details.png", ""] }
        ]
      }]
    });

    for (const name of ["sky.png", "terrain.png", "details.png"]) {
      expect(presentation.assets.find((asset) => asset.name === name)).toMatchObject({
        isUsed: true,
        usageLinks: expect.arrayContaining([
          expect.objectContaining({ workspace: "Editor", targetName: "platformer_layered" })
        ])
      });
    }
  });

  it("marks an enabled Affine background as used by its scene", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [{ id: "affine-bg", name: "affine-bg.png", kind: "Background" }],
      rooms: [{
        id: "affine-lab",
        name: "Laboratório Affine",
        runtime: {
          type: "topdown",
          config: {
            affine: { enabled: true, assetId: "affine-bg.png" }
          }
        }
      }]
    });

    expect(presentation.assets[0]).toMatchObject({
      isUsed: true,
      usageLabels: ["Background Affine: Laboratório Affine"],
      usageLinks: [{
        label: "Background Affine: Laboratório Affine",
        workspace: "Editor",
        targetName: "Laboratório Affine",
        usageKind: "affine-background"
      }]
    });
  });

  it("marks the paged tactical presentation resources as used by its scene", () => {
    const tacticalAssets = [
      "surface-r0c0.png",
      "surface-r0c1.png",
      "surface-r1c0.png",
      "surface-r1c1.png",
      "grid.png",
      "hud.png"
    ];
    const presentation = deriveFilesWorkspacePresentation({
      assets: tacticalAssets.map((name) => ({ id: name, name, kind: "Background" })),
      rooms: [{
        id: "tactical-arena",
        name: "Arena Tática",
        runtime: {
          type: "isometric",
          config: {
            tacticalPresentation: {
              surfacePages: tacticalAssets.slice(0, 4).map((asset, index) => ({
                id: `r${Math.floor(index / 2)}c${index % 2}`,
                asset,
                world: { x: 0, y: 0, width: 240, height: 160 }
              })),
              gridAsset: "grid.png",
              hudLayout: "hud.png"
            }
          }
        }
      }]
    });

    expect(presentation.assets.map((asset) => [asset.name, asset.isUsed, asset.usageLinks[0]?.usageKind])).toEqual([
      ["surface-r0c0.png", true, "tactical-resource"],
      ["surface-r0c1.png", true, "tactical-resource"],
      ["surface-r1c0.png", true, "tactical-resource"],
      ["surface-r1c1.png", true, "tactical-resource"],
      ["grid.png", true, "tactical-resource"],
      ["hud.png", true, "tactical-resource"]
    ]);
  });

  it("keeps paged foregrounds and configured interface theme frames out of Sem uso", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "market-front", name: "market-front.png", kind: "Background" },
        { id: "narrative-frame", name: "narrative-frame.png", kind: "UI" },
        { id: "unused-frame", name: "unused-frame.png", kind: "UI" }
      ],
      rooms: [{
        id: "market",
        name: "mercado_suspenso",
        runtime: {
          type: "isometric",
          config: { pagedSurface: { foregroundAsset: "market-front.png" } }
        }
      }],
      settings: {
        interfaceThemes: {
          themes: [{ id: "narrative", name: "Narrativa", hudImage: "narrative-frame.png", boxImage: "narrative-frame.png" }]
        }
      }
    });

    expect(presentation.assets.find((asset) => asset.name === "market-front.png")?.usageLinks)
      .toEqual([expect.objectContaining({ usageKind: "isometric-paged-foreground", targetName: "mercado_suspenso" })]);
    expect(presentation.assets.find((asset) => asset.name === "narrative-frame.png")?.usageLinks)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ usageKind: "settings-interface-theme-hud" }),
        expect.objectContaining({ usageKind: "settings-interface-theme-dialogue" })
      ]));
    expect(filterFilesWorkspaceAssets(presentation.assets, { usage: "unused" }).map((asset) => asset.name))
      .toEqual(["unused-frame.png"]);
  });

  it("counts assets referenced by project HUD presets as used", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "box", name: "dialogue-box.png", kind: "UI" },
        { id: "selector", name: "dialogue-selector.png", kind: "UI" },
        { id: "font", name: "dialogue-font.png", kind: "FONT" },
        { id: "icon", name: "hud-icon.png", kind: "UI" },
        { id: "unused", name: "unused.png", kind: "UI" }
      ],
      settings: {
        hudPresets: [{
          id: "hud-narrative",
          name: "HUD Narrativa",
          backgroundImage: "dialogue-box.png",
          selectorImage: "dialogue-selector.png",
          font: "dialogue-font.png",
          components: [{ id: "portrait-frame", label: "Moldura", asset: "hud-icon.png" }]
        }]
      }
    });

    expect(presentation.assets.map((asset) => [asset.name, asset.isUsed, asset.usageLinks[0]?.usageKind])).toEqual([
      ["dialogue-box.png", true, "hud-preset-background"],
      ["dialogue-selector.png", true, "hud-preset-selector"],
      ["dialogue-font.png", true, "hud-preset-font"],
      ["hud-icon.png", true, "hud-preset-component"],
      ["unused.png", false, undefined]
    ]);
  });

  it("counts a runtime HUD image as used by its scene", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [{ id: "fight-hud", name: "fight-hud.png", kind: "Background" }],
      rooms: [{
        id: "arena",
        name: "arena_arrancada",
        runtime: { type: "luta", config: { hudAssetName: "fight-hud.png" } }
      }]
    });

    expect(presentation.assets[0]).toMatchObject({
      isUsed: true,
      usageLinks: [expect.objectContaining({ usageKind: "runtime-hud", targetName: "arena_arrancada" })]
    });
  });

  it("marks the three pseudo-3D racing visual assets as used by their scene", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "sky", name: "sky.png", kind: "Background" },
        { id: "floor", name: "floor.png", kind: "Background" },
        { id: "map", name: "map.png", kind: "Background" }
      ],
      rooms: [{
        id: "circuit",
        name: "circuito_final",
        runtime: {
          type: "racing",
          config: {
            presentation: "pseudo3d",
            pseudo3dVisuals: {
              panoramaBackgroundId: "sky.png",
              floorTilemapId: "floor.png",
              minimapAssetId: "map.png"
            }
          }
        }
      }]
    });

    expect(presentation.assets.map((asset) => [asset.name, asset.isUsed, asset.usageLinks[0]?.usageKind])).toEqual([
      ["sky.png", true, "racing-pseudo3d-panorama"],
      ["floor.png", true, "racing-pseudo3d-floor"],
      ["map.png", true, "racing-pseudo3d-minimap"]
    ]);
  });

  it("derives contextual links for dialogues and settings UI assets", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "portrait-1", name: "portrait.png", kind: "Sprite" },
        { id: "dialog-ui-1", name: "dialogue_box.png", kind: "UI" },
        { id: "dialog-font-1", name: "dialogue_font.png", kind: "FONT" }
      ],
      dialogues: [
        { key: "intro", character: "Hero", portrait: "portrait.png", text: "Oi" }
      ],
      settings: {
        uiDialogs: {
          boxImage: "dialogue_box.png",
          font: "dialogue_font.png"
        }
      }
    });

    expect(presentation.assets.find((asset) => asset.name === "portrait.png")).toMatchObject({
      usageLabels: ["Dialogo intro: retrato"],
      usageLinks: [
        { label: "Dialogo intro: retrato", workspace: "Dialogos", targetName: "intro", usageKind: "dialogue-portrait" }
      ],
      primaryAction: { label: "Abrir em Diálogos", workspace: "Dialogos", targetName: "intro" }
    });
    expect(presentation.assets.find((asset) => asset.name === "dialogue_box.png")).toMatchObject({
      usageLabels: ["UI dialogo: caixa"],
      usageLinks: [
        { label: "UI dialogo: caixa", workspace: "Dialogos", targetName: "uiDialogs", usageKind: "settings-ui-dialog" }
      ],
      primaryAction: { label: "Abrir em Diálogos", workspace: "Dialogos", targetName: "uiDialogs" }
    });
    expect(presentation.assets.find((asset) => asset.name === "dialogue_font.png")).toMatchObject({
      usageLabels: ["UI dialogo: fonte"],
      usageLinks: [
        { label: "UI dialogo: fonte", workspace: "Dialogos", targetName: "uiDialogs", usageKind: "settings-ui-dialog" }
      ],
      primaryAction: { label: "Abrir em Diálogos", workspace: "Dialogos", targetName: "uiDialogs" }
    });
  });

  it("ignores legacy single room fields when deriving asset usage", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [{ id: "tiles-1", name: "village.png", kind: "Tileset" }],
      scena: { name: "legacy_room", backgroundAssetName: "village.png", referenceImages: [{ assetName: "village.png" }] },
      room: { name: "legacy_room_alias", backgroundAssetName: "village.png" }
    });

    expect(presentation.assets[0]).toMatchObject({
      name: "village.png",
      isUsed: false,
      usageLabels: []
    });
  });

  it("counts backgrounds referenced by cutscene timeline steps as scene usage", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "frame-1", name: "frame-1.png", kind: "Background" },
        { id: "frame-2", name: "frame-2.png", kind: "Background" }
      ],
      scenas: [{
        id: "prologue",
        name: "Prólogo",
        runtime: {
          type: "cutscene",
          config: {
            steps: [
              { backgroundAssetName: "frame-1.png" },
              { backgroundAssetName: "frame-2.png" }
            ]
          }
        }
      }]
    });

    expect(presentation.assets.map((asset) => ({
      name: asset.name,
      isUsed: asset.isUsed,
      usageKind: asset.usageLinks[0]?.usageKind
    }))).toEqual([
      { name: "frame-1.png", isUsed: true, usageKind: "cutscene-step-background" },
      { name: "frame-2.png", isUsed: true, usageKind: "cutscene-step-background" }
    ]);
  });

  it("reports asset groups that reference missing assets", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [{ id: "sprite-1", name: "hero.png", kind: "Sprite" }],
      assetGroups: [
        {
          id: "characters",
          name: "Personagens",
          assetIDs: ["sprite-1", "missing-sprite"],
          children: [
            {
              id: "unused",
              name: "Referencias quebradas",
              assetIDs: ["missing-a", "missing-b"]
            }
          ]
        }
      ]
    });

    expect(presentation.groups).toEqual([
      { id: "characters", name: "Personagens", assetCount: 2, depth: 0, missingAssetIDs: ["missing-sprite"] },
      { id: "unused", name: "Referencias quebradas", assetCount: 2, depth: 1, missingAssetIDs: ["missing-a", "missing-b"] }
    ]);
    expect(presentation.missingGroupAssetReferenceCount).toBe(3);
  });

  it("keeps presentation resilient for partial project data", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [{ name: "", kind: "", metadata: { source: "" } }]
    });

    expect(presentation.assets).toEqual([
      {
        id: "asset-1",
        name: "Asset sem nome",
        kind: "Arquivo",
      systemImage: null,
      source: null,
      bundledDefaultAsset: null,
      previewKind: "generic",
      groupNames: [],
        usageLabels: [],
        usageLinks: [],
        isUsed: false,
        isReusableLibraryAsset: false,
        primaryAction: null
      }
    ]);
    expect(presentation.kindCounts).toEqual([{ kind: "Arquivo", count: 1 }]);
    expect(presentation.ungroupedAssets).toBe(1);
    expect(presentation.missingGroupAssetReferenceCount).toBe(0);
  });

  it("exposes bundled default assets as image previews in a blank project", () => {
    const presentation = deriveFilesWorkspacePresentation(createBlankProjectData({ name: "Novo projeto" }));

    expect(presentation.assets.find((asset) => asset.name === "player_topdown_4dir.png")).toMatchObject({
      kind: "Sprite",
      source: "Assets/sprites/player_topdown_4dir.png",
      bundledDefaultAsset: "topdown-player-4dir",
      previewKind: "image",
      usageLabels: expect.arrayContaining([
        "Ator: Player",
        "Animacao: idle_down",
        "Animacao: walk_left",
        "Estado de animacao: default"
      ]),
      primaryAction: { label: "Abrir no Animador", workspace: "Sprites", targetName: "player_topdown_4dir.png" }
    });
    expect(presentation.assets.find((asset) => asset.name === "actor_point_click.png")).toMatchObject({
      kind: "Sprite",
      source: "Assets/sprites/actor_point_click.png",
      bundledDefaultAsset: "point-click-actor",
      previewKind: "image"
    });
    expect(presentation.assets.find((asset) => asset.name === "cursor_point_click.png")).toMatchObject({
      kind: "Sprite",
      source: "Assets/sprites/cursor_point_click.png",
      bundledDefaultAsset: "point-click-cursor",
      previewKind: "image",
      usageLabels: expect.arrayContaining(["Cursor point-and-click"])
    });
    expect(presentation.assets.find((asset) => asset.name === "dialogue_box.png")).toMatchObject({
      kind: "UI",
      source: "Assets/ui/dialogue_box.png",
      bundledDefaultAsset: "dialogue-box",
      previewKind: "image"
    });
    expect(presentation.assets.find((asset) => asset.name === "dialogue_selector.png")).toMatchObject({
      kind: "UI",
      source: "Assets/ui/dialogue_selector.png",
      bundledDefaultAsset: "dialogue-selector",
      previewKind: "image"
    });
  });

  it("filters assets by query and kind without mutating the presentation", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "sprite-1", name: "hero_idle.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero_idle.png" } },
        { id: "tiles-1", name: "village_tiles.png", kind: "Tileset", metadata: { source: "Assets/tiles/village_tiles.png" } },
        { id: "music-1", name: "intro_theme.mod", kind: "Audio", metadata: { source: "Assets/music/intro_theme.mod" } }
      ],
      assetGroups: [
        { id: "characters", name: "Personagens", assetIDs: ["sprite-1"], children: [] },
        { id: "maps", name: "Mapas", assetIDs: ["tiles-1"], children: [] }
      ]
    });

    expect(filterFilesWorkspaceAssets(presentation.assets, { query: "personagens" }).map((asset) => asset.name)).toEqual(["hero_idle.png"]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { query: "assets/tiles" }).map((asset) => asset.name)).toEqual(["village_tiles.png"]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { kind: "Audio" }).map((asset) => asset.name)).toEqual(["intro_theme.mod"]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { query: "theme", kind: "Sprite" })).toEqual([]);
    expect(presentation.assets).toHaveLength(3);
  });

  it("filters assets by usage state and usage labels", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "sprite-1", name: "hero.png", kind: "Sprite" },
        { id: "tiles-1", name: "village.png", kind: "Tileset" },
        { id: "unused-1", name: "notes.png", kind: "Sprite" }
      ],
      scenas: [{ name: "room_1", backgroundAssetName: "village.png" }],
      animations: [{ name: "idle", spriteSheet: "hero.png" }]
    });

    expect(filterFilesWorkspaceAssets(presentation.assets, { usage: "used" }).map((asset) => asset.name)).toEqual(["hero.png", "village.png"]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { usage: "unused" }).map((asset) => asset.name)).toEqual(["notes.png"]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { query: "room_1" }).map((asset) => asset.name)).toEqual(["village.png"]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { kind: "Sprite", usage: "used" }).map((asset) => asset.name)).toEqual(["hero.png"]);
  });

  it("filters real source folders and descendants without matching sibling prefixes", () => {
    const presentation = deriveFilesWorkspacePresentation({ assets: [
      { id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } },
      { id: "enemy", name: "enemy.png", kind: "Sprite", metadata: { source: "Assets\\sprites\\enemies\\enemy.png" } },
      { id: "old", name: "old.png", kind: "Sprite", metadata: { source: "Assets/sprites-old/old.png" } },
      { id: "internal", name: "internal.png", kind: "Sprite" }
    ] });
    expect(deriveFilesWorkspaceFolders(presentation.assets)).toEqual([
      { path: "Assets", name: "Assets", depth: 0, count: 3 },
      { path: "Assets/sprites", name: "sprites", depth: 1, count: 2 },
      { path: "Assets/sprites/enemies", name: "enemies", depth: 2, count: 1 },
      { path: "Assets/sprites-old", name: "sprites-old", depth: 1, count: 1 }
    ]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { folder: "Assets/sprites" }).map(a => a.id)).toEqual(["hero", "enemy"]);
    expect(filterFilesWorkspaceAssets(presentation.assets, { folder: "Assets/sprites", query: "enemy", kind: "Sprite" }).map(a => a.id)).toEqual(["enemy"]);
    expect(presentation.assets).toHaveLength(4);
  });

  it("groups filtered assets by kind with usage counts for the files rail", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "sprite-1", name: "hero.png", kind: "Sprite" },
        { id: "sprite-2", name: "unused.png", kind: "Sprite" },
        { id: "tiles-1", name: "village.png", kind: "Tileset" },
        { id: "audio-1", name: "theme.mod", kind: "Audio" }
      ],
      scenas: [{ name: "room_1", backgroundAssetName: "village.png" }],
      animations: [{ name: "idle", spriteSheet: "hero.png" }],
      audioItems: [{ name: "theme.mod", kind: "Musica", assignedScene: "room_1" }]
    });

    expect(groupFilesWorkspaceAssetsByKind(presentation.assets).map((group) => ({
      kind: group.kind,
      count: group.count,
      usedCount: group.usedCount,
      names: group.assets.map((asset) => asset.name)
    }))).toEqual([
      { kind: "Audio", count: 1, usedCount: 1, names: ["theme.mod"] },
      { kind: "Sprite", count: 2, usedCount: 1, names: ["hero.png", "unused.png"] },
      { kind: "Tileset", count: 1, usedCount: 1, names: ["village.png"] }
    ]);
  });

  it("derives library filter chips with counts and active state", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "sprite-1", name: "hero.png", kind: "Sprite" },
        { id: "sprite-2", name: "notes.png", kind: "Sprite" },
        { id: "tiles-1", name: "village.png", kind: "Tileset" },
        { id: "audio-1", name: "theme.mod", kind: "Audio" }
      ],
      scenas: [{ name: "room_1", backgroundAssetName: "village.png" }],
      animations: [{ name: "idle", spriteSheet: "hero.png" }],
      audioItems: [{ name: "theme.mod", kind: "Musica", assignedScene: "room_1" }]
    });

    const chips = deriveFilesWorkspaceFilterChips(presentation, { kind: "Sprite", usage: "unused" });

    expect(chips.kind).toEqual([
      { id: "kind-all", label: "Todos", value: "", count: 4, isActive: false },
      { id: "kind-audio", label: "Áudio", value: "Audio", count: 1, isActive: false },
      { id: "kind-sprite", label: "Sprite", value: "Sprite", count: 2, isActive: true },
      { id: "kind-tileset", label: "Tileset", value: "Tileset", count: 1, isActive: false }
    ]);
    expect(chips.usage).toEqual([
      { id: "usage-all", label: "Todos", value: "all", count: 4, isActive: false },
      { id: "usage-used", label: "Usados", value: "used", count: 3, isActive: false },
      { id: "usage-unused", label: "Sem uso", value: "unused", count: 1, isActive: true }
    ]);
  });

  it("derives summary cards for the top files dashboard", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "sprite-1", name: "hero.png", kind: "Sprite" },
        { id: "tiles-1", name: "tileset_default.png", kind: "Tileset" },
        { id: "audio-1", name: "theme.mod", kind: "Audio" },
        { id: "font-1", name: "gba_font.png", kind: "Fonte" },
        { id: "unused-1", name: "unused.png", kind: "Sprite" }
      ],
      scenas: [{ name: "room_1", backgroundAssetName: "tileset_default.png" }],
      animations: [{ name: "idle", spriteSheet: "hero.png" }],
      audioItems: [{ name: "theme.mod", kind: "Musica", assignedScene: "room_1" }],
      assetGroups: [{ id: "broken", name: "Quebrados", assetIDs: ["missing-asset"] }]
    });

    expect(presentation.summaryCards).toEqual([
      { id: "total", label: "Total", value: 5, tone: "primary" },
      { id: "images", label: "Imagens", value: 3, tone: "primary" },
      { id: "audio", label: "Áudio", value: 1, tone: "neutral" },
      { id: "fonts", label: "Fontes", value: 1, tone: "neutral" },
      { id: "attention", label: "Com atenção", value: 1, tone: "warning" },
      { id: "unused", label: "Sem uso", value: 2, tone: "neutral" }
    ]);
  });

  it("renames an asset without discarding unrelated fields", () => {
    const project = {
      assets: [
        {
          id: "sprite-1",
          name: "hero.png",
          kind: "Sprite",
          systemImage: "photo",
          metadata: { source: "Assets/hero.png" }
        }
      ],
      editorState: { selectedWorkspace: "files" }
    };

    const next = renameAssetInProject(project, "sprite-1", "hero_idle.png");

    expect(next.assets).toEqual([
      {
        id: "sprite-1",
        name: "hero_idle.png",
        kind: "Sprite",
        systemImage: "photo",
        metadata: { source: "Assets/hero.png" }
      }
    ]);
    expect(next.editorState).toEqual({ selectedWorkspace: "files" });
    expect(project.assets[0].name).toBe("hero.png");
  });

  it("renames asset references across rooms, sprites, dialogues, audio and events", () => {
    const project = {
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }
      ],
      rooms: [
        {
          name: "room_1",
          backgroundAssetName: "hero.png",
          music: "hero.png",
          referenceImages: [{ assetName: "hero.png", title: "Hero ref" }]
        }
      ],
      actors: [{ name: "Player", spriteSheet: "hero.png", animationName: "idle_down" }],
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frames: [{ tiles: [{ sourceSheet: "hero.png", x: 0, y: 0 }] }]
        }
      ],
      animationStates: [{ name: "idle", spriteSheet: "hero.png", animationIDs: ["anim-idle"] }],
      spriteReferenceImages: [{ title: "Hero", assetName: "hero.png", generatedSpriteAssetName: "hero.png" }],
      dialogues: [{ key: "intro", portrait: "hero.png", emote: "hero.png", textSound: "hero.png", confirmSound: "hero.png", text: "Oi" }],
      audioItems: [{ id: "audio-hero", name: "hero.png", kind: "SFX" }],
      events: [
        {
          id: "event-start",
          name: "start",
          command: "play_sfx hero.png",
          steps: [{ command: "show_overlay hero.png" }]
        }
      ],
      settings: {
        uiDialogs: {
          boxImage: "hero.png",
          selectorImage: "hero.png",
          font: "hero.png"
        }
      }
    };

    const next = renameAssetInProject(project, "asset-hero", "hero_idle.png") as typeof project;

    expect(next.assets?.[0]).toMatchObject({ name: "hero_idle.png" });
    expect(next.rooms?.[0]).toMatchObject({
      backgroundAssetName: "hero_idle.png",
      music: "hero_idle.png",
      referenceImages: [{ assetName: "hero_idle.png", title: "Hero ref" }]
    });
    expect(next.actors?.[0]).toMatchObject({ spriteSheet: "hero_idle.png", animationName: "idle_down" });
    expect(next.animations?.[0]).toMatchObject({
      spriteSheet: "hero_idle.png",
      frames: [{ tiles: [{ sourceSheet: "hero_idle.png", x: 0, y: 0 }] }]
    });
    expect(next.animationStates?.[0]).toMatchObject({ spriteSheet: "hero_idle.png" });
    expect(next.spriteReferenceImages?.[0]).toMatchObject({
      assetName: "hero_idle.png",
      generatedSpriteAssetName: "hero_idle.png"
    });
    expect(next.dialogues?.[0]).toMatchObject({
      portrait: "hero_idle.png",
      emote: "hero_idle.png",
      textSound: "hero_idle.png",
      confirmSound: "hero_idle.png"
    });
    expect(next.audioItems?.[0]).toMatchObject({ name: "hero_idle.png" });
    expect(next.events?.[0]).toMatchObject({
      command: "play_sfx hero_idle.png",
      steps: [{ command: "show_overlay hero_idle.png" }]
    });
    expect(next.settings?.uiDialogs).toMatchObject({
      boxImage: "hero_idle.png",
      selectorImage: "hero_idle.png",
      font: "hero_idle.png"
    });
    expect(project.rooms[0].backgroundAssetName).toBe("hero.png");
  });

  it("removes an asset and prunes group membership recursively", () => {
    const project = {
      assets: [
        { id: "sprite-1", name: "hero.png", kind: "Sprite" },
        { id: "tiles-1", name: "village.png", kind: "Tileset" }
      ],
      assetGroups: [
        {
          id: "characters",
          name: "Personagens",
          assetIDs: ["sprite-1", "tiles-1"],
          children: [
            {
              id: "nested",
              name: "Subgrupo",
              assetIDs: ["sprite-1"],
              children: []
            }
          ]
        }
      ]
    };

    const next = removeAssetFromProject(project, "sprite-1");

    expect(next.assets).toEqual([{ id: "tiles-1", name: "village.png", kind: "Tileset" }]);
    expect(next.assetGroups).toEqual([
      {
        id: "characters",
        name: "Personagens",
        assetIDs: ["tiles-1"],
        children: [
          {
            id: "nested",
            name: "Subgrupo",
            assetIDs: [],
            children: []
          }
        ]
      }
    ]);
  });

  it("removes direct asset references instead of leaving broken names behind", () => {
    const project = {
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite" }],
      rooms: [
        {
          name: "room_1",
          backgroundAssetName: "hero.png",
          music: "hero.png",
          referenceImages: [
            { assetName: "hero.png", title: "Hero ref" },
            { assetName: "keep.png", title: "Keep ref" }
          ]
        }
      ],
      actors: [{ name: "Player", spriteSheet: "hero.png", animationName: "idle_down" }],
      animations: [{ name: "idle_down", spriteSheet: "hero.png", frames: [{ tiles: [{ sourceSheet: "hero.png" }] }] }],
      animationStates: [{ name: "idle", spriteSheet: "hero.png" }],
      spriteReferenceImages: [{ title: "Hero", assetName: "hero.png", generatedSpriteAssetName: "hero.png" }],
      dialogues: [{ key: "intro", portrait: "hero.png", emote: "hero.png", textSound: "hero.png", confirmSound: "hero.png", text: "Oi" }],
      audioItems: [{ id: "audio-hero", name: "hero.png", kind: "SFX" }],
      events: [{ name: "start", command: "play_sfx hero.png", steps: [{ command: "show_overlay hero.png" }] }],
      settings: { uiDialogs: { boxImage: "hero.png", selectorImage: "hero.png", font: "hero.png" } }
    };

    const next = removeAssetFromProject(project, "asset-hero") as typeof project;

    expect(next.assets).toEqual([]);
    expect(next.rooms?.[0]).toMatchObject({
      backgroundAssetName: "",
      music: "",
      referenceImages: [{ assetName: "keep.png", title: "Keep ref" }]
    });
    expect(next.actors?.[0]).toMatchObject({ spriteSheet: "", animationName: "" });
    expect(next.animations?.[0]).toMatchObject({ spriteSheet: "", frames: [{ tiles: [{ sourceSheet: "" }] }] });
    expect(next.animationStates?.[0]).toMatchObject({ spriteSheet: "" });
    expect(next.spriteReferenceImages?.[0]).toMatchObject({ assetName: "", generatedSpriteAssetName: "" });
    expect(next.dialogues?.[0]).toMatchObject({ portrait: "", emote: "", textSound: "", confirmSound: "" });
    expect(next.audioItems).toEqual([]);
    expect(next.events?.[0]).toMatchObject({ command: "play_sfx", steps: [{ command: "show_overlay" }] });
    expect(next.settings?.uiDialogs).toMatchObject({ boxImage: "", selectorImage: "", font: "" });
  });

  it("duplicates an asset with a new id and joins the same groups", () => {
    const project = {
      assets: [
        {
          id: "sprite-1",
          name: "hero.png",
          kind: "Sprite",
          systemImage: "photo",
          metadata: { source: "Assets/hero.png", notes: "original" }
        }
      ],
      assetGroups: [
        {
          id: "characters",
          name: "Personagens",
          assetIDs: ["sprite-1"],
          children: []
        }
      ]
    };

    const next = duplicateAssetInProject(project, {
      sourceAssetID: "sprite-1",
      newAssetID: "sprite-2",
      newName: "hero copy.png"
    });

    expect(next.assets).toEqual([
      {
        id: "sprite-1",
        name: "hero.png",
        kind: "Sprite",
        systemImage: "photo",
        metadata: { source: "Assets/hero.png", notes: "original" }
      },
      {
        id: "sprite-2",
        name: "hero copy.png",
        kind: "Sprite",
        systemImage: "photo",
        metadata: { source: "Assets/hero.png", notes: "original" }
      }
    ]);
    expect(next.assetGroups).toEqual([
      {
        id: "characters",
        name: "Personagens",
        assetIDs: ["sprite-1", "sprite-2"],
        children: []
      }
    ]);
  });

  it("creates imported asset records with inferred kind, icon and relative source", () => {
    expect(makeImportedAssetRecord({
      id: "asset-image",
      name: "hero.png",
      relativePath: "Assets/hero.png"
    })).toEqual({
      id: "asset-image",
      name: "hero.png",
      kind: "Sprite",
      systemImage: "photo",
      metadata: { source: "Assets/hero.png" }
    });

    expect(makeImportedAssetRecord({
      id: "asset-audio",
      name: "theme.mod",
      relativePath: "Assets/theme.mod"
    })).toMatchObject({
      kind: "Audio",
      systemImage: "music.note"
    });

    expect(makeImportedAssetRecord({
      id: "asset-generic",
      name: "notes.txt",
      relativePath: "Assets/notes.txt"
    })).toMatchObject({
      kind: "Arquivo",
      systemImage: "doc"
    });
  });

  it("appends imported assets without discarding existing project fields", () => {
    const project = {
      assets: [{ id: "sprite-1", name: "hero.png", kind: "Sprite" }],
      editorState: { selectedWorkspace: "files" }
    };

    const next = appendImportedAssetsToProject(project, [
      {
        id: "sprite-2",
        name: "enemy.png",
        relativePath: "Assets/enemy.png",
        kind: "Sprite",
        systemImage: "photo"
      }
    ]);

    expect(next.assets).toEqual([
      { id: "sprite-1", name: "hero.png", kind: "Sprite" },
      {
        id: "sprite-2",
        name: "enemy.png",
        kind: "Sprite",
        systemImage: "photo",
        metadata: { source: "Assets/enemy.png" }
      }
    ]);
    expect(next.editorState).toEqual({ selectedWorkspace: "files" });
    expect(project.assets).toEqual([{ id: "sprite-1", name: "hero.png", kind: "Sprite" }]);
  });

  it("links imported audio assets into audioItems without duplicating existing names", () => {
    const project = {
      audioItems: [{ id: "audio-existing", name: "theme.mod", kind: "Musica", format: "MOD" }],
      assets: [{ id: "asset-existing", name: "theme.mod", kind: "Audio", metadata: { source: "Assets/theme.mod" } }]
    };

    const next = appendImportedAssetsToProject(project, [
      {
        id: "asset-theme-copy",
        name: "theme.mod",
        relativePath: "Assets/theme 2.mod",
        kind: "Audio",
        systemImage: "music.note"
      },
      {
        id: "asset-confirm",
        name: "confirm.wav",
        relativePath: "Assets/confirm.wav",
        kind: "Audio",
        systemImage: "music.note"
      },
      {
        id: "asset-hero",
        name: "hero.png",
        relativePath: "Assets/hero.png",
        kind: "Sprite",
        systemImage: "photo"
      }
    ]);

    expect(next.audioItems).toEqual([
      { id: "audio-existing", name: "theme.mod", kind: "Musica", format: "MOD" },
      {
        id: "audio-asset-confirm",
        sourceAssetID: "asset-confirm",
        name: "confirm.wav",
        kind: "SFX",
        format: "WAV",
        assignedScene: "Global",
        loops: false,
        bpm: 120,
        exportID: "confirm",
        volume: 90,
        channels: []
      }
    ]);
    expect(next.assets).toHaveLength(4);
    expect(project.audioItems).toEqual([{ id: "audio-existing", name: "theme.mod", kind: "Musica", format: "MOD" }]);
  });

  it("seeds imported sprite assets with a usable idle animation for the sprites workspace", () => {
    const project = {
      assets: [{ id: "asset-existing", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }],
      animations: [{ id: "anim-existing", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 }]
    };

    const next = appendImportedAssetsToProject(project, [
      {
        id: "asset-enemy",
        name: "enemy.png",
        relativePath: "Assets/enemy.png",
        kind: "Sprite",
        systemImage: "photo"
      },
      {
        id: "asset-theme",
        name: "theme.mod",
        relativePath: "Assets/theme.mod",
        kind: "Audio",
        systemImage: "music.note"
      }
    ]);
    const sprites = deriveSpritesWorkspacePresentation(next);

    expect(next.animations).toEqual([
      { id: "anim-existing", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 },
      {
        id: "animation-asset-enemy-idle-down",
        name: "idle_down",
        spriteSheet: "enemy.png",
        frameWidth: 16,
        frameHeight: 32,
        fps: 8,
        loops: true,
        frameCount: 1,
        state: "idle",
        direction: "down",
        colorMode: "4bpp"
      }
    ]);
    expect(sprites.spriteSheets.find((sheet) => sheet.name === "enemy.png")).toMatchObject({
      hasAsset: true,
      animationCount: 1,
      totalFrames: 1,
      maxFrameSize: "16 x 32"
    });
    expect(sprites.stateDirectionPreviewsBySheet["enemy.png"]).toEqual([
      {
        animationID: "animation-asset-enemy-idle-down",
        animationName: "idle_down",
        state: "idle",
        direction: "down",
        frameSize: "16 x 32",
        frameWidth: 16,
        frameHeight: 32,
        frameCount: 1,
        fps: 8,
        loops: true,
        pingPong: false
      }
    ]);
    expect((next.audioItems as Record<string, unknown>[])[0]).toMatchObject({ id: "audio-asset-theme", name: "theme.mod" });
    expect(project.animations).toHaveLength(1);
  });

  it("resolves asset source paths relative to the open project file", () => {
    expect(resolveAssetSourcePath("/Projects/Demo/Demo.gba-project", "Assets/hero.png")).toBe("/Projects/Demo/Assets/hero.png");
    expect(resolveAssetSourcePath("/Projects/Demo/Demo.gba-project", "/Shared/hero.png")).toBe("/Shared/hero.png");
    expect(resolveAssetSourcePath(undefined, "Assets/hero.png")).toBeNull();
    expect(resolveAssetSourcePath("/Projects/Demo/Demo.gba-project", null)).toBeNull();
  });

  it("aggregates library validation issues for groups, missing sources and unused assets", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        { id: "asset-used", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } },
        { id: "asset-unused", name: "unused.png", kind: "Sprite", metadata: { source: "Assets/unused.png" } }
      ],
      assetGroups: [{ id: "g1", name: "Grupo", assetIDs: ["missing-id"] }],
      actors: [{ name: "NPC", spriteSheet: "hero.png" }]
    });

    const validation = deriveFilesWorkspaceValidation(presentation);
    expect(validation.ready).toBe(false);
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "error", message: expect.stringContaining("grupo") }),
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("sem uso") })
    ]));
  });

  it("keeps reusable library assets available without reporting them as unused project content", () => {
    const presentation = deriveFilesWorkspacePresentation({
      assets: [
        {
          id: "asset-emote",
          name: "emote-surprise.png",
          kind: "Emote",
          metadata: {
            source: "Assets/emotes/emote-surprise.png",
            reusableLibraryAsset: true
          }
        }
      ]
    });

    expect(presentation.assets[0]).toMatchObject({
      name: "emote-surprise.png",
      isUsed: false,
      isReusableLibraryAsset: true
    });
    expect(presentation.summaryCards.find((card) => card.id === "unused")?.value).toBe(0);
    expect(deriveFilesWorkspaceValidation(presentation)).toMatchObject({
      ready: true,
      issues: [
        expect.objectContaining({
          severity: "info",
          message: expect.stringContaining("Biblioteca validada")
        })
      ]
    });
  });

  it("seeds imported tileset, ui and emote assets into the project when slots are empty", () => {
    const base = {
      ...createBlankProjectData({ name: "Seed import" }),
      dialogues: [{ key: "intro", text: "Oi" }]
    };
    const next = appendImportedAssetsToProject(base, [
      { id: "asset-tiles", name: "overworld.png", kind: "Tileset", relativePath: "Assets/overworld.png", systemImage: "photo" },
      { id: "asset-ui", name: "dialogue_box.png", kind: "UI", relativePath: "Assets/dialogue_box.png", systemImage: "photo" },
      { id: "asset-emote", name: "smile.png", kind: "Emote", relativePath: "Assets/smile.png", systemImage: "photo" }
    ]);

    const rooms = (next.scenas ?? next.rooms) as Array<Record<string, unknown>>;
    expect(rooms[0]?.backgroundAssetName).toBe("overworld.png");
    expect((next.settings as Record<string, unknown>).uiDialogs).toMatchObject({
      boxImage: "dialogue_box.png"
    });
    expect((next.dialogues as Array<Record<string, unknown>>)[0]?.emote).toBe("smile.png");
  });
});
