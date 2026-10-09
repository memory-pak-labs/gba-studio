import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  terminateChild,
  wait,
  waitForRenderedText
} from "./lib/electron-smoke-helpers.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectPath = join(appRoot, "default-assets/templates/exemplo-gba/exemplo-gba.gba-project");
const outputDir = join(appRoot, "artifacts/visual-responsive/latest");
const screenshotPath = join(outputDir, "02h-room-connectors-behind-cards.png");
const port = Number(process.env.GBA_STUDIO_CONNECTOR_SMOKE_CDP_PORT ?? 9369);

async function waitForTarget() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = response.ok ? await response.json() : [];
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Electron may still be starting.
    }
    await wait(250);
  }
  throw new Error(`DevTools endpoint did not become available on port ${port}.`);
}

async function main() {
  if (!existsSync(projectPath)) {
    throw new Error(`Exemplo GBA template not found: ${projectPath}`);
  }

  const electronPath = electronExecutablePath({ appRoot, usePackagedApp: false });
  const userDataPath = await mkdtemp(join(tmpdir(), "gba-studio-connector-layer-"));
  const child = spawn(electronPath, [appRoot], {
    cwd: appRoot,
    env: createElectronSmokeEnv({
      GBA_STUDIO_OPEN_PROJECT: projectPath,
      GBA_STUDIO_SMOKE_CDP_PORT: String(port),
      GBA_STUDIO_SMOKE_USER_DATA_DIR: userDataPath
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    const page = await waitForTarget();
    const cdp = cdpSession(page.webSocketDebuggerUrl);
    await cdp.ready;
    try {
      await cdp.send("Page.enable");
      await waitForRenderedText(
        cdp,
        (text) => text.includes("porto_lumen") && text.includes("farol_interior"),
        "complete Exemplo GBA template ready"
      );
      await wait(300);

      const layerResult = await cdp.send("Runtime.evaluate", {
        expression: `
          (() => {
            const connectorLayer = document.querySelector('.room-card-connector-layer');
            const connectorPaths = Array.from(document.querySelectorAll('.room-card-connector-path'));
            const cards = Array.from(document.querySelectorAll('.room-stage-card-frame'));
            const selectedCard = document.querySelector('.room-stage-card-frame.selected');
            const canvasStage = document.querySelector('.rooms-canvas-stage');
            const canvasWorld = document.querySelector('.rooms-canvas-world');
            const connectorMarker = document.querySelector('#room-card-connector-arrow');
            const firstCardAction = selectedCard?.querySelector('.room-stage-card-actions button');
            const firstCardActions = selectedCard?.querySelector('.room-stage-card-actions');
            const firstCardElement = selectedCard?.querySelector('.room-stage-card');
            const firstCardTitle = selectedCard?.querySelector('.room-stage-card-header strong');
            const firstCardTitleBlock = selectedCard?.querySelector('.room-stage-card-title-block');
            const firstCardTitleRow = selectedCard?.querySelector('.room-stage-card-title-row');
            const inactiveCards = cards.filter((card) => !card.classList.contains('selected'));
            if (!connectorLayer || cards.length < 2) {
              return { ok: false, cardCount: cards.length, connectorCount: connectorPaths.length, hasConnectorLayer: Boolean(connectorLayer) };
            }
            const connectorZ = Number.parseInt(getComputedStyle(connectorLayer).zIndex, 10);
            const cardZValues = cards.map((card) => Number.parseInt(getComputedStyle(card).zIndex, 10));
            const connectorStrokeWidths = connectorPaths.map((path) => Number.parseFloat(getComputedStyle(path).strokeWidth));
            const connectorMarkerWidth = Number.parseFloat(connectorMarker?.getAttribute('markerWidth') ?? '0');
            const firstCardActionWidth = firstCardAction?.getBoundingClientRect().width ?? 0;
            const firstCardTitleFontSize = Number.parseFloat(firstCardTitle ? getComputedStyle(firstCardTitle).fontSize : '0');
            const selectedChromeVisible = Boolean(firstCardActions)
              && getComputedStyle(firstCardActions).display !== 'none'
              && firstCardActionWidth > 0;
            const inactiveChromeHidden = inactiveCards.every((card) => (
              getComputedStyle(card.querySelector('.room-stage-card-tags')).display === 'none'
              && getComputedStyle(card.querySelector('.room-stage-card-actions')).display === 'none'
              && getComputedStyle(card.querySelector('.room-stage-card-footer')).display === 'none'
            ));
            const selectedSceneName = canvasWorld?.getAttribute('data-scene-map-selection') ?? null;
            const connectorsBelongToSelection = connectorPaths.every((path) => (
              path.getAttribute('data-connector-from') === selectedSceneName
              || path.getAttribute('data-connector-to') === selectedSceneName
            ));
            const zoom = canvasStage?.getAttribute('data-zoom') ?? null;
            const checks = {
              cardsAboveConnectors: cardZValues.every((zIndex) => Number.isFinite(zIndex) && zIndex > connectorZ),
              connectorMarkerSize: connectorMarkerWidth > 0 && connectorMarkerWidth <= 6,
              connectorMarkerUnits: connectorMarker?.getAttribute('markerUnits') === 'userSpaceOnUse',
              connectorSelection: connectorsBelongToSelection,
              connectorStrokes: connectorStrokeWidths.every((width) => Number.isFinite(width) && width <= 3),
              connectorsPresent: connectorPaths.length > 0,
              inactiveChromeHidden,
              selectedChromeVisible,
              titleFits: (firstCardTitleRow?.getBoundingClientRect().width ?? 0) >= (firstCardTitle?.scrollWidth ?? 0) + 20,
              titleFont: firstCardTitleFontSize > 0 && firstCardTitleFontSize <= 13,
              zoom: /^\\d+%$/.test(zoom ?? '')
            };
            return {
              cardDensity: canvasStage?.getAttribute('data-card-density') ?? null,
              cardCount: cards.length,
              cardZValues,
              selectedChromeVisible,
              connectorMarkerUnits: connectorMarker?.getAttribute('markerUnits') ?? null,
              connectorMarkerWidth,
              connectorCount: connectorPaths.length,
              connectorsBelongToSelection,
              connectorStrokeWidths,
              connectorZ,
              firstCardActionWidth,
              firstCardActionsWidth: firstCardActions?.getBoundingClientRect().width ?? 0,
              firstCardCardWidth: firstCardElement?.getBoundingClientRect().width ?? 0,
              firstCardTitleBlockWidth: firstCardTitleBlock?.getBoundingClientRect().width ?? 0,
              firstCardTitleFontSize,
              firstCardTitleScrollWidth: firstCardTitle?.scrollWidth ?? 0,
              firstCardTitleText: firstCardTitle?.textContent ?? null,
              firstCardTitleRowWidth: firstCardTitleRow?.getBoundingClientRect().width ?? 0,
              firstCardTitleWidth: firstCardTitle?.getBoundingClientRect().width ?? 0,
              inactiveChromeHidden,
              selectedSceneName,
              checks: { ...checks, connectorLayer: connectorZ === 0, selectedActionSize: firstCardActionWidth > 0 },
              ok: Object.values(checks).every(Boolean),
              zoom
            };
          })()
        `,
        returnByValue: true
      });
      const evidence = layerResult.result?.value;
      if (!evidence?.ok) {
        throw new Error(`Room connector selection or layering is invalid: ${JSON.stringify(evidence)}`);
      }

      await mkdir(outputDir, { recursive: true });
      const screenshot = await cdp.send("Page.captureScreenshot", {
        captureBeyondViewport: false,
        format: "png",
        fromSurface: true
      });
      const bytes = Buffer.from(String(screenshot.data ?? ""), "base64");
      if (bytes.byteLength < 20_000) {
        throw new Error(`Connector screenshot is too small: ${bytes.byteLength} bytes.`);
      }
      await writeFile(screenshotPath, bytes);
      process.stdout.write(`${JSON.stringify({ ...evidence, screenshotPath }, null, 2)}\n`);
    } finally {
      cdp.close();
    }
  } finally {
    await terminateChild(child);
    await rm(userDataPath, { force: true, recursive: true });
  }
}

await main();
