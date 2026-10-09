import { chmod, copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");

export async function preparePortableEnginePack(options = {}) {
  const source = options.source ?? path.resolve(appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
  const output = options.output ?? path.join(appRoot, "build/embedded-runtime/EnginePack/GBAStudioEnginePack");
  const manifest = JSON.parse(await readFile(path.join(source, "enginepack.json"), "utf8"));
  if (!(await stat(path.join(source, "lib/libgbastudio_engine.a"))).isFile()) {
    throw new Error("Engine Pack sem biblioteca ARM compilada.");
  }
  for (const tool of ["assetc", "gbsdoctor", "gbsbuild"]) {
    await stat(path.join(source, "tools", tool));
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
  for (const tool of ["assetc", "gbsdoctor", "gbsbuild"]) {
    await copyFile(path.join(output, "tools", tool), path.join(output, "tools", `${tool}.py`));
  }
  for (const tool of await readdir(path.join(output, "tools"), { withFileTypes: true })) {
    if (tool.isFile()) await chmod(path.join(output, "tools", tool.name), 0o755);
  }
  await writeFile(path.join(output, "HOST_REQUIREMENTS.txt"), [
    `GBA Studio Engine Pack ${manifest.version}`,
    "Python 3 with Pillow, devkitPro/devkitARM and GNU make/bash are required on the host.",
    "Configure DEVKITPRO/DEVKITARM and PATH; GBA_STUDIO_PYTHON can select a Python executable.",
    "This package does not bundle the host Python or compiler toolchain.", ""
  ].join("\n"));
  return { output, version: manifest.version };
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  const result = await preparePortableEnginePack();
  console.log(`[portable-engine-pack] ${result.version}: ${result.output}`);
}
