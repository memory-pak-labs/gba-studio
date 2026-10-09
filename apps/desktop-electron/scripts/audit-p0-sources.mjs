#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditCanonicalP0Assets,
  assertCanonicalP0AssetsApproved,
  assertP0SourceExists,
  blockingCanonicalP0Assets,
  p0SourceKeys
} from "./p0-source-catalog.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

for (const sourceKey of p0SourceKeys()) {
  const source = assertP0SourceExists(appRoot, sourceKey);
  console.log(`${sourceKey}: ${source.role} -> ${path.relative(appRoot, source.projectPath)}`);
}

const assets = auditCanonicalP0Assets(appRoot);
const canonicalPolicy = assertP0SourceExists(appRoot, "canonicalP0").assetPolicy ?? {};
for (const root of canonicalPolicy.candidateRoots ?? []) {
  console.log(`canonical asset candidates (excluded): ${root}`);
}
for (const root of canonicalPolicy.legacyFixtureRoots ?? []) {
  console.log(`legacy fixture assets (excluded): ${root}`);
}
const counts = assets.reduce((summary, asset) => ({
  ...summary,
  [asset.status]: (summary[asset.status] ?? 0) + 1
}), {});
console.log(`canonical asset tree: ${assets.length} files scanned (${Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(", ")})`);
for (const [label, scopedAssets] of [
  ["canonical project library", assets.filter((asset) => asset.declaredInProject)],
  ["files outside project library", assets.filter((asset) => !asset.declaredInProject)]
]) {
  const scopedCounts = scopedAssets.reduce((summary, asset) => ({
    ...summary,
    [asset.status]: (summary[asset.status] ?? 0) + 1
  }), {});
  console.log(`${label}: ${scopedAssets.length} (${Object.entries(scopedCounts).map(([status, count]) => `${status}=${count}`).join(", ")})`);
}
for (const asset of assets.filter((candidate) => !["approved", "baseline"].includes(candidate.status))) {
  const reason = asset.reason ? ` — ${asset.reason}` : "";
  const scope = asset.declaredInProject ? "canonical asset" : "file outside project library";
  console.log(`${scope}: ${asset.status} -> ${asset.path}${asset.sha256 ? ` (${asset.sha256})` : ""}${reason}`);
}

const blockedAssets = blockingCanonicalP0Assets(assets);
if (blockedAssets.length > 0) {
  const details = blockedAssets
    .map((asset) => `${asset.path}: ${asset.mirrorMatches === false ? "visual-mirror-mismatch" : asset.status}`)
    .join(", ");
  const message = `P0 canônico bloqueado por assets não aprovados: ${details}.`;
  if (strict) throw new Error(message);
  console.warn(`P0 source catalog WARNING: ${message}`);
} else {
  assertCanonicalP0AssetsApproved(appRoot);
  console.log("P0 source catalog OK: o projeto exemplo é o único P0 canônico e seus assets estão aprovados.");
}
