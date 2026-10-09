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
  "engine-rom-p0",
  "latest",
  "engine_p0_rom_smoke_evidence.json"
);
const defaultNotePath = path.join(appRoot, "artifacts", "engine-rom-p0", "latest", "manual_mgba_playtest.md");

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function validateManualP0PlaytestNote(noteText, romPath) {
  const normalized = normalize(noteText);
  const failures = [];
  const normalizedWithoutUncheckedFailureOption = normalized.replace(/(^|\n)\s*-\s*\[\s\]\s*reprovado\b/g, "\n");
  const requiredTerms = [
    "aprovado",
    path.basename(romPath),
    "boot",
    "room_2",
    "intro_001",
    "ator",
    "trigger",
    "tilemap",
    "OBJ"
  ];

  if (
    /\[[xX]\]\s*reprovado/.test(noteText) ||
    /\breprovado\b|\bfailed\b|\bfalhou\b|\bcrash\b|\btravou\b/i.test(normalizedWithoutUncheckedFailureOption)
  ) {
    failures.push("A nota contem falha ou reprovacao explicita.");
  }

  const pendingChecklistItems = noteText
    .split("\n")
    .filter((line) => /^\s*-\s*\[\s\]/.test(line))
    .filter((line) => !normalize(line).includes("reprovado"));
  if (pendingChecklistItems.length > 0) {
    failures.push("A nota ainda contem checkbox pendente.");
  }

  for (const term of requiredTerms) {
    if (!normalized.includes(normalize(term))) {
      failures.push(`A nota precisa citar: ${term}.`);
    }
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

export function applyManualP0PlaytestEvidence(evidence, noteText, notePath) {
  if (evidence?.ok !== true || evidence?.romBuildVerified !== true || typeof evidence?.romPath !== "string") {
    throw new Error("A evidencia da ROM técnica P0 precisa existir e ter romBuildVerified=true antes do playtest manual.");
  }
  if (evidence?.source?.id !== "electron-p0-technical-fixture"
    || evidence?.source?.role !== "technical-contract-fixture") {
    throw new Error("A evidencia da ROM técnica P0 precisa declarar a fixture técnica como fonte.");
  }

  const validation = validateManualP0PlaytestNote(noteText, evidence.romPath);
  if (!validation.ok) {
    throw new Error(`Playtest manual da fixture técnica P0 invalido:\n- ${validation.failures.join("\n- ")}`);
  }

  return {
    ...evidence,
    gameplayVerified: true,
    manualVisualPlaytestPassed: true,
    manualEvidenceNotePath: notePath,
    manualEvidenceNoteSha256: sha256Text(noteText),
    manualEvidenceValidatedAt: new Date().toISOString()
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const notePathArg = process.argv.find((arg) => arg.startsWith("--note="));
  const notePath = path.resolve(notePathArg ? notePathArg.slice("--note=".length) : defaultNotePath);

  if (!existsSync(evidencePath)) {
    throw new Error(`Evidencia da ROM técnica P0 nao encontrada: ${evidencePath}`);
  }
  if (!existsSync(notePath)) {
    throw new Error(`Nota de playtest manual nao encontrada: ${notePath}`);
  }

  const evidence = await readJson(evidencePath);
  const noteText = await readFile(notePath, "utf8");
  const updatedEvidence = applyManualP0PlaytestEvidence(evidence, noteText, notePath);
  await writeFile(evidencePath, `${JSON.stringify(updatedEvidence, null, 2)}\n`, "utf8");
  console.log(`Playtest manual P0 aprovado e registrado: ${evidencePath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
