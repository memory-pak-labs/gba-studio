import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { deriveEventsWorkspacePresentation, deriveEventsWorkspaceValidationIssues } from "./eventsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

function project(roomName: string | undefined = "storm", enabled = true): GBAProjectData {
  return {
    rooms: [{ name: "storm", sceneType: "shmup", runtime: { type: "shmup" } }, { name: "port", sceneType: "topdown" }],
    actors: [{ id: "drone", name: "Drone", roomName: "storm" }],
    events: [
      { name: "enemy_fire", roomName, steps: [{ command: "launch_projectile drone left 2", isEnabled: enabled }] },
      { name: "old_event", roomName: "storm", steps: [{ command: "noop", isEnabled: true }] }
    ]
  };
}

describe("Shmup projectile authoring usage", () => {
  it.each(["storm", undefined])("recognizes projectile configuration consumed by export in %s scope", roomName => {
    const p = project();
    if (roomName === undefined) delete (p.events as Array<Record<string, unknown>>)[0]!.roomName;
    const presentation = deriveEventsWorkspacePresentation(p);
    const event = presentation.groups.flatMap(group => group.events).find(event => event.name === "enemy_fire")!;
    expect(event.isUnlinked).toBe(false);
    expect(event.bindingLabels).toContain("Exportação: projéteis Shoot em Up");
    expect(deriveEventsWorkspaceValidationIssues(presentation).filter(issue => issue.id.startsWith("unlinked-")).map(issue => issue.eventName)).toEqual(["old_event"]);
  });

  it.each(["disabled", "other-scene", "no-shmup"])("keeps genuinely unused %s launch events visible", scenario => {
    const p = project(scenario === "other-scene" ? "port" : "storm", scenario !== "disabled");
    if (scenario === "no-shmup") p.rooms = [{ name: "storm", sceneType: "topdown" }];
    const issues = deriveEventsWorkspaceValidationIssues(deriveEventsWorkspacePresentation(p));
    expect(issues.filter(issue => issue.id.startsWith("unlinked-")).map(issue => issue.eventName)).toContain("enemy_fire");
  });

  it("preserves the example's native enemy firing configuration and its authoring event", () => {
    const p = JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8")) as GBAProjectData;
    const before = structuredClone(p);
    const exported = buildEngineExportProjectContract(p);
    expect(exported.shmup_project?.waves.flatMap(wave => wave.enemies.map(enemy => enemy.fire_interval))).toEqual([60, 60, 40]);
    const issues = deriveEventsWorkspaceValidationIssues(deriveEventsWorkspacePresentation(p));
    expect(issues.filter(issue => issue.id.startsWith("unlinked-")).map(issue => issue.eventName)).not.toContain("tempestade_drone_disparar");
    expect(p).toEqual(before);
  });
});
