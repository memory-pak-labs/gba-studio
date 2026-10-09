import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronSmokeEnv,
  copySmokeProject,
  cdpSession,
  electronExecutablePath,
  terminateChild,
  wait,
  waitForRenderedText
} from "./lib/electron-smoke-helpers.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalP0ProjectPath = process.env.GBA_STUDIO_ISOMETRIC_EDITOR_PROJECT
  ?? join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");
const outputDir = process.env.GBA_STUDIO_ISOMETRIC_EDITOR_OUTPUT
  ? process.env.GBA_STUDIO_ISOMETRIC_EDITOR_OUTPUT
  : join(appRoot, "artifacts/visual-isometric/latest");
const port = Number(process.env.GBA_STUDIO_ISOMETRIC_EDITOR_CDP_PORT ?? 9362);
const arenaOnly = process.argv.includes("--arena-only");

function sceneDisplayName(value) {
  const name = String(value ?? "").trim();
  return name;
}

function projectRoomForScene(project, sceneName) {
  return (project.rooms ?? []).find((room) => sceneDisplayName(room.name) === sceneName) ?? null;
}

function countMatching(values, predicate) {
  return Array.isArray(values) ? values.filter(predicate).length : 0;
}

function expandedSceneValues(value) {
  if (Array.isArray(value)) return value;
  if (value?.encoding === "rle-v1" && Array.isArray(value.runs)) {
    return value.runs.flatMap(([item, count]) => Array(count).fill(item));
  }
  return [];
}

function deriveIsometricPreviewAspect(project, room) {
  const runtime = room?.runtime?.type === "isometric" ? room.runtime.config ?? {} : {};
  const surface = runtime.pagedSurface;
  if (surface && Number(surface.width) > 0 && Number(surface.height) > 0) {
    return Number(surface.width) / Number(surface.height);
  }
  const assetName = room?.backgroundAssetName ?? room?.tilesetAssetName;
  const asset = (project.assets ?? []).find((item) => item?.name === assetName);
  const metadata = asset?.metadata ?? {};
  const tileWidth = Number(runtime.tileWidth ?? metadata.tileWidth ?? 32);
  const tileHeight = Number(runtime.tileHeight ?? metadata.tileHeight ?? 16);
  const atlasTileHeight = Number(metadata.atlasTileHeight ?? tileHeight);
  const span = Number(room?.width ?? 0) + Number(room?.height ?? 0);
  const width = span * (tileWidth / 2);
  const height = span * (tileHeight / 2) + Math.max(0, atlasTileHeight - tileHeight);
  return height > 0 ? width / height : 0;
}

function expectedFocusedScene(project, sceneName, base) {
  const room = projectRoomForScene(project, sceneName);
  if (!room) throw new Error(`Cena isométrica ${sceneName} não encontrada no projeto do smoke.`);
  const roomName = room.name;
  const collisionTypes = expandedSceneValues(room.collisionTypes ?? room.collisions);
  return {
    ...base,
    backgroundLayerCount: room.runtime?.config?.pagedSurface
      ? 1 + Number(Boolean(room.runtime.config.pagedSurface.foregroundAsset)) : 0,
    hasModularTilePreview: !room.gbStudioUseBackgroundLayout && !room.runtime?.config?.tacticalPresentation?.surfacePages?.length,
    surfacePageCount: room.runtime?.config?.tacticalPresentation?.surfacePages?.length ?? 0,
    actorCount: countMatching(project.actors, (actor) => actor?.roomName === roomName),
    actorHitboxCount: countMatching(project.actors, (actor) => actor?.roomName === roomName),
    cellCount: Number(room.width) * Number(room.height),
    collisionOverlayMinimum: countMatching(collisionTypes, (collision) => collision !== "free"),
    elevatedCellCount: countMatching(expandedSceneValues(room.heightLevels), (level) => Number(level) > 0),
    rampCount: countMatching(collisionTypes, (collision) => String(collision).startsWith("slope_")),
    triggerCount: countMatching(project.triggers, (trigger) => trigger?.roomName === roomName)
  };
}

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTargets() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets();
      if (targets.length > 0) return targets;
    } catch {
      // Electron may still be starting.
    }
    await wait(250);
  }
  throw new Error(`DevTools endpoint did not become available on port ${port}.`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true
  });
  return result.result?.value ?? null;
}

