import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import catalog from "./p0-source-catalog.json" with { type: "json" };

export const CANONICAL_P0_SOURCE_KEY = "canonicalP0";
export const TECHNICAL_P0_SOURCE_KEY = "technicalFixture";

const sourceKeys = Object.freeze([CANONICAL_P0_SOURCE_KEY]);
const catalogKeys = new Set(Object.keys(catalog));

export const P0_SOURCE_CATALOG = Object.freeze(catalog);

export function p0SourceKeys() {
  return [...sourceKeys];
}

export function getP0Source(sourceKey = CANONICAL_P0_SOURCE_KEY) {
  if (!catalogKeys.has(sourceKey)) {
    throw new Error(`Fonte P0 desconhecida: ${sourceKey}`);
  }
  return P0_SOURCE_CATALOG[sourceKey];
}

export function getCanonicalP0Source() {
  return getP0Source(CANONICAL_P0_SOURCE_KEY);
}

export function resolveCanonicalP0Source(appRoot) {
  return resolveP0Source(appRoot, CANONICAL_P0_SOURCE_KEY);
}

export function assertCanonicalP0Source(appRoot) {
  return assertP0SourceExists(appRoot, CANONICAL_P0_SOURCE_KEY);
}

export function resolveP0Source(appRoot, sourceKey = CANONICAL_P0_SOURCE_KEY) {
  const source = getP0Source(sourceKey);
  return Object.freeze({
    ...source,
    projectPath: path.resolve(appRoot, source.projectPath),
    assetsRoot: source.assetsRoot ? path.resolve(appRoot, source.assetsRoot) : undefined,
    visualMirrorPath: source.visualMirrorPath
      ? path.resolve(appRoot, source.visualMirrorPath)
      : undefined,
    visualMirrorAssetsRoot: source.visualMirrorAssetsRoot
      ? path.resolve(appRoot, source.visualMirrorAssetsRoot)
      : undefined
  });
}

export function classifyP0ProjectPath(appRoot, projectPath) {
  const resolvedPath = path.resolve(projectPath);
  for (const sourceKey of sourceKeys) {
    const source = resolveP0Source(appRoot, sourceKey);
    if (source.projectPath === resolvedPath) {
      return Object.freeze({ sourceKey, ...source });
    }
  }
  return Object.freeze({
    id: "external-project",
    role: "external",
    projectPath: resolvedPath,
    sourceKey: null
  });
}

export function assertP0SourceExists(appRoot, sourceKey) {
  const source = resolveP0Source(appRoot, sourceKey);
  if (!existsSync(source.projectPath)) {
    throw new Error(`Projeto da fonte ${sourceKey} ausente: ${source.projectPath}`);
  }
  if (source.assetsRoot && !existsSync(source.assetsRoot)) {
    throw new Error(`Assets da fonte ${sourceKey} ausentes: ${source.assetsRoot}`);
  }
  if (source.visualMirrorPath && !existsSync(source.visualMirrorPath)) {
    throw new Error(`Espelho visual da fonte ${sourceKey} ausente: ${source.visualMirrorPath}`);
  }
  if (source.visualMirrorAssetsRoot && !existsSync(source.visualMirrorAssetsRoot)) {
    throw new Error(`Assets do espelho visual da fonte ${sourceKey} ausentes: ${source.visualMirrorAssetsRoot}`);
  }
  return source;
}

export function readP0SourceProject(appRoot, sourceKey) {
  const source = assertP0SourceExists(appRoot, sourceKey);
  return JSON.parse(readFileSync(source.projectPath, "utf8"));
}

function canonicalAssetFiles(root, relativeDirectory = "") {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(root, entry.name);
      return entry.isDirectory()
        ? canonicalAssetFiles(absolutePath, relativePath)
        : entry.isFile()
          ? [{ absolutePath, relativePath }]
          : [];
    });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function trackedBaselineSha256(repoRoot, absolutePath) {
  const repositoryPath = path.relative(repoRoot, absolutePath).split(path.sep).join("/");
  if (!repositoryPath || repositoryPath.startsWith("../")) return null;
  try {
    return sha256(execFileSync("git", ["show", `HEAD:${repositoryPath}`], {
      cwd: repoRoot,
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    }));
  } catch {
    return null;
  }
}

function mirrorMetadata(mirrorRoot, relativePath, expectedSha256) {
  if (!mirrorRoot) {
    return {
      mirrorAssetPath: null,
      mirrorExists: null,
      mirrorMatches: null,
      mirrorSha256: null
    };
  }
  const mirrorAssetPath = path.join(mirrorRoot, relativePath);
  const mirrorExists = existsSync(mirrorAssetPath);
  const mirrorSha256 = mirrorExists ? sha256(readFileSync(mirrorAssetPath)) : null;
  return {
    mirrorAssetPath,
    mirrorExists,
    mirrorMatches: expectedSha256 ? mirrorSha256 === expectedSha256 : null,
    mirrorSha256
  };
}

