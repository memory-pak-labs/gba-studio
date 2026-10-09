#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import electron from "electron";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scripts, "..");
const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = await mkdtemp(path.join(os.tmpdir(), "gba-studio-play-benchmark-"));
const project = path.resolve(option("project", path.join(appRoot, "default-assets/templates/exemplo-gba/exemplo-gba.gba-project")));
const pack = path.resolve(option("engine-pack", path.resolve(appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack")));
const player = process.argv.includes("--player");
const realDevkitpro = process.env.DEVKITPRO ?? "/opt/devkitpro";
const realDevkitarm = process.env.DEVKITARM ?? path.join(realDevkitpro, "devkitARM");
const env = { ...process.env, GBA_BENCHMARK_ROOT: root, GBA_BENCHMARK_PROJECT: project,
  GBA_BENCHMARK_PACK: pack, GBA_BENCHMARK_ROUNDS: option("rounds", "3"), GBA_BENCHMARK_PLAYER: player ? "1" : "0",
  GBA_BENCHMARK_DEVKITPRO: realDevkitpro, GBA_BENCHMARK_DEVKITARM: realDevkitarm,
  DEVKITPRO: path.join(root, "devkit"), DEVKITARM: path.join(root, "devkit/devkitARM"), TMPDIR: path.join(root, "tmp") };
await mkdir(env.TMPDIR);
await writeFile(path.join(root, "electron-stub.mjs"), "export const app={getAppPath:()=>'',getPath:()=>''};");
for (const relative of ["assetc-timer", "devkit/devkitARM/bin/arm-none-eabi-g++", "devkit/devkitARM/bin/arm-none-eabi-objcopy", "devkit/tools/bin/gbafix"]) {
  const output = path.join(root, relative); await mkdir(path.dirname(output), {recursive:true});
  await cp(path.join(scripts, "benchmark-build-tool.py"), output);
  await (await import("node:fs/promises")).chmod(output, 0o755);
}
await build({ entryPoints: [path.join(scripts, "benchmark-incremental-cache.ts")], outfile: path.join(root, "measure.mjs"),
  bundle: true, platform: "node", format: "esm", alias: {electron:path.join(root,"electron-stub.mjs")},
  define: { "import.meta.url": JSON.stringify(new URL("benchmark-incremental-cache.ts", import.meta.url).href) } });
const run = (executable, args) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {cwd:appRoot,env,stdio:"inherit"});
  child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Benchmark terminou com codigo ${code}; evidencias: ${root}`)));
});
console.log(`Benchmark isolado: ${root}`);
await run(process.execPath, [path.join(root,"measure.mjs")]);
if (player) {
  await cp(path.join(appRoot,"static/WebPlayer"), path.join(root,"WebPlayer"), {recursive:true});
  await cp(path.join(appRoot,"dist/preload"), path.join(root,"preload"), {recursive:true});
  await build({entryPoints:[path.join(scripts,"benchmark-play-window.ts")],outfile:path.join(root,"measure-player.mjs"),bundle:true,platform:"node",format:"esm",external:["electron"]});
  await writeFile(path.join(root,"player-bootstrap.cjs"), `const {app}=require('electron');const path=require('node:path');
app.on('window-all-closed',()=>{});app.setPath('userData',path.join(${JSON.stringify(root)},'electron-user-data'));app.setPath('sessionData',path.join(${JSON.stringify(root)},'electron-session-data'));
app.whenReady().then(()=>import('./measure-player.mjs')).catch(e=>{console.error(e);app.exit(1)});`);
  const playerEnv = env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RUN_AS_NODE;
  await run(electron, [path.join(root,"player-bootstrap.cjs"), root]);
  if (playerEnv !== undefined) env.ELECTRON_RUN_AS_NODE = playerEnv;
}
