#!/usr/bin/env node
import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultReleaseDir = path.join(appRoot, "release");
const defaultEvidencePath = path.join(
  appRoot,
  "artifacts",
  "ci-artifacts",
  "latest",
  "ci_artifacts_evidence.json"
);

const expectedArtifacts = {
  macos: [".dmg", ".zip"],
  windows: [".exe", ".zip"],
  linux: [".AppImage", ".deb", ".tar.gz"]
};

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function normalizePlatform(platform) {
  if (platform === "mac" || platform === "darwin") return "macos";
  if (platform === "win" || platform === "win32") return "windows";
  if (platform === "linux") return "linux";
  return platform;
}

function matchesExtension(fileName, extension) {
  return fileName.endsWith(extension);
}

async function listReleaseFiles(releaseDir) {
  const entries = await readdir(releaseDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(releaseDir, entry.name);
    const fileStat = await stat(filePath);
    files.push({
      name: entry.name,
      path: filePath,
      bytes: fileStat.size
    });
  }

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

export async function validateReleaseArtifacts(options) {
  const platform = normalizePlatform(options.platform);
  const expected = expectedArtifacts[platform];
  if (!expected) {
    throw new Error(`Unsupported platform '${options.platform}'. Use macos, windows or linux.`);
  }

  const minBytes = options.minBytes ?? 1024;
  const files = await listReleaseFiles(options.releaseDir);
  const items = expected.map((extension) => {
    const artifact = files.find((file) => matchesExtension(file.name, extension));
    const present = Boolean(artifact);
    const sizeOk = present && artifact.bytes >= minBytes;
    const state = present && sizeOk ? "passed" : "blocked";
    return {
      extension,
      state,
      file: artifact?.path,
      bytes: artifact?.bytes ?? 0,
      ...(state === "blocked"
        ? { issue: present ? `Artefato ${extension} tem tamanho invalido.` : `Artefato ${extension} ausente.` }
        : {})
    };
  });
  const blockers = items.filter((item) => item.state === "blocked").map((item) => item.issue);

  return {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    platform,
    releaseDir: options.releaseDir,
    minBytes,
    files,
    items,
    blockers
  };
}

async function main() {
  const platform = readArg("--platform", process.env.RUNNER_OS?.toLowerCase() ?? process.platform);
  const releaseDir = path.resolve(readArg("--release-dir", defaultReleaseDir));
  const evidencePath = path.resolve(readArg("--evidence", defaultEvidencePath));
  const minBytes = Number(readArg("--min-bytes", "1024"));

  const report = await validateReleaseArtifacts({ platform, releaseDir, minBytes });
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[validate-ci-artifacts] platform: ${report.platform}`);
  console.log(`[validate-ci-artifacts] release: ${releaseDir}`);
  console.log(`[validate-ci-artifacts] evidence: ${evidencePath}`);

  for (const item of report.items) {
    const suffix = item.state === "passed" ? `${item.bytes} bytes` : item.issue;
    console.log(`- ${item.extension}: ${item.state} (${suffix})`);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error("[validate-ci-artifacts] failed");
    console.error(error);
    process.exit(1);
  });
}
