import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { createBlankProjectData } from "../shared/newProject.js";
import { updateSettingsFieldInProject } from "../shared/settingsWorkspace.js";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import { selectAudioPreviewData } from "./engineAudioPreview.js";
import { createAudioItemInProject } from "../shared/audioWorkspace.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "../shared/previewRuntime.js";

describe("project PCM mixing rate", () => {
  it("preserves the project output rate in isolated audio previews and simulated events", () => {
    const data = createAudioItemInProject(createBlankProjectData({ name: "Mix", includeStarterContent: true }), { id: "song", name: "Tema", kind: "Musica", synthesis: "PCM" });
    (data.settings as any).audio.mixingRate = 21024;
    const before = JSON.stringify(data);
    const selected = selectAudioPreviewData({ data, audioID: "song", requestID: "mix", scope: "sequence" });
    expect((selected.settings as any).audio.mixingRate).toBe(21024);
    expect(JSON.stringify(data)).toBe(before);
    data.events = [{ name: "mix", category: "Cena", steps: [{ command: "set_audio_mixing_rate 10512" }] }];
    const runtime = createPreviewRuntime(data);
    expect(runtime.audioMix.mixingRate).toBe(21024);
    expect(runPreviewRuntimeEvent(runtime, "mix").audioMix.mixingRate).toBe(10512);
    expect(runtime.audioMix.mixingRate).toBe(21024);
  });
  it("defaults independently of the WAV conversion rate and exports explicit rates", () => {
    const data = createBlankProjectData({ name: "Mix", includeStarterContent: true });
    expect(buildEngineExportProjectContract(data).audio_mixing_rate).toBe(31536);
    for (const rate of [10512, 21024, 31536]) {
      const changed = updateSettingsFieldInProject(data, "audio", "mixingRate", rate);
      expect(changed).not.toBe(data);
      expect((changed.settings as any).audio.mixingRate).toBe(rate);
      expect((changed.settings as any).audio.sampleRate).toBe((data.settings as any).audio.sampleRate);
      expect(buildEngineExportProjectContract(changed).audio_mixing_rate).toBe(rate);
    }
    expect(updateSettingsFieldInProject(data, "audio", "mixingRate", 16000)).toBe(data);
    const bad = structuredClone(data); (bad.settings as any).audio.mixingRate = 16000;
    expect(() => buildEngineExportProjectContract(bad)).toThrow(/mixagem/i);
  });
  it("exports dynamic changes and offers only supported values in the event inspector", () => {
    const data = createBlankProjectData({ name: "Mix", includeStarterContent: true });
    data.events = [{ name: "mix", category: "Cena", steps: [{ command: "set_audio_mixing_rate 21024" }] }];
    const step = deriveEventsWorkspacePresentation(data).groups[0]!.events[0]!.steps[0]!;
    expect(step.commandParameters[0]?.label).toBe("Frequência de mixagem (Hz)");
    expect(step.commandParameters[0]?.options).toEqual(["10512", "21024", "31536"]);
    expect(buildEngineExportProjectContract(data).topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "mix", script: [{ op: "set_audio_mixing_rate", rate: 21024 }] })
    ]));
    (data.events as any[])[0].steps[0].command = "set_audio_mixing_rate 16000";
    expect(() => buildEngineExportProjectContract(data)).toThrow(/mixagem/i);
  });
});
