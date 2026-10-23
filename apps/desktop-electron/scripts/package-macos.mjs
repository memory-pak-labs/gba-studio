import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { macosMachOArchitecture } from "./macos-universal-runtime.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");

export function macosPackageArguments(architecture, directoryOnly = false) {
  macosMachOArchitecture(architecture);
  return ["--mac", `--${architecture}`, ...(directoryOnly ? ["--dir"] : []), "--publish", "never"];
}

async function run(executable, args, env = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: appRoot, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${executable} ${args.join(" ")} terminou com ${code}.`)));
  });
}

async function main() {
  if (process.platform !== "darwin") throw new Error("Prepare os instaladores macOS em um Mac.");
  const selection = process.argv[process.argv.indexOf("--arch") + 1];
  const architectures = selection === "all" ? ["arm64", "x64"] : [selection];
  architectures.forEach(macosMachOArchitecture);
  for (const script of ["icons", "prepare:translation-models", "build"]) await run("npm", ["run", script]);
  for (const architecture of architectures) {
    const env = { ...process.env, GBA_STUDIO_MAC_ARCH: architecture };
    delete env.GBA_STUDIO_REQUIRE_UNIVERSAL_RUNTIME;
    await run(process.execPath, ["scripts/prepare-embedded-runtime.mjs"], env);
    await run(process.execPath, ["scripts/verify-macos-universal-runtime.mjs"], env);
    await run(process.execPath, ["node_modules/electron-builder/out/cli/cli.js", ...macosPackageArguments(architecture, process.argv.includes("--dir"))], env);
  }
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
