import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  renderedText,
  terminateChild,
  wait
} from "./lib/electron-smoke-helpers.mjs";
import { activeBuildRomPaths, fullProjectRuntimeEvidence } from "./exemplo-template-smoke-contract.mjs";
import { auditExemploTemplate, expandCompactSequence } from "./exemplo-template-audit.mjs";
import { assertCanonicalP0Source } from "./p0-source-catalog.mjs";
import { defaultWelcomeSavedProjectPath } from "./smoke-electron-welcome-paths.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalP0Source = assertCanonicalP0Source(appRoot);
const usePackagedApp = process.argv.includes("--packaged");
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9344);
const completeProjectTimeoutMs = 600_000;
const evidenceRoot = process.env.GBA_STUDIO_EXEMPLO_TEMPLATE_OUTPUT
  ?? join(appRoot, "artifacts", "exemplo-template", "latest");
const evidencePath = join(evidenceRoot, "exemplo_template_evidence.json");
const screenshotPath = join(evidenceRoot, "exemplo_template_editor.png");
const racingFocusScreenshotPath = join(evidenceRoot, "exemplo_template_racing_focus.png");
const dialogueScreenshotPath = join(evidenceRoot, "exemplo_template_dialogue_ui.png");
const assetsScreenshotPath = join(evidenceRoot, "exemplo_template_assets.png");
const campaignScreenshotPath = join(evidenceRoot, "exemplo_template_campaign_editor.png");
const uiP0EvidenceRoot = process.env.GBA_STUDIO_EXEMPLO_TEMPLATE_OUTPUT
  ? join(evidenceRoot, "ui-p0") : join(appRoot, "artifacts", "ui-p0", "latest");
const uiP0EvidencePath = join(uiP0EvidenceRoot, "ui_p0_evidence.json");
const romContractEvidencePath = join(evidenceRoot, "exemplo_export_project.json");
const editedGameTitle = "Exemplo GBA Funcional";
const editedDialogueText = "EDICAO REAL DO TEMPLATE GBA";
const editedOriginalSceneName = "porto_lumen";
const editedSceneName = "porto_lumen_funcional";
const editedActorName = "Nara";
const editedSpriteSheet = "nara-topdown.png";
const editedEventName = "porto_abrir_mapa";
const editedTriggerName = "Saída para a rota dos faróis";
const editedEventDialogue = "conselho";

function displaySceneName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name;
}

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTargets() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets();
      if (targets.length > 0) return targets;
    } catch {
      // Electron can still be starting.
    }
    await wait(250);
  }
  throw new Error("O endpoint DevTools do aplicativo não ficou disponível.");
}

async function waitForText(cdp, predicate, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await renderedText(cdp);
    if (predicate(lastText)) return lastText;
    await wait(250);
  }
  const diagnostics = description.includes("compilação")
    ? await evaluate(cdp, `
        (() => ({
          status: document.querySelector('.studio-status-bar-message')?.textContent?.trim() ?? null,
          playButtons: Array.from(document.querySelectorAll('button[aria-label="Executar ROM"]')).map((button) => ({
            disabled: button.disabled,
            visible: button.getClientRects().length > 0,
            title: button.getAttribute('title'),
            className: button.className
          }))
        }))()
      `).catch(() => null)
    : null;
  throw new Error(`Estado não alcançado: ${description}.\nTexto renderizado:\n${lastText.slice(0, 8_000)}\nDiagnóstico: ${JSON.stringify(diagnostics)}`);
}

async function assertSelectedEntityInspector(cdp, kind, entityName) {
  const state = await evaluate(cdp, `
    (() => {
      const panel = document.querySelector('.room-selected-entity-inspector');
      const number = (label) => panel?.querySelector('input[aria-label="' + label + '"]');
      const selected = Array.from(document.querySelectorAll('.editor-tree-row.is-selected'))
        .some(row => row.textContent.includes(${JSON.stringify(entityName)}));
      const coordinates = ['X', 'Y'].every(label => {
        const field = number(label);
        return field && !field.disabled && Number.isFinite(Number(field.value));
      });
      const dimensions = ['W', 'H'].every(label => {
        const field = number(label);
        return field && !field.disabled && Number(field.value) >= 1;
      });
      return {
        selected,
        coordinates,
        dimensions,
        sprite: Boolean(panel?.querySelector('.room-actor-sprite-sheet-field select')),
        tab: Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
          .map(tab => tab.textContent.trim())
      };
    })()
  `);
  if (!state?.selected || !state.coordinates || !state.tab.includes("Objeto")
    || (kind === "actor" ? !state.sprite : !state.dimensions)) {
    throw new Error(`Inspetor contextual de ${kind} ${entityName} inválido: ${JSON.stringify(state)}`);
  }
}

async function waitForVisualComparison(cdp, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let lastComparison = null;
  while (Date.now() < deadline) {
    lastComparison = await evaluate(cdp, `
      (() => {
        const panel = document.querySelector('[aria-label="Comparação PNG original e RGB555"]');
        const compiled = panel?.querySelector('img[alt="Preview RGB555 compilado"]');
        return {
          hasPanel: Boolean(panel),
          hasOriginal: Boolean(panel?.querySelector('img[alt="Background PNG original"]')),
          hasCompiled: Boolean(compiled),
          isExpanded: panel?.querySelector('button[aria-label="Comparar PNG original e RGB555"]')?.getAttribute("aria-expanded") === "true",
          compiledComplete: compiled?.complete === true && compiled?.naturalWidth > 0
        };
      })()
    `);
    if (lastComparison?.hasPanel
      && lastComparison.hasOriginal
      && lastComparison.hasCompiled
      && lastComparison.isExpanded
      && lastComparison.compiledComplete) {
      return lastComparison;
    }
    await wait(100);
  }
  throw new Error(`A comparação PNG → RGB555 não terminou de carregar: ${JSON.stringify(lastComparison)}`);
}

async function waitForSceneVisualComparison(cdp, sceneName, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let lastComparison = null;
  while (Date.now() < deadline) {
    lastComparison = await evaluate(cdp, `
      (() => {
        const sceneCard = Array.from(document.querySelectorAll(".project-health-scene-card"))
          .find((item) => item.querySelector(".project-health-scene-heading strong")?.textContent?.trim() === ${JSON.stringify(displaySceneName(sceneName))});
        const panel = sceneCard?.querySelector('[aria-label="Comparação PNG original e RGB555"]');
        const compiled = panel?.querySelector('img[alt="Preview RGB555 compilado"]');
        return {
          hasPanel: Boolean(panel),
          hasOriginal: Boolean(panel?.querySelector('img[alt="Background PNG original"]')),
          hasCompiled: Boolean(compiled),
          isExpanded: panel?.querySelector('button[aria-label="Comparar PNG original e RGB555"]')?.getAttribute("aria-expanded") === "true",
          compiledComplete: compiled?.complete === true && compiled?.naturalWidth > 0
        };
      })()
    `);
    if (lastComparison?.hasPanel
      && lastComparison.hasOriginal
      && lastComparison.hasCompiled
      && lastComparison.isExpanded
      && lastComparison.compiledComplete) {
      return lastComparison;
    }
    await wait(100);
  }
  throw new Error(`A comparação PNG → RGB555 da cena ${sceneName} não terminou de carregar: ${JSON.stringify(lastComparison)}`);
}

async function waitForSelectionScenePreview(cdp, sceneName, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clean = await evaluate(cdp, `
      (() => {
        const viewport = document.querySelector(${JSON.stringify(`[aria-label="Viewport GBA da cena ${displaySceneName(sceneName)}"]`)});
        const canvas = viewport?.querySelector(".room-focused-scene-editor-frame .room-stage-card-canvas");
        const background = canvas?.querySelector("img.room-stage-background-layout");
        return Boolean(canvas)
          && background?.complete === true
          && background.naturalWidth > 0
          && !canvas.querySelector(".room-stage-cell-tile");
      })()
    `);
    if (clean) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`O preview da cena ${sceneName} não voltou ao modo de seleção.`);
}

async function waitForUniqueRom(engineExportRoot, cdp, timeoutMs = completeProjectTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let generatedFiles = [];
  let rendered = "";
  while (Date.now() < deadline) {
    generatedFiles = existsSync(engineExportRoot) ? await listFilesRecursively(engineExportRoot) : [];
    const romPaths = activeBuildRomPaths(generatedFiles);
    if (romPaths.length > 1) {
      throw new Error(`A compilação materializou mais de uma ROM: ${romPaths.join(", ")}`);
    }
    if (romPaths.length === 1) return romPaths[0];
    rendered = await renderedText(cdp).catch(() => "");
    await wait(250);
  }
  throw new Error(
    `A compilação não materializou uma ROM única em ${timeoutMs} ms. `
    + `Texto renderizado: ${rendered.slice(0, 4_000)}`
  );
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const details = JSON.stringify(result.exceptionDetails);
    const message = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.exception?.value
      ?? result.exceptionDetails.text
      ?? "Falha ao avaliar expressão no renderer.";
    throw new Error(`${message}\nExpression:\n${expression}\nDetails:\n${details}`);
  }
  return result.result?.value;
}

async function clickButtonByText(cdp, label) {
  const result = await evaluate(cdp, `
    (() => {
      const label = ${JSON.stringify(label)};
      const buttons = Array.from(document.querySelectorAll("button"));
      const button = buttons.find((item) => {
        const text = item.textContent?.trim() ?? "";
        return text === label || text.endsWith(label) || text.includes(label);
      });
      if (!button) return { ok: false, available: buttons.map((item) => item.textContent?.trim()).filter(Boolean) };
      if (button.disabled) return { ok: false, reason: "disabled" };
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Botão ${JSON.stringify(label)} indisponível: ${JSON.stringify(result)}`);
  }
}

async function clickButtonByAriaLabel(cdp, ariaLabel) {
  const result = await evaluate(cdp, `
    (() => {
      const ariaLabel = ${JSON.stringify(ariaLabel)};
      const buttons = Array.from(document.querySelectorAll("button[aria-label]"));
      const button = buttons.find((item) => item.getAttribute("aria-label") === ariaLabel);
      if (!button) return { ok: false, available: buttons.map((item) => item.getAttribute("aria-label")).filter(Boolean) };
      if (button.disabled) return { ok: false, reason: "disabled" };
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Botão aria-label ${JSON.stringify(ariaLabel)} indisponível: ${JSON.stringify(result)}`);
  }
}

async function waitForSceneEditor(cdp, roomTitle, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, `
      (() => {
        const expectedViewport = ${JSON.stringify(`Viewport GBA da cena ${displaySceneName(roomTitle)}`)};
        const viewport = document.querySelector('[aria-label^="Viewport GBA da cena "]');
        const secondaryToolbar = document.querySelector('.rooms-editor-secondary-toolbar');
        const backButton = secondaryToolbar?.querySelector('button[aria-label="Voltar à visão geral"]');
        return {
          hasSceneEditor: Array.from(document.querySelectorAll('[aria-label^="Viewport GBA da cena "]'))
            .some((item) => item.getAttribute('aria-label') === expectedViewport),
          hasSecondaryToolbar: Boolean(secondaryToolbar),
          hasBackButton: Boolean(backButton),
          viewport: viewport?.getAttribute('aria-label') ?? null
        };
      })()
    `);
    if (lastState?.hasSceneEditor && lastState.hasSecondaryToolbar && lastState.hasBackButton) return;
    await wait(250);
  }
  throw new Error(`Editor da cena ${roomTitle} não ficou pronto: ${JSON.stringify(lastState)}`);
}

async function saveProjectThroughOverflow(cdp) {
  await clickButtonByAriaLabel(cdp, "Abrir menu de projeto");
  await waitForText(cdp, (text) => text.includes("Salvar projeto"), "ação Salvar projeto no menu de reticências");
  await clickButtonInSelectorByText(cdp, ".project-action-menu", "Salvar projeto");
}

async function clickButtonInSelectorByText(cdp, selector, label) {
  const result = await evaluate(cdp, `
    (() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      const buttons = Array.from(root?.querySelectorAll("button") ?? []);
      const button = buttons.find((item) => {
        const text = item.textContent?.trim() ?? "";
        return text === ${JSON.stringify(label)} || text.endsWith(${JSON.stringify(label)});
      });
      if (!button) return { ok: false, available: buttons.map((item) => item.textContent?.trim()).filter(Boolean) };
      if (button.disabled) return { ok: false, reason: "disabled" };
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Botão ${JSON.stringify(label)} indisponível em ${selector}: ${JSON.stringify(result)}`);
  }
}

async function clickButtonInSelectorContainingText(cdp, selector, label) {
  const result = await evaluate(cdp, `
    (() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      const buttons = Array.from(root?.querySelectorAll("button") ?? []);
      const button = buttons.find((item) => (item.textContent?.trim() ?? "").includes(${JSON.stringify(label)}));
      if (!button) return { ok: false, available: buttons.map((item) => item.textContent?.trim()).filter(Boolean) };
      if (button.disabled) return { ok: false, reason: "disabled" };
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Botão contendo ${JSON.stringify(label)} indisponível em ${selector}: ${JSON.stringify(result)}`);
  }
}

