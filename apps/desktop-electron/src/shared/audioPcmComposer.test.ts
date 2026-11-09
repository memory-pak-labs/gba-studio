import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { audioContractIssues } from "./audioContract.js";
import { createAudioItemInProject, createAudioChannelInProject, updateAudioChannelFieldsInProject, deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { buildAssetcAudioPackGeneration, compileComposedMusicaToTracker } from "./engineProjectExport.js";
import { defaultPcmSfx, renderPcmSfx, updatePcmSfxInProject } from "./audioPcm.js";
import { planAssetDeletion, resolveAssetDeletion } from "./assetDeletion.js";

const blank = () => createBlankProjectData({ name: "PCM composer", includeStarterContent: false });
function song() {
  return createAudioItemInProject(blank(), { id: "song", name: "Tema PCM", kind: "Musica", synthesis: "PCM" });
}

describe("PCM authored audio", () => {
  it("creates sixteen independent PCM lanes and refuses a seventeenth without altering the project", () => {
    let data = song();
    const audio = () => (data.audioItems as any[])[0];
    expect(audio().synthesis).toBe("PCM");
    expect(audio().patterns[0].channels).toHaveLength(4);
    for (let index = 5; index <= 16; index++) data = createAudioChannelInProject(data, "song", {
      id: `pcm-${index}`, name: `Faixa ${index}`, type: "pcm", patternID: audio().patterns[0].id
    });
    expect(audio().patterns[0].channels).toHaveLength(16);
    const before = data;
    expect(createAudioChannelInProject(data, "song", { id: "overflow", name: "Extra", type: "pcm", patternID: audio().patterns[0].id })).toBe(before);
    expect(audioContractIssues(audio(), data).filter(issue => issue.level === "error")).toEqual([]);
    expect(audioContractIssues({ ...audio(), patterns: [{ ...audio().patterns[0], channels: [...audio().patterns[0].channels, { id: "overflow", type: "pcm" }] }] }, data).some(issue => issue.level === "error")).toBe(true);
  });

  it("exports all PCM voices, their pitch, gain, pan and rests without remapping to PSG", () => {
    const data = song(); const audio = (data.audioItems as any[])[0];
    audio.patterns[0].steps = 2;
    audio.patterns[0].channels = Array.from({ length: 16 }, (_, index) => ({ id: `v${index}`, name: `Faixa ${index + 1}`, type: "pcm", instrument: "PCM Triangle", envelope: "Short Decay", volume: 70, pan: index ? 127 : -127, notes: [index ? "C5" : "C4", "---"] }));
    const tracker = compileComposedMusicaToTracker(audio, "theme", data)!;
    expect(tracker.samples).toHaveLength(1);
    const steps = tracker.patterns![0].steps;
    expect(steps).toHaveLength(32);
    expect(steps.slice(0, 16).map(step => step.channel)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(steps.every(step => step.sample_only)).toBe(true);
    expect(steps[0]).toMatchObject({ sample_pitch_ratio: 1, pan: -127 });
    expect(steps[1].sample_pitch_ratio).toBeCloseTo(523 / 262);
    expect(steps.slice(16).every(step => step.volume === 0)).toBe(true);
    expect(steps.filter(step => step.duration_frames > 0)).toHaveLength(2);
    expect(deriveAudioWorkspacePresentation(data).items[0].previewRows).toHaveLength(16);
  });

  it("keeps independent sample bindings and instrument references on repeated PCM lane types", () => {
    let data = song(); const audio = (data.audioItems as any[])[0];
    data.assets = [...data.assets as any[], { id: "sample", name: "bell.wav", kind: "Audio", metadata: { source: "Assets/audio/bell.wav" } }];
    const [first, second] = audio.patterns[0].channels;
    data = updateAudioChannelFieldsInProject(data, "song", { channelID: first.id, sampleAssetID: "sample", sampleRootNote: "C5", sampleLoop: true });
    const updated = (data.audioItems as any[])[0];
    expect(updated.patterns[0].channels[0]).toMatchObject({ sampleAssetID: "sample", sampleRootNote: "C5", sampleLoop: true });
    expect(updated.patterns[0].channels.find((channel: any) => channel.id === second.id).sampleAssetID).toBeUndefined();
    const pack = buildAssetcAudioPackGeneration(data)!;
    expect(pack.sourceCopies.some(copy => copy.id === "sample")).toBe(true);
  });

  it("renders a reproducible PCM effect and exports the same samples through a native SFX alias", () => {
    let data = createAudioItemInProject(blank(), { id: "hit", name: "Impacto PCM", kind: "SFX", synthesis: "PCM" });
    data = updatePcmSfxInProject(data, "hit", { durationMs: 400, frequencyStart: 880, frequencyEnd: 110, attackMs: 4, releaseMs: 90, waveform: "triangle", noiseMix: 25 });
    const audio = (data.audioItems as any[])[0]; const settings = { ...defaultPcmSfx(), ...audio.pcmSfx };
    const rendered = renderPcmSfx(settings);
    expect(rendered).toEqual(renderPcmSfx(settings));
    expect(rendered).toHaveLength(Math.round(31536 * 0.4));
    expect(rendered[0]).toBe(0); expect(rendered.at(-1)).toBe(0);
    expect(Math.max(...rendered)).toBeGreaterThan(20); expect(Math.min(...rendered)).toBeGreaterThanOrEqual(-127);
    const pack = buildAssetcAudioPackGeneration(data)!;
    expect(pack.document.pcm[0]).toMatchObject({ name: "impacto_pcm", sample_rate_hz: 31536, samples: rendered });
    expect(pack.document.sfx[0]).toMatchObject({ name: "impacto_pcm", pcm: "impacto_pcm", tones: [] });
    expect(pack.document.tracker).toHaveLength(0);
    expect(audioContractIssues(audio, data).filter(issue => issue.level === "error")).toEqual([]);
  });

  it("preserves existing PSG compositions when a PCM item is added and edited", () => {
    let data = createAudioItemInProject(blank(), { id: "legacy", name: "Tema PSG", kind: "Musica" });
    const original = JSON.stringify(data.audioItems);
    data = createAudioItemInProject(data, { id: "new", name: "Novo PCM", kind: "SFX", synthesis: "PCM" });
    data = updatePcmSfxInProject(data, "new", { durationMs: 320, noiseMix: 55 });
    expect(JSON.stringify([(data.audioItems as any[])[0]])).toBe(original);
    expect((data.audioItems as any[])[0].patterns[0].channels.map((c: any) => c.type)).toEqual(["pulse1", "pulse2", "wave", "noise"]);
  });

  it("tracks a sample effect for replacement and unlinking without leaving an invalid source", () => {
    let data = createAudioItemInProject(blank(), { id: "hit", name: "Hit", kind: "SFX", synthesis: "PCM" });
    data.assets = [...data.assets as any[], { id: "sample", name: "hit.wav", kind: "Audio", metadata: { source: "Assets/audio/hit.wav" } }];
    data = updatePcmSfxInProject(data, "hit", { source: "sample", sampleAssetID: "sample" });
    const pack = buildAssetcAudioPackGeneration(data)!;
    expect(pack.document.pcm[0].transform).toMatchObject({ duration_ms: 300, trim_start_ms: 0, pitch_semitones: 0 });
    expect(pack.sourceCopies.some(copy => copy.id === "sample")).toBe(true);
    expect(planAssetDeletion(data, ["sample"]).canUnlink).toBe(true);
    const next = resolveAssetDeletion(data, ["sample"], null);
    expect((next.audioItems as any[])[0].pcmSfx).toMatchObject({ source: "synth", sampleAssetID: null });
    expect((data.audioItems as any[])[0].pcmSfx.source).toBe("sample");
    expect(audioContractIssues((next.audioItems as any[])[0], next).filter(issue => issue.level === "error")).toEqual([]);
  });
});
