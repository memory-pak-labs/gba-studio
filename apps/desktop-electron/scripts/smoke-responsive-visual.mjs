import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronSmokeEnv,
  cdpSession,
  electronExecutablePath,
  renderedText,
  terminateChild,
  wait,
  waitForRenderedText
} from "./lib/electron-smoke-helpers.mjs";
import { assertCanonicalP0Source } from "./p0-source-catalog.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalP0Source = assertCanonicalP0Source(appRoot);
const outputDir = process.env.GBA_STUDIO_RESPONSIVE_SMOKE_OUTPUT
  ? process.env.GBA_STUDIO_RESPONSIVE_SMOKE_OUTPUT
  : join(appRoot, "artifacts/visual-responsive/latest");
const port = Number(process.env.GBA_STUDIO_RESPONSIVE_SMOKE_CDP_PORT ?? 9359);
const viewportHeight = 900;
const viewportProfiles = [
  { label: "half", title: "Meia tela", width: 900 },
  { label: "compact", title: "Janela compacta", width: 1440 },
  { label: "full", title: "Tela inteira", width: 1600 }
];

const responsiveWorkspaces = [
  {
    label: "Editor",
    fileSlug: "editor",
    expectedText: ["Projeto", "Modelos", "Ferramentas do Editor"],
    requiredAriaLabels: ["Conectores entre cenas"]
  },
  {
    label: "Cenas",
    fileSlug: "cenas",
    expectedText: ["Cenas", "Padrões do projeto", "Players Padrão", "Transições"]
  },
  {
    label: "Dialogos",
    fileSlug: "dialogos",
    expectedText: ["Diálogos", "Texto do diálogo", "Páginas", "Editar na cena", "Tradução"]
  },
  {
    label: "Sprites",
    fileSlug: "sprites",
    expectedText: ["Sprites", "Folha · Quadros", "Tipo de animação"],
    requiredAriaLabels: ["Configurações de animação"]
  },
  {
    label: "Audio",
    fileSlug: "audio",
    expectedText: ["Compositor de Áudio", "Biblioteca", "Piano Roll", "farol_tema_principal"]
  },
  {
    label: "Arquivos",
    fileSlug: "arquivos",
    expectedText: ["Arquivos", "Biblioteca", "Onde é usado", "Abrir cena", "Detalhes técnicos"]
  },
  {
    label: "Exportar",
    fileSlug: "exportar",
    readyText: ["Exportar", "Projeto e ROM", "Compilação", "Hardware GBA", "Verificar caminhos"],
    expectedText: [
      "Exportar",
      "Runtime Universal",
      "Relógio em tempo real (RTC)",
      "Link cable / multiplayer",
      "Composição Affine"
    ],
    openState: async (cdp) => {
      await clickButtonByText(cdp, "Runtime Universal");
      await waitForSettingsSection(cdp, "Runtime Universal");
    },
    closeState: async (cdp) => {
      await clickButtonByText(cdp, "Projeto e ROM");
      await waitForSettingsSection(cdp, "Projeto e ROM");
    }
  },
  {
    label: "Ajustes",
    fileSlug: "ajustes",
    readyText: ["Ajustes", "Interface", "Controles"],
    expectedText: [
      "Ajustes",
      "MCP local",
      "Configuração para Codex",
      "Copiar para Codex"
    ],
    openState: async (cdp) => {
      await clickButtonByText(cdp, "MCP local");
      await waitForSettingsSection(cdp, "MCP local");
    },
    closeState: async (cdp) => {
      await clickButtonByText(cdp, "Interface");
      await waitForSettingsSection(cdp, "Interface");
    }
  }
];

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

async function setViewport(cdp, width) {
  const windowResult = await cdp.send("Browser.getWindowForTarget").catch(() => null);
  const windowID = windowResult?.windowId;
  if (typeof windowID === "number") {
    await cdp.send("Browser.setWindowBounds", {
      bounds: {
        height: viewportHeight,
        width,
        windowState: "normal"
      },
      windowId: windowID
    });
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: viewportHeight,
    mobile: false,
    width
  });
  await wait(250);
}

