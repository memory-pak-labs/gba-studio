import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { auditIsometricPreviewStability } from "./isometric-preview-stability.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalP0ProjectPath = join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");
const outputDir = process.env.GBA_STUDIO_ISOMETRIC_MARKET_STABILITY_OUTPUT
  ? process.env.GBA_STUDIO_ISOMETRIC_MARKET_STABILITY_OUTPUT
  : join(appRoot, "artifacts/visual-isometric-stability/latest");
const port = Number(process.env.GBA_STUDIO_ISOMETRIC_MARKET_STABILITY_CDP_PORT ?? 9363);
const sceneName = "mercado_suspenso";
const sampleCount = 36;

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
      if (targets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) return targets;
    } catch {
      // Electron ainda pode estar iniciando.
    }
    await wait(250);
  }
  throw new Error(`DevTools endpoint did not become available on port ${port}.`);
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise,
    expression,
    returnByValue: true
  });
  return result.result?.value ?? null;
}

async function clickEditorWorkspace(cdp) {
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector('.workspace-list .workspace[aria-label="Workspace Editor"]');
      button?.click();
      return Boolean(button);
    })()
  `);
  if (!result) throw new Error("Workspace Editor não encontrado.");
}

async function clickSceneEditor(cdp) {
  const result = await evaluate(cdp, `
    (() => {
      const card = Array.from(document.querySelectorAll('.room-stage-card[data-scene-map-mode="overview"]'))
        .find((item) => item.querySelector('.room-stage-card-header strong')?.textContent?.trim() === '${sceneName}');
      const button = card?.querySelector('[aria-label="Editar cena ${sceneName}"]');
      button?.click();
      return Boolean(button);
    })()
  `);
  if (!result) throw new Error(`Card da cena ${sceneName} não possui ação de edição.`);
}

async function returnToOverview(cdp) {
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector('[aria-label="Voltar à visão geral"]');
      button?.click();
      return Boolean(button);
    })()
  `);
  if (!result) throw new Error("O editor isométrico não ofereceu retorno à visão geral.");
}

async function waitForOverviewCard(cdp) {
  const deadline = Date.now() + 10_000;
  let lastState = null;

  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, `
      (() => {
        const card = Array.from(document.querySelectorAll('.room-stage-card[data-scene-map-mode="overview"]'))
          .find((item) => item.querySelector('.room-stage-card-header strong')?.textContent?.trim() === '${sceneName}');
        card?.scrollIntoView({ block: "center", inline: "center" });
        const layer = card?.querySelector('.room-stage-card-preview-layer');
        const canvas = card?.querySelector('.room-stage-card-preview-canvas');
        const images = Array.from(layer?.querySelectorAll('.room-stage-background-layout, .room-stage-tactical-surface-page-image') ?? []);
        const loadedImageCount = images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length;
        const hasCanvas = Boolean(canvas && canvas.width > 0 && canvas.height > 0);
        return {
          hasCard: Boolean(card),
          hasPreviewLayer: Boolean(layer),
          hasRasterSource: hasCanvas || loadedImageCount > 0,
          loadedImageCount,
          imageCount: images.length,
          rasterSize: hasCanvas ? { height: canvas.height, width: canvas.width } : null
        };
      })()
    `);

    if (lastState?.hasCard && lastState.hasPreviewLayer && lastState.hasRasterSource) {
      return;
    }
    await wait(250);
  }

  throw new Error(`O card do Mercado Suspenso não ficou pronto para amostragem: ${JSON.stringify(lastState)}`);
}

async function settleOverview(cdp) {
  await waitForOverviewCard(cdp);
  const ready = await evaluate(cdp, `
    (() => {
      const card = Array.from(document.querySelectorAll('.room-stage-card[data-scene-map-mode="overview"]'))
        .find((item) => item.querySelector('.room-stage-card-header strong')?.textContent?.trim() === '${sceneName}');
      card?.scrollIntoView({ block: "center", inline: "center" });
      const layer = card?.querySelector('.room-stage-card-preview-layer');
      const canvas = card?.querySelector('.room-stage-card-preview-canvas');
      const images = Array.from(layer?.querySelectorAll('.room-stage-background-layout, .room-stage-tactical-surface-page-image') ?? []);
      const hasCanvas = Boolean(canvas && canvas.width > 0 && canvas.height > 0);
      const hasLoadedImage = images.some((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
      return Boolean(card && layer && (hasCanvas || hasLoadedImage));
    })()
  `);
  if (!ready) throw new Error("O card do Mercado Suspenso não ficou pronto para amostragem visual.");
  await wait(250);
}