export function auditCanonicalP0Assets(appRoot) {
  const source = assertCanonicalP0Source(appRoot);
  const policy = source.assetPolicy ?? {};
  const approved = Array.isArray(policy.approved) ? policy.approved : [];
  const pending = Array.isArray(policy.pending) ? policy.pending : [];
  const retired = Array.isArray(policy.retired) ? policy.retired : [];
  const policyEntries = [...approved, ...pending, ...retired]
    .filter((entry) => entry && typeof entry.path === "string");
  const approvedByPath = new Map(approved.map((entry) => [entry.path, entry]));
  const retiredByPath = new Map(retired.map((entry) => [entry.path, entry]));
  const scannedRoot = path.resolve(path.dirname(source.projectPath), policy.scanRoot ?? "Assets");
  const scanRootName = policy.scanRoot ?? "Assets";
  const mirrorRoot = source.visualMirrorAssetsRoot;
  const repoRoot = path.resolve(appRoot, "../..");
  const project = readP0SourceProject(appRoot, CANONICAL_P0_SOURCE_KEY);
  const declaredAssetPaths = new Set(
    (Array.isArray(project.assets) ? project.assets : [])
      .map((asset) => asset?.metadata?.source)
      .filter((assetPath) => typeof assetPath === "string")
      .map((assetPath) => assetPath.replaceAll("\\", "/"))
      .filter((assetPath) => assetPath.startsWith(`${scanRootName}/`))
  );
  const result = [];
  const seenPaths = new Set();

  for (const file of canonicalAssetFiles(scannedRoot)) {
    const relativePath = path.join(policy.scanRoot ?? "Assets", file.relativePath).split(path.sep).join("/");
    const actualSha256 = sha256(readFileSync(file.absolutePath));
    const approvedEntry = approvedByPath.get(relativePath);
    const pendingEntry = pending.find((candidate) => candidate.path === relativePath && candidate.sha256 === actualSha256);
    const retiredEntry = retiredByPath.get(relativePath);
    const baselineSha256 = trackedBaselineSha256(repoRoot, file.absolutePath);
    const expectedSha256 = approvedEntry?.sha256 ?? retiredEntry?.sha256;
    const mirror = mirrorMetadata(mirrorRoot, file.relativePath, expectedSha256);
    const status = actualSha256 === approvedEntry?.sha256
      ? "approved"
      : actualSha256 === retiredEntry?.sha256
        ? "retired"
      : pendingEntry
        ? pendingEntry.status ?? "pending-context-review"
        : baselineSha256 === actualSha256
          ? "baseline"
          : "unknown";
    seenPaths.add(relativePath);
    result.push(Object.freeze({
      approved: status === "approved" || status === "baseline" || status === "retired",
      assetPath: file.absolutePath,
      contract: approvedEntry?.contract ?? retiredEntry?.contract ?? null,
      declaredInProject: declaredAssetPaths.has(relativePath),
      expectedApprovedSha256: expectedSha256 ?? null,
      exists: true,
      ...mirror,
      path: relativePath,
      reason: pendingEntry?.reason ?? retiredEntry?.reason ?? null,
      sha256: actualSha256,
      status
    }));
  }

  for (const relativePath of declaredAssetPaths) {
    if (seenPaths.has(relativePath)) continue;
    const entry = policyEntries.find((candidate) => candidate.path === relativePath);
    const assetPath = path.resolve(path.dirname(source.projectPath), relativePath);
    const mirrorRelativePath = relativePath.startsWith(`${scanRootName}/`)
      ? relativePath.slice(scanRootName.length + 1)
      : relativePath;
    const approvedEntry = approvedByPath.get(relativePath);
    const retiredEntry = retiredByPath.get(relativePath);
    const expectedSha256 = approvedEntry?.sha256 ?? retiredEntry?.sha256;
    const mirror = mirrorMetadata(mirrorRoot, mirrorRelativePath, expectedSha256);
    result.push(Object.freeze({
      approved: false,
      assetPath,
      contract: approvedEntry?.contract ?? retiredEntry?.contract ?? null,
      declaredInProject: true,
      expectedApprovedSha256: expectedSha256 ?? null,
      exists: false,
      ...mirror,
      path: relativePath,
      reason: entry?.reason ?? null,
      sha256: null,
      status: "missing"
    }));
  }

  return result;
}

export function blockingCanonicalP0Assets(assets) {
  return assets.filter((asset) => asset.declaredInProject && (!asset.approved || asset.mirrorMatches === false));
}

export function assertCanonicalP0AssetsApproved(appRoot) {
  const assets = auditCanonicalP0Assets(appRoot);
  const blockedAssets = blockingCanonicalP0Assets(assets);
  if (blockedAssets.length > 0) {
    const details = blockedAssets
      .map((asset) => `${asset.path}: ${asset.mirrorMatches === false ? "visual-mirror-mismatch" : asset.status}`)
      .join(", ");
    throw new Error(`P0 canônico bloqueado por assets não aprovados: ${details}.`);
  }
  return assets;
}