async function clickEditorWorkspace(cdp) {
  const value = await evaluate(cdp, `
    (() => {
      const button = document.querySelector('.workspace-list .workspace[aria-label="Workspace Editor"]');
      if (!button) return { ok: false };
      button.click();
      return { ok: true };
    })()
  `);
  if (!value?.ok) throw new Error("Workspace Editor não encontrado.");
}

async function focusScene(cdp, sceneName) {
  const value = await evaluate(cdp, `
    (() => {
      const sceneName = ${JSON.stringify(sceneName)};
      const card = document.querySelector(
        '[aria-label="Card da cena ' + sceneName + ' · visão geral somente leitura"]'
      );
      const button = card?.querySelector('[aria-label="Editar cena ' + sceneName + '"]');
      if (!button) {
        return {
          ok: false,
          cards: Array.from(document.querySelectorAll('[data-scene-map-preview]'))
            .map((item) => item.getAttribute('aria-label'))
            .filter(Boolean)
        };
      }
      button.click();
      return { ok: true };
    })()
  `);
  if (!value?.ok) throw new Error(`Card da cena ${sceneName} não encontrado: ${JSON.stringify(value)}`);
}

async function inspectOverviewCard(cdp, sceneName, expectedAspectRatio, expectedImageCount) {
  const value = await evaluate(cdp, `
    (() => {
      const sceneName = ${JSON.stringify(sceneName)};
      const card = Array.from(document.querySelectorAll('[data-scene-map-preview]'))
        .find((item) => item.getAttribute('aria-label') === 'Card da cena ' + sceneName + ' · visão geral somente leitura');
      card?.scrollIntoView({ block: 'center', inline: 'center' });
      const layer = card?.querySelector('.room-stage-card-preview-layer');
      const canvas = card?.querySelector('.room-stage-card-preview-canvas');
      const rect = (item) => item ? (() => {
        const bounds = item.getBoundingClientRect();
        return {
          height: Math.round(bounds.height),
          left: Math.round(bounds.left),
          top: Math.round(bounds.top),
          width: Math.round(bounds.width)
        };
      })() : null;
      const layerBounds = rect(layer);
      const canvasBounds = rect(canvas);
      const images = Array.from(layer?.querySelectorAll('.room-stage-background-layout') ?? []);
      const imageMetrics = images.map(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
      const actorRects = Array.from(card?.querySelectorAll('.room-stage-entity.actor') ?? [])
        .map((item) => rect(item));
      const context = canvas?.getContext('2d');
      const raster = document.createElement('canvas');
      raster.width = Math.max(1, Math.round(layerBounds?.width ?? 0));
      raster.height = Math.max(1, Math.round(layerBounds?.height ?? 0));
      const rasterContext = raster.getContext('2d');
      for (const image of images) {
        if (image.complete && image.naturalWidth > 0) rasterContext?.drawImage(image, 0, 0, raster.width, raster.height);
      }
      const pixels = context && canvas ? context.getImageData(0, 0, canvas.width, canvas.height).data
        : rasterContext?.getImageData(0, 0, raster.width, raster.height).data;
      let nonTransparentPixelCount = 0;
      if (pixels) {
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) nonTransparentPixelCount += 1;
        }
      }
      const actorsInsideLayer = Array.from(card?.querySelectorAll('.room-stage-entity') ?? [])
        .every((item) => {
          const bounds = item.getBoundingClientRect();
          return Boolean(layerBounds)
            && bounds.left >= layerBounds.left - 1
            && bounds.top >= layerBounds.top - 1
            && bounds.right <= layerBounds.left + layerBounds.width + 1
            && bounds.bottom <= layerBounds.top + layerBounds.height + 1;
        });
      const aspectRatio = layerBounds && layerBounds.height > 0
        ? layerBounds.width / layerBounds.height
        : 0;
      return {
        actorsInsideLayer,
        actorRects,
        imageMetrics,
        aspectRatio,
        card: rect(card),
        canvasBackground: canvas ? getComputedStyle(canvas.closest('.room-stage-card-canvas')).backgroundColor : null,
        canvas: canvasBounds,
        canvasBitmap: canvas ? { height: canvas.height, width: canvas.width } : null,
        hasCanvas: Boolean(canvas),
        hasPreviewLayer: Boolean(layer),
        previewMode: layer?.getAttribute('data-card-preview-mode') ?? null,
        nonTransparentPixelCount,
        projection: layer?.getAttribute('data-card-preview-projection') ?? null,
        sceneName
      };
    })()
  `);
  const sourceIsReady = expectedImageCount > 0
    ? value?.imageMetrics?.length === expectedImageCount
      && value.imageMetrics.every(image => image.complete && image.width > 0 && image.height > 0)
    : value?.hasCanvas && value.canvasBitmap?.width > 0 && value.canvasBitmap?.height > 0;
  const valid = sourceIsReady
    && value.hasPreviewLayer
    && value.projection === 'isometric-contain'
    && value.previewMode === 'isometric-tilemap'
    && value.nonTransparentPixelCount > 0
    && value.actorsInsideLayer
    && Number.isFinite(expectedAspectRatio)
    && Math.abs(value.aspectRatio - expectedAspectRatio) < 0.1;
  if (!valid) {
    throw new Error(`Preview do card ${sceneName} não preserva a composição isométrica: ${JSON.stringify({ expectedAspectRatio, observed: value })}`);
  }
  return { ...value, expectedAspectRatio, expectedImageCount };
}