async function clickButtonInSelectorByAriaLabel(cdp, selector, ariaLabel) {
  const deadline = Date.now() + 15_000;
  let result = null;
  while (Date.now() < deadline) {
    result = await evaluate(cdp, `
      (() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        const buttons = Array.from(root?.querySelectorAll("button") ?? []);
        const button = buttons.find((item) => item.getAttribute("aria-label") === ${JSON.stringify(ariaLabel)});
        if (!button) {
          return {
            ok: false,
            retryable: true,
            available: buttons.map((item) => item.getAttribute("aria-label") ?? item.textContent?.trim()).filter(Boolean)
          };
        }
        if (button.disabled) return { ok: false, retryable: false, reason: "disabled" };
        button.click();
        return { ok: true };
      })()
    `);
    if (result?.ok) return;
    if (result?.retryable === false) break;
    await wait(100);
  }
  throw new Error(`Botão aria-label ${JSON.stringify(ariaLabel)} indisponível em ${selector}: ${JSON.stringify(result)}`);
}

async function fillInputNearLabel(cdp, label, value) {
  const result = await evaluate(cdp, `
    (() => {
      const label = ${JSON.stringify(label)};
      const value = ${JSON.stringify(value)};
      const rows = Array.from(document.querySelectorAll("label"));
      const row = rows.find((item) => item.querySelector("span")?.textContent?.trim() === label)
        ?? rows.find((item) => item.textContent?.includes(label));
      const input = row?.querySelector("input");
      if (!input) return { ok: false, available: rows.map((item) => item.textContent?.trim()).filter(Boolean) };
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      input.focus();
      descriptor?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Campo ${JSON.stringify(label)} indisponível: ${JSON.stringify(result)}`);
  }
}

async function fillTextareaNearLabel(cdp, label, value) {
  const result = await evaluate(cdp, `
    (() => {
      const label = ${JSON.stringify(label)};
      const value = ${JSON.stringify(value)};
      const rows = Array.from(document.querySelectorAll("label"));
      const row = rows.find((item) => item.textContent?.includes(label));
      const textarea = row?.querySelector("textarea");
      if (!textarea) return { ok: false, available: rows.map((item) => item.textContent?.trim()).filter(Boolean) };
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
      textarea.focus();
      descriptor?.set?.call(textarea, value);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Área de texto ${JSON.stringify(label)} indisponível: ${JSON.stringify(result)}`);
  }
}

async function waitForTextareaValue(cdp, label, expectedValue, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let currentValue = "";
  while (Date.now() < deadline) {
    currentValue = await evaluate(cdp, `
      (() => {
        const label = ${JSON.stringify(label)};
        const row = Array.from(document.querySelectorAll("label"))
          .find((item) => item.textContent?.includes(label));
        return row?.querySelector("textarea")?.value ?? "";
      })()
    `);
    if (currentValue === expectedValue) return;
    await wait(250);
  }
  throw new Error(
    `Área de texto ${JSON.stringify(label)} não refletiu o valor esperado. `
    + `Atual=${JSON.stringify(currentValue)} esperado=${JSON.stringify(expectedValue)}`
  );
}

async function fillLastInputByAriaLabel(cdp, ariaLabel, value) {
  const result = await evaluate(cdp, `
    (() => {
      const controls = Array.from(document.querySelectorAll("input[aria-label], select[aria-label]"))
        .filter((item) => {
          const label = item.getAttribute("aria-label") ?? "";
          return label === ${JSON.stringify(ariaLabel)} || label.startsWith(${JSON.stringify(`${ariaLabel} `)});
        });
      const control = controls[controls.length - 1];
      if (!control) {
        return {
          ok: false,
          available: Array.from(document.querySelectorAll("input[aria-label], select[aria-label]"))
            .map((item) => item.getAttribute("aria-label"))
            .filter(Boolean)
        };
      }
      const prototype = control instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      control.focus();
      descriptor?.set?.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Último campo aria-label ${JSON.stringify(ariaLabel)} indisponível: ${JSON.stringify(result)}`);
  }
}

async function selectAudioLibraryItem(cdp, itemName) {
  const result = await evaluate(cdp, `
    (() => {
      const button = Array.from(document.querySelectorAll('.audio-groove-library-list button'))
        .find((item) => item.getAttribute("aria-label") === ${JSON.stringify(`Selecionar áudio ${itemName}`)});
      if (!button) {
        return {
          ok: false,
          available: Array.from(document.querySelectorAll('.audio-groove-library-list button[aria-label]'))
            .map((item) => item.getAttribute("aria-label"))
        };
      }
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Áudio ${JSON.stringify(itemName)} indisponível: ${JSON.stringify(result)}`);
  }
}

function roomStageCardExpression(roomTitle) {
  return `Array.from(document.querySelectorAll(".room-stage-card"))
    .find((item) => item.querySelector(".room-stage-card-header strong")?.textContent?.trim() === ${JSON.stringify(displaySceneName(roomTitle))})`;
}

async function focusSceneInEditor(cdp, roomTitle) {
  const focusedScene = await evaluate(cdp, `
    (() => {
      const back = document.querySelector('.rooms-editor-secondary-toolbar button[aria-label="Voltar à visão geral"]');
      if (!back) return false;
      back.click();
      return true;
    })()
  `);
  if (focusedScene) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const cardReady = await evaluate(cdp, `
        Boolean(document.querySelector('[aria-label=${JSON.stringify(`Editar cena ${displaySceneName(roomTitle)}`)}]'))
      `);
      if (cardReady) break;
      await wait(250);
    }
  }
  await clickButtonByAriaLabel(cdp, `Editar cena ${displaySceneName(roomTitle)}`);
  await waitForSceneEditor(cdp, roomTitle);
}

async function firstRoomCanvasCellWithoutCollision(cdp, roomTitle) {
  const result = await evaluate(cdp, `
    (() => {
      const card = ${roomStageCardExpression(roomTitle)};
      if (!card) return {
        ok: false,
        reason: "room card not found",
        available: Array.from(document.querySelectorAll(".room-stage-card-header strong"))
          .map((item) => item.textContent?.trim()).filter(Boolean),
        layout: [".content", ".work-area", ".rooms-workspace", ".rooms-editor-layout", ".rooms-canvas-world-scroll"]
          .map((selector) => {
            const element = document.querySelector(selector);
            const bounds = element?.getBoundingClientRect();
            return { selector, width: Math.round(bounds?.width ?? 0), height: Math.round(bounds?.height ?? 0) };
          })
      };
      const cell = Array.from(card.querySelectorAll(".room-stage-card-canvas button"))
        .find((item) => item.getAttribute("aria-label")?.startsWith("Pintar colisão ") && !item.classList.contains("has-collision"));
      return {
        ok: Boolean(cell),
        ariaLabel: cell?.getAttribute("aria-label") ?? null
      };
    })()
  `);
  if (!result?.ok || !result.ariaLabel) {
    throw new Error(`Nenhuma célula livre encontrada em ${roomTitle}: ${JSON.stringify(result)}`);
  }
  return result.ariaLabel;
}

async function firstRoomCanvasTileCell(cdp, roomTitle) {
  const result = await evaluate(cdp, `
    (() => {
      const card = ${roomStageCardExpression(roomTitle)};
      const cell = Array.from(card?.querySelectorAll(".room-stage-card-canvas button") ?? [])
        .find((item) => item.getAttribute("aria-label")?.startsWith("Pintar tile "));
      return { ok: Boolean(cell), ariaLabel: cell?.getAttribute("aria-label") ?? null };
    })()
  `);
  if (!result?.ok || !result.ariaLabel) {
    throw new Error(`Nenhuma célula de tile encontrada em ${roomTitle}: ${JSON.stringify(result)}`);
  }
  return result.ariaLabel;
}

async function selectTilesetTile(cdp) {
  const result = await evaluate(cdp, `
    (() => {
      const image = document.querySelector("img.room-stage-tileset-probe");
      if (!image) return { ok: false, reason: "tileset missing" };
      const bounds = image.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return { ok: false, reason: "tileset hidden" };
      image.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left,
        clientY: bounds.top,
        pointerId: 1,
        pointerType: "mouse"
      }));
      return { ok: true, width: bounds.width, height: bounds.height };
    })()
  `);
  if (!result?.ok) throw new Error(`Tileset não permitiu selecionar um tile: ${JSON.stringify(result)}`);
  return result;
}

async function dispatchPointerPressOnRoomCell(cdp, roomTitle, ariaLabel) {
  const result = await evaluate(cdp, `
    (() => {
      const card = ${roomStageCardExpression(roomTitle)};
      const element = Array.from(card?.querySelectorAll(".room-stage-card-canvas button") ?? [])
        .find((item) => item.getAttribute("aria-label") === ${JSON.stringify(ariaLabel)});
      if (!element) return { ok: false };
      const bounds = element.getBoundingClientRect();
      const eventInit = {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
        pointerId: 1,
        pointerType: "mouse"
      };
      element.dispatchEvent(new PointerEvent("pointerdown", { ...eventInit, buttons: 1 }));
      element.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, buttons: 0 }));
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Não foi possível pintar ${ariaLabel} em ${roomTitle}.`);
  }
}

async function selectRoomEntityRow(cdp, entityName) {
  await clickButtonInSelectorByText(cdp, ".editor-project-tabs", "Pré-fabricados");
  const result = await evaluate(cdp, `
    (() => {
      const rows = Array.from(document.querySelectorAll(".room-entity-row"));
      const row = rows.find((item) => (
        item.querySelector(".room-entity-title strong")?.textContent?.trim() === ${JSON.stringify(entityName)}
      ));
      // The prefab rail also contains <summary> rows for reusable definitions.
      // Only deeper rows are scene instances and trigger the editor inspector;
      // clicking a prefab summary merely expands it and leaves the room tabs.
      const treeRows = Array.from(document.querySelectorAll(".editor-rail-section.prefabs-section .editor-tree-row.deeper"));
      const treeRow = treeRows.find((item) => (
        item.querySelector("strong")?.textContent?.trim() === ${JSON.stringify(entityName)}
      ));
      const button = row?.querySelector(".room-entity-select") ?? treeRow;
      button?.click();
      return {
        ok: Boolean(button),
        available: [
          ...rows.map((item) => item.querySelector(".room-entity-title strong")?.textContent?.trim()),
          ...treeRows.map((item) => item.querySelector("strong")?.textContent?.trim())
        ].filter(Boolean)
      };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Entidade ${JSON.stringify(entityName)} indisponível: ${JSON.stringify(result)}`);
  }
}

async function renameScene(cdp, currentName, nextName) {
  const opened = await evaluate(cdp, `
    (() => {
      const row = Array.from(document.querySelectorAll(".editor-rail-section.project-section .editor-tree-row"))
        .find((item) => item.querySelector("strong")?.textContent?.trim() === ${JSON.stringify(displaySceneName(currentName))});
      if (!row) return { ok: false };
      row.click();
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 180, clientY: 180 }));
      return { ok: true };
    })()
  `);
  if (!opened?.ok) throw new Error(`Cena ${currentName} não foi encontrada no Explorer.`);
  await clickButtonInSelectorByText(cdp, ".editor-explorer-context-menu", "Renomear");
  await fillInputNearLabel(cdp, "Nome da cena", nextName);
  await clickButtonInSelectorByText(cdp, ".room-name-prompt", "Salvar");
  await waitForText(cdp, (text) => text.includes(displaySceneName(nextName)), `cena renomeada para ${nextName}`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const cardUpdated = await evaluate(cdp, `Boolean(${roomStageCardExpression(nextName)})`);
    if (cardUpdated) return;
    await wait(100);
  }
  throw new Error(`O card da cena não atualizou para ${nextName}.`);
}

