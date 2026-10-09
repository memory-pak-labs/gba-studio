import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, chmod, copyFile, cp, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function verifiedDownload(source, cache) {
  await mkdir(cache, { recursive: true });
  const destination = path.join(cache, source.name);
  if (!existsSync(destination)) {
    console.log(`[offline-runtime] Download ${source.name}`);
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Download HTTP ${response.status}: ${source.name}`);
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }
  const digest = createHash("sha256").update(await readFile(destination)).digest("hex");
  if (digest !== source.sha256) throw new Error(`SHA256 incorreto: ${source.name}`);
  return destination;
}

async function executableFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await executableFiles(file));
    else if (entry.isFile()) {
      const handle = await open(file, "r");
      try {
        const magic = Buffer.alloc(20); await handle.read(magic, 0, 20, 0);
        if (magic.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) && [2, 3].includes(magic.readUInt16LE(16)) && magic.readUInt16LE(18) === 62) result.push(file);
      } finally { await handle.close(); }
    }
  }
  return result;
}

async function linuxSharedLibraries(files, output) {
  await mkdir(output, { recursive: true });
  const copied = new Map();
  for (const file of files) {
    let dependencies;
    try { dependencies = execFileSync("ldd", [file], { encoding: "utf8" }); }
    catch (error) {
      if (/not a dynamic executable|statically linked/.test(`${error.stdout} ${error.stderr}`)) continue;
      throw error;
    }
    if (dependencies.includes("not found")) throw new Error(`Biblioteca host ausente: ${file}\n${dependencies}`);
    for (const match of dependencies.matchAll(/=>\s+(\/[^\s]+)/g)) {
      const source = match[1], name = path.basename(source);
      // libc and its loader are the Linux ABI, not a private replacement for it.
      if (/^(libc|libm|libpthread|libdl|librt|libutil)\.so/.test(name)) continue;
      if (!copied.has(name)) { await copyFile(source, path.join(output, name)); copied.set(name, source); }
    }
  }
  return Object.fromEntries(copied);
}

export async function preparePortableRuntime() {
  const platform = process.platform;
  if (!["win32", "linux"].includes(platform) || process.arch !== "x64") throw new Error("Prepare o runtime no host nativo Windows/Linux x64.");
  const lock = JSON.parse(await readFile(path.join(appRoot, "scripts/portable-runtime-sources.json"), "utf8"));
  const sources = lock.platforms[platform];
  const output = path.join(appRoot, "build/embedded-runtime");
  const cache = path.join(appRoot, "build/runtime-downloads");
  const stage = path.join(appRoot, "build/offline-runtime-staging");
  const archives = {};
  for (const [name, source] of Object.entries(sources)) archives[name] = await verifiedDownload(source, cache);
  const gbafixSource = await verifiedDownload(lock.gbafix.source, cache);
  const gbafixLicense = await verifiedDownload(lock.gbafix.license, cache);
  await rm(stage, { recursive: true, force: true });
  const runtime = path.join(stage, "Runtime"), toolchain = path.join(stage, "Toolchain");
  const pythonRoot = path.join(runtime, "Python"), compilerRoot = path.join(toolchain, "devkitARM");
  const bin = path.join(toolchain, "bin"), gbaBin = path.join(toolchain, "tools/bin");
  for (const directory of [pythonRoot, compilerRoot, bin, gbaBin, path.join(runtime, "Sources/gbafix")]) await mkdir(directory, { recursive: true });
  // GNU tar from MSYS treats a Windows drive prefix as a remote host.
  const tar = platform === "win32" ? path.join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe") : "tar";
  execFileSync(tar, ["-xf", archives.python, "--strip-components=1", "-C", pythonRoot], { stdio: "inherit" });
  const suffix = platform === "win32" ? ".exe" : "";
  const python = path.join(pythonRoot, platform === "win32" ? "python.exe" : "bin/python3");
  if (archives.compiler.endsWith(".zip")) {
    const extracted = path.join(stage, "compiler-extract");
    await mkdir(extracted);
    execFileSync(python, ["-I", "-m", "zipfile", "-e", archives.compiler, extracted], { stdio: "inherit" });
    const roots = await readdir(extracted); if (roots.length !== 1) throw new Error("Layout do compilador ZIP desconhecido.");
    await rm(compilerRoot, { recursive: true }); await rename(path.join(extracted, roots[0]), compilerRoot);
  } else execFileSync(tar, ["-xf", archives.compiler, "--strip-components=1", "-C", compilerRoot], { stdio: "inherit" });
  execFileSync(python, ["-I", "-m", "pip", "install", "--no-index", "--no-deps", archives.pillow], { stdio: "inherit" });
  execFileSync("gcc", ["-O2", ...(platform === "win32" ? ["-static"] : []), gbafixSource, "-o", path.join(gbaBin, `gbafix${suffix}`)], { stdio: "inherit" });
  await copyFile(gbafixSource, path.join(runtime, "Sources/gbafix/gbafix.c"));
  await copyFile(gbafixLicense, path.join(runtime, "Sources/gbafix/COPYING"));
  let hostLibraries, hostPackageVersions;
  if (platform === "win32") {
    const msys = process.env.GBA_STUDIO_MSYS_SOURCE || "C:/msys64/usr";
    for (const name of ["make", "bash", "sh", "mkdir", "rm", "cat", "pwd", "ls", "cygpath"]) await copyFile(path.join(msys, `bin/${name}.exe`), path.join(bin, `${name}.exe`));
    for (const entry of await readdir(path.join(msys, "bin"))) if (entry.endsWith(".dll")) await copyFile(path.join(msys, "bin", entry), path.join(bin, entry));
    await cp(path.join(msys, "share/licenses"), path.join(runtime, "Licenses/MSYS2"), { recursive: true });
    hostPackageVersions = execFileSync(path.join(msys, "bin/pacman.exe"), ["-Q"], { encoding: "utf8" }).trim().split("\n");
  } else {
    for (const name of ["make", "bash", "sh", "mkdir", "rm", "cat", "pwd", "ls"]) {
      await copyFile(`/usr/bin/${name}`, path.join(bin, name)); await chmod(path.join(bin, name), 0o755);
    }
    hostLibraries = await linuxSharedLibraries([...await executableFiles(bin), ...await executableFiles(compilerRoot), path.join(gbaBin, "gbafix")], path.join(toolchain, "lib-host"));
    for (const name of ["make", "bash", "coreutils"]) await cp(`/usr/share/doc/${name}`, path.join(runtime, "Licenses", name), { recursive: true });
    const packages = ["make", "bash", "coreutils", "dash", "libtinfo6", "libgcc-s1", "libstdc++6"];
    hostPackageVersions = execFileSync("dpkg-query", ["-W", "-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}\n", ...packages], { encoding: "utf8" }).trim().split("\n");
    for (const name of packages) {
      const copyright = `/usr/share/doc/${name}/copyright`;
      if (existsSync(copyright)) { await mkdir(path.join(runtime, "Licenses", name), { recursive: true }); await copyFile(copyright, path.join(runtime, "Licenses", name, "copyright")); }
    }
  }
  const pythonVersion = execFileSync(python, ["-I", "-c", "import PIL,sys;print(sys.version);print(PIL.__version__)"], { encoding: "utf8" });
  const compilerVersion = execFileSync(path.join(compilerRoot, `bin/arm-none-eabi-g++${suffix}`), ["--version"], { encoding: "utf8" });
  const arm7Flags = ["-mthumb", "-mthumb-interwork", "-mcpu=arm7tdmi"];
  const compilerMultilib = execFileSync(path.join(compilerRoot, `bin/arm-none-eabi-g++${suffix}`), [...arm7Flags, "-print-multi-directory"], { encoding: "utf8" }).trim();
  const manifest = { profile: "offline", platform, arch: "x64", pythonVersion, compilerVersion, compilerMultilib, sources: lock, hostLibraries, hostPackageVersions, gbafixBuild: `gcc -O2 ${platform === "win32" ? "-static " : ""}gbafix.c -o gbafix${suffix}` };
  await writeFile(path.join(runtime, "runtime.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(path.join(runtime, "Sources/SOURCES.txt"), [
    "Corresponding source access for the independent bundled tools",
    "Original copyright notices and GPL/LGPL/PSF/BSD/MIT-CMU licenses are retained.",
    "gbafix.c and its original COPYING are included in this directory.",
    "GNU Arm compiler sources:", ...lock.correspondingSources.compilerSources,
    "Exact xPack build recipes, patches and dependency versions/source locations:",
    lock.correspondingSources.buildRecipes, lock.correspondingSources.dependenciesAndPatches,
    "MSYS2 host-tool source archives and recipes:", lock.correspondingSources.msys2SourcePool, lock.correspondingSources.msys2Recipes,
    "Ubuntu host-tool sources (versions recorded below):", lock.correspondingSources.ubuntuSources,
    "Python source: https://www.python.org/ftp/python/3.13.16/Python-3.13.16.tar.xz",
    "Python distribution build recipes: https://github.com/astral-sh/python-build-standalone/tree/20261009",
    "Pillow source and codec build recipes: https://github.com/python-pillow/Pillow/tree/12.3.0",
    "Keep equivalent source access alongside any public Release; these tools retain their own licenses.", "",
    "Host package versions (binary/version/source-package/source-version on Linux):", ...hostPackageVersions, ""
  ].join("\n"));
  await writeFile(path.join(runtime, "THIRD_PARTY_NOTICES.txt"), "Python/CPython and incorporated libraries retain their original licenses. Pillow retains its MIT-CMU license and bundled codec notices. GNU Arm GCC, binutils, make/bash/coreutils and MSYS2 retain their GPL/LGPL licenses. gbafix source and COPYING are included in Sources/gbafix. Compiler documentation/license files, Python notices, Pillow dist-info/licenses and host notices are preserved. These independent executable tools are not relicensed under the editor's MIT license. See runtime.json for pinned versions, download URLs and SHA256.\n");
  for (const name of ["Runtime", "Toolchain"]) {
    await rm(path.join(output, name), { recursive: true, force: true });
    await cp(path.join(stage, name), path.join(output, name), { recursive: true, dereference: false, verbatimSymlinks: true });
  }
  await writeFile(path.join(output, "EnginePack/GBAStudioEnginePack/HOST_REQUIREMENTS.txt"), "Offline Windows/Linux x64 package. Python/Pillow, GNU Arm compiler and make/shell are bundled. No external Python or devkitPro installation is required.\n");
  await rm(stage, { recursive: true, force: true });
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, "GBA_STUDIO_RUNTIME_SOURCES_READY=1\n");
  console.log(`[offline-runtime] ${platform}: Python/Pillow and ARM compiler validated; ${output}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await preparePortableRuntime();
