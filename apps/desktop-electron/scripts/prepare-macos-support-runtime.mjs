import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeUniversalBinary, mergeUniversalMachOTrees } from "./macos-universal-runtime.mjs";
import { verifiedDownload } from "./prepare-portable-runtime.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function removePythonBytecode(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name === "__pycache__") await rm(file, { recursive: true, force: true });
    else if (entry.isDirectory()) await removePythonBytecode(file);
    else if (entry.isFile() && /\.(pyc|pyo)$/.test(entry.name)) await rm(file);
  }
}

export async function prepareMacosSupportRuntime() {
  const lock = JSON.parse(await readFile(path.join(appRoot, "scripts/portable-runtime-sources.json"), "utf8"));
  const cache = path.join(appRoot, "build/runtime-downloads");
  const stage = path.join(appRoot, "build/macos-support-runtime");
  const archives = {};
  for (const [name, source] of Object.entries(lock.macosRuntime)) archives[name] = await verifiedDownload(source, cache);
  await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true });
  for (const architecture of ["arm64", "x86_64"]) {
    const root = path.join(stage, architecture);
    await mkdir(root, { recursive: true });
    execFileSync("/usr/bin/tar", ["-xf", archives[`python_${architecture}`], "--strip-components=1", "-C", root]);
    const python = path.join(root, "bin/python3");
    execFileSync("/usr/bin/arch", [`-${architecture}`, python, "-I", "-m", "pip", "install", "--no-index", "--no-deps", archives[`pillow_${architecture}`]], { stdio: "inherit" });
  }
  const pythonRoot = path.join(stage, "Python");
  await cp(path.join(stage, "arm64"), pythonRoot, { recursive: true, verbatimSymlinks: true });
  await mergeUniversalMachOTrees({ arm64Root: path.join(stage, "arm64"), x86_64Root: path.join(stage, "x86_64"), destinationRoot: pythonRoot });
  // Preserve each interpreter's build metadata for sysconfig/pip on Intel too.
  const stdlib = "lib/python3.13";
  for (const architecture of ["arm64", "x86_64"]) {
    await copyFile(path.join(stage, architecture, stdlib, "_sysconfigdata__darwin_darwin.py"), path.join(pythonRoot, stdlib, `_gbastudio_sysconfig_${architecture}.py`));
  }
  await writeFile(path.join(pythonRoot, stdlib, "_sysconfigdata__darwin_darwin.py"), [
    "# Architecture-specific CPython build metadata; upstream files preserved beside this selector.",
    "import os", "from importlib import import_module",
    "build_time_vars = import_module('_gbastudio_sysconfig_' + ('arm64' if os.uname().machine == 'arm64' else 'x86_64')).build_time_vars", ""
  ].join("\n"));
  await removePythonBytecode(pythonRoot);

  // Configure probes one CPU at a time; multi-arch preprocessing can mix SDK headers.
  for (const architecture of ["arm64", "x86_64"]) {
    const makeSource = path.join(stage, `make-${architecture}`); await mkdir(makeSource);
    execFileSync("/usr/bin/tar", ["-xf", archives.make, "--strip-components=1", "-C", makeSource]);
    const buildEnvironment = { ...process.env, CC: "/usr/bin/clang", CPP: `/usr/bin/clang -E -arch ${architecture}`, CFLAGS: `-O2 -std=gnu11 -arch ${architecture} -mmacosx-version-min=12.0`, LDFLAGS: `-arch ${architecture} -mmacosx-version-min=12.0`, MACOSX_DEPLOYMENT_TARGET: "12.0" };
    execFileSync("/bin/sh", ["./configure", `--host=${architecture === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`, "--disable-dependency-tracking", "--without-guile", "--disable-nls"], { cwd: makeSource, env: buildEnvironment, stdio: "inherit" });
    execFileSync("/usr/bin/make", ["-j2"], { cwd: makeSource, env: buildEnvironment, stdio: "inherit" });
    await copyFile(path.join(makeSource, "make"), path.join(stage, `make-${architecture}.bin`));
    await rm(makeSource, { recursive: true, force: true });
  }
  const make = path.join(stage, "make");
  await mergeUniversalBinary({ arm64Path: path.join(stage, "make-arm64.bin"), x86_64Path: path.join(stage, "make-x86_64.bin"), outputPath: make });
  const sources = path.join(pythonRoot, "Sources"); await mkdir(sources);
  await copyFile(archives.make, path.join(sources, path.basename(archives.make)));
  await writeFile(path.join(sources, "SOURCES.txt"), [
    "Python and Pillow retain their original licenses and incorporated library notices.",
    "https://www.python.org/ftp/python/3.13.16/Python-3.13.16.tar.xz",
    "https://github.com/astral-sh/python-build-standalone/tree/20261009",
    "https://github.com/python-pillow/Pillow/tree/12.3.0",
    "CPython sysconfig data: original arm64/x86_64 modules retained; selector uses os.uname().machine.",
    "GNU make 4.4.1 source archive is included here; GPL-3.0 license in its COPYING.",
    "make configure: --host=aarch64-apple-darwin or x86_64-apple-darwin --disable-dependency-tracking --without-guile --disable-nls",
    "CC=/usr/bin/clang; CPP=clang -E -arch <cpu>; CFLAGS=-O2 -std=gnu11 -arch <cpu> -mmacosx-version-min=12.0; LDFLAGS=-arch <cpu> -mmacosx-version-min=12.0",
    "Build: /usr/bin/make -j2; minimum macOS 12.0; no system make is shipped.",
    "", JSON.stringify(lock.macosRuntime, null, 2), ""
  ].join("\n"));
  return { pythonRoot, make };
}
