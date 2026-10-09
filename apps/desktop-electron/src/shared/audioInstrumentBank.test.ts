import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { createAudioInstrumentFromChannel, updateAudioInstrumentInProject, removeAudioInstrumentFromProject } from "./audioInstruments.js";
import { createAudioItemInProject, updateAudioChannelFieldsInProject, deriveAudioWorkspacePresentation, deriveAudioPreviewPlaybackPlan } from "./audioWorkspace.js";
import { buildAssetcAudioPackGeneration } from "./engineProjectExport.js";
import { projectReferenceDeletionGuard } from "./projectReferenceUsages.js";
import { splitProjectResources, joinSplitProjectResources } from "./projectResourceFormat.js";
import { validateAudioSchemaCoverage } from "../../../../packages/project-contract/src/index.js";

function fixture() {
  let data = createBlankProjectData({ name: "Banco" });
  data.assets = [{ id: "wav", name: "Piano.wav", kind: "SFX", metadata: { source: "assets/piano.wav" } }];
  for (const id of ["a", "b"]) data = createAudioItemInProject(data, { id, name: id, kind: "Musica" });
  const row = deriveAudioWorkspacePresentation(data).items.find(item => item.id === "a")!.previewRows[0];
  data = updateAudioChannelFieldsInProject(data, "a", { channelID: row.id, sampleAssetID: "wav", sampleLoop: true, sampleRootNote: "C4" });
  return { data, channelID: row.id };
}
function shared() {
  const { data, channelID } = fixture();
  let next = createAudioInstrumentFromChannel(data, "a", channelID, { id: "piano", name: "Piano suave" });
  const second = deriveAudioWorkspacePresentation(next).items.find(item => item.id === "b")!.previewRows[0];
  next = updateAudioChannelFieldsInProject(next, "b", { channelID: second.id, instrumentID: "piano", pan: 127 });
  return next;
}
describe("shared sample instrument bank", () => {
  it("creates an immutable shared definition and retains existing notes", () => {
    const { data, channelID } = fixture(); const before = JSON.stringify(data);
    const next = createAudioInstrumentFromChannel(data, "a", channelID, { id: "piano", name: "Piano suave" });
    expect(JSON.stringify(data)).toBe(before);
    expect(next.audioInstruments).toEqual([expect.objectContaining({ id: "piano", name: "Piano suave", sampleAssetID: "wav", sampleLoop: true })]);
    const row = deriveAudioWorkspacePresentation(next).items.find(item => item.id === "a")!.previewRows[0];
    expect(row.instrumentID).toBe("piano");
    expect(row.cells).toEqual(deriveAudioWorkspacePresentation(data).items.find(item => item.id === "a")!.previewRows[0].cells);
  });
  it("resolves edits in every consumer, preview and export without copying stale definitions", () => {
    const data = shared();
    const next = updateAudioInstrumentInProject(data, "piano", { sampleRootNote: "C5", sampleLoop: false, envelope: "Short Decay" });
    const items = deriveAudioWorkspacePresentation(next).items;
    for (const item of items) {
      expect(item.previewRows[0]).toMatchObject({ sampleRootNote: "C5", sampleLoop: false, envelope: "Short Decay" });
      const note = deriveAudioPreviewPlaybackPlan(item).steps.flatMap(step => step.notes).find(note => note.sample)!;
      expect(note.sample?.loop).toBe(false);
      expect(note.sample?.pitchRatio).toBeCloseTo(note.frequency! / 523);
    }
    const pack = buildAssetcAudioPackGeneration(next)!;
    expect(pack.sourceCopies).toHaveLength(1);
    expect(pack.document.tracker.every(track => track.samples?.[0].loop === false)).toBe(true);
    expect(deriveAudioWorkspacePresentation(data).items[0].previewRows[0].sampleLoop).toBe(true);
  });
  it("persists the bank and enforces safe deletion of instruments and WAVs", () => {
    const data = JSON.parse(JSON.stringify(shared()));
    const split = splitProjectResources(data);
    const restored = joinSplitProjectResources(split.manifest, split.resources);
    expect(restored.audioInstruments).toEqual(data.audioInstruments);
    expect(deriveAudioWorkspacePresentation(restored).items[1].previewRows[0].instrumentID).toBe("piano");
    expect(validateAudioSchemaCoverage(data)).toEqual([]);
    expect(removeAudioInstrumentFromProject(data, "piano")).toBe(data);
    expect(projectReferenceDeletionGuard(data, { kind: "asset", id: "wav", name: "Piano.wav" }).canDelete).toBe(false);
    for (const item of deriveAudioWorkspacePresentation(data).items) {
      const next = updateAudioChannelFieldsInProject(data, item.id, { channelID: item.previewRows[0].id, instrumentID: null, sampleAssetID: null });
      data.audioItems = next.audioItems;
    }
    expect(removeAudioInstrumentFromProject(data, "piano").audioInstruments).toEqual([]);
  });
  it("blocks dangling links, duplicate bank IDs and invalid saved panorama", () => {
    const data = shared();
    (data.audioInstruments as any[]).push({ ...(data.audioInstruments as any[])[0] });
    expect(validateAudioSchemaCoverage(data).length).toBeGreaterThan(0);
    const { data: bad, channelID } = fixture();
    expect(updateAudioChannelFieldsInProject(bad, "a", { channelID, instrumentID: "missing" })).toBe(bad);
    ((bad.audioItems as any[])[0].patterns[0].channels[0]).instrumentID = "missing";
    expect(deriveAudioWorkspacePresentation(bad).items[0].errors.join(" ")).toContain("instrumento");
    ((bad.audioItems as any[])[0].patterns[0].channels[0]).pan = 128;
    expect(validateAudioSchemaCoverage(bad).length).toBeGreaterThan(0);
  });
  it("exports and previews channel panorama consistently", () => {
    const data = shared(); const item = deriveAudioWorkspacePresentation(data).items.find(item => item.id === "b")!;
    expect(item.previewRows[0].pan).toBe(127);
    expect(deriveAudioPreviewPlaybackPlan(item).steps.flatMap(step => step.notes).find(note => note.sample)?.pan).toBe(127);
    expect(buildAssetcAudioPackGeneration(data)!.document.tracker[1].patterns![0].steps.find(step => step.sample_only)?.pan).toBe(127);
  });
});
