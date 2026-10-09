import { describe, expect, it } from "vitest";

import { buildFunctionalP0Project } from "./functionalP0Project.js";
import {
  analyzePreviewVramUsage,
  breakpointKey,
  deriveGbaDebuggerPresentation,
  formatPreviewDebuggerVariableValue,
  parsePreviewDebuggerVariableInput
} from "./gbaDebugger.js";
import {
  bootPreviewRuntimeAtRoom,
  createPreviewDebuggerSession,
  createPreviewRuntime,
  resumePreviewDebugger,
  setPreviewDebuggerVariable,
  stepPreviewDebuggerScript
} from "./previewRuntime.js";

describe("GBA debugger", () => {
  it("estimates BG and OBJ VRAM usage from the live preview runtime", () => {
    const runtime = createPreviewRuntime({
      ...buildFunctionalP0Project(),
      variables: [{ name: "score" }]
    });

    const usage = analyzePreviewVramUsage(runtime);

    expect(usage.bgUniqueTiles).toBeGreaterThan(0);
    expect(usage.bgBytes).toBe(usage.bgUniqueTiles * 32);
    expect(usage.objSpriteCount).toBeGreaterThan(0);
    expect(usage.objBytes).toBeGreaterThan(0);
    expect(usage.totalBytes).toBe(usage.bgBytes + usage.objBytes);
    expect(usage.budgetBytes).toBe(96 * 1024);
  });

  it("pauses on event breakpoints and steps one exported script command at a time", () => {
    const project = {
      ...buildFunctionalP0Project(),
      events: [
        {
          name: "room_boot",
          steps: [
            { command: "set_variable score 1" },
            { command: "set_variable score 2" },
            { command: "set_variable score 3" }
          ]
        }
      ],
      variables: [{ name: "score" }]
    };

    const runtime = bootPreviewRuntimeAtRoom(project, "cena_1", {
      debugger: createPreviewDebuggerSession({
        enabled: true,
        breakpoints: [breakpointKey("room_boot", 1)]
      })
    });

    expect(runtime.debugger.paused).toBe(true);
    expect(runtime.debugger.pauseReason).toContain("room_boot");
    expect(runtime.variables.score).toBeUndefined();

    const stepped = stepPreviewDebuggerScript(runtime);
    expect(stepped.variables.score).toBe(1);
    expect(stepped.debugger.paused).toBe(true);
    expect(stepped.debugger.scriptFrame?.commandIndex).toBe(2);

    const resumed = resumePreviewDebugger(stepped);
    expect(resumed.debugger.paused).toBe(false);
    expect(resumed.variables.score).toBe(3);
    expect(resumed.debugger.scriptFrame).toBeNull();
  });

  it("allows live variable edits while the debugger is paused", () => {
    const project = {
      ...buildFunctionalP0Project(),
      events: [
        {
          name: "room_boot",
          steps: [{ command: "set_variable coins 5" }]
        }
      ],
      variables: [{ name: "coins" }]
    };

    const runtime = setPreviewDebuggerVariable(
      bootPreviewRuntimeAtRoom(project, "cena_1", {
        debugger: createPreviewDebuggerSession({
          enabled: true,
          breakpoints: [breakpointKey("room_boot", 1)]
        })
      }),
      "coins",
      99
    );

    expect(runtime.variables.coins).toBe(99);

    const presentation = deriveGbaDebuggerPresentation(runtime, project);
    expect(presentation.liveVariables).toEqual([
      { name: "coins", value: "99", declared: true }
    ]);
    expect(presentation.callStack).toEqual(["room_boot"]);
    expect(presentation.watchValues).toEqual([
      { expression: "coins", value: "99" }
    ]);
  });

  it("parses live variable edits for numbers, booleans and strings", () => {
    expect(parsePreviewDebuggerVariableInput("42")).toBe(42);
    expect(parsePreviewDebuggerVariableInput("true")).toBe(true);
    expect(parsePreviewDebuggerVariableInput("hello")).toBe("hello");
    expect(formatPreviewDebuggerVariableValue(false)).toBe("false");
  });
});