async function inspectOverviewCompositionCard(cdp, sceneName) {
  const value = await evaluate(cdp, `
    (() => {
      const sceneName = ${JSON.stringify(sceneName)};
      const card = Array.from(document.querySelectorAll('[data-scene-map-preview]'))
        .find((item) => item.getAttribute('aria-label') === 'Card da cena ' + sceneName + ' · visão geral somente leitura');
      card?.scrollIntoView({ block: 'center', inline: 'center' });
      const layer = card?.querySelector('.room-stage-card-preview-layer');
      const canvas = card?.querySelector('.room-stage-card-preview-canvas');
      const surface = card?.querySelector('.room-stage-tactical-surface-preview');
      const rect = (item) => item ? (() => {
        const bounds = item.getBoundingClientRect();
        return {
          height: Math.round(bounds.height),
          left: Math.round(bounds.left),
          top: Math.round(bounds.top),
          width: Math.round(bounds.width)
        };
      })() : null;
      const layerBounds = rect(layer);
      const surfaceBounds = rect(surface);
      const surfaceFrameAligned = Boolean(layerBounds && surfaceBounds)
        && Math.abs(layerBounds.left - surfaceBounds.left) <= 1
        && Math.abs(layerBounds.top - surfaceBounds.top) <= 1
        && Math.abs(layerBounds.width - surfaceBounds.width) <= 1
        && Math.abs(layerBounds.height - surfaceBounds.height) <= 1;
      const actorsInsideLayer = Array.from(card?.querySelectorAll('.room-stage-entity') ?? [])
        .every((item) => {
          const bounds = item.getBoundingClientRect();
          return Boolean(layerBounds)
            && bounds.left >= layerBounds.left - 1
            && bounds.top >= layerBounds.top - 1
            && bounds.right <= layerBounds.left + layerBounds.width + 1
            && bounds.bottom <= layerBounds.top + layerBounds.height + 1;
        });
      const imageMetrics = Array.from(surface?.querySelectorAll('.room-stage-tactical-surface-page-image') ?? [])
        .map((item) => ({
          complete: item.complete,
          naturalHeight: item.naturalHeight,
          naturalWidth: item.naturalWidth,
          rect: rect(item)
        }));
      return {
        actorsInsideLayer,
        card: rect(card),
        canvas: rect(canvas),
        hasCanvas: Boolean(canvas),
        hasPreviewLayer: Boolean(layer),
        layer: layerBounds,
        projection: layer?.getAttribute('data-card-preview-projection') ?? null,
        previewMode: layer?.getAttribute('data-card-preview-mode') ?? null,
        sceneName,
        surface: surfaceBounds,
        surfaceFrameAligned,
        surfacePageCount: surface?.querySelectorAll('.room-stage-tactical-surface-page').length ?? 0,
        surfaceImageMetrics: imageMetrics
      };
    })()
  `);
  if (!value?.hasPreviewLayer || !value.actorsInsideLayer || !value.surfaceFrameAligned || value.previewMode !== 'tactical-surface'
    || value.surfacePageCount < 1 || value.surfaceImageMetrics.length !== value.surfacePageCount
    || value.surfaceImageMetrics.some(image => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)) {
    throw new Error(`Preview composto do card ${sceneName} está fora do frame do card: ${JSON.stringify(value)}`);
  }
  return value;
}

