import { renameAssetInProject } from "./filesWorkspace.js";
import { projectReferenceDeletionGuard } from "./projectReferenceUsages.js";
import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { audioContractIssues } from "./audioContract.js";
import { buildAssetcAudioPackGeneration } from "./engineProjectExport.js";
import { validateAudioSchemaCoverage } from "../../../../packages/project-contract/src/index.js";
import { deriveAudioWorkspacePresentation, deriveAudioPreviewPlaybackPlan, updateAudioChannelFieldsInProject } from "./audioWorkspace.js";

function fixture() {
  const data = createBlankProjectData({ name: "Samples" });
  data.assets = [{ id: "wav-a", name: "Piano suave.wav", kind: "SFX", metadata: { source: "assets/Piano suave.wav" } }];
  data.audioItems = [{ id: "song", name: "Song", kind: "Musica", volume: 100, bpm: 120, loops: true, patternOrder: ["p1", "p2"], patterns: ["p1", "p2"].map(id => ({ id, name: id, steps: 2, channels: [{ id: "voice", type: "pulse1", instrument: "Pulse Warm", volume: 100, notes: ["C4", "C5"] }] })) }];
  return data;
}

describe("sample instruments in the piano roll", () => {
  it("persists a stable sample ID, keeps notes and permits returning to PSG", () => {
    const data = fixture();
    const changed = updateAudioChannelFieldsInProject(data, "song", { channelID: "voice", sampleAssetID: "wav-a", sampleRootNote: "C4", sampleLoop: true });
    expect(changed).not.toBe(data);
    const saved = JSON.parse(JSON.stringify(changed));
    expect(saved.audioItems[0].patterns[0].channels[0]).toMatchObject({ sampleAssetID: "wav-a", sampleLoop: true, notes: ["C4", "C5"], instrument: "Pulse Warm" });
    expect(saved.audioItems[0].patterns[1].channels[0].sampleAssetID).toBeUndefined();
    expect(updateAudioChannelFieldsInProject(saved, "song", { channelID: "voice", sampleAssetID: null }).audioItems).toEqual(data.audioItems);
  });
  it("exports a deduplicated sample bank and uses the same pitch in preview", () => {
    const data = updateAudioChannelFieldsInProject(fixture(), "song", { channelID: "voice", sampleAssetID: "wav-a", sampleRootNote: "C4", sampleLoop: true });
    const pack = buildAssetcAudioPackGeneration(data)!;
    expect(pack.sourceCopies).toHaveLength(1);
    expect(pack.document.tracker[0].samples).toEqual([{ asset_id: "wav-a", wav: "sample_wav_a.wav", loop: true }]);
    expect(pack.document.tracker[0].patterns![0].steps[0]).toMatchObject({ sample_index: 0, sample_only: true, sample_pitch_ratio: 1 });
    expect(pack.document.tracker[0].patterns![0].steps[1].sample_pitch_ratio).toBeCloseTo(2);
    const item = deriveAudioWorkspacePresentation(data).items[0];
    expect(item.errors).toEqual([]);
    const notes = deriveAudioPreviewPlaybackPlan(item).steps.flatMap(step => step.notes);
    expect(notes[0].sample).toMatchObject({ source: "assets/Piano suave.wav", loop: true, pitchRatio: 1 });
    expect(notes[1].sample?.pitchRatio).toBeCloseTo(2);
  });
  it("blocks missing samples, invalid tuning and sample SFX instead of exporting silent or stale audio", () => {
    const data = fixture();
    const song = (data.audioItems as Record<string, any>[])[0];
    song.patterns[0].channels[0].sampleAssetID = "missing";
    song.patterns[0].channels[0].sampleRootNote = "wrong";
    expect(audioContractIssues(song, data).filter(issue => issue.level === "error").length).toBeGreaterThanOrEqual(2);
    song.kind = "SFX";
    expect(audioContractIssues(song, data).some(issue => issue.message.includes("músicas"))).toBe(true);
  });
  it("keeps sample references when assets are renamed and protects referenced WAVs from deletion", () => {
    const data = updateAudioChannelFieldsInProject(fixture(), "song", { channelID: "voice", sampleAssetID: "wav-a" });
    const renamed = renameAssetInProject(data, "wav-a", "Piano novo.wav");
    expect(deriveAudioWorkspacePresentation(renamed).sampleInstruments).toContainEqual({ id: "wav-a", name: "Piano novo.wav" });
    expect(projectReferenceDeletionGuard(renamed, { kind: "asset", id: "wav-a", name: "Piano novo.wav" }).canDelete).toBe(false);
    expect(buildAssetcAudioPackGeneration(renamed)?.sourceCopies[0].source).toBe("assets/Piano suave.wav");
  });
  it("rejects normalized sample filename collisions rather than selecting the wrong WAV", () => {
    const data = updateAudioChannelFieldsInProject(fixture(), "song", { channelID: "voice", sampleAssetID: "wav-a" });
    (data.assets as Array<Record<string, unknown>>).push({ id: "wav_a", name: "Outro.wav", kind: "SFX", metadata: { source: "assets/Outro.wav" } });
    const songs = data.audioItems as Array<{ patterns: Array<{ channels: Array<{ sampleAssetID?: string }> }> }>;
    songs[0].patterns[1].channels[0].sampleAssetID = "wav_a";
    expect(() => buildAssetcAudioPackGeneration(data)).toThrow("mesmo arquivo de exportação");
  });
  it("does not mutate existing PSG songs or add sample data to their export", () => {
    const data = fixture();
    const before = JSON.stringify(data);
    const pack = buildAssetcAudioPackGeneration(data)!;
    expect(pack.document.tracker[0].samples).toBeUndefined();
    expect(pack.document.tracker[0].patterns![0].steps[0].sample_index).toBeUndefined();
    expect(JSON.stringify(data)).toBe(before);
  });
  it("accepts the editor's channel volume percentage in the saved project contract", () => {
    const data = fixture();
    const song = (data.audioItems as Array<Record<string, unknown>>)[0];
    song.format = "COMPOSED";
    for (const pattern of song.patterns as Array<{ name: string; channels: Array<{ name?: string }> }>) pattern.channels[0].name = "Melody";
    expect(validateAudioSchemaCoverage(data)).toEqual([]);
  });
});