async function editEventInWorkspace(cdp) {
  await clickButtonInSelectorByText(cdp, ".rooms-inspector-tabs", "Eventos");
  const opened = await evaluate(cdp, `
    (() => {
      if (document.querySelector(".room-event-editor-shell")) return { ok: true, alreadyOpen: true };
      const expectedText = ${JSON.stringify(`Abrir evento ${editedEventName}`)};
      const directButtons = Array.from(document.querySelectorAll(".room-selected-entity-inspector button, .room-linked-event-button"));
      let button = directButtons.find((item) => item.textContent?.trim() === expectedText);
      if (!button) {
        const binding = Array.from(document.querySelectorAll(".room-event-binding")).find((candidate) => (
          Array.from(candidate.querySelectorAll("input"))
            .some((input) => input.value === ${JSON.stringify(editedEventName)})
        ));
        button = binding?.querySelector(".room-event-binding-open") ?? null;
      }
      button ??= document.querySelector(".room-event-binding-open");
      if (!button) {
        const available = [
          ...Array.from(document.querySelectorAll(".room-selected-entity-inspector button, .room-linked-event-button, .room-event-binding-open"))
        ].map((item) => item.textContent?.trim()).filter(Boolean);
        const bindings = Array.from(document.querySelectorAll(".room-event-binding")).map((item) => ({
          label: item.getAttribute("aria-label"),
          eventName: item.querySelector("input[role='combobox']")?.value ?? "",
          text: item.textContent?.trim()
        }));
        return { ok: false, available, bindings };
      }
      button?.click();
      return { ok: true };
    })()
  `);
  if (!opened?.ok) {
    throw new Error(`Não foi possível abrir o evento ${editedEventName}. Botões disponíveis no inspetor: ${JSON.stringify(opened?.available ?? [])}. Estados visíveis: ${JSON.stringify(opened?.bindings ?? [])}`);
  }
  await waitForText(
    cdp,
    (text) => text.includes("Adicionar evento") && text.includes("Ao entrar"),
    "inspetor do evento vinculado ao ator"
  );
  const addResult = await evaluate(cdp, `
    (() => {
      const eventRoots = [
        document.querySelector(".events-workspace"),
        document.querySelector(".event-step-editor"),
        document.querySelector(".event-build-actions"),
        document.querySelector(".room-selected-entity-inspector")
      ].filter(Boolean);
      for (const root of eventRoots) {
        const button = Array.from(root.querySelectorAll("button"))
          .find((item) => {
            const text = item.textContent?.trim() ?? "";
            return text === "Adicionar evento" || text === "Adicionar" || text === "Adicionar comando";
          });
        if (button) {
          button.click();
          return { ok: true, text: button.textContent?.trim() ?? null };
        }
      }
      return {
        ok: false,
        available: Array.from(new Set(Array.from(document.querySelectorAll("button")).map((item) => item.textContent?.trim()).filter(Boolean)))
      };
    })()
  `);
  if (!addResult?.ok) {
    throw new Error(`O inspetor integrado do evento não expôs Adicionar evento: ${JSON.stringify(addResult)}`);
  }
  try {
    await waitForText(cdp, (text) => text.includes("Buscar evento por nome ou ação") || text.includes("Adicionar evento selecionado"), "biblioteca de eventos do evento");
    await fillLastInputByAriaLabel(cdp, "Buscar evento", "Mostrar diálogo com nome");
    await waitForText(cdp, (text) => text.includes("Mostrar diálogo com nome"), "categoria de diálogo do evento");
    await clickButtonInSelectorContainingText(cdp, ".event-library", "Mostrar diálogo com nome");
    await clickButtonInSelectorByText(cdp, ".event-library", "Adicionar evento selecionado");
    await waitForText(cdp, (text) => text.includes(`Passo adicionado em ${editedEventName}`), "comando adicionado ao fluxo do evento");
    const selectedStep = await evaluate(cdp, `
      new Promise((resolve) => {
        const deadline = Date.now() + 5_000;
        const select = () => {
          const buttons = Array.from(document.querySelectorAll('.event-build-panel button[aria-label^="Passo "]'));
          const button = buttons.find((item) => item.getAttribute("aria-label")?.includes("Mostrar diálogo com nome"));
          if (button) {
            button.click();
            resolve({ ok: true, label: button.getAttribute("aria-label"), count: buttons.length });
          } else if (Date.now() >= deadline) {
            resolve({ ok: false, labels: buttons.map((item) => item.getAttribute("aria-label")) });
          } else {
            setTimeout(select, 100);
          }
        };
        select();
      })
    `, true);
    if (!selectedStep?.ok) {
      throw new Error(`O novo comando do evento não ficou selecionável no Editor: ${JSON.stringify(selectedStep)}`);
    }
    await waitForText(cdp, (text) => text.includes("Mostrar diálogo com nome") && text.includes("Alvo"), "parâmetros do novo evento de diálogo");
    const parameterEdit = await evaluate(cdp, `
      (() => {
        const inlineEditor = document.querySelector('.event-build-panel .event-block-inspector-parameters');
        const control = inlineEditor?.querySelector('input, select');
        if (!control || control.value !== 'intro_001') {
          return { ok: false, values: Array.from(inlineEditor?.querySelectorAll('input, select') ?? []).map((item) => item.value) };
        }
        const prototype = control instanceof HTMLSelectElement
          ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, ${JSON.stringify(editedEventDialogue)});
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      })()
    `);
    if (!parameterEdit?.ok) throw new Error(`Chave do novo diálogo indisponível: ${JSON.stringify(parameterEdit)}`);
    const updatedStep = await evaluate(cdp, `
      new Promise((resolve) => {
        const deadline = Date.now() + 5_000;
        const check = () => {
          const button = document.querySelector('.event-build-panel button[aria-label*="Mostrar diálogo com nome"]');
          const command = button?.getAttribute('title') ?? '';
          if (command.startsWith(${JSON.stringify(`show_dialogue_speaker ${editedEventDialogue} `)})) {
            resolve({ ok: true, command });
          } else if (Date.now() >= deadline) {
            resolve({ ok: false, command });
          } else setTimeout(check, 100);
        };
        check();
      })
    `, true);
    if (!updatedStep?.ok) throw new Error(`O novo evento não recebeu a chave de diálogo: ${JSON.stringify(updatedStep)}`);
    return true;
  } catch (error) {
    throw new Error(`Editor de comandos do evento integrado não abriu o comando esperado: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function duplicateAssetInWorkspace(cdp) {
  const source = await evaluate(cdp, `
    (() => {
      const title = document.querySelector(".files-preview-header p")?.textContent?.trim() ?? "";
      return { ok: Boolean(title), name: title };
    })()
  `);
  if (!source?.ok) throw new Error("O workspace Arquivos não selecionou um asset ativo para duplicação.");

  await clickButtonByAriaLabel(cdp, `Mais ações para ${source.name}`);
  await clickButtonInSelectorByText(cdp, ".studio-context-menu", "Duplicar");
  await waitForText(cdp, (text) => text.includes("Nome do asset duplicado"), "prompt de duplicação do asset");
  const duplicateName = `${source.name} smoke copy`;
  const filled = await evaluate(cdp, `
    (() => {
      const input = document.querySelector('[role="dialog"] input');
      if (!input) return { ok: false };
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      input.focus();
      descriptor?.set?.call(input, ${JSON.stringify(duplicateName)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, value: input.value };
    })()
  `);
  if (!filled?.ok) throw new Error("O prompt de duplicação do asset não expôs um campo editável.");
  await clickButtonInSelectorByText(cdp, ".studio-dialog-actions", "OK");
  await wait(250);
  return { source: source.name, duplicateName };
}

async function editSpriteInWorkspace(cdp, framesBefore) {
  await fillLastInputByAriaLabel(cdp, "Buscar sprite", editedSpriteSheet);
  const selected = await evaluate(cdp, `
    (() => {
      const button = Array.from(document.querySelectorAll(".sprite-sheet-rail-row"))
        .find((item) => item.getAttribute("aria-label") === ${JSON.stringify(editedSpriteSheet)});
      button?.click();
      return Boolean(button);
    })()
  `);
  if (!selected) throw new Error(`O sprite ${editedSpriteSheet} não foi encontrado.`);
  await clickButtonByAriaLabel(cdp, "Adicionar quadro");
  const frameDeadline = Date.now() + 5_000;
  let frameCount = 0;
  while (Date.now() < frameDeadline) {
    frameCount = await evaluate(cdp, `document.querySelectorAll('.sprite-composer-frame-card').length`);
    if (frameCount === framesBefore + 1) break;
    await wait(100);
  }
  if (frameCount !== framesBefore + 1) throw new Error(`Adicionar quadro não atualizou a timeline: antes=${framesBefore} depois=${frameCount}`);
  await clickButtonByAriaLabel(cdp, "Ultimo frame");
  await clickButtonByAriaLabel(cdp, "Pintar");
  await wait(100);
  const canvas = await evaluate(cdp, `
    (() => {
      const button = document.querySelector('button[aria-label^="Pintar tile no frame "]');
      if (!button) return { ok: false, reason: "sprite paint canvas missing" };
      button.scrollIntoView({ block: "center", inline: "center" });
      const bounds = button.getBoundingClientRect();
      return {
        ok: bounds.width > 0 && bounds.height > 0
          && document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === button,
        label: button.getAttribute("aria-label"),
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
        receivesPointer: document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === button,
        tilesBefore: document.querySelectorAll('.sprite-composer-tile-strip button').length
      };
    })()
  `);
  if (!canvas?.ok) throw new Error(`O canvas do animador não permitiu pintar um tile: ${JSON.stringify(canvas)}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: canvas.x, y: canvas.y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: canvas.x, y: canvas.y, button: "left", buttons: 0, clickCount: 1 });
  const deadline = Date.now() + 5_000;
  let tilesAfter = canvas.tilesBefore;
  while (Date.now() < deadline) {
    tilesAfter = await evaluate(cdp, `document.querySelectorAll('.sprite-composer-tile-strip button').length`);
    if (tilesAfter === canvas.tilesBefore + 1) return { ...canvas, tilesAfter };
    await wait(100);
  }
  throw new Error(`A pintura não acrescentou um tile ao frame ativo: ${JSON.stringify({ ...canvas, tilesAfter })}`);
}

async function editAudioInWorkspace(cdp) {
  const before = await evaluate(cdp, `
    (() => {
      const row = Array.from(document.querySelectorAll("label"))
        .find((item) => item.textContent?.trim().startsWith("BPM"));
      const input = row?.querySelector("input");
      const value = Number(input?.value ?? NaN);
      return { ok: Boolean(input) && Number.isFinite(value), value };
    })()
  `);
  if (!before?.ok) throw new Error(`O inspetor de áudio não expôs o BPM: ${JSON.stringify(before)}`);
  const nextBpm = Math.min(240, before.value + 1);
  await fillInputNearLabel(cdp, "BPM", nextBpm);
  await waitForText(cdp, (text) => text.includes("Áudio atualizado."), "atualização do BPM no projeto");
  await evaluate(cdp, `document.querySelector('button[aria-label="Fechar detalhes"]')?.click()`);
  const note = await evaluate(cdp, `
    (() => {
      const button = Array.from(document.querySelectorAll('.audio-groove-grid .audio-groove-cell'))
        .find((item) => item.getAttribute("aria-label")?.startsWith("Adicionar "));
      if (!button) return { ok: false, reason: "audio note cell missing" };
      const label = button.getAttribute("aria-label");
      button.click();
      return { ok: true, label };
    })()
  `);
  if (!note?.ok) throw new Error(`O piano roll não permitiu adicionar uma nota: ${JSON.stringify(note)}`);
  const noteDeadline = Date.now() + 5_000;
  let notePersisted = false;
  while (Date.now() < noteDeadline) {
    notePersisted = await evaluate(cdp, `
    (() => {
      const selectedLabel = ${JSON.stringify(note.label.replace(/^Adicionar /, "Selecionar "))};
      const cell = Array.from(document.querySelectorAll('.audio-groove-grid .audio-groove-cell.has-note'))
        .find((item) => item.getAttribute("aria-label") === selectedLabel);
      return Boolean(cell);
    })()
    `);
    if (notePersisted) break;
    await wait(100);
  }
  if (!notePersisted) throw new Error(`A nota adicionada não apareceu no piano roll: ${note.label}`);
  const after = await evaluate(cdp, `
    (() => {
      const row = Array.from(document.querySelectorAll("label"))
        .find((item) => item.textContent?.trim().startsWith("BPM"));
      return Number(row?.querySelector("input")?.value ?? NaN);
    })()
  `);
  if (after !== nextBpm) throw new Error(`O BPM não foi persistido no inspector: ${before.value} -> ${after}`);
  return { beforeBpm: before.value, afterBpm: after, note, notePersisted };
}

async function inspectFilesWorkspacePipeline(cdp) {
  await clickButtonByText(cdp, "Ver detalhes");
  const result = await evaluate(cdp, `
    (() => {
      const workspace = document.querySelector(".files-workspace");
      const text = workspace?.textContent ?? "";
      return {
        ok: Boolean(workspace)
          && Boolean(workspace.querySelector(".files-technical-details[open]"))
          && text.includes("Pipeline GBA")
          && text.includes("Fonte")
          && text.includes("Preparado")
          && text.includes("Exportado"),
        text: text.slice(0, 2_000)
      };
    })()
  `);
  if (!result?.ok) throw new Error(`O pipeline do asset selecionado não ficou visível: ${JSON.stringify(result)}`);
  return result;
}

async function validateSettingsPaths(cdp) {
  await clickButtonByAriaLabel(cdp, "Compilação seção de ajustes");
  await clickButtonByText(cdp, "Verificar caminhos");
  const result = await evaluate(cdp, `
    new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const validation = document.querySelector(".settings-path-validation");
        if (validation) {
          const heading = validation.querySelector(".settings-path-validation-header strong")?.textContent?.trim() ?? "";
          const count = validation.querySelector(".settings-path-validation-header span")?.textContent?.trim() ?? "";
          const items = Array.from(validation.querySelectorAll(".settings-path-validation-row")).map((row) => ({
            detail: row.querySelector("strong")?.textContent?.trim() ?? "",
            label: row.querySelector("span")?.textContent?.trim() ?? "",
            path: row.querySelector("small")?.textContent?.trim() ?? ""
          }));
          resolve({
            count,
            heading,
            items,
            ok: true,
            text: [heading, count, ...items.flatMap((item) => [item.label, item.detail, item.path])]
              .filter(Boolean)
              .join(" · ")
          });
          return;
        }
        if (Date.now() - started > 10_000) {
          resolve({ ok: false, text: "" });
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })
  `, true);
  if (!result?.ok) throw new Error("A validação de paths não renderizou resultado.");
  return result;
}

async function captureScreenshot(cdp, outputPath = screenshotPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  const result = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png"
  });
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function inspectBackgroundLayoutRendering(cdp, project) {
  const sceneByName = new Map((project.scenas ?? []).map((scene) => [scene.name, scene]));
  const assetByName = new Map((project.assets ?? []).map((asset) => [asset.name, asset]));
  const expectedSceneImage = (name, extras = {}) => {
    const scene = sceneByName.get(name);
    const asset = assetByName.get(scene?.backgroundAssetName);
    const source = asset?.metadata?.source;
    if (!scene || !asset || typeof source !== "string") {
      throw new Error(`Background canônico sem fonte para ${name}.`);
    }
    const bytes = readFileSync(join(appRoot, "default-assets", "templates", "exemplo-gba", source));
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error(`Background canônico não é PNG: ${source}.`);
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (asset.metadata.width != null && Number(asset.metadata.width) !== width
      || asset.metadata.height != null && Number(asset.metadata.height) !== height) {
      throw new Error(`Metadados do background ${source} divergem do PNG.`);
    }
    return { name, expectedImageWidth: width, expectedImageHeight: height, ...extras };
  };
  const wideScenes = [
    expectedSceneImage("penedos_vento", { requireFullCoverage: true }),
    expectedSceneImage("tempestade"),
    expectedSceneImage("mapa_rota", { requireFullCoverage: true }),
    expectedSceneImage("mercado_suspenso", { requireIsometricTilemap: true })
  ];
  const advancedBackgroundScenes = [expectedSceneImage("usina_submersa")];
  const authoredLowColorScenes = ["titulo", "prologo", "tempestade", "guardiao_rele", "conselho_guardia", "mapa_rota"]
    .map((name) => expectedSceneImage(name, { minColors: 2 }));
  const result = await evaluate(cdp, `
    (async () => {
      const deadline = Date.now() + 10_000;
      const wideScenes = ${JSON.stringify(wideScenes)};
      const advancedBackgroundScenes = ${JSON.stringify(advancedBackgroundScenes)};
      const authoredLowColorScenes = ${JSON.stringify(authoredLowColorScenes)};
      const displaySceneName = (value) => {
        const name = typeof value === "string" ? value.trim() : "";
        return name;
      };
      const cardFor = (name) => Array.from(document.querySelectorAll(".room-stage-card"))
        .find((item) => item.querySelector(".room-stage-card-header strong")?.textContent?.trim() === displaySceneName(name));
      let lastState = null;
      const sampleCanvas = (canvas) => {
        const context = canvas?.getContext("2d");
        if (!context || canvas.width <= 0 || canvas.height <= 0) return { opaque: 0, colors: 0 };
        const colors = new Set();
        let opaque = 0;
        for (const xRatio of [0.05, 0.25, 0.5, 0.75, 0.95]) {
          for (const yRatio of [0.15, 0.5, 0.85]) {
            const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(canvas.width * xRatio)));
            const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(canvas.height * yRatio)));
            const pixel = context.getImageData(x, y, 1, 1).data;
            if (pixel[3] > 0) opaque += 1;
            colors.add(Array.from(pixel).join(","));
          }
        }
        return { opaque, colors: colors.size };
      };
      const sampleVisual = (visual) => {
        if (visual?.tagName !== "IMG") return sampleCanvas(visual);
        if (!visual.complete || visual.naturalWidth <= 0 || visual.naturalHeight <= 0) {
          return { opaque: 0, colors: 0 };
        }
        const probe = document.createElement("canvas");
        probe.width = Math.min(240, visual.naturalWidth);
        probe.height = Math.min(160, visual.naturalHeight);
        const context = probe.getContext("2d");
        if (!context) return { opaque: 0, colors: 0 };
        context.drawImage(visual, 0, 0, probe.width, probe.height);
        return sampleCanvas(probe);
      };
      const inspectCanvasPixels = (canvas) => {
        const context = canvas?.getContext("2d");
        if (!context || canvas.width <= 0 || canvas.height <= 0) {
          return { blackPixels: -1, opaquePixels: 0, uniqueColorCount: 0 };
        }
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set();
        let blackPixels = 0;
        let opaquePixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] === 0) continue;
          opaquePixels += 1;
          if (pixels[offset] === 0 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0) {
            blackPixels += 1;
          }
          colors.add([pixels[offset], pixels[offset + 1], pixels[offset + 2]].join(":"));
        }
        return { blackPixels, opaquePixels, uniqueColorCount: colors.size };
      };
      const inspectVisualPixels = (visual) => {
        if (visual?.tagName !== "IMG") return inspectCanvasPixels(visual);
        if (!visual.complete || visual.naturalWidth <= 0 || visual.naturalHeight <= 0) {
          return { blackPixels: -1, opaquePixels: 0, uniqueColorCount: 0 };
        }
        const probe = document.createElement("canvas");
        probe.width = Math.min(240, visual.naturalWidth);
        probe.height = Math.min(160, visual.naturalHeight);
        const context = probe.getContext("2d");
        if (!context) return { blackPixels: -1, opaquePixels: 0, uniqueColorCount: 0 };
        context.drawImage(visual, 0, 0, probe.width, probe.height);
        return inspectCanvasPixels(probe);
      };

      while (Date.now() < deadline) {
        const activeCard = cardFor(${JSON.stringify(editedSceneName)});
        const activeCanvas = activeCard?.querySelector(".room-stage-card-canvas");
        const activeBackground = activeCanvas?.querySelector("img.room-stage-background-layout");
        const active = {
          complete: activeBackground?.complete === true,
          naturalWidth: activeBackground?.naturalWidth ?? 0,
          naturalHeight: activeBackground?.naturalHeight ?? 0,
          hasGrid: Boolean(activeCanvas?.querySelector(".room-stage-background-grid")),
          hasCollisionCell: Boolean(activeCanvas?.querySelector(".room-stage-cell.has-collision")),
          hasActor: Boolean(activeCanvas?.querySelector(".room-stage-entity.actor")),
          hasTrigger: Boolean(activeCanvas?.querySelector(".room-stage-entity.trigger")),
          hasSelectionChrome: Array.from(activeCanvas?.querySelectorAll(".room-stage-entity.readonly") ?? [])
            .some((entity) => {
              const style = getComputedStyle(entity);
              return style.borderTopWidth !== "0px" || style.borderRightWidth !== "0px"
                || style.borderBottomWidth !== "0px" || style.borderLeftWidth !== "0px"
                || style.boxShadow !== "none";
            }),
          hasVisibleLabel: Array.from(activeCanvas?.querySelectorAll(".room-stage-entity-label") ?? [])
            .some((label) => getComputedStyle(label).display !== "none"),
          renderedWidth: Math.round(activeCanvas?.getBoundingClientRect().width ?? 0),
          renderedHeight: Math.round(activeCanvas?.getBoundingClientRect().height ?? 0)
        };
        const wide = wideScenes.map((scene) => {
          const card = cardFor(scene.name);
          const canvas = card?.querySelector("canvas.room-stage-card-preview-canvas");
          const previewLayer = card?.querySelector(".room-stage-card-preview-layer");
          const image = card?.querySelector("img.room-stage-background-layout");
          const visual = canvas ?? image;
          const previewLayerBounds = previewLayer?.getBoundingClientRect();
          return {
            ...scene,
            canvasWidth: canvas?.width ?? 0,
            canvasHeight: canvas?.height ?? 0,
            previewLayerWidth: Math.round(previewLayerBounds?.width ?? 0),
            previewLayerHeight: Math.round(previewLayerBounds?.height ?? 0),
            previewProjection: previewLayer?.dataset.cardPreviewProjection ?? null,
            imageComplete: image?.complete === true,
            imageNaturalWidth: image?.naturalWidth ?? 0,
            imageNaturalHeight: image?.naturalHeight ?? 0,
            renderedWidth: Math.round(visual?.getBoundingClientRect().width ?? 0),
            renderedHeight: Math.round(visual?.getBoundingClientRect().height ?? 0),
            hasLayoutClass: card?.querySelector(".room-stage-card-canvas")?.classList.contains("has-background-layout") ?? false,
            hasIsometricClass: card?.querySelector(".room-stage-card-canvas")?.classList.contains("isometric") ?? false,
            hasGrid: Boolean(card?.querySelector(".room-stage-background-grid")),
            ...sampleVisual(visual)
          };
        });
        const advancedBackgrounds = advancedBackgroundScenes.map((scene) => {
          const card = cardFor(scene.name);
          const canvas = card?.querySelector(".room-stage-card-canvas");
          const previewCanvas = canvas?.querySelector("canvas.room-stage-card-preview-canvas");
          const previewImage = canvas?.querySelector("img.room-stage-background-layout");
          const visual = previewCanvas ?? previewImage;
          return {
            ...scene,
            hasLayoutClass: canvas?.classList.contains("has-background-layout") ?? false,
            canvasWidth: previewCanvas?.width ?? 0,
            canvasHeight: previewCanvas?.height ?? 0,
            imageComplete: previewImage?.complete === true,
            imageNaturalWidth: previewImage?.naturalWidth ?? 0,
            imageNaturalHeight: previewImage?.naturalHeight ?? 0,
            renderedWidth: Math.round(visual?.getBoundingClientRect().width ?? 0),
            renderedHeight: Math.round(visual?.getBoundingClientRect().height ?? 0),
            hasGrid: Boolean(card?.querySelector(".room-stage-background-grid")),
            ...sampleVisual(visual)
          };
        });
        const authoredBackgrounds = authoredLowColorScenes.map((scene) => {
          const card = cardFor(scene.name);
          const canvas = card?.querySelector("canvas.room-stage-card-preview-canvas");
          const image = card?.querySelector("img.room-stage-background-layout");
          const visual = canvas ?? image;
          return {
            ...scene,
            canvasWidth: canvas?.width ?? 0,
            canvasHeight: canvas?.height ?? 0,
            imageComplete: image?.complete === true,
            imageNaturalWidth: image?.naturalWidth ?? 0,
            imageNaturalHeight: image?.naturalHeight ?? 0,
            renderedWidth: Math.round(visual?.getBoundingClientRect().width ?? 0),
            renderedHeight: Math.round(visual?.getBoundingClientRect().height ?? 0),
            hasGrid: Boolean(card?.querySelector(".room-stage-background-grid")),
            ...inspectVisualPixels(visual)
          };
        });
        const viewportElement = document.querySelector(".rooms-canvas-world-scroll");
        const viewportStyle = viewportElement ? getComputedStyle(viewportElement) : null;
        const inactiveGridCount = document.querySelectorAll(
          ".room-stage-card-canvas-readonly .room-stage-background-grid"
        ).length;
        const inactiveCardCount = document.querySelectorAll(
          ".room-stage-card-canvas-readonly"
        ).length;
        const viewport = {
          clientWidth: viewportElement?.clientWidth ?? 0,
          scrollWidth: viewportElement?.scrollWidth ?? 0,
          clientHeight: viewportElement?.clientHeight ?? 0,
          scrollHeight: viewportElement?.scrollHeight ?? 0,
          overflowX: viewportStyle?.overflowX ?? "",
          overflowY: viewportStyle?.overflowY ?? ""
        };
        const activeReady = Boolean(activeCanvas?.classList.contains("room-stage-card-canvas-readonly"))
          && !active.hasGrid && !active.hasSelectionChrome && !active.hasVisibleLabel
          && active.renderedWidth > 0 && active.renderedHeight > 0;
        const wideReady = wide.every((scene) => (
          scene.imageComplete
          && scene.imageNaturalWidth === scene.expectedImageWidth
          && scene.imageNaturalHeight === scene.expectedImageHeight
          && scene.renderedWidth > 0
          && scene.renderedHeight > 0
          && (scene.requireIsometricTilemap
            ? scene.hasIsometricClass
            : scene.hasLayoutClass && scene.imageComplete && scene.imageNaturalWidth > 0 && scene.imageNaturalHeight > 0)
          && !scene.hasGrid
          && (scene.requireFullCoverage ? scene.opaque === 15 : scene.opaque > 0) && scene.colors > 0
        ));
        const advancedBackgroundsReady = advancedBackgrounds.every((scene) => (
          scene.hasLayoutClass && scene.imageComplete && scene.imageNaturalWidth > 0 && scene.imageNaturalHeight > 0
          && scene.imageNaturalWidth === scene.expectedImageWidth && scene.imageNaturalHeight === scene.expectedImageHeight
          && scene.renderedWidth > 0 && scene.renderedHeight > 0
          && !scene.hasGrid && scene.opaque > 0 && scene.colors > 1
        ));
        const authoredBackgroundsReady = authoredBackgrounds.every((scene) => (
          scene.imageComplete && scene.imageNaturalWidth === scene.expectedImageWidth && scene.imageNaturalHeight === scene.expectedImageHeight
          && scene.renderedWidth > 0 && scene.renderedHeight > 0
          && !scene.hasGrid
          && scene.opaquePixels === Math.min(240, scene.expectedImageWidth) * Math.min(160, scene.expectedImageHeight)
          && scene.uniqueColorCount >= scene.minColors
        ));
        const inactiveGridsReady = inactiveCardCount > 0 && inactiveGridCount === 0;
        const viewportReady = viewport.overflowX === "auto" && viewport.overflowY === "auto"
          && (viewport.scrollWidth > viewport.clientWidth || viewport.scrollHeight > viewport.clientHeight);
        lastState = {
          active,
          activeReady,
          wide,
          wideReady,
          advancedBackgrounds,
          advancedBackgroundsReady,
          authoredBackgrounds,
          authoredBackgroundsReady,
          inactiveGridCount,
          inactiveCardCount,
          inactiveGridsReady,
          viewport,
          viewportReady
        };
        if (activeReady && wideReady && advancedBackgroundsReady && authoredBackgroundsReady
          && inactiveGridsReady && viewportReady) {
          return {
            ok: true,
            active,
            wide,
            advancedBackgrounds,
            authoredBackgrounds,
            inactiveGridCount,
            inactiveCardCount,
            viewport
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { ok: false, reason: "background layouts did not become visually ready", ...lastState };
    })()
  `, true);
  if (!result?.ok) {
    throw new Error(`Os backgrounds das cenas não foram renderizados no canvas: ${JSON.stringify(result)}`);
  }
  return result;
}

