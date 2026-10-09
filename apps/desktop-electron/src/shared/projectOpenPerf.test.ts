import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { deriveProjectContractDiagnostics } from "./projectContractDiagnostics.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { deriveSpritesWorkspacePresentation } from "./spritesWorkspace.js";
import { createBlankProjectData } from "./newProject.js";
import { parseGBAProjectFile } from "./projectFile.js";

function elapsedMs(start: number): number {
  return performance.now() - start;
}

describe("project open perf smoke", () => {
  it("flags expensive derivations on the current Exemplo GBA project", () => {
    const fixture = readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8");
    const project = parseGBAProjectFile(fixture).data;
    const blank = createBlankProjectData({ name: "Blank" });

    const timings: Record<string, number> = {};

    let start = performance.now();
    deriveRoomsWorkspacePresentation(project);
    timings.p0Rooms = elapsedMs(start);

    start = performance.now();
    deriveEventsWorkspacePresentation(project);
    timings.p0Events = elapsedMs(start);

    start = performance.now();
    deriveProjectContractDiagnostics(project);
    timings.p0Contract = elapsedMs(start);

    start = performance.now();
    deriveAudioWorkspacePresentation(project);
    timings.p0Audio = elapsedMs(start);

    start = performance.now();
    deriveSpritesWorkspacePresentation(project);
    timings.p0Sprites = elapsedMs(start);

    const total = Object.values(timings).reduce((sum, value) => sum + value, 0);
    expect(total).toBeLessThan(750);
    expect(timings.p0Audio).toBeLessThan(500);
  });
});
