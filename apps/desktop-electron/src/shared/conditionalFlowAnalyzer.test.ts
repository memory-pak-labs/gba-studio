import { describe, expect, it } from "vitest";
import { analyzeConditionalSceneFlow } from "./conditionalFlowAnalyzer.js";

describe("conditional scene flow analyzer", () => {
  it("treats a Start Menu as a reachable topdown overlay without a dead end", () => {
    const report = analyzeConditionalSceneFlow({
      rooms: [
        { id: "play", name: "play", sceneType: "topdown", runtime: { type: "topdown" } },
        { id: "start-menu", name: "start-menu", sceneType: "menu", runtime: { type: "menu", config: { role: "start" } } }
      ],
      settings: { general: { startScene: "play" } },
      editorState: { scenaConnections: [] },
      events: []
    });

    expect(report.reachableScenes).toEqual(["play", "start-menu"]);
    expect(report.unreachableScenes).toEqual([]);
    expect(report.deadEnds).toEqual([]);
  });

  it("finds unreachable scenes, invalid transitions, dead ends and conditional loops", () => {
    const report = analyzeConditionalSceneFlow({
      rooms: [
        { id: "start", name: "start" },
        { id: "forest", name: "forest" },
        { id: "ending", name: "ending" },
        { id: "unused", name: "unused" }
      ],
      settings: { general: { startScene: "start" } },
      editorState: {
        scenaConnections: [
          { from: "start", to: "forest", eventName: "open_forest" },
          { from: "forest", to: "start" },
          { from: "forest", to: "ending", eventName: "needs_key" },
          { from: "ending", to: "missing" }
        ]
      },
      events: [
        { name: "open_forest", steps: [{ command: "if_variable chapter >= 1" }] },
        { name: "needs_key", steps: [{ command: "if_inventory key >= 1" }] }
      ]
    }, {
      variables: { chapter: 1 },
      inventory: { key: 0 }
    });

    expect(report.reachableScenes).toEqual(["forest", "start"]);
    expect(report.unreachableScenes).toEqual(["ending", "unused"]);
    expect(report.invalidTransitions).toEqual([
      expect.objectContaining({ from: "ending", to: "missing" })
    ]);
    expect(report.loops).toEqual([["forest", "start"]]);
    expect(report.blockedTransitions).toEqual([
      expect.objectContaining({ from: "forest", to: "ending", reason: expect.stringContaining("key") })
    ]);
  });
});
