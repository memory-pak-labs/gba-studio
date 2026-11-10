import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { readTrackerModuleForEditing } from "./trackerModuleImport.js";
import { makeEditableModFixture } from "../shared/trackerModuleFixtures.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tracker-read-")); roots.push(root);
  const original = makeEditableModFixture(16); await writeFile(path.join(root, "source.mod"), original);
  return { root, original, request: { projectPath: path.join(root, "project.gba-project"), audioID: "a", data: {
    audioItems: [{ id: "a", kind: "Musica", sourceAssetID: "s" }], assets: [{ id: "s", name: "source.mod", kind: "Audio", metadata: { source: "source.mod" } }] } } };
}
describe("read-only tracker import", () => {
  it("reads the source, instruments and 16 tracks and does not write to it", async () => {
    const { root, original, request } = await setup(); const result = await readTrackerModuleForEditing(request);
    expect(result.error).toBeUndefined(); expect(result.song?.patterns[0].channels).toHaveLength(16);
    expect(result.song?.trackerModule.sourceSha256).toBe(createHash("sha256").update(original).digest("hex"));
    expect(await readFile(path.join(root, "source.mod"))).toEqual(Buffer.from(original));
  });
  it("rejects a relative path and a symlink escaping the project", async () => {
    const { root, request } = await setup();
    request.data.assets[0].metadata.source = "../outside.mod";
    expect((await readTrackerModuleForEditing(request)).error).toMatch(/dentro da pasta/);
    const other = await mkdtemp(path.join(os.tmpdir(), "tracker-outside-")); roots.push(other);
    await writeFile(path.join(other, "outside.mod"), makeEditableModFixture()); await symlink(path.join(other, "outside.mod"), path.join(root, "linked.mod"));
    request.data.assets[0].metadata.source = "linked.mod";
    expect((await readTrackerModuleForEditing(request)).error).toMatch(/fora da pasta/);
  });
});
