import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseTrackerModule } from "../shared/trackerModule.js";
import { makeEditableModFixture, makeEditableS3mFixture } from "../shared/trackerModuleFixtures.js";
import { makeXmFixture, makeItFixture } from "../shared/extendedTrackerFixtures.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";
import { writeEngineProjectExport } from "./engineProjectExport.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("editable native module export", () => {
  it("keeps the prepared PCM cache volume aligned with the game bus when an imported item becomes editable", () => {
    const bytes = makeEditableModFixture(16);
    const song = parseTrackerModule(bytes, "MOD", hash(bytes));
    const item = { id: "original", name: "Theme", kind: "Musica", sourceAssetID: "source", volume: 86, loops: true };
    const data = { settings: { audio: { musicVolume: 80 } }, audioItems: [item],
      assets: [{ id: "source", name: "source.mod", kind: "Audio", metadata: { source: "source.mod" } }] };
    const before = buildAssetcAudioPackGeneration(data)!;
    const after = buildAssetcAudioPackGeneration({ ...data, audioItems: [{ ...item, ...song }] })!;
    expect(after.document.tracker[0].native_primary_volume).toBe(before.document.tracker[0].native_primary_volume);
    expect(after.document.tracker[0].native_primary_volume).toBe(12);
  });

  it.each(["MOD", "S3M", "XM", "IT"] as const)("exports edited %s through its native importer and leaves the source intact", async format => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tracker-edit-export-")); roots.push(root);
    const original = format === "MOD" ? makeEditableModFixture(16) : format === "S3M" ? makeEditableS3mFixture() : format === "XM" ? makeXmFixture() : makeItFixture();
    await writeFile(path.join(root, `original.${format.toLowerCase()}`), original);
    const song = parseTrackerModule(original, format, hash(original)); song.patterns[0].channels[0].notes[0] = "D4";
    const data = { audioItems: [{ ...song, id: "edited", name: "Edited", kind: "Musica", exportID: "edited", sourceAssetID: "source", volume: 100, loops: true }],
      assets: [{ id: "source", name: `original.${format.toLowerCase()}`, kind: "Audio", metadata: { source: `original.${format.toLowerCase()}` } }] };
    const pack = buildAssetcAudioPackGeneration(data)!;
    expect(pack.document.tracker[0][format.toLowerCase() as "mod" | "s3m" | "xm" | "it"]).toBe(`edited_module.${format.toLowerCase()}`);
    expect(pack.document.tracker[0].patterns).toBeUndefined();
    await writeEngineProjectExport({ destination: path.join(root, "export"), projectPath: path.join(root, "project.gba-project"), generated: { target: "test", files: [], assets: pack.sourceCopies } });
    const output = await readFile(path.join(root, "export/assets/audio", `edited_module.${format.toLowerCase()}`));
    expect(parseTrackerModule(output, format, hash(output)).patterns[0].channels[0].notes[0]).toBe("D4");
    expect(hash(await readFile(path.join(root, `original.${format.toLowerCase()}`)))).toBe(hash(original));
  });

  it("rejects an externally changed source instead of applying edits to a different module", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tracker-edit-hash-")); roots.push(root);
    const original = makeEditableModFixture(); const song = parseTrackerModule(original, "MOD", hash(original));
    const changed = original.slice(); changed[45] = 12; await writeFile(path.join(root, "original.mod"), changed);
    const asset = { id: "source", name: "original.mod", kind: "Audio", source: "original.mod", output: "edited.mod", trackerModule: song };
    await expect(writeEngineProjectExport({ destination: path.join(root, "export"), projectPath: path.join(root, "project.gba-project"), generated: { target: "test", files: [], assets: [asset] } })).rejects.toThrow(/fonte.*alterad|alterad.*fonte/i);
    expect(hash(await readFile(path.join(root, "original.mod")))).toBe(hash(changed));
  });
});