async function clickButtonByText(cdp, label) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const label = ${JSON.stringify(label)};
        const buttons = Array.from(document.querySelectorAll("button"));
        const button = buttons.find((item) => {
          const text = item.textContent?.trim() ?? "";
          return text === label || text.endsWith(label) || text.includes(label);
        });
        if (!button) {
          return {
            ok: false,
            available: buttons.map((item) => item.textContent?.trim()).filter(Boolean)
          };
        }
        button.click();
        return { ok: true };
      })()
    `,
    returnByValue: true
  });
  const value = result.result?.value;
  if (!value?.ok) {
    throw new Error(`Button ${JSON.stringify(label)} not found. Available buttons: ${(value?.available ?? []).join(", ")}`);
  }
}

async function waitForSettingsSection(cdp, label) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const label = ${JSON.stringify(label)};
          const selectedButton = Array.from(document.querySelectorAll(".settings-nav button[aria-pressed=\\"true\\"]"))
            .find((item) => (item.textContent ?? "").includes(label));
          const section = Array.from(document.querySelectorAll(".settings-continuous-section, .export-settings-page, .settings-interface-page"))
            .find((item) => ((item.textContent ?? "") + (item.getAttribute("aria-label") ?? "")).includes(label)
              && item.getBoundingClientRect().height > 0);
          return { ok: Boolean(selectedButton && section) };
        })()
      `,
      returnByValue: true
    });
    if (result.result?.value?.ok) {
      await wait(1_200);
      return;
    }
    await wait(100);
  }
  throw new Error(`Settings section ${JSON.stringify(label)} did not settle before capture.`);
}

async function clickElementByAriaLabel(cdp, ariaLabel) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const ariaLabel = ${JSON.stringify(ariaLabel)};
        const element = document.querySelector(\`[aria-label="\${ariaLabel}"]\`);
        if (!element) {
          return {
            ok: false,
            available: Array.from(document.querySelectorAll("[aria-label]"))
              .map((item) => item.getAttribute("aria-label"))
              .filter(Boolean)
              .slice(0, 50)
          };
        }
        element.click();
        return { ok: true };
      })()
    `,
    returnByValue: true
  });
  const value = result.result?.value;
  if (!value?.ok) {
    throw new Error(`Element with aria-label ${JSON.stringify(ariaLabel)} not found. Available labels: ${(value?.available ?? []).join(", ")}`);
  }
}

async function clickWorkspaceByLabel(cdp, label) {
  const displayLabel = { Audio: "Áudio", Dialogos: "Diálogos" }[label] ?? label;
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const ariaLabel = ${JSON.stringify(`Workspace ${displayLabel}`)};
        const button = document.querySelector(\`.workspace-list .workspace[aria-label="\${ariaLabel}"]\`);
        if (!button) {
          return {
            ok: false,
            available: Array.from(document.querySelectorAll(".workspace-list .workspace"))
              .map((item) => item.getAttribute("aria-label"))
              .filter(Boolean)
          };
        }
        button.click();
        return { ok: true };
      })()
    `,
    returnByValue: true
  });
  const value = result.result?.value;
  if (!value?.ok) {
    throw new Error(`Workspace ${JSON.stringify(label)} not found. Available workspaces: ${(value?.available ?? []).join(", ")}`);
  }
}

