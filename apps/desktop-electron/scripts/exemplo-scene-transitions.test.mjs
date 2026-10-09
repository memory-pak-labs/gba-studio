import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyExampleSceneTransitions } from "./exemplo-scene-transitions.mjs";

const canonical = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
describe("example scene transition showcase", () => {
  it("covers every example connection and demonstrates all seven styles", () => {
    const project = applyExampleSceneTransitions(canonical);
    expect(project.editorState.scenaConnections.every(c => c.transition)).toBe(true);
    expect(new Set(project.editorState.scenaConnections.map(c => c.transition.style))).toEqual(new Set(["cut", "fade", "fade-color", "wipe", "mosaic", "slide", "crossfade"]));
    expect(project.editorState.scenaConnections.filter(c => c.from === "titulo" || c.from === "logo").every(c => c.transition.style === "cut")).toBe(true);
  });
  it("preserves every unrelated field, asset and event and is safe to repeat", () => {
    const input = structuredClone(canonical);
    input.editorState.scenaConnections.push({ from: "custom", to: "other", transition: { style: "fade", durationFrames: 99 } });
    const result = applyExampleSceneTransitions(input);
    const withoutTransitions = p => ({ ...p, editorState: { ...p.editorState, scenaConnections: p.editorState.scenaConnections.map(({ transition, ...connection }) => connection) } });
    expect(withoutTransitions(result)).toEqual(withoutTransitions(input));
    expect(result.editorState.scenaConnections.at(-1)).toEqual(input.editorState.scenaConnections.at(-1));
    expect(applyExampleSceneTransitions(result)).toEqual(result);
  });
});
