import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { decodePngRgba } from "./lib/png-icons.mjs";
import {
  VERTICE_RACING_ART_DIRECTION,
  VERTICE_INITIAL_MENU_BACKGROUND_LAYOUT,
  VERTICE_GENDER_SELECTION_BACKGROUND_LAYOUT,
  VERTICE_GENDER_SELECTION_ACTOR_LAYOUT,
  VERTICE_INITIAL_MENU_ACTOR_LAYOUT,
  VERTICE_SAVE_GAME_BACKGROUND_LAYOUT,
  VERTICE_INVENTORY_BACKGROUND_LAYOUT,
  VERTICE_INVENTORY_ACTOR_LAYOUT,
  VERTICE_MAP_HYBRID_BACKGROUND_LAYOUT,
  VERTICE_MAP_HYBRID_ACTOR_LAYOUT,
  VERTICE_LANGUAGE_BACKGROUND_LAYOUT,
  VERTICE_SETTINGS_BACKGROUND_LAYOUT,
  VERTICE_CREDITS_BACKGROUND_LAYOUT,
  VERTICE_PROFILE_BACKGROUND_LAYOUT,
  VERTICE_PROFILE_ACTOR_LAYOUT,
  VERTICE_MISSIONS_BACKGROUND_LAYOUT,
  VERTICE_MISSIONS_ACTOR_LAYOUT,
  VERTICE_START_MENU_BACKGROUND_LAYOUT,
  VERTICE_START_MENU_ACTOR_LAYOUT,
  VERTICE_IN_GAME_MENU_BACKGROUND_LAYOUT,
  VERTICE_IN_GAME_MENU_ACTOR_LAYOUT,
  VERTICE_OPENING_ACTOR_ASSET_LAYOUT,
  VERTICE_TITLE_BACKGROUND_LAYOUT,
  VERTICE_TITLE_LOGO_ACTOR_LAYOUT,
  VERTICE_LUTA_ASSET_LAYOUT,
  syncVerticeInitialMenuActors,
  syncVerticeInitialMenuBackground,
  syncVerticeGenderSelectionBackground,
  syncVerticeGenderSelectionActors,
  syncVerticeSaveGameBackground,
  syncVerticeInventoryAssets,
  syncVerticeMapHybridAssets,
  syncVerticeLanguageAssets,
  syncVerticeSettingsAssets,
  syncVerticeCreditsAssets,
  syncVerticeProfileAssets,
  syncVerticeMissionsAssets,
  syncVerticeStartMenuAssets,
  syncVerticeInGameMenuAssets,
  syncVerticeOpeningActor,
  setVerticeAssetSyncManifest,
  clearVerticeAssetSyncManifest,
  syncVerticeTitleBackground,
  syncVerticeTitleLogoActors
} from "./vertice-showcase-assets.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const artDirection = JSON.parse(readFileSync(path.join(repositoryRoot, "direcao_arte_gba_neutra_coesa.json"), "utf8"));
const initialMenuBackgroundAssetcReportPath = path.join(
  repositoryRoot,
  "tools",
  "gba-sprite-prep",
  "production",
  "exemplo-gba-menu-inicial-v6-light-harbor-16banks-actors",
  "reports",
  "background-preparation.json"
);
const initialMenuBackgroundAssetcReport = existsSync(initialMenuBackgroundAssetcReportPath)
  ? JSON.parse(readFileSync(initialMenuBackgroundAssetcReportPath, "utf8"))
  : null;
const dialogueFontPath = path.join(
  repositoryRoot,
  "apps",
  "desktop-electron",
  "default-assets",
  "templates",
  "exemplo-gba",
  "Assets",
  "fonts",
  "gba-dialogue-font-v3.png"
);

