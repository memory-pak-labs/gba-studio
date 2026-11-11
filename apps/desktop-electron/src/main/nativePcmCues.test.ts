import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGBAProjectFile } from "../../../../packages/project-contract/src/index.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

describe("native PCM action cues", () => {
  it("exports dialogue and all genre action cues through the SFX registry while retaining direct PCM events", () => {
    const project = parseGBAProjectFile(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8")).data as any;
    // Retain a PSG entry ahead of PCM to detect accidental use of the PCM index.
    const legacy = JSON.parse(readFileSync(new URL("../../fixtures/asset-provenance/racing-approved-manifest.json", import.meta.url), "utf8")).audioItems.find((item: any) => item.kind === "SFX");
    project.audioItems.unshift({ ...legacy, id: "legacy-psg", name: "legacy_psg", exportID: "legacy_psg" });
    for (const [index,item] of project.audioItems.entries()) {
      if (item.kind !== "SFX" || item.id === "legacy-psg") continue;
      item.format = "WAV"; item.sourceAssetID = `native-cue-${index}`;
      delete item.patterns; delete item.patternOrder;
      project.assets.push({ id: item.sourceAssetID, name: `${item.exportID}.wav`, kind: "SFX", metadata: { source: `Assets/audio/${item.exportID}.wav` } });
    }
    const before = JSON.stringify(project);
    const pack = buildAssetcAudioPackGeneration(project)!;
    const contract = buildEngineExportProjectContract(project);
    expect(contract.requires.features).toContain("audio.pcm_sfx_aliases");
    expect(pack.document.pcm).toHaveLength(58);
    expect(pack.document.sfx.filter(item => item.pcm)).toHaveLength(58);
    const textIndex = pack.document.sfx.findIndex(item => item.name === "farol_sfx_texto");
    expect(textIndex).toBeGreaterThan(pack.document.pcm.findIndex(item => item.name === "farol_sfx_texto"));
    const objects: any[] = [];
    const walk = (value: any) => { if (!value || typeof value !== "object") return; objects.push(value); Object.values(value).forEach(walk); };
    walk(contract);
    expect(objects.filter(value => value.op === "set_text_sfx").length).toBeGreaterThan(10);
    expect(objects.filter(value => value.op === "set_text_sfx").every(value => value.sfx === textIndex)).toBe(true);
    const actionCues = objects.filter(value => value.action_sounds && Object.values(value.action_sounds).every(index => typeof index === "number")).map(value => value.action_sounds);
    expect(actionCues.length).toBeGreaterThanOrEqual(4);
    for (const cues of actionCues) for (const index of Object.values(cues)) {
      expect(pack.document.sfx[index as number]?.pcm).toBeTruthy();
    }
    expect(objects.some(value => value.op === "play_pcm_sfx")).toBe(true);
    expect(JSON.stringify(project)).toBe(before);
  });
});