async function sampleOverview(cdp) {
  const samples = await evaluate(cdp, `
    new Promise((resolve) => {
      const samples = [];
      const collect = () => {
        const card = Array.from(document.querySelectorAll('.room-stage-card[data-scene-map-mode="overview"]'))
          .find((item) => item.querySelector('.room-stage-card-header strong')?.textContent?.trim() === '${sceneName}');
        const preview = card?.querySelector('.room-stage-card-canvas');
        const layer = card?.querySelector('.room-stage-card-preview-layer');
        const canvas = card?.querySelector('.room-stage-card-preview-canvas');
        const layerBounds = layer?.getBoundingClientRect();
        const raster = document.createElement('canvas');
        raster.width = Math.max(1, canvas?.width || Math.round(layerBounds?.width ?? 0));
        raster.height = Math.max(1, canvas?.height || Math.round(layerBounds?.height ?? 0));
        const context = raster.getContext('2d', { willReadFrequently: true });
        const previewImages = Array.from(layer?.querySelectorAll('.room-stage-background-layout, .room-stage-tactical-surface-page-image') ?? [])
          .filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
          .map((image, order) => ({
            bounds: image.getBoundingClientRect(),
            image,
            order,
            zIndex: Number.parseInt(getComputedStyle(image).zIndex, 10) || 0
          }))
          .sort((left, right) => left.zIndex - right.zIndex || left.order - right.order);
        if (canvas && canvas.width > 0 && canvas.height > 0 && context) {
          context.drawImage(canvas, 0, 0, raster.width, raster.height);
        } else if (context && layerBounds && previewImages.length > 0) {
          for (const entry of previewImages) {
            const x = (entry.bounds.left - layerBounds.left) * raster.width / layerBounds.width;
            const y = (entry.bounds.top - layerBounds.top) * raster.height / layerBounds.height;
            const width = entry.bounds.width * raster.width / layerBounds.width;
            const height = entry.bounds.height * raster.height / layerBounds.height;
            context.drawImage(entry.image, x, y, width, height);
          }
        }
        let pixels = null;
        try {
          pixels = context?.getImageData(0, 0, raster.width, raster.height).data ?? null;
        } catch (error) {
          samples.push({ frame: samples.length, rasterError: String(error) });
        }
        let nonTransparentPixelCount = 0;
        let signatureHash = 2_166_136_261;
        if (pixels) {
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] > 0) nonTransparentPixelCount += 1;
            signatureHash ^= pixels[index];
            signatureHash = Math.imul(signatureHash, 16_777_619);
            signatureHash ^= pixels[index + 1];
            signatureHash = Math.imul(signatureHash, 16_777_619);
            signatureHash ^= pixels[index + 2];
            signatureHash = Math.imul(signatureHash, 16_777_619);
            signatureHash ^= pixels[index + 3];
            signatureHash = Math.imul(signatureHash, 16_777_619);
          }
        }
        samples.push({
          rasterBitmap: pixels ? { height: raster.height, width: raster.width } : null,
          frame: samples.length,
          hasRasterContent: Boolean(pixels && nonTransparentPixelCount > 0),
          backgroundLayout: Boolean(preview?.classList.contains('has-background-layout')),
          hasOrthogonalBackgroundGrid: Boolean(card?.querySelector('.room-stage-background-grid')),
          hasPreviewLayer: Boolean(layer),
          layer: layerBounds ? { height: Math.round(layerBounds.height), width: Math.round(layerBounds.width) } : null,
          nonTransparentPixelCount,
          projection: layer?.getAttribute('data-card-preview-projection') ?? null,
          rasterSource: canvas ? 'canvas' : previewImages.length > 0 ? 'image-layers' : 'none',
          signature: pixels ? (signatureHash >>> 0).toString(16) : null
        });
        if (samples.length >= ${sampleCount}) {
          resolve(samples);
          return;
        }
        requestAnimationFrame(collect);
      };
      requestAnimationFrame(collect);
    })
  `, true);
  return Array.isArray(samples) ? samples : [];
}