function readIndexedPng(filePath) {
  const data = readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let paletteEntries = 0;
  let alpha = [];
  const idat = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
    } else if (type === "PLTE") {
      paletteEntries = payload.length / 3;
    } else if (type === "tRNS") {
      alpha = [...payload];
    } else if (type === "IDAT") {
      idat.push(payload);
    }
  }

  if (colorType !== 3) throw new Error(`${filePath} precisa ser um PNG indexado.`);
  if (![4, 8].includes(bitDepth)) throw new Error(`${filePath} usa profundidade indexada não suportada: ${bitDepth}.`);
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = [];
  let scanOffset = 0;
  const bytesPerRow = Math.ceil(width * bitDepth / 8);
  let previous = new Uint8Array(bytesPerRow);
  const paeth = (left, up, upLeft) => {
    const estimate = left + up - upLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upLeftDistance = Math.abs(estimate - upLeft);
    return leftDistance <= upDistance && leftDistance <= upLeftDistance
      ? left
      : upDistance <= upLeftDistance
        ? up
        : upLeft;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[scanOffset];
    scanOffset += 1;
    const encoded = raw.subarray(scanOffset, scanOffset + bytesPerRow);
    scanOffset += bytesPerRow;
    const row = new Uint8Array(bytesPerRow);
    for (let x = 0; x < bytesPerRow; x += 1) {
      const left = x > 0 ? row[x - 1] : 0;
      const up = previous[x];
      const upLeft = x > 0 ? previous[x - 1] : 0;
      const value = encoded[x];
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 0xff;
      else if (filter === 2) row[x] = (value + up) & 0xff;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 0xff;
      else throw new Error(`${filePath} usa filtro PNG desconhecido: ${filter}.`);
    }
    pixels.push(Array.from({ length: width }, (_, x) => {
      if (bitDepth === 8) return row[x];
      const value = row[Math.floor(x / 2)];
      return x % 2 === 0 ? value >> 4 : value & 0x0f;
    }));
    previous = row;
  }
  return { alpha, height, paletteEntries, pixels, width };
}

function spriteFrameMetrics(filePath, frameWidth, frameHeight) {
  const image = readIndexedPng(filePath);
  if (image.width % frameWidth !== 0 || image.height !== frameHeight) {
    throw new Error(`${filePath} nao respeita o grid ${frameWidth}x${frameHeight}.`);
  }
  return Array.from({ length: image.width / frameWidth }, (_, frameIndex) => {
    const colors = new Set();
    let opaquePixels = 0;
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const colorIndex = image.pixels[y][frameIndex * frameWidth + x];
        if ((image.alpha[colorIndex] ?? 255) === 0) continue;
        opaquePixels += 1;
        colors.add(colorIndex);
      }
    }
    return { opaquePixels, visibleColors: colors.size };
  });
}