async function inspectEditorScrollChrome(cdp) {
  const result = await evaluate(cdp, `
    (async () => {
      const element = (selector) => document.querySelector(selector);
      const rect = (selector) => {
        const bounds = element(selector)?.getBoundingClientRect();
        return bounds ? {
          top: Math.round(bounds.top),
          right: Math.round(bounds.right),
          bottom: Math.round(bounds.bottom),
          left: Math.round(bounds.left),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height)
        } : null;
      };
      const selectors = {
        topbar: ".app-topbar",
        toolbar: ".rooms-editor-secondary-toolbar",
        toolRail: ".room-editor-tool-rail",
        inspector: ".editor-side-stack.rooms-side-stack"
      };
      const content = element(".content");
      const viewport = element(".rooms-canvas-world-scroll");
      // Opening a scene initializes the focus camera in a later animation
      // frame. Wait for that layout/scroll to settle before simulating a user.
      const settlingStarted = performance.now();
      let previousGeometry = "", stableFrames = 0;
      while (performance.now() - settlingStarted < 2000) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const geometry = JSON.stringify([viewport?.scrollHeight,viewport?.clientHeight,viewport?.scrollTop,
          ...Object.values(selectors).map(selector => rect(selector))]);
        stableFrames = geometry === previousGeometry ? stableFrames + 1 : 0;
        previousGeometry = geometry;
        if (stableFrames >= 6 && performance.now() - settlingStarted >= 250) break;
      }
      const before = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, rect(selector)]));
      if (!content || !viewport || Object.values(before).some((bounds) => !bounds)) {
        return { ok: false, reason: "editor chrome elements are missing", before };
      }

      const targetCanvasScrollTop = Math.min(320, Math.max(0, viewport.scrollHeight - viewport.clientHeight));
      const initialScrollRange = {height:viewport.scrollHeight,clientHeight:viewport.clientHeight,top:viewport.scrollTop};
      content.scrollTop = 320;
      viewport.scrollTop = targetCanvasScrollTop;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const after = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, rect(selector)]));
      const stable = Object.keys(selectors).every((name) => (
        Math.abs(before[name].top - after[name].top) <= 1
        && Math.abs(before[name].left - after[name].left) <= 1
      ));
      const visible = Object.values(after).every((bounds) => (
        bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth
      ));
      const shellLocked = window.scrollY === 0 && content.scrollTop === 0;
      const canvasScrolled = targetCanvasScrollTop === 0 || viewport.scrollTop === targetCanvasScrollTop;

      return {
        ok: stable && visible && shellLocked && canvasScrolled,
        stable,
        visible,
        shellLocked,
        canvasScrolled,
        targetCanvasScrollTop,
        initialScrollRange,
        finalScrollRange: {height:viewport.scrollHeight,clientHeight:viewport.clientHeight},
        canvasScrollTop: viewport.scrollTop,
        contentScrollTop: content.scrollTop,
        windowScrollY: window.scrollY,
        before,
        after
      };
    })()
  `, true);
  await writeFile(join(evidenceRoot, "editor-scroll-result.json"), JSON.stringify(result, null, 2));
  if (!result?.ok) {
    throw new Error(`A verificação de rolagem do Editor falhou: ${JSON.stringify(result)}`);
  }
  return result;
}