async function captureScreenshot(cdp, path) {
  const screenshot = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true
  });
  await writeFile(path, Buffer.from(String(screenshot.data ?? ""), "base64"));
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-isometric-market-stability-"));
  const fixtureRoot = join(tempRoot, "exemplo-gba");
  const fixturePath = join(fixtureRoot, "exemplo-gba.gba-project");
  const userDataPath = join(tempRoot, "user-data");
  let child;
  let stdout = "";
  let stderr = "";
  try {
    await copySmokeProject(dirname(canonicalP0ProjectPath), fixtureRoot);
    await mkdir(userDataPath, { recursive: true });
    child = spawn(electronExecutablePath({ appRoot, usePackagedApp: false }), [appRoot], {
      cwd: appRoot,
      env: createElectronSmokeEnv({
        GBA_STUDIO_OPEN_PROJECT: fixturePath,
        GBA_STUDIO_ISOMETRIC_MARKET_STABILITY_CDP_PORT: String(port),
        GBA_STUDIO_SMOKE_CDP_PORT: String(port),
        GBA_STUDIO_SMOKE_USER_DATA_DIR: userDataPath
      }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });

    const targets = await waitForTargets();
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) throw new Error("Página principal do Electron não encontrada.");
    const cdp = cdpSession(page.webSocketDebuggerUrl);
    await cdp.ready;
    try {
      await cdp.send("Page.enable");
      await waitForRenderedText(cdp, (text) => text.includes("Cenas") && text.includes(sceneName), "projeto completo");
      await clickEditorWorkspace(cdp);
      await waitForRenderedText(cdp, (text) => text.includes("Ferramentas do Editor") && text.includes(sceneName), "workspace Editor");
      await settleOverview(cdp);
      const before = await sampleOverview(cdp);
      const beforeAudit = auditIsometricPreviewStability(before);
      const beforeScreenshot = join(outputDir, "mercado-suspenso-stability-overview-before.png");
      await captureScreenshot(cdp, beforeScreenshot);
      if (!beforeAudit.ok || before.some((sample) => sample.hasOrthogonalBackgroundGrid)) {
        throw new Error(`O card do Mercado Suspenso apresentou instabilidade antes do foco: ${JSON.stringify({ audit: beforeAudit, samples: before })}`);
      }

      await clickSceneEditor(cdp);
      await waitForRenderedText(cdp, (text) => text.includes("Viewport Play") && text.includes(sceneName), "editor focado do Mercado Suspenso");
      await wait(300);
      await returnToOverview(cdp);
      await settleOverview(cdp);
      const after = await sampleOverview(cdp);
      const afterAudit = auditIsometricPreviewStability(after);
      const afterScreenshot = join(outputDir, "mercado-suspenso-stability-overview-after.png");
      await captureScreenshot(cdp, afterScreenshot);
      if (!afterAudit.ok || after.some((sample) => sample.hasOrthogonalBackgroundGrid)) {
        throw new Error(`O card do Mercado Suspenso apresentou instabilidade após foco/retorno: ${JSON.stringify({ audit: afterAudit, samples: after })}`);
      }

      const evidence = {
        generatedAt: new Date().toISOString(),
        ok: true,
        sceneName,
        sampleCount,
        before: { audit: beforeAudit, samples: before, screenshot: beforeScreenshot },
        after: { audit: afterAudit, samples: after, screenshot: afterScreenshot },
        contract: {
          projection: "isometric-contain",
          orthogonalBackgroundGrid: false,
          transition: "overview → focused editor → overview"
        }
      };
      const evidencePath = join(outputDir, "mercado-suspenso-stability-evidence.json");
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