describe("assets de corrida de Vértice", () => {
  it("promove a HUD v2 da luta no pacote de assets da Arena", () => {
    expect(VERTICE_LUTA_ASSET_LAYOUT).toEqual([
      expect.objectContaining({
        name: "arena-gba.png",
        destination: "backgrounds",
        source: "../exemplo-gba-luta-cais-v3-candidate/prepared/arena-cais-do-farol-240x160-exact-reference-plan.png"
      }),
      expect.objectContaining({
        name: "fight-hud-v2-arena-bank-05.png",
        destination: "backgrounds",
        source: "../exemplo-gba-luta-cais-v3-candidate/prepared/vertice-fight-hud-v2-arena-bank-05.png"
      }),
      expect.objectContaining({
        name: "nara-fighter.png",
        destination: "sprites",
        source: "../exemplo-gba-luta-cais-v3-candidate/prepared/fighter-player-64x64-explicit-object-palette.png"
      }),
      expect.objectContaining({
        name: "rival-fighter.png",
        destination: "sprites",
        source: "../exemplo-gba-luta-cais-v3-candidate/prepared/fighter-rival-64x64-left-explicit-object-palette.png"
      })
    ]);
    expect(VERTICE_LUTA_ASSET_LAYOUT.some(({ name }) => name === "fight-ui.png")).toBe(false);
  });

  it("deriva a paleta de Vértice do padrão neutro e coeso do projeto", () => {
    expect(artDirection).toMatchObject({
      profile_id: "gba_neutral_cohesive_pixel_art",
      global_rendering_rules: {
        pixel_method: {
          cluster_rule: expect.stringContaining("grupos intencionais"),
          scaling: expect.stringContaining("nearest-neighbor")
        },
        lighting: { default_direction: expect.stringContaining("superior-esquerda") }
      }
    });
    expect(artDirection.global_rendering_rules.color_system.palette_roles).toMatchObject({
      outline_dark: expect.arrayContaining(["#1C2638"]),
      warm_accents: expect.arrayContaining(["#D96A4B"]),
      cool_accents: expect.arrayContaining(["#3CA6A3"])
    });
  });

  it.skipIf(!initialMenuBackgroundAssetcReport)("mantém o background do Menu Inicial dentro do orçamento 4 BPP", () => {
    expect(initialMenuBackgroundAssetcReport).toMatchObject({
      bank_count: 16,
      height: 160,
      prepared_color_count: expect.any(Number),
      requires_visual_review: true,
      runtime_bpp: 4,
      status: "attention",
      tile_count: 600,
      width: 240
    });
    expect(initialMenuBackgroundAssetcReport.prepared_color_count).toBeLessThanOrEqual(16 * 16 - 1);
  });

  it("mantém a célula U+0020 do atlas de diálogo vazia para preservar os espaços", () => {
    const font = decodePngRgba(readFileSync(dialogueFontPath));
    expect(font).toMatchObject({ width: 128, height: 112 });

    const pixel = (x, y) => font.pixels.subarray(((y * font.width) + x) * 4, ((y * font.width) + x + 1) * 4);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        expect([...pixel(x, y)], `célula do espaço em ${x},${y}`).toEqual([16, 28, 48, 255]);
      }
    }

    const letterA = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => pixel(8 + x, 16 + y)[0]))
      .flat()
      .filter((red) => red > 100);
    expect(letterA.length).toBeGreaterThan(0);
  });

  it("declara a composição própria do circuito top-down e arquiva a rota pseudo-3D", () => {
    expect(VERTICE_RACING_ART_DIRECTION).toEqual({
      profile: "diesel-fantasy-v2",
      topdownTrack: {
        size: { width: 480, height: 320 },
        tileSize: 8,
        roomTiles: { width: 60, height: 40 },
        regions: ["road", "curb", "sea", "shore", "beacons", "dock"]
      },
      archivedPseudo3d: {
        panorama: { width: 240, height: 160 },
        affineFloor: { width: 512, height: 512 },
        minimap: { width: 128, height: 128 }
      },
      racers: {
        frameSize: { width: 32, height: 32 },
        frames: ["steer-left", "straight", "steer-right"],
        maxVisibleColors: 15
      }
    });
  });

  it("valida os atores atuais do título em suas dimensões nativas", () => {
    const assets = [
      { name: "title-logo-actor-128x88.png", directory: "sprites", frame: [128, 88], frames: 1 },
      { name: "press-start-actor-88x32.png", directory: "sprites", frame: [88, 32], frames: 1 }
    ];

    for (const asset of assets) {
      const image = decodePngRgba(readFileSync(path.join(
        repositoryRoot,
        "apps/desktop-electron/default-assets/templates/exemplo-gba/Assets",
        asset.directory,
        asset.name
      )));
      const alphaValues = new Set();
      const visibleColors = new Set();
      let opaquePixels = 0;
      for (let offset = 0; offset < image.pixels.length; offset += 4) {
        const pixel = image.pixels.subarray(offset, offset + 4);
        alphaValues.add(pixel[3]);
        if (pixel[3] > 0) {
          opaquePixels += 1;
          visibleColors.add(pixel.subarray(0, 3).toString("hex"));
        }
      }
      expect(image).toMatchObject({ width: asset.frame[0], height: asset.frame[1] });
      expect(asset.frames).toBe(1);
      expect(opaquePixels, `${asset.name} pixels opacos`).toBeGreaterThan(0);
      expect([...alphaValues].every((alpha) => alpha === 0 || alpha === 255)).toBe(true);
      expect(visibleColors.size, `${asset.name} cores visíveis`).toBeLessThanOrEqual(15);
    }
  });

  it("mantém o Press Start atual no canvas nativo da Title Screen", () => {
    const image = decodePngRgba(readFileSync(path.join(
      repositoryRoot,
      "apps",
      "desktop-electron",
      "default-assets",
      "templates",
      "exemplo-gba",
      "Assets",
      "sprites",
      "press-start-actor-88x32.png"
    )));
    const alphaValues = new Set();
    const visibleColors = new Set();
    for (let offset = 0; offset < image.pixels.length; offset += 4) {
      const pixel = image.pixels.subarray(offset, offset + 4);
      alphaValues.add(pixel[3]);
      if (pixel[3] > 0) visibleColors.add(pixel.subarray(0, 3).toString("hex"));
    }

    expect(image).toMatchObject({ width: 88, height: 32 });
    expect([...alphaValues].sort((left, right) => left - right)).toEqual([0, 255]);
    expect(visibleColors.size).toBeGreaterThan(3);
    expect(visibleColors.size).toBeLessThanOrEqual(15);
  });

  it("usa o logo atual como um único ator declarado no projeto", async () => {
    const project = JSON.parse(readFileSync(path.join(
      repositoryRoot,
      "apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
    ), "utf8"));
    const activeNames = new Set(project.assets.map((asset) => asset.name));

    expect(activeNames.has("title-logo-actor-128x88.png")).toBe(true);
    expect(activeNames.has("press-start-actor-88x32.png")).toBe(true);
    expect(activeNames.has("title-emblem.png")).toBe(false);
    expect(activeNames.has("airship.png")).toBe(false);
    expect(VERTICE_TITLE_LOGO_ACTOR_LAYOUT.every((asset) => !activeNames.has(asset.name))).toBe(true);
  });

  it("mantém alpha binário nos atores aprovados do Porto para o formato OBJ", () => {
    for (const name of [
      "nara-topdown.png",
      "gender-player-male-32x64.png",
      "gender-player-female-32x64.png",
      "mechanic-pilot-32x32.png"
    ]) {
      const image = decodePngRgba(readFileSync(path.join(
        repositoryRoot,
        "apps/desktop-electron/default-assets/templates/exemplo-gba/Assets/sprites",
        name
      )));
      const alphaValues = new Set();
      for (let offset = 3; offset < image.pixels.length; offset += 4) alphaValues.add(image.pixels[offset]);

      const expectedSize = name === "mechanic-pilot-32x32.png"
        ? { width: 256, height: 32 }
        : name === "nara-topdown.png"
          ? { width: 288, height: 64 }
        : name.includes("32x64")
          ? { width: 48, height: 48 }
          : { width: 288, height: 64 };
      expect(image).toMatchObject(expectedSize);
      expect([...alphaValues].sort((left, right) => left - right)).toEqual([0, 255]);
    }
  });

  it("usa o jogador atual dos Penedos em seis quadros nativos de 40x40", () => {
    const actorPath = path.join(
      repositoryRoot,
      "apps",
      "desktop-electron",
      "default-assets",
      "templates",
      "exemplo-gba",
      "Assets",
      "sprites",
      "penedos-v10-nara.png"
    );
    const image = decodePngRgba(readFileSync(actorPath));
    expect(image).toMatchObject({ width: 240, height: 40 });
    for (let frameIndex = 0; frameIndex < 6; frameIndex += 1) {
      let opaquePixels = 0;
      for (let y = 0; y < 40; y += 1) {
        for (let x = 0; x < 40; x += 1) {
          const offset = ((y * image.width) + (frameIndex * 40) + x) * 4;
          if (image.pixels[offset + 3] === 0) continue;
          opaquePixels += 1;
        }
      }
      expect(opaquePixels).toBeGreaterThan(0);
    }
  });

  it("mantém os retratos aprovados do Menu Start em escala nativa", () => {
    const spriteRoot = path.join(
      repositoryRoot,
      "apps/desktop-electron/default-assets/templates/exemplo-gba/Assets/sprites"
    );
    const expected = new Map([
      ["gender-player-male-32x64.png", { width: 48, height: 48, maxColors: 15 }],
      ["gender-player-female-32x64.png", { width: 48, height: 48, maxColors: 15 }]
    ]);
    for (const [name, dimensions] of expected) {
      const image = decodePngRgba(readFileSync(path.join(spriteRoot, name)));
      const alphaValues = new Set();
      const visibleColors = new Set();
      for (let offset = 0; offset < image.pixels.length; offset += 4) {
        const pixel = image.pixels.subarray(offset, offset + 4);
        alphaValues.add(pixel[3]);
        if (pixel[3] > 0) visibleColors.add(pixel.subarray(0, 3).toString("hex"));
      }
      expect(image, `${name} dimensão nativa`).toMatchObject({ width: dimensions.width, height: dimensions.height });
      expect([...alphaValues].sort((left, right) => left - right)).toEqual([0, 255]);
      expect(visibleColors.size, `${name} cores visíveis`).toBeGreaterThan(0);
      expect(visibleColors.size, `${name} limite OBJ`).toBeLessThanOrEqual(dimensions.maxColors);
    }
  });

  it("mantém o cursor point-and-click aprovado dentro do limite 4 BPP", () => {
    const filePath = path.join(
      repositoryRoot,
      "apps",
      "desktop-electron",
      "default-assets",
      "templates",
      "exemplo-gba",
      "Assets",
      "sprites",
      "point-click-cursor.png"
    );
    const cursor = decodePngRgba(readFileSync(filePath));
    const project = JSON.parse(readFileSync(path.join(
      repositoryRoot,
      "apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
    ), "utf8"));
    const asset = project.assets.find((item) => item.name === "point-click-cursor.png");
    const alphaValues = new Set();
    const visibleColors = new Set();
    for (let offset = 0; offset < cursor.pixels.length; offset += 4) {
      const pixel = cursor.pixels.subarray(offset, offset + 4);
      alphaValues.add(pixel[3]);
      if (pixel[3] > 0) visibleColors.add(pixel.subarray(0, 3).toString("hex"));
    }
    expect(cursor).toMatchObject({ width: 32, height: 16 });
    expect(asset?.metadata).toMatchObject({ colorMode: "4bpp", frameWidth: 16, frameHeight: 16, frameCount: 2 });
    expect([...alphaValues].sort((left, right) => left - right)).toEqual([0, 255]);
    expect(visibleColors.size).toBeGreaterThan(0);
    expect(visibleColors.size).toBeLessThanOrEqual(15);
    const frames = Array.from({ length: cursor.width / 16 }, (_, frameIndex) => {
      const colors = new Set();
      let opaquePixels = 0;
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const offset = (y * cursor.width + frameIndex * 16 + x) * 4;
          if (cursor.pixels[offset + 3] === 0) continue;
          opaquePixels += 1;
          colors.add(cursor.pixels.subarray(offset, offset + 3).toString("hex"));
        }
      }
      return { opaquePixels, visibleColors: colors.size };
    });
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.opaquePixels > 0 && frame.visibleColors > 0 && frame.visibleColors <= 15))
      .toBe(true);
  });

  it("mantém os assets exclusivos da Oficina aposentados do template", () => {
    const project = JSON.parse(readFileSync(path.join(
      repositoryRoot,
      "apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
    ), "utf8"));
    expect(project.scenas.some((scene) => scene.name === "oficina")).toBe(false);
    expect(project.assets.some((asset) => ["oficina-cursor.png", "oficina-stabilizer.png"].includes(asset.name)))
      .toBe(false);
  });

  it("resolve no template canônico cada fonte de asset declarada pelo projeto", () => {
    const projectPath = path.join(repositoryRoot, "apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project");
    const project = JSON.parse(readFileSync(projectPath, "utf8"));
    const root = path.dirname(projectPath);
    expect(project.assets.length).toBeGreaterThan(0);
    for (const asset of project.assets) {
      const source = asset.metadata?.source;
      expect(source, `fonte ausente: ${asset.name}`).toMatch(/^Assets\//);
      expect(existsSync(path.join(root, source)), `asset ausente: ${source}`).toBe(true);
    }
  });

  it("não recopia assets de cenas aposentadas que o manifesto atual não declara", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "active-assets-only-"));
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const sourceDirectory = path.join(root, "sources");
    const layout = VERTICE_TITLE_BACKGROUND_LAYOUT[0];
    const source = path.join(sourceDirectory, layout.source ?? layout.name);
    const currentProject = {
      assets: [{ name: "market-adventure-merchant.png", metadata: { source: "Assets/sprites/market-adventure-merchant.png" } }]
    };
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(source), { recursive: true })
    ]);
    await writeFile(templateProjectPath, JSON.stringify(currentProject));
    await writeFile(source, "superseded-title-background");

    const synced = await syncVerticeTitleBackground({ templateProjectPath, sourceDirectory });

    expect(synced.templateAssets).toEqual([]);
    await expect(readFile(path.join(root, "template", "Assets", layout.destination, layout.name)))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("usa o manifesto final promovido durante a sincronização antes de gravar o projeto", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "promoted-assets-manifest-"));
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const sourceDirectory = path.join(root, "sources");
    const layout = VERTICE_INITIAL_MENU_BACKGROUND_LAYOUT[0];
    const source = path.join(sourceDirectory, layout.source ?? layout.name);
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(source), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, JSON.stringify({ assets: [] })),
      writeFile(source, "current-approved-menu")
    ]);
    setVerticeAssetSyncManifest(templateProjectPath, {
      assets: [{ name: layout.name, metadata: { source: `Assets/${layout.destination}/${layout.name}` } }]
    });
    try {
      const synced = await syncVerticeInitialMenuBackground({ templateProjectPath, sourceDirectory });
      expect(synced.templateAssets).toEqual([
        path.join(root, "template", "Assets", layout.destination, layout.name)
      ]);
      await expect(readFile(synced.templateAssets[0], "utf8")).resolves.toBe("current-approved-menu");
    } finally {
      clearVerticeAssetSyncManifest(templateProjectPath);
    }
  });

  it("materializa o background isolado do Menu Inicial", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "initial-menu-assets-"));
    const sourceDirectory = path.join(root, "source");
    const preparedDirectory = path.join(sourceDirectory, "prepared");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(preparedDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(preparedDirectory, "menu-inicial-v3-gba.png"), "menu-inicial")
    ]);

    const synced = await syncVerticeInitialMenuBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(VERTICE_INITIAL_MENU_BACKGROUND_LAYOUT).toEqual([expect.objectContaining({
      name: "menu-inicial-v3-gba.png",
      destination: "backgrounds"
    })]);
    expect(synced.templateAssets).toEqual([path.join(path.dirname(templateProjectPath), "Assets/backgrounds/menu-inicial-v3-gba.png")]);
    expect(synced.fixtureAssets).toEqual([path.join(path.dirname(fixtureProjectPath), "Assets/backgrounds/menu-inicial-v3-gba.png")]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/backgrounds/menu-inicial-v3-gba.png"), "utf8"))
      .resolves.toBe("menu-inicial");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets/backgrounds/menu-inicial-v3-gba.png"), "utf8"))
      .resolves.toBe("menu-inicial");
  });

  it("materializa o background dedicado da escolha de gênero", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gender-selection-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(sourceDirectory, "prepared", "gender-selection-gba.png"), "gender-selection")
    ]);

    const synced = await syncVerticeGenderSelectionBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(VERTICE_GENDER_SELECTION_BACKGROUND_LAYOUT).toEqual([expect.objectContaining({
      name: "gender-selection-gba.png",
      destination: "backgrounds"
    })]);
    expect(synced.templateAssets).toEqual([path.join(path.dirname(templateProjectPath), "Assets/backgrounds/gender-selection-gba.png")]);
    expect(synced.fixtureAssets).toEqual([path.join(path.dirname(fixtureProjectPath), "Assets/backgrounds/gender-selection-gba.png")]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/backgrounds/gender-selection-gba.png"), "utf8"))
      .resolves.toBe("gender-selection");
  });

  it("materializa os atores 32x64 dedicados da escolha de gênero", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gender-selection-actors-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared", "male"), { recursive: true }),
      mkdir(path.join(sourceDirectory, "prepared", "female"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(sourceDirectory, "prepared", "male", "player-male-32x64.png"), "male-32x64"),
      writeFile(path.join(sourceDirectory, "prepared", "female", "player-female-32x64.png"), "female-32x64")
    ]);

    const synced = await syncVerticeGenderSelectionActors({ templateProjectPath, fixtureProjectPath, sourceDirectory });

    expect(VERTICE_GENDER_SELECTION_ACTOR_LAYOUT).toEqual([
      expect.objectContaining({ name: "gender-player-male-32x64.png", destination: "sprites" }),
      expect.objectContaining({ name: "gender-player-female-32x64.png", destination: "sprites" })
    ]);
    expect(synced.templateAssets).toEqual([
      path.join(path.dirname(templateProjectPath), "Assets/sprites/gender-player-male-32x64.png"),
      path.join(path.dirname(templateProjectPath), "Assets/sprites/gender-player-female-32x64.png")
    ]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/sprites/gender-player-male-32x64.png"), "utf8"))
      .resolves.toBe("male-32x64");
  });

  it("materializa o background isolado de Salvar no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "save-game-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const [asset] = VERTICE_SAVE_GAME_BACKGROUND_LAYOUT;
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(sourceDirectory, asset.source), "save-game")
    ]);

    const synced = await syncVerticeSaveGameBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(VERTICE_SAVE_GAME_BACKGROUND_LAYOUT).toEqual([expect.objectContaining({
      name: "save-game-gba.png",
      destination: "backgrounds"
    })]);
    expect(synced.templateAssets).toEqual([
      path.join(path.dirname(templateProjectPath), "Assets/backgrounds/save-game-gba.png")
    ]);
    expect(synced.fixtureAssets).toEqual([
      path.join(path.dirname(fixtureProjectPath), "Assets/backgrounds/save-game-gba.png")
    ]);
    await expect(readFile(synced.templateAssets[0], "utf8")).resolves.toBe("save-game");
    await expect(readFile(synced.fixtureAssets[0], "utf8")).resolves.toBe("save-game");
  });

  it("materializa o pacote dedicado do Menu Start no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "start-menu-assets-"));
    const sourceDirectory = path.join(root, "source");
    const preparedDirectory = path.join(sourceDirectory, "prepared");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(preparedDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_START_MENU_BACKGROUND_LAYOUT.map(({ name }) => writeFile(path.join(preparedDirectory, name), name)),
      ...VERTICE_START_MENU_ACTOR_LAYOUT.map(({ name }) => writeFile(path.join(preparedDirectory, name), name))
    ]);

    const synced = await syncVerticeStartMenuAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(VERTICE_START_MENU_BACKGROUND_LAYOUT.length + VERTICE_START_MENU_ACTOR_LAYOUT.length);
    expect(synced.fixtureAssets).toHaveLength(VERTICE_START_MENU_BACKGROUND_LAYOUT.length + VERTICE_START_MENU_ACTOR_LAYOUT.length);
    for (const name of [
      ...VERTICE_START_MENU_BACKGROUND_LAYOUT.map(({ name }) => name),
      ...VERTICE_START_MENU_ACTOR_LAYOUT.map(({ name }) => name)
    ]) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", name.includes("gba") ? "backgrounds" : "sprites", name), "utf8"))
        .resolves.toBe(name);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", name.includes("gba") ? "backgrounds" : "sprites", name), "utf8"))
        .resolves.toBe(name);
    }
  });

  it("materializa o pacote dedicado de Missões no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "missions-assets-"));
    const sourceDirectory = path.join(root, "source");
    const preparedDirectory = path.join(sourceDirectory, "prepared");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(preparedDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_MISSIONS_BACKGROUND_LAYOUT.map(({ name }) => writeFile(path.join(preparedDirectory, name), name)),
      ...VERTICE_MISSIONS_ACTOR_LAYOUT.map(({ name }) => writeFile(path.join(preparedDirectory, name), name))
    ]);

    const synced = await syncVerticeMissionsAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    const expectedCount = VERTICE_MISSIONS_BACKGROUND_LAYOUT.length + VERTICE_MISSIONS_ACTOR_LAYOUT.length;
    expect(synced.templateAssets).toHaveLength(expectedCount);
    expect(synced.fixtureAssets).toHaveLength(expectedCount);
    for (const { name, destination } of [...VERTICE_MISSIONS_BACKGROUND_LAYOUT, ...VERTICE_MISSIONS_ACTOR_LAYOUT]) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
    }
  });

  it("materializa backgrounds hi-detail e atores aprovados dos menus in-game", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "in-game-menu-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const layout = [...VERTICE_IN_GAME_MENU_BACKGROUND_LAYOUT, ...VERTICE_IN_GAME_MENU_ACTOR_LAYOUT];
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...layout.map(async ({ source, name }) => {
        const sourcePath = path.join(sourceDirectory, source);
        await mkdir(path.dirname(sourcePath), { recursive: true });
        await writeFile(sourcePath, name);
      })
    ]);

    const synced = await syncVerticeInGameMenuAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(layout.length);
    expect(synced.fixtureAssets).toHaveLength(layout.length);
    for (const { name, destination } of layout) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
    }
  });

  it("materializa o pacote dedicado do Inventário no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "inventory-assets-"));
    const sourceDirectory = path.join(root, "source");
    const preparedDirectory = path.join(sourceDirectory, "prepared");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(preparedDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_INVENTORY_BACKGROUND_LAYOUT.map(({ source, name }) => writeFile(path.join(sourceDirectory, source), name)),
      ...VERTICE_INVENTORY_ACTOR_LAYOUT.map(({ source, name }) => writeFile(path.join(sourceDirectory, source), name))
    ]);

    const synced = await syncVerticeInventoryAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    const layout = [...VERTICE_INVENTORY_BACKGROUND_LAYOUT, ...VERTICE_INVENTORY_ACTOR_LAYOUT];
    expect(synced.templateAssets).toHaveLength(layout.length);
    expect(synced.fixtureAssets).toHaveLength(layout.length);
    for (const { name, destination } of layout) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
    }
  });

  it("materializa o pacote dedicado do Mapa Híbrido no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "map-hybrid-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...[...VERTICE_MAP_HYBRID_BACKGROUND_LAYOUT, ...VERTICE_MAP_HYBRID_ACTOR_LAYOUT]
        .map(({ source, name }) => writeFile(path.join(sourceDirectory, source), name))
    ]);

    const synced = await syncVerticeMapHybridAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    const layout = [...VERTICE_MAP_HYBRID_BACKGROUND_LAYOUT, ...VERTICE_MAP_HYBRID_ACTOR_LAYOUT];
    expect(synced.templateAssets).toHaveLength(layout.length);
    expect(synced.fixtureAssets).toHaveLength(layout.length);
    for (const { name, destination } of layout) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
    }
  });

  it("materializa o pacote dedicado de Perfil/Equipe no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "profile-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    const layout = [...VERTICE_PROFILE_BACKGROUND_LAYOUT, ...VERTICE_PROFILE_ACTOR_LAYOUT];
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...layout.map(async ({ source, name }) => {
        const sourcePath = path.join(sourceDirectory, source);
        await mkdir(path.dirname(sourcePath), { recursive: true });
        await writeFile(sourcePath, name);
      })
    ]);

    const synced = await syncVerticeProfileAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(layout.length);
    expect(synced.fixtureAssets).toHaveLength(layout.length);
    for (const { name, destination } of layout) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", destination, name), "utf8"))
        .resolves.toBe(name);
    }
  });

  it("materializa o background dedicado de Idioma no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "language-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    const [asset] = VERTICE_LANGUAGE_BACKGROUND_LAYOUT;
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(sourceDirectory, asset.source), asset.name)
    ]);

    const synced = await syncVerticeLanguageAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(1);
    expect(synced.fixtureAssets).toHaveLength(1);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/backgrounds", asset.name), "utf8"))
      .resolves.toBe(asset.name);
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets/backgrounds", asset.name), "utf8"))
      .resolves.toBe(asset.name);
  });

  it("materializa o background dedicado de Configurações no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "settings-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    const [asset] = VERTICE_SETTINGS_BACKGROUND_LAYOUT;
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(sourceDirectory, asset.source), asset.name)
    ]);

    const synced = await syncVerticeSettingsAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(1);
    expect(synced.fixtureAssets).toHaveLength(1);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/backgrounds", asset.name), "utf8"))
      .resolves.toBe(asset.name);
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets/backgrounds", asset.name), "utf8"))
      .resolves.toBe(asset.name);
  });

  it("materializa o background dedicado de Créditos no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "credits-assets-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.join(sourceDirectory, "prepared"), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    const [asset] = VERTICE_CREDITS_BACKGROUND_LAYOUT;
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(sourceDirectory, asset.source), asset.name)
    ]);

    const synced = await syncVerticeCreditsAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(1);
    expect(synced.fixtureAssets).toHaveLength(1);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/backgrounds", asset.name), "utf8"))
      .resolves.toBe(asset.name);
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets/backgrounds", asset.name), "utf8"))
      .resolves.toBe(asset.name);
  });

  it("materializa os cinco rótulos e a seta do Menu Inicial", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "initial-menu-actors-"));
    const sourceDirectory = path.join(root, "source");
    const preparedDirectory = path.join(sourceDirectory, "prepared");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(preparedDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_INITIAL_MENU_ACTOR_LAYOUT.map(({ name }) => writeFile(path.join(preparedDirectory, name), name))
    ]);

    const synced = await syncVerticeInitialMenuActors({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(6);
    expect(synced.fixtureAssets).toHaveLength(6);
    for (const name of VERTICE_INITIAL_MENU_ACTOR_LAYOUT.map(({ name }) => name)) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/sprites", name), "utf8"))
        .resolves.toBe(name);
    }
  });

  it("materializa o ator medium isolado da Abertura no template e no fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "opening-actor-assets-"));
    const sourceDirectory = path.join(root, "source");
    const preparedDirectory = path.join(sourceDirectory, "abertura", "airship-candidate-v11", "prepared");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(preparedDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      writeFile(path.join(preparedDirectory, "opening-airship-v11.png"), "opening-airship")
    ]);

    const synced = await syncVerticeOpeningActor({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(VERTICE_OPENING_ACTOR_ASSET_LAYOUT).toEqual([expect.objectContaining({
      source: "abertura/airship-candidate-v11/prepared/vertice-opening-airship-v11.png",
      name: "opening-airship.png",
      destination: "sprites"
    })]);
    expect(synced.templateAssets).toEqual([path.join(path.dirname(templateProjectPath), "Assets/sprites/opening-airship.png")]);
    expect(synced.fixtureAssets).toEqual([path.join(path.dirname(fixtureProjectPath), "Assets/sprites/opening-airship.png")]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets/sprites/opening-airship.png"), "utf8"))
      .resolves.toBe("opening-airship");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets/sprites/opening-airship.png"), "utf8"))
      .resolves.toBe("opening-airship");
  });
});
