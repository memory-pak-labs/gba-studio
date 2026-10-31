import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { prepareEncoreReview } from "./prepare-encore-review.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
const template = path.join(app, "default-assets/templates/exemplo-gba");
const script = fileURLToPath(new URL("./prepare-encore-review.mjs", import.meta.url));
const approvalFile = path.join(app, "fixtures/asset-provenance/encore-approved.json");
const roots = [];
const temporary = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "gba-encore-review-")); roots.push(root); return root; };
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: app });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("imports without preparing a project", () => {
  expect(typeof prepareEncoreReview).toBe("function");
});

it("copies the approved canonical project and manifest byte for byte by default", () => {
  const output = path.join(temporary(), "approved"), original = fs.readFileSync(path.join(template, "exemplo-gba.gba-project"));
  const result = run(output); expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.mode).toBe("approved"); expect(report.sourceSha256).toBe(digest(original));
  expect(fs.readFileSync(path.join(report.projectRoot, "exemplo-gba.gba-project"))).toEqual(original);
  expect(fs.readFileSync(path.join(output, "assets/manifest.json"))).toEqual(fs.readFileSync(approvalFile));
  const manifest = JSON.parse(fs.readFileSync(approvalFile));
  for (const asset of manifest.assets) {
    expect(digest(fs.readFileSync(path.join(output, "assets", asset.name)))).toBe(asset.metadata.preparedSha256);
    expect(fs.readFileSync(path.join(report.projectRoot, asset.metadata.source)))
      .toEqual(fs.readFileSync(path.join(template, asset.metadata.source)));
  }
  expect(fs.readFileSync(path.join(template, "exemplo-gba.gba-project"))).toEqual(original);
}, 240_000);

it("requires an explicit candidate flag and removes all previous approval from new assets", () => {
  const root = temporary(), assets = path.join(root, "input"), output = path.join(root, "candidate"); fs.mkdirSync(assets);
  const approved = JSON.parse(fs.readFileSync(approvalFile)), original = fs.readFileSync(path.join(template, "exemplo-gba.gba-project"));
  for (const asset of approved.assets) {
    const bytes = fs.readFileSync(path.join(template, asset.metadata.source));
    if (asset.kind === "SFX") bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(path.join(assets, asset.name), bytes);
  }
  const result = run(output, "--candidate-assets=" + assets); expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).mode).toBe("candidate");
  const manifest = JSON.parse(fs.readFileSync(path.join(output, "assets/manifest.json")));
  expect(manifest.approval).toEqual({ approved: false, visual: false, audio: false });
  const project = JSON.parse(fs.readFileSync(path.join(output, "project/exemplo-gba.gba-project")));
  for (const asset of manifest.assets) {
    expect(asset.metadata.approved).toBe(false); expect(asset.metadata.reviewStatus).toBe("candidate");
    expect(asset.metadata.approvalDate).toBeUndefined(); expect(asset.metadata.approvedAt).toBeUndefined();
    expect(asset.metadata.license).toContain("Unverified candidate");
    expect(asset.metadata.generatedBy).toContain("candidate copy only");
    expect(project.assets.find(row => row.id === asset.id)).toEqual(asset);
    expect(digest(fs.readFileSync(path.join(output, "project", asset.metadata.source)))).toBe(asset.metadata.preparedSha256);
  }
  const before = JSON.parse(original);
  expect({ ...project, assets: before.assets }).toEqual(before);
  expect(fs.readFileSync(path.join(template, "exemplo-gba.gba-project"))).toEqual(original);
});

it("refuses to refresh an existing review or write into the checkout through a symlink", () => {
  const root = temporary(), sentinel = path.join(root, "keep.txt"); fs.writeFileSync(sentinel, "other work");
  expect(run(root).status).not.toBe(0); expect(fs.readdirSync(root)).toEqual(["keep.txt"]);
  expect(fs.readFileSync(sentinel, "utf8")).toBe("other work");
  const checkout = path.resolve(app, "../.."), inside = path.join(checkout, "packages", path.basename(root)); roots.push(inside);
  expect(run(inside).stderr).toContain("outside the checkout");
  const alias = path.join(root, "checkout"); fs.symlinkSync(checkout, alias, process.platform === "win32" ? "junction" : "dir");
  expect(run(path.join(alias, "packages", path.basename(root))).stderr).toContain("outside the checkout");
  expect(fs.existsSync(inside)).toBe(false);
});

it("fails before creating output when candidate inputs are missing", () => {
  const root = temporary(), output = path.join(root, "out");
  expect(run(output, "--candidate-assets=" + path.join(root, "missing")).status).not.toBe(0);
  expect(fs.readdirSync(root)).toEqual([]);
});

it("rejects missing and unknown arguments", () => {
  const root = temporary();
  for (const args of [[], [path.join(root, "out"), "old-manifest.json"], [path.join(root, "out"), "--candidate-assets="]]) {
    expect(run(...args).stderr).toContain("Usage:");
  }
  expect(fs.readdirSync(root)).toEqual([]);
});
