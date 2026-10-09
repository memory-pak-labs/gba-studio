import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectMGBAWebCore } from "./verify-mgba-web-core.mjs";

const temporaryRoots = [];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-mgba-core-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "player"), { recursive: true });
  await mkdir(path.join(root, "licenses"), { recursive: true });
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  await writeFile(path.join(root, "player", "mgba-core.wasm"), wasm);
  await writeFile(path.join(root, "player", "mgba-core.mjs"), "export default async function createMGBA() {}\n");
  await writeFile(path.join(root, "licenses", "mGBA-MPL-2.0.txt"), "MPL 2.0\n");
  await writeFile(path.join(root, "player", "mgba-core.manifest.json"), `${JSON.stringify({
    schema: 1,
    source: { repository: "https://github.com/mgba-emu/mgba.git", revision: "0.10.5" },
    wasm: { file: "mgba-core.wasm", sha256: createHash("sha256").update(wasm).digest("hex") },
    licenses: ["../licenses/mGBA-MPL-2.0.txt"]
  }, null, 2)}\n`);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => {
    await (await import("node:fs/promises")).rm(root, { recursive: true, force: true });
  }));
});

describe("mGBA Web core verification", () => {
  it("accepts a self-contained direct WASM core with a pinned source and matching hash", async () => {
    const root = await fixture();
    await expect(inspectMGBAWebCore(root)).resolves.toMatchObject({
      ok: true,
      wasmPath: path.join(root, "player", "mgba-core.wasm"),
      sourceRevision: "0.10.5"
    });
  });

  it("rejects a manifest whose WASM hash does not match the bundled binary", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "player", "mgba-core.manifest.json"), `${JSON.stringify({
      schema: 1,
      source: { repository: "https://github.com/mgba-emu/mgba.git", revision: "0.10.5" },
      wasm: { file: "mgba-core.wasm", sha256: "0".repeat(64) },
      licenses: ["../licenses/mGBA-MPL-2.0.txt"]
    })}\n`);

    await expect(inspectMGBAWebCore(root)).resolves.toMatchObject({ ok: false });
  });
});
