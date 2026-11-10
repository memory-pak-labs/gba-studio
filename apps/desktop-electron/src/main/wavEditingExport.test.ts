import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { decodeWav, encodeWav, type WavEdit } from "../shared/wavEditing.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";
import { createAudioItemInProject } from "../shared/audioWorkspace.js";
import { createBlankProjectData } from "../shared/newProject.js";
import { writeEngineProjectExport, writeEngineSchemaExport } from "./engineProjectExport.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const original = encodeWav({ sampleRate: 8000, channels: [Float32Array.from([0, .125, -.25, .5, -.5, .25, -.125, 0])], loop: null });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const recipe = (): WavEdit => ({ version: 1, sourceSha256: hash(original), sourceFrames: 8, sampleRate: 8000, trimStart: 2, trimEnd: 7, loop: { start: 3, end: 6 }, operations: [{ type: "fadeOut", start: 4, end: 7 }] });
function project() {
  let data = createBlankProjectData({ name: "WAV", includeStarterContent: false });
  data.assets = [{ id: "wav", name: "bell.wav", kind: "Audio", metadata: { source: "bell.wav", wavEdit: recipe() } }];
  data.audioItems = [{ id: "fx", name: "Bell", kind: "SFX", sourceAssetID: "wav", loops: true }];
  data = createAudioItemInProject(data, { id: "song", name: "Song", kind: "Musica", synthesis: "PCM" });
  const song = (data.audioItems as any[]).find(a => a.id === "song"); song.patterns[0].channels[0].sampleAssetID = "wav"; song.patterns[0].channels[0].sampleLoop = true;
  data = createAudioItemInProject(data, { id: "sample-fx", name: "Sample", kind: "SFX", synthesis: "PCM" });
  const fx = (data.audioItems as any[]).find(a => a.id === "sample-fx"); fx.pcmSfx.source = "sample"; fx.pcmSfx.sampleAssetID = "wav";
  return data;
}
describe("WAV source edits in all export paths", () => {
  it("keeps audio recipes after generic assets are staged in the normal game exporter", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wav-edits-game-")); roots.push(root);
    await writeFile(path.join(root, "bell.wav"), original);
    const data = createBlankProjectData({ name: "WAV game", includeStarterContent: false, sceneType: "cutscene" });
    data.assets = project().assets; data.audioItems = [{ id: "fx", name: "Bell", kind: "SFX", sourceAssetID: "wav" }];
    const prepared = prepareEngineProjectExport(data, { enginePackPath: path.join(root, "pack") });
    expect(prepared.error).toBeUndefined();
    // Stop at tool invocation: this standard host test isolates staging, without
    // requiring ARM tools. The opt-in ROM proof exercises assetc and gbsbuild.
    await expect(writeEngineSchemaExport({ destination: path.join(root, "export"), projectPath: path.join(root, "game.gba-project"), prepared: prepared.generated!, assetcPath: path.join(root, "missing-assetc"), cacheEnabled: false })).rejects.toThrow();
    const staged = decodeWav(await readFile(path.join(root, "export/assets/audio/bell.wav")));
    expect(staged.channels[0].length).toBe(5); expect(staged.loop).toEqual({ start: 1, end: 4 });
    expect(hash(await readFile(path.join(root, "bell.wav")))).toBe(hash(original));
  });
  it("carries recipes for imported WAVs, song samples and authored PCM effects", () => {
    const pack = buildAssetcAudioPackGeneration(project())!;
    expect(pack.sourceCopies).toHaveLength(3);
    for (const copy of pack.sourceCopies) expect(copy.wavEdit).toEqual(recipe());
  });
  it("stages edited PCM and smpl while leaving the original bytes unchanged", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wav-edits-")); roots.push(root);
    await writeFile(path.join(root, "bell.wav"), original);
    const pack = buildAssetcAudioPackGeneration(project())!;
    await writeEngineProjectExport({ destination: path.join(root, "export"), projectPath: path.join(root, "project.gba-project"), generated: { target: "test", files: [], assets: pack.sourceCopies } });
    for (const copy of pack.sourceCopies) {
      const result = decodeWav(await readFile(path.join(root, "export", copy.output)));
      expect(result.channels[0]).toHaveLength(5); expect(result.loop).toEqual({ start: 1, end: 4 }); expect(result.channels[0][4]).toBe(0);
    }
    expect(hash(await readFile(path.join(root, "bell.wav")))).toBe(hash(original));
  });
  it("rejects externally replaced source bytes and invalid persisted recipes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wav-edits-stale-")); roots.push(root);
    const changed = original.slice(); changed[44] = 2; await writeFile(path.join(root, "bell.wav"), changed);
    const pack = buildAssetcAudioPackGeneration(project())!;
    await expect(writeEngineProjectExport({ destination: path.join(root, "export"), projectPath: path.join(root, "project.gba-project"), generated: { target: "test", files: [], assets: pack.sourceCopies } })).rejects.toThrow(/fonte.*alterad/i);
    const invalid = project(); (invalid.assets as any[])[0].metadata.wavEdit.trimEnd = 99;
    expect(() => buildAssetcAudioPackGeneration(invalid)).toThrow(/WAV/);
  });
  it("refuses to export edited samples over their source, including hard links", async () => {
    const { link } = await import("node:fs/promises");
    const root = await mkdtemp(path.join(os.tmpdir(), "wav-edits-source-")); roots.push(root);
    await writeFile(path.join(root, "bell.wav"), original); await link(path.join(root, "bell.wav"), path.join(root, "linked.wav"));
    for (const output of ["bell.wav", "linked.wav"]) {
      await expect(writeEngineProjectExport({ destination: root, projectPath: path.join(root, "project.gba-project"), generated: { target: "test", files: [], assets: [{ id: "wav", name: "bell.wav", kind: "Audio", source: "bell.wav", output, wavEdit: recipe() }] } })).rejects.toThrow(/original/);
    }
    expect(hash(await readFile(path.join(root, "bell.wav")))).toBe(hash(original));
  });
});
