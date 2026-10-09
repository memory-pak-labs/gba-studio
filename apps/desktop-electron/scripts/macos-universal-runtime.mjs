import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const machOMagics = new Set(["cafebabe", "cafebabf", "feedface", "feedfacf", "cefaedfe", "cffaedfe"]);

export function parseLipoArchitectures(output) {
  return [...new Set(String(output).trim().split(/\s+/).filter(Boolean))].sort();
}

export function hasUniversalMacArchitectures(architectures) {
  const values = new Set(architectures);
  return values.has("arm64") && values.has("x86_64");
}

export function matchingMachORelativePaths(arm64Paths, x86_64Paths) {
  const arm64 = [...new Set(arm64Paths)].sort();
  const x86_64 = [...new Set(x86_64Paths)].sort();
  if (JSON.stringify(arm64) !== JSON.stringify(x86_64)) {
    const onlyArm64 = arm64.filter((item) => !x86_64.includes(item));
    const onlyX86_64 = x86_64.filter((item) => !arm64.includes(item));
    throw new Error(
      `Toolchains possuem layouts Mach-O diferentes: arm64-only=${onlyArm64.join(",") || "nenhum"}; x86_64-only=${onlyX86_64.join(",") || "nenhum"}.`
    );
  }
  return arm64;
}

async function isMachOFile(filePath) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, 4, 0);
    return bytesRead === 4 && machOMagics.has(buffer.toString("hex"));
  } finally {
    await handle.close();
  }
}

export async function collectMachORelativePaths(root) {
  const result = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && await isMachOFile(absolutePath)) {
        result.push(path.relative(root, absolutePath));
      }
    }
  }

  await visit(root);
  return result.sort();
}

export async function normalizeInfoPlistsToXml(root) {
  const plistPaths = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && entry.name === "Info.plist") {
        plistPaths.push(absolutePath);
      }
    }
  }

  await visit(root);
  for (const plistPath of plistPaths) {
    await execFileAsync("plutil", ["-convert", "xml1", plistPath], { maxBuffer: 1024 * 1024 });
  }
  return plistPaths;
}

export async function architecturesForMachO(filePath) {
  const { stdout } = await execFileAsync("lipo", ["-archs", filePath], { maxBuffer: 1024 * 1024 });
  return parseLipoArchitectures(stdout);
}

export async function mergeUniversalBinary({ arm64Path, x86_64Path, outputPath }) {
  const temporaryPath = `${outputPath}.universal-${process.pid}`;
  const arm64ThinPath = `${outputPath}.arm64-${process.pid}`;
  const x86_64ThinPath = `${outputPath}.x86_64-${process.pid}`;
  const sourceStat = await lstat(arm64Path);
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    const arm64Architectures = await architecturesForMachO(arm64Path);
    const x86_64Architectures = await architecturesForMachO(x86_64Path);
    if (!arm64Architectures.includes("arm64") || !x86_64Architectures.includes("x86_64")) {
      throw new Error(`Slices incompatíveis: arm64=${arm64Architectures.join(",")}; x86_64=${x86_64Architectures.join(",")}.`);
    }
    const arm64Input = arm64Architectures.length === 1 ? arm64Path : arm64ThinPath;
    const x86_64Input = x86_64Architectures.length === 1 ? x86_64Path : x86_64ThinPath;
    if (arm64Input === arm64ThinPath) {
      await execFileAsync("lipo", [arm64Path, "-thin", "arm64", "-output", arm64ThinPath], { maxBuffer: 8 * 1024 * 1024 });
    }
    if (x86_64Input === x86_64ThinPath) {
      await execFileAsync("lipo", [x86_64Path, "-thin", "x86_64", "-output", x86_64ThinPath], { maxBuffer: 8 * 1024 * 1024 });
    }
    await execFileAsync("lipo", ["-create", arm64Input, x86_64Input, "-output", temporaryPath], {
      maxBuffer: 8 * 1024 * 1024
    });
    await chmod(temporaryPath, sourceStat.mode);
    await execFileAsync("codesign", ["--force", "--sign", "-", "--timestamp=none", temporaryPath], {
      maxBuffer: 8 * 1024 * 1024
    });
    await rename(temporaryPath, outputPath);
  } finally {
    await Promise.all([
      rm(temporaryPath, { force: true }),
      rm(arm64ThinPath, { force: true }),
      rm(x86_64ThinPath, { force: true })
    ]);
  }
  const architectures = await architecturesForMachO(outputPath);
  if (!hasUniversalMacArchitectures(architectures)) {
    throw new Error(`Falha ao criar binario Universal: ${outputPath} (${architectures.join(", ")}).`);
  }
  return architectures;
}

export async function mergeUniversalMachOTrees({ arm64Root, x86_64Root, destinationRoot }) {
  const arm64Paths = await collectMachORelativePaths(arm64Root);
  const x86_64Paths = await collectMachORelativePaths(x86_64Root);
  const relativePaths = matchingMachORelativePaths(arm64Paths, x86_64Paths);

  for (const relativePath of relativePaths) {
    await mergeUniversalBinary({
      arm64Path: path.join(arm64Root, relativePath),
      x86_64Path: path.join(x86_64Root, relativePath),
      outputPath: path.join(destinationRoot, relativePath)
    });
  }

  return relativePaths;
}

export async function auditUniversalMachOTree(root) {
  const paths = await collectMachORelativePaths(root);
  const binaries = [];
  for (const relativePath of paths) {
    const architectures = await architecturesForMachO(path.join(root, relativePath));
    binaries.push({ relativePath, architectures, universal: hasUniversalMacArchitectures(architectures) });
  }
  return {
    root,
    binaries,
    total: binaries.length,
    invalid: binaries.filter((item) => !item.universal)
  };
}
