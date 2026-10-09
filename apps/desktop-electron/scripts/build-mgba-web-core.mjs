#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMGBAWebCore } from "./verify-mgba-web-core.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(appRoot, "..", "..");
const revision = "0.10.5";
const sourceRepository = "https://github.com/mgba-emu/mgba.git";
const sourceRoot = process.env.GBA_STUDIO_MGBA_SOURCE ?? path.join(repositoryRoot, ".cache", "mgba", revision);
const buildRoot = path.join(repositoryRoot, ".cache", "mgba-build", revision);
const playerRoot = path.join(appRoot, "static", "WebPlayer", "player");
const licensesRoot = path.join(appRoot, "static", "WebPlayer", "licenses");
const wrapperPath = path.join(appRoot, "third_party", "mgba-web", "mgba_web.c");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? repositoryRoot, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} falhou com codigo ${result.status ?? "desconhecido"}.`);
  }
}

function output(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} falhou.`);
  return result.stdout.trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function ensureSource() {
  if (existsSync(path.join(sourceRoot, ".git"))) return;
  await mkdir(path.dirname(sourceRoot), { recursive: true });
  await rm(sourceRoot, { recursive: true, force: true });
  run("git", ["clone", "--depth", "1", "--branch", revision, sourceRepository, sourceRoot]);
}

async function main() {
  const requiredTools = [["emcc", ["--version"]], ["emcmake", ["cmake", "--version"]], ["cmake", ["--version"]]];
  for (const [command, args] of requiredTools) {
    if (spawnSync(command, args, { stdio: "ignore" }).status !== 0) {
      throw new Error(`${command} nao encontrado. Instale Emscripten e CMake para gerar o core Web localmente.`);
    }
  }

  await ensureSource();
  await rm(buildRoot, { recursive: true, force: true });
  run("emcmake", ["cmake", "-S", sourceRoot, "-B", buildRoot, "-DLIBMGBA_ONLY=ON", "-DM_CORE_GBA=ON", "-DM_CORE_GB=OFF", "-DBUILD_LTO=OFF", "-DMINIMAL_CORE=2", "-DENABLE_EXTRA=ON", "-DCMAKE_C_FLAGS=-D_GNU_SOURCE -DDISABLE_ANON_MMAP -DPATH_MAX=4096 -DHAVE_LOCALE -include mgba-util/string.h", "-DCMAKE_POLICY_VERSION_MINIMUM=3.5"]);
  run("cmake", ["--build", buildRoot, "--target", "mgba", "-j", String(process.env.GBA_STUDIO_MGBA_BUILD_JOBS ?? 4)]);

  const libraryPath = path.join(buildRoot, "libmgba.a");
  if (!existsSync(libraryPath)) throw new Error(`Biblioteca libmgba esperada nao encontrada: ${libraryPath}`);

  await mkdir(playerRoot, { recursive: true });
  await mkdir(licensesRoot, { recursive: true });
  const modulePath = path.join(playerRoot, "mgba-core.mjs");
  const wasmPath = path.join(playerRoot, "mgba-core.wasm");
  await rm(modulePath, { force: true });
  await rm(wasmPath, { force: true });
  run("emcc", [
    wrapperPath,
    libraryPath,
    "-I", path.join(sourceRoot, "include"),
    "-I", path.join(buildRoot, "include"),
    "-O3",
    "-s", "MODULARIZE=1",
    "-s", "EXPORT_ES6=1",
    "-s", "ENVIRONMENT=web",
    "-s", "ALLOW_MEMORY_GROWTH=1",
    "-s", "FILESYSTEM=0",
    "--no-entry",
    "-s", "EXPORTED_RUNTIME_METHODS=['HEAPU8']",
    "-s", "EXPORTED_FUNCTIONS=['_malloc','_free','_gba_init','_gba_load_rom','_gba_last_stage','_gba_run_frame','_gba_audio_samples','_gba_audio_sample_count','_gba_audio_sample_rate','_gba_audio_register','_gba_set_keys','_gba_reset','_gba_find_runtime_telemetry','_gba_runtime_telemetry_word','_gba_framebuffer','_gba_framebuffer_size','_gba_state_size','_gba_save_state','_gba_load_state','_gba_savedata_size','_gba_savedata_copy','_gba_savedata_restore','_gba_destroy']",
    "-o", modulePath
  ]);

  const licensePath = path.join(licensesRoot, "mGBA-MPL-2.0.txt");
  const license = await readFile(path.join(sourceRoot, "LICENSE"), "utf8");
  await writeFile(licensePath, license.replace(/[ \t]+$/gm, ""), "utf8");
  const wasm = await readFile(wasmPath);
  const manifestPath = path.join(playerRoot, "mgba-core.manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    schema: 1,
    source: { repository: sourceRepository, revision, commit: output("git", ["-C", sourceRoot, "rev-parse", "HEAD"]) },
    wasm: { file: "mgba-core.wasm", sha256: sha256(wasm) },
    licenses: ["../licenses/mGBA-MPL-2.0.txt"]
  }, null, 2)}\n`, "utf8");

  const verification = await inspectMGBAWebCore(path.join(appRoot, "static", "WebPlayer"));
  if (!verification.ok) throw new Error(`Core gerado invalido:\n- ${verification.failures.join("\n- ")}`);
  console.log(`Core mGBA Web gerado: ${wasmPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
