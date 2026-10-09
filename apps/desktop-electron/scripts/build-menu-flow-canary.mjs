#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMenuFlowCanaryManifest } from "../fixtures/menu-flow-canary.mjs";
import { resolveEnginePackRoot } from "./resolve-engine-pack-root.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const enginePackRoot = resolveEnginePackRoot(appRoot);
const artifactRoot = path.join(appRoot, "artifacts", "menu-runtime-canary");
const sourceDir = path.join(artifactRoot, "source");
const exportDir = path.join(artifactRoot, "exported");
const manifestPath = path.join(sourceDir, "export_project.json");
const assetcPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "assetc.exe" : "assetc");
const gbsbuildPath = path.join(enginePackRoot, "tools", process.platform === "win32" ? "gbsbuild.exe" : "gbsbuild");
const devkitPro = process.env.DEVKITPRO ?? "/opt/devkitpro";
const devkitArm = process.env.DEVKITARM ?? path.join(devkitPro, "devkitARM");

function run(command, args, cwd = appRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} saiu com codigo ${code ?? "desconhecido"}`)));
  });
}

async function main() {
  for (const required of [assetcPath, gbsbuildPath, devkitArm]) {
    if (!existsSync(required)) throw new Error(`Dependencia do canario nao encontrada: ${required}`);
  }
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(sourceDir, { recursive: true });
  const manifest = buildMenuFlowCanaryManifest(path.join(enginePackRoot, "templates", "exported_mixed"));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await run(assetcPath, [manifestPath, "-o", exportDir, "--export-project-json"]);
  await run(gbsbuildPath, [
    "--engine-pack", enginePackRoot,
    "--project-dir", exportDir,
    "--build-dir", path.join(exportDir, "build"),
    "--devkitpro", devkitPro,
    "--devkitarm", devkitArm,
    "--clean"
  ]);
  const romPath = path.join(exportDir, "build", "menu_flow_canary.gba");
  if (!existsSync(romPath)) throw new Error(`ROM do canario nao gerada: ${romPath}`);
  console.log(romPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