async function assertNoResponsiveBreakage(cdp, width, label) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const viewportWidth = window.innerWidth;
        const body = document.body;
        const root = document.documentElement;
        const uiFontSize = root.getAttribute("data-studio-font-size");
        const uiFontScale = getComputedStyle(root).getPropertyValue("--studio-font-scale").trim();
        const topbar = document.querySelector(".app-topbar, .welcome-shell");
        const workspaceList = document.querySelector(".workspace-list");
        const workspaceButtons = Array.from(document.querySelectorAll(".workspace-list .workspace"));
        const activeWorkspaceButton = document.querySelector(".workspace-list .workspace[aria-current='page']");
        const modal = document.querySelector(".event-command-menu");
        const activeWorkspace = document.querySelector(".files-workspace, .rooms-workspace, .sprites-workspace, .events-workspace, .colors-workspace, .dialogues-workspace, .audio-workspace, .settings-workspace, .welcome-shell");
        const filesPreviewCard = document.querySelector(".files-preview-card");
        const filesPreviewContent = document.querySelector(".files-preview-content");
        const filesPreviewDetails = document.querySelector(".files-preview-details");
        const inspectorBody = activeWorkspace?.querySelector("[data-scroll-owner='inspector']");
        const inspectorRail = activeWorkspace?.querySelector(".workspace-inspector-rail");
        const scrollOverflow = Math.max(
          body?.scrollWidth ?? 0,
          document.documentElement?.scrollWidth ?? 0
        ) - viewportWidth;
        const topbarBounds = topbar?.getBoundingClientRect();
        const workspaceListBounds = workspaceList?.getBoundingClientRect();
        const workspaceButtonsFit = workspaceButtons.length === 0 || Boolean(workspaceListBounds && workspaceButtons.every((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.left >= workspaceListBounds.left - 1 && bounds.right <= workspaceListBounds.right + 1;
        }));
        const activeWorkspaceVisible = Boolean(workspaceListBounds && activeWorkspaceButton && (() => {
          const bounds = activeWorkspaceButton.getBoundingClientRect();
          return bounds.left >= workspaceListBounds.left - 1 && bounds.right <= workspaceListBounds.right + 1;
        })());
        const modalBounds = modal?.getBoundingClientRect();
        const workspaceBounds = activeWorkspace?.getBoundingClientRect();
        const inspectorBodyBounds = inspectorBody?.getBoundingClientRect();
        const inspectorRailBounds = inspectorRail?.getBoundingClientRect();
        const inspectorStyle = inspectorBody ? getComputedStyle(inspectorBody) : null;
        const filesPreviewCardBounds = filesPreviewCard?.getBoundingClientRect();
        const filesPreviewContentBounds = filesPreviewContent?.getBoundingClientRect();
        const filesPreviewDetailsBounds = filesPreviewDetails?.getBoundingClientRect();
        const modalFits = !modalBounds || (modalBounds.left >= -1 && modalBounds.right <= viewportWidth + 1);
        const workspaceVisible = Boolean(workspaceBounds && workspaceBounds.width > 240 && workspaceBounds.height > 300);
        const inspectorScrollOwner = !inspectorBody || Boolean(
          ["auto", "scroll"].includes(inspectorStyle?.overflowY ?? "")
          && inspectorStyle.overflowX === "hidden"
          && inspectorBody.getAttribute("data-scroll-owner") === "inspector"
          && inspectorBodyBounds
          && inspectorRailBounds
          && inspectorBodyBounds.height <= inspectorRailBounds.height + 1
        );
        const filesPreviewTopOffset =
          filesPreviewCardBounds && filesPreviewContentBounds
            ? filesPreviewContentBounds.top - filesPreviewCardBounds.top
            : null;
        const filesPreviewTopAligned = filesPreviewTopOffset === null || filesPreviewTopOffset <= 40;
        const filesDetailsAboveFold =
          !filesPreviewDetailsBounds ||
          viewportWidth < 1200 ||
          filesPreviewDetailsBounds.top < window.innerHeight - 16;
        return {
          filesDetailsAboveFold,
          filesPreviewTopAligned,
          filesPreviewTopOffset,
          inspectorBodyHeight: inspectorBodyBounds?.height ?? null,
          inspectorRailHeight: inspectorRailBounds?.height ?? null,
          inspectorScrollOwner,
          modalFits,
          ok:
            scrollOverflow <= 4 &&
            Boolean(topbarBounds) &&
            (workspaceButtonsFit || (viewportWidth < 1440 && activeWorkspaceVisible)) &&
            workspaceVisible &&
            modalFits &&
            uiFontSize === "compact" &&
            uiFontScale === "0.9" &&
            filesPreviewTopAligned &&
            filesDetailsAboveFold &&
            inspectorScrollOwner,
          scrollOverflow,
          uiFontScale,
          uiFontSize,
          workspaceButtonsFit,
          workspaceListOverflow: workspaceList ? workspaceList.scrollWidth - workspaceList.clientWidth : null,
          topbarHeight: topbarBounds?.height ?? null,
          viewportWidth,
          workspaceHeight: workspaceBounds?.height ?? null,
          workspaceWidth: workspaceBounds?.width ?? null
        };
      })()
    `,
    returnByValue: true
  });
  const value = result.result?.value;
  if (!value?.ok) {
    throw new Error(`Responsive layout broke at ${width}px for ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

async function waitForEditorVisualAssets(cdp) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const images = Array.from(document.querySelectorAll(
            ".room-stage-card-canvas-readonly img.room-stage-background-layout"
          ));
          return {
            count: images.length,
            ready: images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0)
          };
        })()
      `,
      returnByValue: true
    });
    if (result.result?.value?.ready) return;
    await wait(100);
  }
  throw new Error("Os backgrounds reais do mapa não ficaram prontos antes da captura responsiva.");
}

async function captureCurrentViewport(cdp, label, fileName, expectedText, width) {
  const text = await waitForRenderedText(
    cdp,
    (nextText) => expectedText.every((item) => nextText.includes(item)),
    `${label} at ${width}px`
  ).catch((error) => {
    return renderedText(cdp).then((nextText) => {
      const missingText = expectedText.filter((item) => !nextText.includes(item));
      throw new Error(`${error.message} Missing text: ${missingText.join(", ")}`);
    });
  });

  const layout = await assertNoResponsiveBreakage(cdp, width, label);
  if (label.startsWith("Editor")) {
    await waitForEditorVisualAssets(cdp);
  }
  const screenshot = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true
  });
  const image = Buffer.from(String(screenshot.data ?? ""), "base64");
  if (image.byteLength < 20_000) {
    throw new Error(`Responsive screenshot for ${label} at ${width}px looks too small (${image.byteLength} bytes).`);
  }

  const targetPath = join(outputDir, fileName);
  await writeFile(targetPath, image);

  return {
    bytes: image.byteLength,
    expectedText,
    label,
    layout,
    path: targetPath,
    textLength: text.length,
    width
  };
}

async function runElectronSession(openProjectPath, callback) {
  const electronPath = electronExecutablePath({ appRoot, usePackagedApp: false });
  const userDataPath = await mkdtemp(join(tmpdir(), "gba-studio-responsive-user-data-"));
  const childEnv = createElectronSmokeEnv({
    GBA_STUDIO_OPEN_PROJECT: openProjectPath,
    GBA_STUDIO_SMOKE_CDP_PORT: String(port),
    GBA_STUDIO_SMOKE_USER_DATA_DIR: userDataPath
  });
  if (!openProjectPath) {
    delete childEnv.GBA_STUDIO_OPEN_PROJECT;
  }

  const child = spawn(electronPath, [appRoot], {
    cwd: appRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const targets = await waitForTargets();
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ?? targets[0];
    const cdp = cdpSession(page.webSocketDebuggerUrl);
    await cdp.ready;

    try {
      await cdp.send("Page.enable");
      return await callback(cdp);
    } finally {
      cdp.close();
    }
  } finally {
    await terminateChild(child);
    await rm(userDataPath, { force: true, recursive: true });
    if (stdout.includes("Unhandled") || stderr.includes("Unhandled")) {
      throw new Error(`Electron emitted an unhandled error.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
  }
}

