#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const evidencePath = path.join(
  appRoot,
  "artifacts",
  "preview-playtest",
  "latest",
  "preview_playtest_evidence.json"
);

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

export function validatePreviewP0VisualEvidence(evidence, visualResult) {
  const failures = [];
  const expectedRuntime = evidence?.expectedRuntime ?? {};
  const source = evidence?.source ?? {};
  const expectedProjectName = stringValue(evidence?.sourceProjectName) || "Electron P0 Functional";
  const screenshotBytes = Number(visualResult?.screenshotBytes ?? 0);

  if (evidence?.ok !== true || evidence?.previewPackageGenerated !== true) {
    failures.push("A evidencia do pacote Web P0 precisa existir e estar ok.");
  }
  if (evidence?.runtimeComplete !== true || (evidence?.missingRuntimeFiles ?? []).length > 0) {
    failures.push("O runtime Web do preview técnico P0 precisa estar completo.");
  }
  if (evidence?.romCopied !== true || typeof evidence?.files?.rom !== "string") {
    failures.push("O pacote de preview precisa conter a ROM técnica P0 real.");
  }
  if (source.id !== "electron-p0-technical-fixture" || source.role !== "technical-contract-fixture") {
    failures.push("O preview técnico P0 reduzido precisa declarar a fixture técnica como fonte.");
  }
  if (visualResult?.domReady !== true) {
    failures.push("O documento do preview nao chegou ao estado pronto.");
  }
  if (visualResult?.gameContainerFound !== true) {
    failures.push("O container #game do preview nao foi encontrado.");
  }
  if (visualResult?.playerConfigFound !== true) {
    failures.push("A configuracao do GBA Studio Player nao foi encontrada.");
  }
  if (visualResult?.playerDomMounted !== true) {
    failures.push("O player do preview nao montou elementos no DOM.");
  }
  if (visualResult?.runtimeStarted !== true) {
    failures.push("O runtime GBA nao iniciou apos a acao Jogar.");
  }
  if (visualResult?.expectedCore !== expectedRuntime.core) {
    failures.push(`Core esperado divergente: ${stringValue(visualResult?.expectedCore)}.`);
  }
  if (visualResult?.expectedRomPath !== expectedRuntime.romPath) {
    failures.push(`ROM esperada divergente: ${stringValue(visualResult?.expectedRomPath)}.`);
  }
  if (visualResult?.expectedPlayerPath !== expectedRuntime.playerPath) {
    failures.push(`Player esperado divergente: ${stringValue(visualResult?.expectedPlayerPath)}.`);
  }
  if (typeof visualResult?.screenshotPath !== "string" || screenshotBytes < 10_000) {
    failures.push("O screenshot visual do preview esta ausente ou pequeno demais.");
  }
  if (!stringValue(visualResult?.renderedText).includes(expectedProjectName)) {
    failures.push(`O texto renderizado nao identifica o preview técnico P0 (${expectedProjectName}).`);
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

export function applyPreviewP0VisualEvidence(evidence, visualResult) {
  const validation = validatePreviewP0VisualEvidence(evidence, visualResult);
  if (!validation.ok) {
    throw new Error(`Playtest visual do preview técnico P0 invalido:\n- ${validation.failures.join("\n- ")}`);
  }

  const visualEvidence = {
    checkedAt: new Date().toISOString(),
    domReady: visualResult.domReady,
    playerConfigFound: visualResult.playerConfigFound,
    runtimeStarted: visualResult.runtimeStarted,
    expectedCore: visualResult.expectedCore,
    expectedPlayerPath: visualResult.expectedPlayerPath,
    expectedRomPath: visualResult.expectedRomPath,
    gameContainerFound: visualResult.gameContainerFound,
    playerDomMounted: visualResult.playerDomMounted,
    renderedText: visualResult.renderedText,
    screenshotBytes: visualResult.screenshotBytes,
    screenshotPath: visualResult.screenshotPath
  };

  return {
    ...evidence,
    previewPlaytestVerified: true,
    visualPreviewSmokePassed: true,
    visualEvidence,
    visualEvidenceSha256: sha256Text(JSON.stringify(visualEvidence))
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const visualPathArg = process.argv.find((arg) => arg.startsWith("--visual="));
  const visualPath = visualPathArg
    ? path.resolve(visualPathArg.slice("--visual=".length))
    : path.join(appRoot, "artifacts", "preview-playtest", "latest", "preview_visual_evidence.json");

  if (!existsSync(evidencePath)) {
    throw new Error(`Evidencia do preview técnico P0 nao encontrada: ${evidencePath}`);
  }
  if (!existsSync(visualPath)) {
    throw new Error(`Evidencia visual do preview técnico P0 nao encontrada: ${visualPath}`);
  }

  const evidence = await readJson(evidencePath);
  const visualResult = await readJson(visualPath);
  const updatedEvidence = applyPreviewP0VisualEvidence(evidence, visualResult);
  await writeFile(evidencePath, `${JSON.stringify(updatedEvidence, null, 2)}\n`, "utf8");
  console.log(`Playtest visual do preview técnico P0 aprovado e registrado: ${evidencePath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
