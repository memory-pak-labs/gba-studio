import { describe, expect, it } from "vitest";
import { planAssetDeletion, resolveAssetDeletion } from "../shared/assetDeletion.js";
import { planAnimationDeletion, resolveAnimationDeletion } from "../shared/animationDeletion.js";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { pushProjectHistory, undoProjectHistory } from "../shared/projectHistory.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

const example = buildProjectFromTemplate("exemplo-gba", { name: "Excluir recursos" });
const list = (data: Record<string, unknown>, key: string) => data[key] as Record<string, unknown>[];
const asset = (id: string, width = 16, kind = "Sprite") => ({
  id, name: `${id}.png`, kind, metadata: { source: `Assets/${id}.png`, width, height: 16, colorMode: "4bpp" }
});
const clip = (id: string, name: string, spriteSheet = "npc.png") => ({ id, name, spriteSheet, frameCount: 2 });

describe("visual resource deletion", () => {
  it("replaces or unlinks a frame background in the real template and can restore it with one undo", () => {
    const id = "startup-fade-a-00";
    const plan = planAssetDeletion(example, [id]);
    expect(plan.usages).toEqual(expect.arrayContaining([expect.stringContaining("Cena: logo · quadro")]));
    expect(plan.replacements.some(choice => choice.value === "startup-fade-a-01")).toBe(true);
    expect(plan.canUnlink).toBe(true);
    for (const replacement of [null, "startup-fade-a-01"]) {
      const result = resolveAssetDeletion(example, [id], replacement);
      expect(result).not.toBe(example);
      expect(list(result, "assets").some(item => item.id === id)).toBe(false);
      expect(JSON.stringify(result.scenas)).not.toContain("startup-fade-a-00-gba.png");
      expect(() => buildEngineExportProjectContract(result)).not.toThrow();
      expect(undoProjectHistory(pushProjectHistory({ present: example, undoStack: [], redoStack: [] }, result)).present).toBe(example);
    }
  });

  it("requires matching graphics layout for positional references and updates saved RLE sources", () => {
    const data = {
      assets: [asset("old"), asset("replacement"), asset("wrong", 32)],
      scenas: [{ name: "A", tileLayers: [{ tileSourceAssetNames: { encoding: "rle-v1", runs: [["old.png", 3], [null, 2]] } }] }],
      animations: [{ id: "anim", name: "idle", spriteSheet: "old.png", frames: [{ tiles: [{ sourceSheet: "old.png" }] }] }]
    };
    const plan = planAssetDeletion(data, ["old"]);
    expect(plan.canUnlink).toBe(false);
    expect(plan.replacements.map(choice => choice.value)).toEqual(["replacement"]);
    expect(resolveAssetDeletion(data, ["old"], null)).toBe(data);
    expect(resolveAssetDeletion(data, ["old"], "wrong")).toBe(data);
    const edited = resolveAssetDeletion(data, ["old"], "replacement");
    expect(JSON.stringify(edited.scenas)).toContain('["replacement.png",3]');
    expect(JSON.stringify(edited.animations)).not.toContain("old.png");
  });

  it("replaces a source sound by ID without renaming its logical item or breaking a menu cue", () => {
    const id = String(list(example, "audioItems").find(item => item.name === "menu-navegar-v1.wav")!.sourceAssetID);
    const plan = planAssetDeletion(example, [id]);
    expect(plan.canUnlink).toBe(false);
    expect(plan.usages).toEqual(expect.arrayContaining([expect.stringContaining("Fonte de áudio")]));
    const replacement = plan.replacements[0]!;
    expect(replacement).toBeDefined();
    const next = resolveAssetDeletion(example, [id], replacement.value);
    expect(list(next, "audioItems").find(item => item.name === "menu-navegar-v1.wav")?.sourceAssetID).toBe(replacement.value);
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
  });

  it("removes an archived original without unlinking the renewed source or its menu cues", () => {
    const archivedID = "initial-menu-navegar-v1";
    const plan = planAssetDeletion(example, [archivedID]);
    expect(plan.canUnlink).toBe(true);
    const next = resolveAssetDeletion(example, [archivedID], null);
    expect(next.audioItems).toEqual(example.audioItems);
    expect(next.rooms).toEqual(example.rooms);
    expect(next.scenas).toEqual(example.scenas);
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
  });

  it("unlinks assets in a batch without dropping other references or changing unrelated script text", () => {
    const data = {
      assets: [asset("a"), asset("b"), asset("keep")],
      scenas: [{ name: "A", referenceImages: [{ assetName: "a.png" }, { assetName: "b.png" }, { assetName: "keep.png" }] }],
      events: [{ name: "Fala", command: "show_dialogue a.png" }]
    };
    const result = resolveAssetDeletion(data, ["a", "b"], null);
    expect(list(result, "scenas")[0]?.referenceImages).toEqual([{ assetName: "keep.png" }]);
    expect(result.events).toEqual(data.events);
  });

  it("matches animation references by sheet, preserving homonyms and legacy commands", () => {
    const data = {
      animations: [clip("a", "idle"), clip("b", "idle", "other.png"), clip("replacement", "rest")],
      actors: [{ id: "one", name: "One", spriteSheet: "npc.png", animationName: "idle" },
        { id: "two", name: "Two", spriteSheet: "other.png", animationName: "idle" }],
      events: [{ name: "Script", commands: "set_actor_animation one idle\nset_actor_animation two idle" }]
    };
    const plan = planAnimationDeletion(data, "a");
    expect(plan.usages).toEqual(["Ator: One", "Evento: Script"]);
    expect(plan.replacements.map(choice => choice.value)).toEqual(["replacement"]);
    const replaced = resolveAnimationDeletion(data, "a", "replacement");
    expect(list(replaced, "events")[0]?.commands).toBe("set_actor_animation one rest\nset_actor_animation two idle");
    expect(list(replaced, "actors").map(actor => actor.animationName)).toEqual(["rest", "idle"]);
    const unlinked = resolveAnimationDeletion(data, "a", null);
    expect(list(unlinked, "events")[0]?.commands).toBe("noop\nset_actor_animation two idle");
    expect(list(unlinked, "actors").map(actor => actor.animationName)).toEqual([undefined, "idle"]);
  });

  it("protects the last clip in the default state used implicitly by an actor", () => {
    const data = {
      animations: [clip("a", "idle"), clip("replacement", "rest")],
      animationStates: [{ id: "default", spriteSheet: "npc.png", animationType: "fixed", animationIDs: ["a"] }],
      actors: [{ id: "npc", spriteSheet: "npc.png" }]
    };
    const plan = planAnimationDeletion(data, "a");
    expect(plan.canUnlink).toBe(false);
    expect(plan.replacements.map(choice => choice.value)).toEqual(["replacement"]);
    expect(resolveAnimationDeletion(data, "a", null)).toBe(data);
  });

  it("replaces the clip in a required state without losing the state or its callers", () => {
    const id = "farol-relay-faulty";
    const plan = planAnimationDeletion(example, id);
    expect(plan.usages.some(usage => usage.includes("Estado de animação: faulty"))).toBe(true);
    expect(plan.canUnlink).toBe(false);
    expect(plan.replacements.some(choice => choice.value === "farol-relay-working")).toBe(true);
    const result = resolveAnimationDeletion(example, id, "farol-relay-working");
    expect(list(result, "animationStates").find(state => state.id === "farol-relay-faulty-state")?.animationIDs).toEqual(["farol-relay-working"]);
    expect(() => buildEngineExportProjectContract(result)).not.toThrow();
  });
});
