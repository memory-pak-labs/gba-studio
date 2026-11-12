import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeEditableModFixture, makeEditableS3mFixture } from "./trackerModuleFixtures.js";
import { parseTrackerModule, writeTrackerModule } from "./trackerModule.js";
import { prepareTrackerModuleForEditingInProject, createEditableTrackerCopyInProject, editTrackerModuleInProject, trackerModuleSong } from "./trackerModuleEditing.js";
import { makeXmFixture, makeItFixture } from "./extendedTrackerFixtures.js";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";

function setup(channels = 16) {
  const bytes = makeEditableModFixture(channels); const song = parseTrackerModule(bytes, "MOD", createHash("sha256").update(bytes).digest("hex"));
  const data = { name: "Projeto do usuário", rooms: [{ id: "room", music: "Tema" }],
    audioItems: [{ id: "original", name: "Tema", kind: "Musica", format: "MOD", sourceAssetID: "asset", volume: 80, loops: true }],
    assets: [{ id: "asset", name: "source.mod", kind: "Audio", metadata: { source: "Assets/source.mod" } }] };
  const copy = createEditableTrackerCopyInProject(data, "original", song, "editable");
  return { data, copy, song: trackerModuleSong((copy.audioItems as Record<string, unknown>[])[1]) };
}
describe("editable tracker project commands", () => {
  it.each(["MOD", "S3M", "XM", "IT"] as const)("edits the same %s item, retaining source identity, metadata and game references", format => {
    const bytes = format === "MOD" ? makeEditableModFixture(16) : format === "S3M" ? makeEditableS3mFixture() : format === "XM" ? makeXmFixture() : makeItFixture();
    const song = parseTrackerModule(bytes, format, createHash("sha256").update(bytes).digest("hex"));
    const source = { id: "original", name: "Tema", kind: "Musica", exportID: "theme", sourceAssetID: "asset", volume: 86, loops: false, metadata: { userNote: "Keep" } };
    const data = { rooms: [{ music: "Tema" }], events: [{ steps: [{ command: "play_music Tema" }] }], audioItems: [source],
      assets: [{ id: "asset", name: `source.${format.toLowerCase()}`, kind: "Audio", metadata: { source: `Assets/source.${format.toLowerCase()}` } }] };
    const before = JSON.stringify(data);
    const prepared = prepareTrackerModuleForEditingInProject(data, "original", song);
    expect(prepared.audioItems).toHaveLength(1);
    expect((prepared.audioItems as unknown[])[0]).toMatchObject({ ...source, trackerModule: { sourceSha256: song.trackerModule.sourceSha256, projectOverlay: true } });
    expect(prepared.assets).toBe(data.assets); expect(prepared.rooms).toBe(data.rooms); expect(prepared.events).toBe(data.events);
    expect(deriveAudioWorkspacePresentation(prepared).items[0]).toMatchObject({ id: "original", origin: "Importado", name: "Tema", format });
    const edited = editTrackerModuleInProject(prepared, "original", { type: "cell", patternID: song.patterns[0].id, channelID: song.patterns[0].channels[0].id, row: 0, fields: { note: "D4" } });
    const reopened = JSON.parse(JSON.stringify(edited));
    expect(prepareTrackerModuleForEditingInProject(reopened, "original", song)).toBe(reopened);
    expect(trackerModuleSong(reopened.audioItems[0]).patterns[0].channels[0].notes[0]).toBe("D4");
    expect(JSON.stringify(data)).toBe(before);
  });
  it("does not reuse a S3M channel carrying preserved hidden commands", () => {
    const bytes = makeEditableS3mFixture(); const digest = createHash("sha256").update(bytes).digest("hex");
    const song = parseTrackerModule(bytes, "S3M", digest);
    const data = { audioItems: [{ id: "original", name: "Tema", kind: "Musica", sourceAssetID: "asset" }], assets: [{ id: "asset", name: "source.s3m", kind: "Audio", metadata: { source: "Assets/source.s3m" } }] };
    const copy = createEditableTrackerCopyInProject(data, "original", song, "editable");
    const added = editTrackerModuleInProject(copy, "editable", { type: "channel-add", id: "extra" });
    const next = trackerModuleSong((added.audioItems as Record<string, unknown>[])[1]);
    expect(next.trackerModule.channelMap).toEqual([0, 3, 17, 2]);
    const exported = writeTrackerModule(bytes, next);
    const again = parseTrackerModule(exported, "S3M", createHash("sha256").update(exported).digest("hex"));
    expect(again.patterns[0].trackerHiddenChannels).toEqual(song.patterns[0].trackerHiddenChannels);
  });
  it("accepts the native S3M tempo range", () => {
    const bytes = makeEditableS3mFixture(); const song = parseTrackerModule(bytes, "S3M", createHash("sha256").update(bytes).digest("hex"));
    song.bpm = 32;
    const data = { audioItems: [{ id: "original", name: "Tema", kind: "Musica", sourceAssetID: "asset" }], assets: [{ id: "asset", name: "source.s3m", kind: "Audio", metadata: { source: "Assets/source.s3m" } }] };
    const copy = createEditableTrackerCopyInProject(data, "original", song, "editable");
    expect(deriveAudioWorkspacePresentation(copy).items.find(item => item.id === "editable")!.warnings.filter(message => /BPM/.test(message))).toEqual([]);
  });
  it("creates an independent editable item and keeps the original item, asset and scene references", () => {
    const { data, copy } = setup(); expect(copy.audioItems).toHaveLength(2);
    expect((copy.audioItems as unknown[])[0]).toEqual(data.audioItems[0]);
    expect(copy.rooms).toEqual(data.rooms); expect(copy.assets).toEqual(data.assets);
    expect((copy.audioItems as Record<string, unknown>[])[1]).toMatchObject({ name: "Tema (editável)", sourceAssetID: "asset", volume: 100, synthesis: "PCM", format: "MOD" });
  });
  it("edits and clears just a note without clearing its instrument or effects", () => {
    const { copy, song } = setup(); const before = JSON.stringify(copy);
    const cell = { type: "cell" as const, patternID: song.patterns[0].id, channelID: song.patterns[0].channels[0].id, row: 0 };
    const edited = editTrackerModuleInProject(copy, "editable", { ...cell, fields: { note: "D4" } });
    const cleared = editTrackerModuleInProject(edited, "editable", { ...cell, fields: { note: "" } });
    const result = trackerModuleSong((cleared.audioItems as Record<string, unknown>[])[1]);
    expect(result.patterns[0].channels[0].notes[0]).toBe("---");
    expect(result.patterns[0].channels[0].trackerCells[0]).toMatchObject({ instrument: 1, effect: 15, parameter: 6 });
    expect(JSON.stringify(copy)).toBe(before);
    expect((cleared.audioItems as unknown[])[0]).toEqual((copy.audioItems as unknown[])[0]);
  });
  it("moves a whole tracker cell including its command, not just the displayed pitch", () => {
    const { copy, song } = setup(); const moved = editTrackerModuleInProject(copy, "editable", { type: "move-cell", patternID: song.patterns[0].id,
      channelID: song.patterns[0].channels[0].id, row: 0, direction: 1 });
    const channel = trackerModuleSong((moved.audioItems as Record<string, unknown>[])[1]).patterns[0].channels[0];
    expect(channel.notes[1]).toBe("C4"); expect(channel.trackerCells[1]).toMatchObject({ instrument: 1, effect: 15, parameter: 6 });
    expect(channel.notes[0]).toBe("---"); expect(channel.trackerCells[0]).toEqual({ instrument: 0, effect: 0, parameter: 0 });
  });
  it("duplicates 16 independent channels and creates blank 64-row patterns", () => {
    const { copy, song } = setup(); const duplicated = editTrackerModuleInProject(copy, "editable", { type: "pattern-add", id: "copy", name: "Cópia", sourcePatternID: song.patterns[0].id });
    const added = editTrackerModuleInProject(duplicated, "editable", { type: "pattern-add", id: "blank", name: "Vazio" });
    const result = trackerModuleSong((added.audioItems as Record<string, unknown>[])[1]);
    expect(new Set(result.patterns[2].channels.map(c => c.id)).size).toBe(16);
    expect(result.patterns[2].channels[0].trackerCells[0].effect).toBe(15);
    expect(result.patterns[3].channels[0].notes).toEqual(Array(64).fill("---"));
    expect(result.patterns[3].channels[0].trackerCells[0].effect).toBe(0);
    expect(result.patternOrder.at(-1)).toBe("blank");
  });
  it("adds and removes a physical channel consistently across all patterns", () => {
    const { copy, song } = setup(4); const added = editTrackerModuleInProject(copy, "editable", { type: "channel-add", id: "extra" });
    const next = trackerModuleSong((added.audioItems as Record<string, unknown>[])[1]);
    expect(next.patterns.every(p => p.channels.length === 5)).toBe(true); expect(next.trackerModule.channelMap).toHaveLength(5);
    const removed = editTrackerModuleInProject(added, "editable", { type: "channel-remove", patternID: song.patterns[0].id, channelID: next.patterns[0].channels[4].id });
    expect(trackerModuleSong((removed.audioItems as Record<string, unknown>[])[1]).patterns.every(p => p.channels.length === 4)).toBe(true);
  });
  it("rejects malformed note/effect edits and preserves the earlier project snapshot", () => {
    const { copy, song } = setup(); const before = JSON.stringify(copy);
    expect(() => editTrackerModuleInProject(copy, "editable", { type: "cell", patternID: song.patterns[0].id,
      channelID: song.patterns[0].channels[0].id, row: 0, fields: { effect: 16 } })).toThrow(/Efeito/);
    expect(JSON.stringify(copy)).toBe(before);
  });
  it("assigns a real module sample when inserting a note into a previously empty track", () => {
    const { copy, song } = setup(); const edited = editTrackerModuleInProject(copy, "editable", { type: "cell", patternID: song.patterns[0].id,
      channelID: song.patterns[0].channels[5].id, row: 4, fields: { note: "E4" } });
    const channel = trackerModuleSong((edited.audioItems as Record<string, unknown>[])[1]).patterns[0].channels[5];
    expect(channel.notes[4]).toBe("E4"); expect(channel.trackerCells[4].instrument).toBe(1);
  });
});