async function main() {
  if (!existsSync(canonicalP0Source.projectPath)) {
    throw new Error(`Projeto P0 canônico não encontrado: ${canonicalP0Source.projectPath}`);
  }

  const electronPath = electronExecutablePath({ appRoot, usePackagedApp: false });
  if (!existsSync(electronPath)) {
    throw new Error(`Electron executable not found: ${electronPath}`);
  }

  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });

  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-electron-responsive-"));
  const temporaryProjectRoot = join(tempRoot, "exemplo-gba");
  const temporaryProjectPath = join(temporaryProjectRoot, "exemplo-gba.gba-project");
  await cp(dirname(canonicalP0Source.projectPath), temporaryProjectRoot, { recursive: true });

  try {
    const captures = [];

    await runElectronSession(null, async (cdp) => {
      await waitForRenderedText(
        cdp,
        (nextText) => nextText.includes("GBA Studio") && nextText.includes("Templates"),
        "welcome screen"
      );

      for (const profile of viewportProfiles) {
        const { label, title, width } = profile;
        await setViewport(cdp, width);
        captures.push(await captureCurrentViewport(cdp, `Welcome - ${title}`, `00-welcome-${label}.png`, [
          "GBA Studio",
          "Templates",
          "Criar projeto",
          "Abrir projeto"
        ], width));
      }
    });

    await runElectronSession(temporaryProjectPath, async (cdp) => {
      await waitForRenderedText(
        cdp,
        (nextText) => nextText.includes("Editor")
          && nextText.includes("Cenas")
          && nextText.includes("logo"),
        "initial project load"
      );

      for (const profile of viewportProfiles) {
        const { label, title, width } = profile;
        await setViewport(cdp, width);
        for (const workspace of responsiveWorkspaces) {
          await clickWorkspaceByLabel(cdp, workspace.label);
          const readyText = workspace.readyText ?? workspace.expectedText;
          await waitForRenderedText(
            cdp,
            (nextText) => readyText.every((item) => nextText.includes(item)),
            `${workspace.label} workspace ready`
          );
          if (workspace.openState) {
            await workspace.openState(cdp);
          }
          if (workspace.requiredAriaLabels) {
            const accessibleRegions = await cdp.send("Runtime.evaluate", {
              expression: `(${JSON.stringify(workspace.requiredAriaLabels)}).every(label => Array.from(document.querySelectorAll('[aria-label]')).some(element => element.getAttribute('aria-label') === label && element.getBoundingClientRect().height > 0))`,
              returnByValue: true
            });
            if (accessibleRegions.result?.value !== true) throw new Error(`${workspace.label}: required accessible regions are absent.`);
          }
          captures.push(await captureCurrentViewport(
            cdp,
            `${workspace.label} - ${title}`,
            `${workspace.fileSlug}-${label}.png`,
            workspace.expectedText,
            width
          ));
          if (workspace.closeState) {
            await workspace.closeState(cdp);
          }
        }
      }
    });

    const manifest = {
      captures,
      generatedAt: new Date().toISOString(),
      ok: true,
      outputDir,
      projectPath: temporaryProjectPath,
      source: {
        id: canonicalP0Source.id,
        projectPath: canonicalP0Source.projectPath,
        role: canonicalP0Source.role,
        sourceKey: "canonicalP0"
      },
      viewportHeight,
      viewportProfiles
    };
    const manifestPath = join(outputDir, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ...manifest, manifestPath }, null, 2));
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
