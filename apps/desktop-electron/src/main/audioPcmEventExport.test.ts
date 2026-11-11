import { describe, expect, it } from "vitest";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { createAudioItemInProject, updateAudioItemFieldsInProject } from "../shared/audioWorkspace.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";

function fixture(command: string) {
  let data = createAudioItemInProject(nativeEventFixture([command]), { id: "hit", name: "Hit", kind: "SFX", synthesis: "PCM" });
  (data.scenas as any[])[0].eventBindings = { onInit: "boot" };
  data = updateAudioItemFieldsInProject(data, "hit", { volume: 20 });
  return data;
}
describe("PCM authored event export", () => {
  it("uses the native SFX alias and its authored gain for default play_sfx events", () => {
    const data = fixture("play_sfx Hit");
    const contract = buildEngineExportProjectContract(data);
    expect(contract.topdown_project!.rooms[0].on_enter).toContainEqual({ op: "play_sfx", index: 0 });
    expect(buildAssetcAudioPackGeneration(data)!.document.sfx[0]).toMatchObject({ pcm: "hit", pcm_volume: 3 });
  });
  it("retains explicit per-event PCM gain and priority overrides", () => {
    const contract = buildEngineExportProjectContract(fixture("play_sfx Hit 60 12"));
    expect(contract.topdown_project!.rooms[0].on_enter).toContainEqual({ op: "play_pcm_sfx", index: 0, volume: 9, priority: 12 });
  });
});