async function listFilesRecursively(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(root, entry.name);
    return entry.isDirectory() ? listFilesRecursively(fullPath) : [fullPath];
  }));
  return nested.flat();
}

async function inspectSavedTemplate(projectPath) {
  const contents = await readFile(projectPath, "utf8");
  const project = JSON.parse(contents);
  const assets = Array.isArray(project.assets) ? project.assets : [];
  const sources = assets
    .map((asset) => asset?.metadata?.source)
    .filter((source) => typeof source === "string");
  const missingSources = sources.filter((source) => !existsSync(join(dirname(projectPath), source)));
  return {
    project,
    contents,
    counts: {
      scenes: Array.isArray(project.scenas) ? project.scenas.length : 0,
      assets: assets.length,
      spriteSheets: assets.filter((asset) => asset?.kind === "Sprite").length,
      actors: Array.isArray(project.actors) ? project.actors.length : 0,
      triggers: Array.isArray(project.triggers) ? project.triggers.length : 0,
      animations: Array.isArray(project.animations) ? project.animations.length : 0,
      animationStates: Array.isArray(project.animationStates) ? project.animationStates.length : 0,
      events: Array.isArray(project.events) ? project.events.length : 0,
      audioItems: Array.isArray(project.audioItems) ? project.audioItems.length : 0
    },
    materializedAssetCount: sources.length - missingSources.length,
    missingSources
  };
}

function racingTopdownContract(scene) {
  const config = scene?.runtime?.config;
  const topdownTrack = config?.topdownTrack;
  return {
    cameraBounds: scene?.cameraBounds ?? null,
    cameraDeadZone: {
      x: topdownTrack?.cameraDeadZoneX ?? null,
      y: topdownTrack?.cameraDeadZoneY ?? null
    },
    checkpoints: Array.isArray(topdownTrack?.checkpoints) ? topdownTrack.checkpoints : [],
    collisionTypes: expandCompactSequence(scene?.collisionTypes),
    presentation: config?.presentation ?? null
  };
}

function collisionFlagsForTypes(types) {
  const flags = {
    damage: 1 << 6,
    down: 1 << 1,
    ladder: 1 << 7,
    left: 1 << 4,
    right: 1 << 3,
    solid: 1,
    up: 1 << 2,
    water: 1 << 5
  };
  return types.map((type) => flags[type] ?? 0);
}