async function enableCollisionOverlay(cdp) {
  const value = await evaluate(cdp, `
    (() => {
      const button = Array.from(document.querySelectorAll('.room-editor-tool-rail button'))
        .find((item) => /colis/i.test(item.getAttribute('aria-label') ?? "")
          && /solidos/i.test(item.getAttribute('aria-label') ?? ""));
      button?.click();
      return {
        available: Array.from(document.querySelectorAll('.room-editor-tool-rail button'))
          .map((item) => item.getAttribute('aria-label'))
          .filter(Boolean),
        clicked: Boolean(button)
      };
    })()
  `);
  if (!value?.clicked) throw new Error(`Ferramenta de colisão não encontrada: ${JSON.stringify(value)}`);
  await wait(100);
}

async function inspectFocusedScene(cdp, sceneName, expected) {
  const controlledActorName = JSON.stringify(expected.controlledActorName ?? "");
  const value = await evaluate(cdp, `
    (() => {
      const sceneName = ${JSON.stringify(sceneName)};
      const editor = document.querySelector('[aria-label="Editor focado da cena ' + sceneName + '"]');
      const card = editor?.querySelector('.room-stage-card.is-focused-scene-editor');
      const canvas = card?.querySelector('.room-stage-card-canvas.isometric');
      const cells = canvas ? Array.from(canvas.querySelectorAll('.room-stage-cell')) : [];
      const ramps = cells.filter((item) => item.classList.contains('has-isometric-ramp'));
      const elevated = cells.filter((item) => Array.from(item.classList).some((name) => name.startsWith('has-isometric-height-')));
      const tileCells = cells.filter((item) => item.querySelector('.room-stage-cell-tile'));
      const actors = canvas ? Array.from(canvas.querySelectorAll('.room-stage-entity-hitbox.isometric')) : [];
      const actorSprites = canvas ? Array.from(canvas.querySelectorAll('.room-stage-entity.actor')) : [];
      const triggers = canvas ? Array.from(canvas.querySelectorAll('.room-stage-entity.trigger')) : [];
      const collisionOverlays = cells
        .map((item) => item.querySelector('[data-collision-overlay="true"]'))
        .filter(Boolean);
      const collisionOverlayStyle = collisionOverlays[0] ? getComputedStyle(collisionOverlays[0]) : null;
      const rect = (item) => item ? (() => {
        const bounds = item.getBoundingClientRect();
        return { height: Math.round(bounds.height), left: Math.round(bounds.left), top: Math.round(bounds.top), width: Math.round(bounds.width) };
      })() : null;
      const viewport = card?.closest('.rooms-canvas-world-scroll');
      const viewportBounds = rect(viewport);
      const backgroundPreviewCount = (canvas?.querySelectorAll(
        '.room-stage-cell-tile, .room-stage-tactical-surface-page, .room-stage-background-layout'
      ).length ?? 0);
      const hasVisibleActorGeometry = actorSprites.every((item) => {
        const bounds = rect(item);
        return Boolean(bounds && bounds.width > 0 && bounds.height > 0);
      });
      const actorFrameRendering = actorSprites.map((item) => {
        const frameWidth = Number(item.getAttribute('data-sprite-frame-width') ?? 0);
        const frameHeight = Number(item.getAttribute('data-sprite-frame-height') ?? 0);
        const imageWidth = Number(item.getAttribute('data-sprite-image-width') ?? 0);
        const imageHeight = Number(item.getAttribute('data-sprite-image-height') ?? 0);
        const backgroundSize = item.style.backgroundSize;
        const expectedWidth = imageWidth > 0 && frameWidth > 0 ? (imageWidth / frameWidth) * 100 : null;
        const expectedHeight = imageHeight > 0 && frameHeight > 0 ? (imageHeight / frameHeight) * 100 : null;
        const [actualWidth, actualHeight] = backgroundSize.match(/[0-9.]+(?=%)/g)?.map(Number) ?? [];
        return {
          backgroundSize,
          frameHeight,
          frameWidth,
          imageHeight,
          imageWidth,
          actualHeight,
          actualWidth,
          expectedHeight,
          expectedWidth,
          complete: frameWidth > 0
            && frameHeight > 0
            && (expectedWidth === null || Math.abs(actualWidth - expectedWidth) < 0.01)
            && (expectedHeight === null || Math.abs(actualHeight - expectedHeight) < 0.01)
        };
      });
      const actorsInsideViewport = actorSprites.every((item) => {
        const bounds = item.getBoundingClientRect();
        return Boolean(viewportBounds)
          && bounds.left >= viewportBounds.left - 1
          && bounds.top >= viewportBounds.top - 1
          && bounds.right <= viewportBounds.left + viewportBounds.width + 1
          && bounds.bottom <= viewportBounds.top + viewportBounds.height + 1;
      });
      const controlledActor = actorSprites.find((item) => (
        item.getAttribute('title')?.startsWith('Player · ' + ${controlledActorName} + ' ·')
          || item.getAttribute('title')?.startsWith(${controlledActorName} + ':')
      ));
      const controlledActorBounds = controlledActor?.getBoundingClientRect();
      const controlledActorInsideViewport = Boolean(
        controlledActorBounds
        && viewportBounds
        && controlledActorBounds.left >= viewportBounds.left - 1
        && controlledActorBounds.top >= viewportBounds.top - 1
        && controlledActorBounds.right <= viewportBounds.left + viewportBounds.width + 1
        && controlledActorBounds.bottom <= viewportBounds.top + viewportBounds.height + 1
      );
      const viewportLabel = document.querySelector('.room-isometric-viewport-label')?.textContent?.trim() ?? null;
      const zoom = document.querySelector('.room-scene-navigation-zoom strong')?.textContent?.trim();
      const hasViewportLabel = viewportLabel === (zoom === '100%' ? 'Viewport Play · 240×160' : 'Revisão da cena · ' + zoom);
      return {
        actorCount: actorSprites.length,
        actorHitboxCount: actors.length,
        backgroundPreviewCount,
        backgroundLayerCount: canvas?.querySelectorAll('.room-stage-background-layout').length ?? 0,
        cellCount: cells.length,
        collisionOverlayCount: collisionOverlays.length,
        hasDiamondCollisionOverlay: collisionOverlayStyle?.clipPath?.includes('50% 0%') ?? false,
        elevatedCellCount: elevated.length,
        hasCanvas: Boolean(canvas),
        hasBackgroundPreview: backgroundPreviewCount > 0,
        hasCompleteActorFrames: actorFrameRendering.every((item) => item.complete),
        hasFocusedEditor: Boolean(editor),
        hasOrthogonalBackgroundGrid: Boolean(canvas?.querySelector('.room-stage-background-grid')),
        hasModularTilePreview: tileCells.length > 0,
        hasVisibleActorGeometry,
        actorsInsideViewport,
        controlledActorInsideViewport,
        actorFrameRendering,
        hasViewportGeometry: Boolean(viewportBounds && viewportBounds.width > 0 && viewportBounds.height > 0),
        geometry: {
          background: rect(canvas?.querySelector('.room-stage-background-layout')),
          canvas: rect(canvas),
          firstCell: rect(cells[0]),
          lastCell: rect(cells[cells.length - 1]),
          actors: actorSprites.map((item) => rect(item)),
          viewport: viewportBounds
        },
        rampCount: ramps.length,
        surfacePageCount: canvas?.querySelectorAll('.room-stage-tactical-surface-page').length ?? 0,
        triggerCount: triggers.length,
        viewportLabel,
        hasViewportLabel
      };
    })()
  `);
  const mismatches = Object.entries(expected)
    .filter(([key]) => !["collisionOverlayMinimum", "viewportMinimumWidth", "controlledActorName"].includes(key))
    .filter(([key, expectedValue]) => value?.[key] !== expectedValue)
    .map(([key, expectedValue]) => ({ expected: expectedValue, key, observed: value?.[key] }));
  if ((value?.collisionOverlayCount ?? 0) < (expected.collisionOverlayMinimum ?? 0)) {
    mismatches.push({
      expected: `>=${expected.collisionOverlayMinimum}`,
      key: "collisionOverlayCount",
      observed: value?.collisionOverlayCount
    });
  }
  if ((value?.geometry?.viewport?.width ?? 0) < (expected.viewportMinimumWidth ?? 0)) {
    mismatches.push({
      expected: `>=${expected.viewportMinimumWidth}`,
      key: "geometry.viewport.width",
      observed: value?.geometry?.viewport?.width
    });
  }
  if (mismatches.length > 0) {
    throw new Error(`Preview isométrico de ${sceneName} não corresponde ao contrato: ${JSON.stringify({ mismatches, observed: value })}`);
  }
  return value;
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-isometric-editor-"));
  const fixtureRoot = join(tempRoot, "exemplo-gba");
  const fixturePath = join(fixtureRoot, "exemplo-gba.gba-project");
  const userDataPath = join(tempRoot, "user-data");
  let child;
  let stdout = "";
  let stderr = "";
  try {
    await copySmokeProject(dirname(canonicalP0ProjectPath), fixtureRoot);
    const project = JSON.parse(await readFile(fixturePath, "utf8"));
    const marketRoom = projectRoomForScene(project, "mercado_suspenso");
    const marketAspectRatio = deriveIsometricPreviewAspect(project, marketRoom);
    await mkdir(userDataPath, { recursive: true });
    const electronPath = electronExecutablePath({ appRoot, usePackagedApp: false });
    const childEnv = createElectronSmokeEnv({
      GBA_STUDIO_OPEN_PROJECT: fixturePath,
      GBA_STUDIO_SMOKE_CDP_PORT: String(port),
      GBA_STUDIO_SMOKE_USER_DATA_DIR: userDataPath
    });
    child = spawn(electronPath, [appRoot], {
      cwd: appRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });

    const targets = await waitForTargets();
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ?? targets[0];
    const cdp = cdpSession(page.webSocketDebuggerUrl);
    await cdp.ready;
    try {
      await cdp.send("Page.enable");
      await waitForRenderedText(cdp, (text) => text.includes("Cenas") && text.includes("mercado_suspenso"), "project scene map");
      await clickEditorWorkspace(cdp);
      await waitForRenderedText(cdp, (text) => text.includes("Ferramentas do Editor") && text.includes("mercado_suspenso"), "Editor workspace");
      const initialEvidence = await cdp.send('Page.captureScreenshot', {format:'png'});
      await writeFile(join(outputDir, 'initial-editor.png'), Buffer.from(initialEvidence.data, 'base64'));
      const overview = await inspectOverviewCard(cdp, "mercado_suspenso", marketAspectRatio, marketRoom?.runtime?.config?.pagedSurface ? 1 + Number(Boolean(marketRoom.runtime.config.pagedSurface.foregroundAsset)) : 0);
      await wait(350);
      const overviewScreenshot = await cdp.send("Page.captureScreenshot", {
        captureBeyondViewport: false,
        format: "png",
        fromSurface: true
      });
      const overviewScreenshotPath = join(outputDir, "mercado-suspenso-card-overview.png");
      await writeFile(overviewScreenshotPath, Buffer.from(String(overviewScreenshot.data ?? ""), "base64"));
      const arenaOverview = await inspectOverviewCompositionCard(cdp, "arena_tatica");
      await wait(350);
      const arenaOverviewScreenshot = await cdp.send("Page.captureScreenshot", {
        captureBeyondViewport: false,
        format: "png",
        fromSurface: true
      });
      const arenaOverviewScreenshotPath = join(outputDir, "arena-tatica-card-overview.png");
      await writeFile(arenaOverviewScreenshotPath, Buffer.from(String(arenaOverviewScreenshot.data ?? ""), "base64"));
      const cases = [
        {
          expected: expectedFocusedScene(project, "mercado_suspenso", {
            hasBackgroundPreview: true,
            hasCompleteActorFrames: true,
            hasCanvas: true,
            hasDiamondCollisionOverlay: true,
            hasFocusedEditor: true,
            hasOrthogonalBackgroundGrid: false,
            hasVisibleActorGeometry: true,
            controlledActorName: "Aventureiro · Mercado",
            controlledActorInsideViewport: true,
            hasViewportGeometry: true,
            viewportMinimumWidth: 700,
            hasViewportLabel: true
          }),
          name: "mercado_suspenso",
          screenshot: "mercado-suspenso-editor-focused.png"
        },
        {
          expected: expectedFocusedScene(project, "arena_tatica", {
            hasBackgroundPreview: true,
            actorsInsideViewport: true,
            hasCompleteActorFrames: true,
            hasCanvas: true,
            hasDiamondCollisionOverlay: true,
            hasFocusedEditor: true,
            hasOrthogonalBackgroundGrid: false,
            hasVisibleActorGeometry: true,
            controlledActorName: "Nara · Arena Tática",
            controlledActorInsideViewport: true,
            hasViewportGeometry: true,
            viewportMinimumWidth: 700,
            hasViewportLabel: true
          }),
          name: "arena_tatica",
          screenshot: "arena-tatica-editor-focused.png"
        }
      ].filter((sceneCase) => !arenaOnly || sceneCase.name === "arena_tatica");
      const previews = [];
      const screenshots = [];
      for (const [index, sceneCase] of cases.entries()) {
        if (index > 0) {
          await evaluate(cdp, `document.querySelector('[aria-label="Voltar à visão geral"]')?.click()`);
          await waitForRenderedText(cdp, (text) => text.includes("Ferramentas do Editor") && text.includes(sceneCase.name), `scene map before ${sceneCase.name}`);
        }
        await focusScene(cdp, sceneCase.name);
        await waitForRenderedText(cdp, (text) => text.includes("Viewport Play") && text.includes(sceneCase.name), `focused ${sceneCase.name}`);
        const fitted = await evaluate(cdp, `
          (() => {
            const button = document.querySelector('[aria-label="Ajustar canvas às cenas visíveis"]');
            button?.click();
            return Boolean(button);
          })()
        `);
        if (!fitted) throw new Error(`Ajustar não disponível no editor de ${sceneCase.name}.`);
        await wait(250);
        await enableCollisionOverlay(cdp);
        await wait(350);
        previews.push({ name: sceneCase.name, ...(await inspectFocusedScene(cdp, sceneCase.name, sceneCase.expected)) });
        const screenshot = await cdp.send("Page.captureScreenshot", {
          captureBeyondViewport: false,
          format: "png",
          fromSurface: true
        });
        const screenshotPath = join(outputDir, sceneCase.screenshot);
        await writeFile(screenshotPath, Buffer.from(String(screenshot.data ?? ""), "base64"));
        screenshots.push(screenshotPath);
      }
      const evidence = {
        generatedAt: new Date().toISOString(),
        ok: true,
        overview: { arena: arenaOverview, market: overview },
        previews,
        screenshots: [overviewScreenshotPath, arenaOverviewScreenshotPath, ...screenshots],
        viewport: await evaluate(cdp, "({ height: innerHeight, width: innerWidth })")
      };
      const evidencePath = join(outputDir, "evidence.json");
      await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
      console.log(JSON.stringify(evidence, null, 2));
    } finally {
      cdp.close();
    }
  } finally {
    if (child) await terminateChild(child);
    await rm(userDataPath, { force: true, recursive: true });
    await rm(tempRoot, { force: true, recursive: true });
    if (stdout.includes("Unhandled") || stderr.includes("Unhandled")) {
      throw new Error(`Electron emitted an unhandled error.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
