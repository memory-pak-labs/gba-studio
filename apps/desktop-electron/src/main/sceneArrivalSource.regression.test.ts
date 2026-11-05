import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGBAProjectFile, type GBAProjectData } from "../shared/projectFile.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

function example() {
  return parseGBAProjectFile(readFileSync(new URL(
    "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url
  ), "utf8")).data;
}

function prologue(data: GBAProjectData) {
  return buildEngineExportProjectContract(data).cutscene_project!.scenes.find(scene => scene.name === "prologo")!;
}

function departureCommand(data: GBAProjectData, command: string) {
  const events = data.events as Array<{ name: string; steps: Array<{ command: string }> }>;
  events.find(event => event.name === "prologo_partir")!.steps[1]!.command = command;
}

describe("arrival connection uses the source scene", () => {
  it.each([false, true])("uses the prologue arrival for campaign advance and skip, reversed=%s", reversed => {
    const data = example();
    const connections = (data.editorState as { scenaConnections: unknown[] }).scenaConnections;
    if (reversed) connections.reverse();
    const scene = prologue(data);
    // The 88,50 entry marker uses the existing one-tile inward arrival rule.
    const arrival = { op: "warp_runtime", runtime: "topdown", room: 0, x: 704, y: 392 };
    expect(scene.steps.flatMap(step => step.script ?? [])).toContainEqual(arrival);
    for (const step of scene.steps.filter(step => step.skippable)) {
      expect(step.on_skip).toContainEqual(arrival);
    }
  });

  it("uses the same source-specific entry for change_scene without explicit coordinates", () => {
    const data = example();
    departureCommand(data, "change_scene porto_lumen");
    expect(prologue(data).steps.flatMap(step => step.script ?? [])).toContainEqual({
      op: "warp_runtime", runtime: "topdown", room: 0, x: 704, y: 392
    });
  });

  it("uses the destination player when no incoming connection belongs to the source", () => {
    const data = example();
    const editor = data.editorState as { scenaConnections: Array<{ from: string; to: string }> };
    editor.scenaConnections = editor.scenaConnections.filter(connection => connection.from !== "prologo");
    expect(prologue(data).steps.flatMap(step => step.script ?? [])).toContainEqual({
      op: "warp_runtime", runtime: "topdown", room: 0, x: 704, y: 400
    });
  });

  it("preserves explicit coordinates ahead of the configured arrival", () => {
    const data = example();
    departureCommand(data, "change_scene porto_lumen 7 9 down");
    expect(prologue(data).steps.flatMap(step => step.script ?? [])).toContainEqual({
      op: "warp_runtime", runtime: "topdown", room: 0, x: 56, y: 72
    });
  });
});
