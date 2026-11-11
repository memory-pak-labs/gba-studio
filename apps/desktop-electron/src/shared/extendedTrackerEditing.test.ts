import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeXmFixture, makeItFixture } from "./extendedTrackerFixtures.js";
import { parseTrackerModule, validateTrackerModuleSong, writeTrackerModule } from "./trackerModule.js";
import { createEditableTrackerCopyInProject, editTrackerModuleInProject, trackerModuleSong } from "./trackerModuleEditing.js";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";

describe("XM/IT project editing", () => {
  it.each(["XM", "IT"] as const)("preserves all %s rows, edits beyond row 64 and reopens native output", format => {
    const bytes = format === "XM" ? makeXmFixture(2, 96) : makeItFixture(63, 96);
    const song = parseTrackerModule(bytes, format, createHash("sha256").update(bytes).digest("hex"));
    const original = { audioItems: [{ id: "original", name: "Tema", kind: "Musica", sourceAssetID: "source" }], assets: [{ id: "source", name: `source.${format.toLowerCase()}`, kind: "Audio", metadata: { source: `source.${format.toLowerCase()}` } }] };
    const before = JSON.stringify(original);
    let data = createEditableTrackerCopyInProject(original, "original", song, "copy");
    data = editTrackerModuleInProject(data, "copy", { type: "cell", patternID: song.patterns[0].id, channelID: song.patterns[0].channels[0].id, row: 80, fields: { note: "D4", volume: format === "XM" ? 0x40 : 48 } });
    data = editTrackerModuleInProject(data, "copy", { type: "channel-add", id: "extra" });
    const added = trackerModuleSong((data.audioItems as Record<string, unknown>[])[1]).patterns[0].channels.at(-1)!;
    data = editTrackerModuleInProject(data, "copy", { type: "cell", patternID: song.patterns[0].id, channelID: added.id, row: 81, fields: { note: "G4" } });
    const reopened = JSON.parse(JSON.stringify(data));
    const edited = trackerModuleSong(reopened.audioItems[1]); validateTrackerModuleSong(edited);
    const item = deriveAudioWorkspacePresentation(reopened).items.find(i => i.id === "copy")!;
    expect(item.stepCount).toBe(96); expect(item.previewRows[0].cells).toHaveLength(96); expect(item.previewRows[0].cells[80].note).toBe("D4");
    expect(edited.patterns[0].channels.at(-1)!.notes).toHaveLength(96);
    const output = writeTrackerModule(bytes, edited), decoded = parseTrackerModule(output, format, createHash("sha256").update(output).digest("hex"));
    expect(decoded.patterns[0].channels.some(c => c.notes[80] === "D4")).toBe(true);
    expect(decoded.patterns[0].channels.some(c => c.notes[81] === "G4")).toBe(true); expect(JSON.stringify(original)).toBe(before);
    expect(() => editTrackerModuleInProject(data, "copy", { type: "cell", patternID: song.patterns[0].id, channelID: song.patterns[0].channels[0].id, row: 96, fields: { note: "E4" } })).toThrow(/Linha/);
  });
});