async function assertWorkspace(cdp, label, expectedText) {
  const result = await evaluate(cdp, `
    (() => {
      const ariaLabel = ${JSON.stringify(`Workspace ${label}`)};
      const button = document.querySelector(\`.workspace-list .workspace[aria-label=\"\${ariaLabel}\"]\`);
      if (!button) {
        return {
          ok: false,
          available: Array.from(document.querySelectorAll(".workspace-list .workspace"))
            .map((item) => item.getAttribute("aria-label"))
            .filter(Boolean)
        };
      }
      if (button.disabled) return { ok: false, reason: "disabled" };
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(
      `Botão da workspace ${JSON.stringify(label)} indisponível: ${JSON.stringify(result)}`
    );
  }
  const deadline = Date.now() + 15_000;
  let lastText = "";
  let activeWorkspace = null;
  while (Date.now() < deadline) {
    lastText = await renderedText(cdp);
    activeWorkspace = await evaluate(cdp, `
      document.querySelector('.workspace-list .workspace[aria-current="page"]')
        ?.getAttribute("aria-label") ?? null
    `);
    if (activeWorkspace === `Workspace ${label}` && expectedText.every((item) => lastText.includes(item))) {
      return lastText;
    }
    await wait(250);
  }
  throw new Error(
    `Workspace ${label} não ficou ativa. Atual=${activeWorkspace ?? "nenhuma"}.\nTexto renderizado:\n${lastText.slice(0, 8_000)}`
  );
}

async function assertSpritesWorkspace(cdp, expectedSheetName, expectedSheetCount) {
  await assertWorkspace(cdp, "Sprites", []);
  const deadline = Date.now() + 15_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await evaluate(cdp, `
      (() => {
        const root = document.querySelector(".sprites-workspace");
        const sheetHeading = root?.querySelector(".sprites-library-heading");
        const animationGroup = root?.querySelector(".sprite-animation-library");
        const sheetRows = Array.from(root?.querySelectorAll(".sprite-sheet-list .sprite-sheet-rail-row") ?? []);
        const animationRows = Array.from(animationGroup?.querySelectorAll(".sprite-animation-rail-row") ?? []);
        const sheetCount = Number(sheetHeading?.querySelector("span")?.textContent?.trim() ?? NaN);
        const animationCount = Number(animationGroup?.querySelector(".sprite-library-title span")?.textContent?.trim() ?? NaN);
        const sheetNames = sheetRows
          .map((row) => row.getAttribute("aria-label") ?? "")
          .filter(Boolean);
        return {
          ok: Boolean(root)
            && sheetHeading?.querySelector("strong")?.textContent?.trim() === "Sprites"
            && animationGroup?.querySelector(".sprite-library-title strong")?.textContent?.trim() === "Animações"
            && sheetCount === ${JSON.stringify(expectedSheetCount)}
            && sheetRows.length === sheetCount
            && animationRows.length === animationCount
            && sheetNames.includes(${JSON.stringify(expectedSheetName)}),
          sheetCount,
          animationCount,
          sheetRows: sheetRows.length,
          animationRows: animationRows.length,
          sheetNames: sheetNames.slice(0, 12)
        };
      })()
    `);
    if (state?.ok) return state;
    await wait(250);
  }
  throw new Error(`Workspace Sprites não expôs a biblioteca atual de atores/animações: ${JSON.stringify(state)}`);
}

async function openExportHealth(cdp) {
  await assertWorkspace(cdp, "Exportar", []);
  await clickButtonByAriaLabel(cdp, "Saúde seção de exportação");
  await waitForText(cdp, (text) => text.includes("Saúde do projeto · Preflight") && text.includes("Capacidades por cena"), "preflight de exportação");
}

async function main() {
  if (canonicalP0Source.role !== "canonical-p0" || canonicalP0Source.globalAcceptance !== true) {
    throw new Error(`O projeto exemplo não está classificado como P0 canônico: ${JSON.stringify(canonicalP0Source)}`);
  }
  const executable = electronExecutablePath({ appRoot, usePackagedApp });
  if (!existsSync(executable)) {
    throw new Error(`Executável do Electron não encontrado: ${executable}`);
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-exemplo-template-"));
  const projectPath = defaultWelcomeSavedProjectPath(tempRoot);
  const engineExportRoot = join(tempRoot, "EngineExport");
  const childEnv = createElectronSmokeEnv({
    GBA_STUDIO_SMOKE_CDP_PORT: String(port),
    GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: engineExportRoot,
    GBA_STUDIO_SMOKE_PROJECT_SAVE_PATH: projectPath,
    GBA_STUDIO_SMOKE_USER_DATA_DIR: join(tempRoot, "UserData")
  });
  delete childEnv.GBA_STUDIO_OPEN_PROJECT;

  const child = spawn(executable, usePackagedApp ? [] : [appRoot], {
    cwd: appRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  try {
    const targets = await waitForTargets();
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ?? targets[0];
    const cdp = cdpSession(page.webSocketDebuggerUrl);
    await cdp.ready;

    try {
      await waitForText(
        cdp,
        (text) => text.includes("Templates") && text.includes("Exemplo GBA Completo"),
        "Welcome com o template Exemplo"
      );
      await clickButtonByText(cdp, "Exemplo GBA Completo");
      await waitForText(
        cdp,
        (text) => text.includes("titulo") && text.includes("penedos_vento") && text.includes("Salvo"),
        "editor do template Exemplo",
        30_000
      );

      const initial = await inspectSavedTemplate(projectPath);
      const initialTemplateAudit = auditExemploTemplate(initial.project);
      if (!initialTemplateAudit.ok) {
        throw new Error(`Auditoria do template inicial falhou: ${initialTemplateAudit.issues.join("; ")}`);
      }
      const uiP0Checked = [];
      const runSceneButtonCount = await evaluate(cdp, `
        Array.from(document.querySelectorAll('button[aria-label^="Executar somente a cena "]')).length
      `);
      if (runSceneButtonCount !== initial.counts.scenes) {
        throw new Error(
          `Esperados ${initial.counts.scenes} botões de executar cena, encontrados ${runSceneButtonCount}.`
        );
      }

      await focusSceneInEditor(cdp, "titulo");
      const titleEditorState = await evaluate(cdp, `
        (() => {
          return {
            hasFocusedEditor: Boolean(document.querySelector('[aria-label="Viewport GBA da cena titulo"]')),
            hasOverviewButton: Boolean(document.querySelector(
              '.rooms-editor-secondary-toolbar button[aria-label="Voltar à visão geral"]'
            )),
            hasRetiredCampaignEditor: Boolean(document.querySelector('[aria-label="Editar continuidade da campanha"]'))
          };
        })()
      `);
      if (!titleEditorState?.hasFocusedEditor
        || !titleEditorState.hasOverviewButton
        || titleEditorState.hasRetiredCampaignEditor) {
        throw new Error(`O editor do Title Screen não expôs o contrato atual: ${JSON.stringify(titleEditorState)}`);
      }
      await captureScreenshot(cdp, campaignScreenshotPath);
      await clickButtonInSelectorByAriaLabel(cdp, ".rooms-editor-secondary-toolbar", "Voltar à visão geral");
      await waitForText(cdp, (text) => !text.includes("Voltar à visão geral"), "retorno à visão geral após validar a continuidade da campanha");

      const initialActor = initial.project.actors?.find((actor) => actor?.name === editedActorName);
      const initialAnimation = initial.project.animations?.find((animation) => animation?.spriteSheet === editedSpriteSheet);
      const initialEvent = initial.project.events?.find((event) => event?.name === editedEventName);
      const initialRacingScene = initial.project.scenas?.find((scene) => scene?.name === "circuito_final");
      const initialRacingContract = racingTopdownContract(initialRacingScene);
      const initialSceneForEdit = initial.project.scenas?.find((scene) => scene?.name === editedOriginalSceneName);
      const initialTilemap = expandCompactSequence(initialSceneForEdit?.tilemap);
      if (!initialActor || !initialAnimation || !initialEvent || !initialRacingScene
        || !initialSceneForEdit || initialTilemap.length === 0
        || initialRacingContract.presentation !== "topdown"
        || initialRacingContract.checkpoints.length === 0) {
        throw new Error("O template inicial não contém os registros escolhidos para o smoke de edição.");
      }

      await renameScene(cdp, editedOriginalSceneName, editedSceneName);
      await focusSceneInEditor(cdp, editedSceneName);
      await clickButtonInSelectorByAriaLabel(cdp, ".room-editor-tool-rail", "Pintura - Tiles");
      await selectTilesetTile(cdp);
      const tileCellLabel = await firstRoomCanvasTileCell(cdp, editedSceneName);
      await dispatchPointerPressOnRoomCell(cdp, editedSceneName, tileCellLabel);
      uiP0Checked.push("workspace-rooms", "workspace-rooms-tile-paint");
      await clickButtonInSelectorByAriaLabel(cdp, ".room-editor-tool-rail", "Colisao - Solidos");
      const collisionCellLabel = await firstRoomCanvasCellWithoutCollision(cdp, editedSceneName);
      const editedCollisionIndex = Number(collisionCellLabel.match(/(\d+)$/)?.[1] ?? 0) - 1;
      if (editedCollisionIndex < 0) {
        throw new Error(`Índice de colisão inválido: ${collisionCellLabel}`);
      }
      await dispatchPointerPressOnRoomCell(cdp, editedSceneName, collisionCellLabel);
      uiP0Checked.push("workspace-rooms-collision-paint");
      await clickButtonInSelectorByAriaLabel(cdp, ".room-editor-tool-rail", "Ator - OBJ");
      await selectRoomEntityRow(cdp, editedActorName);
      await waitForText(
        cdp,
        (text) => text.includes(editedActorName),
        `inspetor do ator ${editedActorName}`
      );
      await assertSelectedEntityInspector(cdp, "actor", editedActorName);
      const actorNudged = await evaluate(cdp, `
        (() => {
          window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
          return true;
        })()
      `);
      if (!actorNudged) throw new Error("O atalho de movimento do ator não pôde ser disparado.");
      await assertWorkspace(cdp, "Editor", []);
      await clickButtonInSelectorByAriaLabel(cdp, ".room-editor-tool-rail", "Trigger - Eventos");
      await selectRoomEntityRow(cdp, editedTriggerName);
      await waitForText(
        cdp,
        (text) => text.includes(editedTriggerName),
        `inspetor do trigger ${editedTriggerName}`
      );
      await assertSelectedEntityInspector(cdp, "trigger", editedTriggerName);
      const eventEdited = await editEventInWorkspace(cdp);
      if (!eventEdited) {
        throw new Error("O evento não pôde ser editado pelo foco Eventos do Editor.");
      }
      uiP0Checked.push("workspace-eventos", "workspace-eventos-add-step", "workspace-eventos-edit-step");
      await assertSpritesWorkspace(cdp, editedSpriteSheet, initial.counts.spriteSheets);
      uiP0Checked.push("workspace-sprites");
      const spriteEdit = await editSpriteInWorkspace(cdp, initialAnimation.frameCount);
      uiP0Checked.push("workspace-sprites-composer-add-tile", "workspace-sprites-composer-paint");
      const dialogueCount = initial.project.dialogues?.length ?? 0;
      const dialogueCountLabel = `${dialogueCount} de ${dialogueCount} visíveis`;
      await assertWorkspace(cdp, "Diálogos", [dialogueCountLabel, "prologo_frame_1", "Epilogo"]);
      uiP0Checked.push("workspace-dialogos");
      const selectedChoiceDialogue = await evaluate(cdp, `
        (() => {
          const button = Array.from(document.querySelectorAll(".dialogue-row"))
            .find((item) => item.getAttribute("aria-label")?.startsWith("conselho ·"));
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!selectedChoiceDialogue) {
        throw new Error("O diálogo de checkpoint com escolhas não foi encontrado.");
      }
      const firstChoice = initial.project.dialogues?.find((dialogue) => dialogue.key === "conselho")?.choices?.[0];
      const initialChoiceLabel = typeof firstChoice === "string" ? firstChoice : firstChoice?.label;
      if (!initialChoiceLabel) throw new Error("O diálogo de checkpoint perdeu sua escolha inicial.");
      await fillLastInputByAriaLabel(cdp, "Idioma da prévia", initial.project.localization.sourceLocale);
      await waitForText(cdp, (text) => text.includes(initialChoiceLabel), "diálogo com escolhas");
      uiP0Checked.push("workspace-dialogos-review-choices");
      await waitForText(cdp, (text) => text.includes("Preview GBA") && text.includes(initialChoiceLabel), "prévia de revisão do diálogo");
      await wait(250);
      const dialogueUIRendering = await evaluate(cdp, `
        (async () => {
          const box = document.querySelector(".dialogue-preview-box.with-authored-skin");
          const selector = document.querySelector(".dialogue-preview-selector");
          const selectedChoice = selector?.closest("li")?.querySelector("span");
          const snapshot = document.querySelector(".dialogues-preview-stage .dialogue-preview-snapshot");
          const canvas = snapshot?.querySelector("canvas");
          const bounds = canvas?.getBoundingClientRect();
          const noteBounds = snapshot?.querySelector(".dialogue-preview-overflow-note")?.getBoundingClientRect();
          const context = canvas?.getContext("2d");
          const deadline = Date.now() + 5_000;
          let opaquePixels = 0;
          let colors = new Set();
          do {
            const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
            opaquePixels = 0;
            colors = new Set();
            for (let index = 0; index < pixels.length; index += 4) {
              if (pixels[index + 3] === 255) {
                opaquePixels += 1;
                colors.add([pixels[index], pixels[index + 1], pixels[index + 2]].join(","));
              }
            }
            if (opaquePixels > 100 && colors.size > 4) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          } while (Date.now() < deadline);
          return {
            ok: Boolean(box)
              && Boolean(selector)
              && selector.complete
              && selector.naturalWidth === 8
              && selector.naturalHeight === 8
              && canvas?.width === 240 && canvas?.height === 160
              && bounds?.width > 0 && bounds?.height > 0
              && (!noteBounds || noteBounds.height < bounds.height / 4)
              && snapshot.dataset.dialoguePreviewRenderer === "native-contract"
              && snapshot.dataset.dialoguePreviewTextLines.includes(${JSON.stringify(initialChoiceLabel)})
              && opaquePixels > 100 && colors.size > 4
              && getComputedStyle(selectedChoice).color === "rgb(216, 208, 176)",
            boxSource: box?.getAttribute("data-dialogue-box-source") ?? "",
            selectorSource: selector?.getAttribute("src") ?? "",
            selectorWidth: selector?.naturalWidth ?? 0,
            selectorHeight: selector?.naturalHeight ?? 0,
            canvasWidth: canvas?.width ?? 0,
            canvasHeight: canvas?.height ?? 0,
            canvasRenderedHeight: bounds?.height ?? 0,
            overflowNoteHeight: noteBounds?.height ?? 0,
            opaquePixels,
            colorCount: colors.size,
            selectedChoiceColor: selectedChoice ? getComputedStyle(selectedChoice).color : ""
          };
        })()
      `, true);
      if (!dialogueUIRendering?.ok) {
        throw new Error(`A caixa/seletor autoral não renderizou no preview: ${JSON.stringify(dialogueUIRendering)}`);
      }
      await captureScreenshot(cdp, dialogueScreenshotPath);
      const selectedSourceDialogue = await evaluate(cdp, `
        (() => {
          const button = Array.from(document.querySelectorAll(".dialogue-row"))
            .find((item) => item.getAttribute("aria-label")?.startsWith("prologo_frame_1 ·"));
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!selectedSourceDialogue) throw new Error("O diálogo de origem não foi encontrado no catálogo.");
      await clickButtonByText(cdp, "Editar na cena");
      await waitForText(cdp, (text) => text.includes("Editar diálogo") && text.includes("prologo_frame_1"), "autoria do diálogo no Editor de cena");
      await fillTextareaNearLabel(cdp, "Texto da fala", editedDialogueText);
      await waitForTextareaValue(cdp, "Texto da fala", editedDialogueText);
      uiP0Checked.push("editor-cena-dialogos-edit-text");
      await assertWorkspace(cdp, "Áudio", ["29 de 29 visíveis", "Músicas", "Efeitos sonoros", "farol_tema_principal", "farol_sfx_texto"]);
      await selectAudioLibraryItem(cdp, "farol_tema_principal");
      await waitForText(cdp, (text) => text.includes("Piano Roll") && text.includes("Prévia"), "compositor de áudio canônico");
      await evaluate(cdp, `document.querySelector('.audio-groove-details-button').click()`);
      await waitForText(cdp, (text) => text.includes("Validação GBA · OK"), "validação do áudio canônico");
      const audioEdit = await editAudioInWorkspace(cdp);
      uiP0Checked.push("workspace-audio", "workspace-audio-edit-bpm", "workspace-audio-edit-note");
      await assertWorkspace(cdp, "Arquivos", [
        "menu-inicial-v3-gba.png",
        "prologue-frame-1-gba.png",
        "council-v5-background.png",
        "mercado-adventure-surface.png",
        "nara-topdown.png",
        "dialogue-selector-gba-v4.png",
        "gba-dialogue-font-v3.png"
      ].map(name => name.replace(/\.png$/, "")));
      const duplicatedAsset = await duplicateAssetInWorkspace(cdp);
      const filesPipeline = await inspectFilesWorkspacePipeline(cdp);
      uiP0Checked.push("workspace-arquivos", "workspace-arquivos-duplicate-asset", "workspace-arquivos-pipeline-visible");
      await wait(250);
      await captureScreenshot(cdp, assetsScreenshotPath);

      await assertWorkspace(cdp, "Ajustes", ["Interface", "Aparência e idioma", "Idioma do aplicativo", "Tradução offline"]);
      uiP0Checked.push("workspace-settings");
      await clickButtonByText(cdp, "Exportar");
      await waitForText(cdp, (text) => text.includes("Informações do jogo"), "Exportar geral");
      const settingsValidation = await validateSettingsPaths(cdp);
      if (!settingsValidation.heading || !settingsValidation.count || settingsValidation.items.length === 0
        || !settingsValidation.text.includes(" · ")
        || settingsValidation.items.some((item) => !item.label || !item.detail || !item.path)) {
        throw new Error(`A validação de paths não produziu evidência estruturada: ${JSON.stringify(settingsValidation)}`);
      }
      const enginePackValidation = settingsValidation.items.find((item) => item.label === "Engine Pack");
      if (settingsValidation.heading !== "Paths validados"
        || !enginePackValidation
        || !enginePackValidation.detail.includes("detectado automaticamente")
        || !enginePackValidation.path.includes("GBAStudioEnginePack")) {
        throw new Error(`O Engine Pack detectado não foi explicado na validação: ${JSON.stringify(settingsValidation)}`);
      }
      uiP0Checked.push("settings-path-validation");
      await clickButtonByAriaLabel(cdp, "Projeto e ROM seção de ajustes");
      await waitForText(cdp, (text) => text.includes("Informações do jogo"), "retorno às informações do jogo");
      await fillInputNearLabel(cdp, "Título", editedGameTitle);
      await waitForText(
        cdp,
        (text) => text.includes("Ajustes atualizado: general.gameTitle.") && text.includes("Alterado"),
        "edição do título"
      );
      uiP0Checked.push("workspace-settings-edit-title");
      await saveProjectThroughOverflow(cdp);
      await waitForText(cdp, (text) => text.includes("Salvo") && !text.includes("Alterado"), "projeto salvo");

      const saved = await inspectSavedTemplate(projectPath);
      const expectedCounts = { ...initial.counts, assets: initial.counts.assets + 1 };
      if (JSON.stringify(saved.counts) !== JSON.stringify(expectedCounts)) {
        throw new Error(
          `Contagens do projeto divergiram durante save/reopen: esperado=${JSON.stringify(expectedCounts)} salvo=${JSON.stringify(saved.counts)}`
        );
      }
      if (saved.project.settings?.debug?.developerMode !== true) {
        throw new Error("O template salvo não preservou developerMode=true.");
      }
      if (saved.project.settings?.general?.gameTitle !== editedGameTitle) {
        throw new Error("A edição feita no aplicativo não foi persistida.");
      }
      if (saved.project.dialogues?.[0]?.text !== editedDialogueText) {
        throw new Error("A edição de diálogo feita no aplicativo não foi persistida.");
      }
      if (!saved.project.assets?.some((asset) => asset?.name === duplicatedAsset.duplicateName)) {
        throw new Error(`A duplicação de asset feita no aplicativo não foi persistida: ${duplicatedAsset.duplicateName}`);
      }
      const savedScene = saved.project.scenas?.find((scene) => scene?.name === editedSceneName);
      if (!savedScene || saved.project.scenas?.some((scene) => scene?.name === editedOriginalSceneName)) {
        throw new Error("A edição da cena feita no aplicativo não foi persistida.");
      }
      const savedTilemap = expandCompactSequence(savedScene.tilemap);
      const tilemapEdited = JSON.stringify(savedTilemap) !== JSON.stringify(initialTilemap);
      if (!tilemapEdited) {
        throw new Error("A pintura de tile feita no aplicativo não foi persistida.");
      }
      const savedRacingScene = saved.project.scenas?.find((scene) => scene?.name === "circuito_final");
      const savedRacingContract = racingTopdownContract(savedRacingScene);
      if (JSON.stringify(savedRacingContract) !== JSON.stringify(initialRacingContract)) {
        throw new Error(`O contrato top-down da corrida não foi preservado no save: inicial=${JSON.stringify(initialRacingContract)} salvo=${JSON.stringify(savedRacingContract)}`);
      }
      if (expandCompactSequence(savedScene.collisionTypes)[editedCollisionIndex] !== "solid") {
        throw new Error(`A colisão editada não foi persistida no índice ${editedCollisionIndex}.`);
      }
      const savedActor = saved.project.actors?.find((actor) => actor?.name === editedActorName);
      if (savedActor?.roomName !== editedSceneName || savedActor?.x !== initialActor.x + 1) {
        throw new Error(`A edição do ator não foi persistida: ${JSON.stringify(savedActor)}`);
      }
      const savedAnimation = saved.project.animations?.find((animation) => animation?.id === initialAnimation.id);
      if (savedAnimation?.frameCount !== initialAnimation.frameCount + 1) {
        throw new Error(`A edição do sprite não foi persistida: ${JSON.stringify(savedAnimation)}`);
      }
      const paintedFrame = savedAnimation.frames?.[initialAnimation.frameCount];
      if (paintedFrame?.tiles?.length !== spriteEdit.tilesAfter
        || !paintedFrame.tiles.some(tile => tile.sourceSheet === editedSpriteSheet)) {
        throw new Error(`A pintura do sprite não foi persistida: ${JSON.stringify({ paintedFrame, spriteEdit })}`);
      }
      const savedEvent = saved.project.events?.find((event) => event?.id === initialEvent.id);
      const originalStepIDs = new Set(initialEvent.steps.map((step) => step.id));
      const addedEventSteps = savedEvent?.steps?.filter((step) => !originalStepIDs.has(step.id)) ?? [];
      if (
        savedEvent?.steps?.length !== initialEvent.steps.length + 1
        || addedEventSteps.length !== 1
        || !addedEventSteps[0]?.command?.startsWith(`show_dialogue_speaker ${editedEventDialogue} `)
      ) {
        throw new Error(`A edição do evento integrado ao Editor não foi persistida: ${JSON.stringify({ addedEventSteps, savedEvent })}`);
      }
      if (saved.missingSources.length > 0 || saved.materializedAssetCount !== saved.counts.assets) {
        throw new Error(`Assets não materializados: ${saved.missingSources.join(", ")}`);
      }
      if (/\/Users|\.cache/.test(saved.contents)) {
        throw new Error("O projeto salvo depende de caminho absoluto ou .cache.");
      }
      console.log("[smoke:exemplo-template] Edições dos workspaces persistidas; reabrindo o projeto isolado.");

      const reopened = await evaluate(cdp, `
        (async () => {
          const opened = await window.gbaStudio.openProjectAtPath(${JSON.stringify(projectPath)});
          return {
            canceled: opened.canceled,
            error: opened.error ?? null,
            scenes: opened.project?.data?.scenas?.length ?? 0,
            assets: opened.project?.data?.assets?.length ?? 0,
            events: opened.project?.data?.events?.length ?? 0,
            developerMode: opened.project?.data?.settings?.debug?.developerMode ?? null,
            gameTitle: opened.project?.data?.settings?.general?.gameTitle ?? null,
            hasEditedScene: opened.project?.data?.scenas?.some((scene) => scene?.name === ${JSON.stringify(editedSceneName)}) ?? false,
            editedActorX: opened.project?.data?.actors?.find((actor) => actor?.name === ${JSON.stringify(editedActorName)})?.x ?? null,
            audioItems: opened.project?.data?.audioItems?.length ?? 0
          };
        })()
      `, true);
      if (reopened?.error || reopened?.canceled || reopened?.scenes !== saved.counts.scenes
        || reopened?.assets !== saved.counts.assets
        || reopened?.events !== saved.counts.events
        || reopened?.developerMode !== true || reopened?.gameTitle !== editedGameTitle
        || reopened?.hasEditedScene !== true || reopened?.editedActorX !== initialActor.x + 1
        || reopened?.audioItems !== saved.counts.audioItems) {
        throw new Error(`Falha ao reabrir o template: ${JSON.stringify(reopened)}`);
      }

      await assertWorkspace(cdp, "Editor", ["penedos_vento"]);
      await evaluate(cdp, `
        (() => {
          const card = Array.from(document.querySelectorAll(".room-stage-card-frame"))
            .find((item) => item.querySelector(".room-stage-card-header strong")?.textContent?.trim() === ${JSON.stringify(displaySceneName(editedSceneName))});
          if (!card) return false;
          card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1 }));
          card.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }));
          return true;
        })()
      `);
      await waitForText(cdp, (text) => text.includes(displaySceneName(editedSceneName)) && text.includes("Cena"), "painel da cena reaberta");
      await openExportHealth(cdp);
      const projectHealth = await evaluate(cdp, `
        (() => {
          const workspace = document.querySelector('section.project-health-workspace[aria-label="Saúde e preflight de exportação"]');
          return {
            errorCount: Number(Array.from(workspace?.querySelectorAll(".project-health-summary-card") ?? [])
              .find((card) => card.querySelector("span")?.textContent?.trim() === "Bloqueios")
              ?.querySelector("strong")?.textContent ?? -1),
            status: workspace?.getAttribute("data-project-health-status") ?? null,
            scenes: workspace?.querySelectorAll(".project-health-scene-card").length ?? 0,
            hasDiagnostics: Boolean(workspace?.querySelector('[aria-labelledby="project-health-diagnostics-title"]')),
            hasBudget: Boolean(workspace?.querySelector('[aria-label^="Orçamento de "]')),
            warningCount: Number(Array.from(workspace?.querySelectorAll(".project-health-summary-card") ?? [])
              .find((card) => card.querySelector("span")?.textContent?.trim() === "Avisos")
              ?.querySelector("strong")?.textContent ?? -1)
          };
        })()
      `);
      if (!projectHealth?.status || projectHealth.scenes !== saved.counts.scenes
        || !projectHealth.hasDiagnostics || !projectHealth.hasBudget) {
        throw new Error(`Preflight de exportação não refletiu o template completo: ${JSON.stringify(projectHealth)}`);
      }
      await assertWorkspace(cdp, "Editor", ["penedos_vento"]);
      const projectProblemCount = await evaluate(cdp, `
        Number(document.querySelector('button[aria-label="Abrir central de pendências"] span')?.textContent ?? -1)
      `);
      if (projectProblemCount <= 0) {
        throw new Error(
          `Os avisos do template não apareceram na central de pendências: ${projectProblemCount}`
        );
      }
      if (projectHealth.warningCount + projectHealth.errorCount !== projectProblemCount) {
        throw new Error(
          `A Central de pendências diverge do resumo da Saúde: resumo=${JSON.stringify(projectHealth)}, central=${projectProblemCount}`
        );
      }
      await evaluate(cdp, `
        document.querySelector('button[aria-label="Abrir central de pendências"]')?.click()
      `);
      await waitForText(cdp, (text) => text.includes("Central de pendências"), "central de pendências");
      const problemMessages = await evaluate(cdp, `
        Array.from(document.querySelectorAll('.project-problems-list button span'))
          .map((item) => item.textContent?.trim())
          .filter(Boolean)
      `);
      if (problemMessages.some((message) => message.includes("O orçamento de assets da cena está próximo do limite."))) {
        throw new Error(`O orçamento do título ainda está emitindo o aviso antigo: ${problemMessages.join("; ")}`);
      }
      if (!problemMessages.some((message) => message.includes("sem uso no projeto."))) {
        throw new Error(`O aviso de asset sem uso não apareceu na central de pendências: ${problemMessages.join("; ")}`);
      }
      const unusedAssetProblemButton = await evaluate(cdp, `
        Array.from(document.querySelectorAll('.project-problems-list button'))
          .find((button) => button.textContent?.includes("sem uso no projeto."))
          ?.getAttribute("aria-label") ?? null
      `);
      if (!unusedAssetProblemButton?.startsWith("Abrir ")) {
        throw new Error(`O aviso de asset sem uso não possui ação de navegação: ${unusedAssetProblemButton ?? "ausente"}`);
      }
      await clickButtonByAriaLabel(cdp, "Fechar central de pendências");
      await focusSceneInEditor(cdp, editedSceneName);
      await clickButtonInSelectorByAriaLabel(cdp, ".room-editor-tool-rail", "Colisao - Solidos");
      await clickButtonInSelectorByAriaLabel(cdp, ".rooms-editor-secondary-toolbar", "Voltar à visão geral");
      await waitForText(cdp, (text) => !text.includes("Voltar à visão geral"), "retorno à visão geral para validar previews");
      const backgroundLayoutRendering = await inspectBackgroundLayoutRendering(cdp, initial.project);
      await openExportHealth(cdp);
      const visualFidelityDiagnostic = await evaluate(cdp, `
        (() => {
          const sceneCard = Array.from(document.querySelectorAll(".project-health-scene-card"))
            .find((item) => item.querySelector(".project-health-scene-heading strong")?.textContent?.trim() === "mapa_menu");
          const panel = sceneCard?.querySelector('[aria-label="Diagnóstico de fidelidade visual da cena"]');
          const text = panel?.textContent?.trim() ?? "";
          return {
            hasDiagnostic: Boolean(panel),
            hasComparison: Boolean(panel?.querySelector('[aria-label="Comparação PNG original e RGB555"]')),
            hasActors: text.includes("Atores"),
            hasRgb555: text.includes("RGB555"),
            hasTriggers: text.includes("Triggers"),
            hasQuantizationWarning: text.includes("Revisar quantização") || text.includes("Erro até"),
            text
          };
        })()
      `);
      if (!visualFidelityDiagnostic?.hasDiagnostic
        || !visualFidelityDiagnostic.hasComparison
        || !visualFidelityDiagnostic.hasActors
        || !visualFidelityDiagnostic.hasRgb555
        || !visualFidelityDiagnostic.hasTriggers
        || !visualFidelityDiagnostic.hasQuantizationWarning) {
        throw new Error(`O diagnóstico de fidelidade visual do Mapa Menu não está completo na Saúde do projeto: ${JSON.stringify(visualFidelityDiagnostic)}`);
      }
      const comparisonButton = await evaluate(cdp, `
        (() => {
          const sceneCard = Array.from(document.querySelectorAll(".project-health-scene-card"))
            .find((item) => item.querySelector(".project-health-scene-heading strong")?.textContent?.trim() === "mapa_menu");
          const button = sceneCard?.querySelector('[aria-label="Comparar PNG original e RGB555"]');
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!comparisonButton) {
        throw new Error("O botão de comparação PNG → RGB555 do Mapa Menu não foi encontrado na Saúde do projeto.");
      }
      const visualComparison = await waitForSceneVisualComparison(cdp, "mapa_menu");
      if (!visualComparison?.hasPanel || !visualComparison.hasOriginal || !visualComparison.hasCompiled || !visualComparison.isExpanded) {
        throw new Error(`A comparação PNG → RGB555 do Mapa Menu não foi renderizada na Saúde do projeto: ${JSON.stringify(visualComparison)}`);
      }
      await assertWorkspace(cdp, "Editor", ["penedos_vento"]);
      await focusSceneInEditor(cdp, editedSceneName);
      await clickButtonInSelectorByAriaLabel(cdp, ".room-editor-tool-rail", "Colisao - Solidos");
      const editorScrollChrome = await inspectEditorScrollChrome(cdp);
      await clickButtonInSelectorByAriaLabel(cdp, ".room-editor-tool-rail", "Selecionar - Mover");
      await waitForSelectionScenePreview(cdp, editedSceneName);
      await clickButtonInSelectorByAriaLabel(cdp, ".rooms-editor-secondary-toolbar", "Voltar à visão geral");
      await waitForText(cdp, (text) => !text.includes("Voltar à visão geral"), "retorno final à visão geral");
      await captureScreenshot(cdp);

      await clickButtonByAriaLabel(cdp, "Editar cena circuito_final");
      await waitForSceneEditor(cdp, "circuito_final");
      await clickButtonByText(cdp, "Minimapa");
      const topdownRacingFocus = await evaluate(cdp, `
        (() => {
          const viewport = document.querySelector('[aria-label="Viewport GBA da cena circuito_final"]');
          const editorMinimap = document.querySelector('[aria-label="Minimapa da cena circuito_final"]');
          return {
            hasFocusedEditor: Boolean(document.querySelector('.room-focused-scene-editor-frame .room-stage-card.is-focused-scene-editor')),
            hasPseudo3dCamera: Boolean(document.querySelector('[aria-label="Câmera pseudo-3D da cena circuito_final"]')),
            hasRacingMinimap: Boolean(document.querySelector('[aria-label="Minimapa de corrida da cena circuito_final"]')),
            hasSceneMinimap: Boolean(editorMinimap),
            viewportHeight: viewport?.getAttribute("data-logical-height") ?? null,
            viewportWidth: viewport?.getAttribute("data-logical-width") ?? null
          };
        })()
      `);
      if (!topdownRacingFocus?.hasFocusedEditor || topdownRacingFocus?.hasPseudo3dCamera
        || topdownRacingFocus?.hasRacingMinimap || !topdownRacingFocus?.hasSceneMinimap
        || topdownRacingFocus?.viewportWidth !== "240" || topdownRacingFocus?.viewportHeight !== "160") {
        throw new Error(`A corrida top-down não respeitou o viewport GBA em foco: ${JSON.stringify(topdownRacingFocus)}`);
      }
      await captureScreenshot(cdp, racingFocusScreenshotPath);
      await clickButtonByAriaLabel(cdp, "Voltar à visão geral");

      console.log("[smoke:exemplo-template] Edição, reabertura e previews verificados; compilando a ROM completa.");
      await clickButtonByAriaLabel(cdp, "Executar ROM");
      await waitForText(cdp, (text) => text.includes("Compilando ROM..."), "compilação do projeto completo", 30_000);
      await waitForUniqueRom(engineExportRoot, cdp);
      await waitForText(cdp, (text) => text.includes("Play Window aberto:"), "Play Window do projeto completo", completeProjectTimeoutMs);

      const generatedFiles = existsSync(engineExportRoot) ? await listFilesRecursively(engineExportRoot) : [];
      const romPaths = activeBuildRomPaths(generatedFiles);
      const contractPaths = generatedFiles.filter((file) => file.endsWith("export_project.json"));
      if (romPaths.length !== 1) {
        throw new Error(`O smoke do projeto completo deve gerar uma ROM; encontrou ${romPaths.length}.`);
      }
      const contractContents = await Promise.all(contractPaths.map((file) => readFile(file, "utf8")));
      const editedContract = contractContents.find((contents) => contents.includes(editedDialogueText));
      if (!editedContract) {
        throw new Error("A edição de diálogo não apareceu no contrato usado para compilar a ROM.");
      }
      const parsedContract = JSON.parse(editedContract);
      const exportWarnings = Array.isArray(parsedContract.export_warnings) ? parsedContract.export_warnings : [];
      if (exportWarnings.some((warning) => !["VRAM:", "Palette:"].some((prefix) => String(warning).startsWith(prefix)))) {
        throw new Error(`Contrato da ROM possui avisos fora de VRAM/paleta: ${exportWarnings.join("; ")}`);
      }
      const fullProjectRuntime = fullProjectRuntimeEvidence(parsedContract);
      for (const expectedRuntimeEdit of [editedSceneName, editedEventDialogue]) {
        if (!editedContract.includes(expectedRuntimeEdit)) {
          throw new Error(`A edição ${expectedRuntimeEdit} não apareceu no contrato usado para compilar a ROM.`);
        }
      }
      const exportedRacingRoom = parsedContract.racing_project?.rooms?.find((room) => room?.name === "circuito_final");
      const exportedRacingContract = {
        cameraDeadZone: exportedRacingRoom?.topdown_track?.camera_dead_zone ?? null,
        checkpoints: exportedRacingRoom?.topdown_track?.checkpoints ?? [],
        collisionFlags: exportedRacingRoom?.collision_flags ?? [],
        presentation: exportedRacingRoom?.config?.presentation ?? null
      };
      const expectedRacingExport = {
        cameraDeadZone: {
          x: initialRacingContract.cameraDeadZone.x,
          y: initialRacingContract.cameraDeadZone.y
        },
        checkpoints: initialRacingContract.checkpoints,
        collisionFlags: collisionFlagsForTypes(initialRacingContract.collisionTypes),
        presentation: "topdown"
      };
      if (JSON.stringify(exportedRacingContract) !== JSON.stringify(expectedRacingExport)) {
        throw new Error(`O contrato exportado da corrida top-down divergiu: esperado=${JSON.stringify(expectedRacingExport)} exportado=${JSON.stringify(exportedRacingContract)}`);
      }
      await mkdir(evidenceRoot, { recursive: true });
      await writeFile(romContractEvidencePath, editedContract, "utf8");
      const romEvidence = await Promise.all(romPaths.map(async (romPath) => {
        const bytes = await readFile(romPath);
        return {
          fileName: romPath.slice(engineExportRoot.length + 1),
          bytes: (await stat(romPath)).size,
          sha256: createHash("sha256").update(bytes).digest("hex")
        };
      }));

      const evidence = {
        ok: true,
        generatedAt: new Date().toISOString(),
        packagedApp: usePackagedApp,
        offlineRuntime: process.env.GBA_STUDIO_OFFLINE_SMOKE === "1" ? { externalToolsRemoved: true, networkIsolation: process.env.GBA_STUDIO_OFFLINE_NETWORK ?? "not-enforced" } : undefined,
        source: {
          id: canonicalP0Source.id,
          role: canonicalP0Source.role,
          globalAcceptance: canonicalP0Source.globalAcceptance,
          projectPath: canonicalP0Source.projectPath,
          visualMirrorPath: canonicalP0Source.visualMirrorPath,
          acceptanceSurfaces: canonicalP0Source.acceptanceSurfaces
        },
        projectCounts: saved.counts,
        materializedAssetCount: saved.materializedAssetCount,
        developerMode: saved.project.settings.debug.developerMode,
        editedGameTitle,
        editedDialogueText,
        editedSceneName,
        editedCollisionIndex,
        tilemapEdited,
        editedActor: {
          name: editedActorName,
          xBefore: initialActor.x,
          xAfter: savedActor.x
        },
        editedSprite: {
          sheet: editedSpriteSheet,
          animationID: initialAnimation.id,
          framesBefore: initialAnimation.frameCount,
          framesAfter: savedAnimation.frameCount
        },
        editedEvent: {
          name: initialEvent.name,
          stepsBefore: initialEvent.steps.length,
          stepsAfter: savedEvent.steps.length,
          editedInSmoke: eventEdited,
          dialogue: editedEventDialogue
        },
        duplicatedAsset,
        spriteEdit,
        audioEdit,
        filesPipeline,
        settingsValidation,
        backgroundLayoutRendering,
        visualFidelityDiagnostic,
        visualComparison,
        titleEditor: {
          state: titleEditorState,
          screenshotPath: campaignScreenshotPath
        },
        dialogueUIRendering,
        editorScrollChrome,
        projectHealth,
        projectProblemCount,
        runSceneButtonCount,
        fullProjectRuntime,
        templateAudit: initialTemplateAudit,
        exportWarnings,
        roms: romEvidence,
        romContractEvidencePath,
        screenshotPath,
        racingFocusScreenshotPath,
        dialogueScreenshotPath,
        assetsScreenshotPath,
        checked: [
          "welcome-template-card",
          "canonical-source-catalog",
          "single-canonical-example-project",
          "project-health-workspace",
          "project-health-capabilities-and-budget",
          "editor-events-focus-inspector",
          "sprites-workspace",
          "dialogues-workspace",
          "authored-dialogue-box-and-selector-visible",
          "audio-workspace-with-authored-music-and-sfx",
          "content-pt-br-en-es-complete",
          "files-workspace",
          "duplicate-asset-in-files-workspace",
          "active-scene-assets-visible-in-files-workspace",
          "asset-pipeline-visible-in-files-workspace",
          "edit-scene",
          "edit-collision",
          "edit-actor",
          "edit-sprite",
          "edit-event-in-editor-inspector",
          "all-actors-resolve-authored-hitboxes",
          "all-scene-collision-grids-complete",
          "unused-asset-warning-visible-and-actionable",
          "vram-export-warnings-accepted",
          "edit-and-save",
          "background-layout-visible",
          "background-layout-overlays",
          "visual-fidelity-diagnostic-rgb555-actors-triggers",
          "visual-fidelity-comparison-png-rgb555",
          "title-scene-editor-current-layout",
          "dungeon-crawler-and-racing-backgrounds-visible",
          "topdown-racing-focus-viewport",
          "editor-scroll-keeps-chrome-visible",
          "wide-platformer-and-shmup-scenes",
          "viewport-clips-logical-scene-map",
          "runtime-dialogue-edit-in-rom-contract",
          "reopen-without-data-loss",
          "mixed-runtime-all-13-scene-types",
          "play-full-project",
          "self-contained-assets"
        ]
      };
      await mkdir(evidenceRoot, { recursive: true });
      await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
      const requiredUiP0Checks = [
        "workspace-rooms",
        "workspace-rooms-tile-paint",
        "workspace-rooms-collision-paint",
        "workspace-sprites",
        "workspace-sprites-composer-add-tile",
        "workspace-sprites-composer-paint",
        "workspace-eventos",
        "workspace-eventos-add-step",
        "workspace-eventos-edit-step",
        "workspace-dialogos",
        "editor-cena-dialogos-edit-text",
        "workspace-dialogos-review-choices",
        "workspace-audio",
        "workspace-audio-edit-bpm",
        "workspace-audio-edit-note",
        "workspace-arquivos",
        "workspace-arquivos-duplicate-asset",
        "workspace-arquivos-pipeline-visible",
        "workspace-settings",
        "workspace-settings-edit-title",
        "settings-path-validation"
      ];
      const uiChecked = [...new Set(uiP0Checked)];
      const missingUiP0Checks = requiredUiP0Checks.filter((check) => !uiChecked.includes(check));
      if (missingUiP0Checks.length > 0) {
        throw new Error(`Evidência UI P0 incompleta: ${missingUiP0Checks.join(", ")}`);
      }
      await mkdir(uiP0EvidenceRoot, { recursive: true });
      await writeFile(uiP0EvidencePath, `${JSON.stringify({
        ok: true,
        generatedAt: evidence.generatedAt,
        packagedApp: usePackagedApp,
        source: evidence.source,
        projectPath: canonicalP0Source.projectPath,
        checked: uiChecked,
        actions: {
          tilemapEdited,
          collisionEdited: true,
          spriteEdit,
          audioEdit,
          filesPipeline,
          settingsValidation
        },
        derivedFrom: evidencePath,
        screenshots: {
          screenshotPath,
          dialogueScreenshotPath,
          assetsScreenshotPath
        }
      }, null, 2)}\n`, "utf8");
      console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2));
    } catch (error) {
      await mkdir(evidenceRoot, { recursive: true });
      await captureScreenshot(cdp, join(evidenceRoot, "failure.png")).catch(() => {});
      await writeFile(join(evidenceRoot, "failure-text.txt"), await renderedText(cdp).catch(() => ""), "utf8");
      throw error;
    } finally {
      cdp.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error([
      message,
      "",
      "Ultimas linhas do stdout do Electron:",
      stdout.slice(-8_000),
      "",
      "Ultimas linhas do stderr do Electron:",
      stderr.slice(-8_000)
    ].join("\n"));
  } finally {
    await terminateChild(child);
    if (process.env.GBA_STUDIO_KEEP_SMOKE_TEMP === "1") {
      console.error(`Diretório temporário preservado: ${tempRoot}`);
    } else {
      await rm(tempRoot, { recursive: true, force: true });
    }
    if (stdout.includes("Unhandled") || stderr.includes("Unhandled")) {
      throw new Error(`Electron emitiu erro não tratado.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
