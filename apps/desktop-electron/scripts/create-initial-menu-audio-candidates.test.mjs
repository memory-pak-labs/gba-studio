import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { createInitialMenuAudioCandidates } from "./create-initial-menu-audio-candidates.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
const script = fileURLToPath(new URL("./create-initial-menu-audio-candidates.mjs", import.meta.url));
const roots = [];
const temporary = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "gba-menu-audio-source-")); roots.push(root); return root; };
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: app });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it("imports without running the CLI", () => {
  expect(typeof createInitialMenuAudioCandidates).toBe("function");
});

it("reproduces the five approved WAVs byte for byte while keeping output unapproved", () => {
  const root = temporary(), first = path.join(root, "first"), second = path.join(root, "second");
  const approved = JSON.parse(fs.readFileSync(path.join(app, "fixtures/asset-provenance/initial-menu-audio-approved.json")));
  for (const output of [first, second]) {
    const result = run(output); expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, "manifest.json")));
    expect(manifest.approval).toEqual({ approved: false, auditory: false });
    expect(manifest.assets).toHaveLength(5);
    for (const asset of approved.assets) {
      const wav = fs.readFileSync(path.join(output, asset.name));
      expect(digest(wav), asset.name).toBe(asset.metadata.preparedSha256);
      expect(wav.equals(fs.readFileSync(path.join(app, "default-assets/templates/exemplo-gba", asset.metadata.source)))).toBe(true);
      expect(wav.readUInt32LE(24)).toBe(31536);
      expect(wav.readUInt16LE(22)).toBe(1); expect(wav.readUInt16LE(34)).toBe(16);
      expect(manifest.assets.find(row => row.name === asset.name).metadata.approved).toBe(false);
    }
  }
  expect(fs.readFileSync(path.join(first, "previa-cinco-efeitos.wav")))
    .toEqual(fs.readFileSync(path.join(second, "previa-cinco-efeitos.wav")));
});

it("refuses an existing output without overwriting its contents", () => {
  const root = temporary(), sentinel = path.join(root, "keep.txt"); fs.writeFileSync(sentinel, "other work");
  expect(run(root).status).not.toBe(0);
  expect(fs.readdirSync(root)).toEqual(["keep.txt"]); expect(fs.readFileSync(sentinel, "utf8")).toBe("other work");
});

it("rejects output in any part of the checkout, including a symlink alias", () => {
  const root = temporary(), checkout = path.resolve(app, "../.."), name = path.basename(root);
  const inside = path.join(checkout, "packages", name); roots.push(inside);
  expect(run(inside).stderr).toContain("outside the checkout"); expect(fs.existsSync(inside)).toBe(false);
  const alias = path.join(root, "checkout"); fs.symlinkSync(checkout, alias, process.platform === "win32" ? "junction" : "dir");
  expect(run(path.join(alias, "packages", name)).stderr).toContain("outside the checkout");
  expect(fs.existsSync(inside)).toBe(false);
});

it("requires exactly one output argument", () => {
  expect(run().stderr).toContain("Usage:");
  const root = temporary(); expect(run(path.join(root, "out"), "extra").stderr).toContain("Usage:");
  expect(fs.readdirSync(root)).toEqual([]);
});
