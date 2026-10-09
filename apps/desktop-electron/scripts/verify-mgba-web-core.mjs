#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function inspectMGBAWebCore(root) {
  const playerRoot = path.join(root, "player");
  const manifestPath = path.join(playerRoot, "mgba-core.manifest.json");
  const modulePath = path.join(playerRoot, "mgba-core.mjs");
  const failures = [];

  if (!existsSync(manifestPath)) failures.push("Manifesto do core mGBA ausente.");
  if (!existsSync(modulePath)) failures.push("Bridge ESM do core mGBA ausente.");
  if (failures.length > 0) return { ok: false, failures };

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return { ok: false, failures: [`Manifesto do core mGBA invalido: ${error instanceof Error ? error.message : String(error)}`] };
  }

  const source = isRecord(manifest.source) ? manifest.source : {};
  const wasm = isRecord(manifest.wasm) ? manifest.wasm : {};
  const wasmFile = typeof wasm.file === "string" ? wasm.file : "";
  const expectedHash = typeof wasm.sha256 === "string" ? wasm.sha256 : "";
  const sourceRepository = typeof source.repository === "string" ? source.repository : "";
  const sourceRevision = typeof source.revision === "string" ? source.revision : "";
  const wasmPath = wasmFile ? path.join(playerRoot, wasmFile) : "";

  if (manifest.schema !== 1) failures.push("Schema do manifesto mGBA nao suportado.");
  if (sourceRepository !== "https://github.com/mgba-emu/mgba.git") failures.push("Repositorio fonte do mGBA nao esta fixado ao upstream oficial.");
  if (!sourceRevision.trim()) failures.push("Revisao do mGBA ausente no manifesto.");
  if (!wasmPath || !existsSync(wasmPath)) failures.push("Binario WASM do mGBA ausente.");
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) failures.push("Hash SHA-256 do WASM invalido.");

  const licenses = Array.isArray(manifest.licenses) ? manifest.licenses : [];
  for (const license of licenses) {
    if (typeof license !== "string" || !existsSync(path.resolve(playerRoot, license))) {
      failures.push("Notice de licenca do mGBA ausente.");
      break;
    }
  }
  if (licenses.length === 0) failures.push("Notice de licenca do mGBA ausente.");

  if (wasmPath && existsSync(wasmPath) && /^[a-f0-9]{64}$/i.test(expectedHash)) {
    const bytes = await readFile(wasmPath);
    if (bytes.subarray(0, 4).compare(Buffer.from([0x00, 0x61, 0x73, 0x6d])) !== 0) {
      failures.push("Binario do mGBA nao possui cabecalho WebAssembly.");
    }
    if (sha256(bytes) !== expectedHash.toLowerCase()) failures.push("Hash SHA-256 do WASM diverge do manifesto.");
  }

  return { ok: failures.length === 0, failures, wasmPath, sourceRevision };
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = path.resolve(scriptDirectory, "..");
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(appRoot, "static", "WebPlayer");
  const result = await inspectMGBAWebCore(root);
  if (!result.ok) {
    throw new Error(`Core mGBA Web invalido:\n- ${result.failures.join("\n- ")}`);
  }
  console.log(`Core mGBA Web valido: ${result.wasmPath} (${result.sourceRevision})`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
