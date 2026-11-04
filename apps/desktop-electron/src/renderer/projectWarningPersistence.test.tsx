/** @vitest-environment happy-dom */
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GBAProjectData } from "../shared/projectFile.js";
import type { ProjectProblem } from "../shared/projectProblems.js";
import { useProjectProblemDismissals } from "./useProjectProblemDismissals.js";

const warning: ProjectProblem = { id: "unused", code: "events.warning", message: "Unused event", targetID: "old", severity: "warning", workspace: "Editor" };
const budget: ProjectProblem = { id: "budget", message: "Palette margin", severity: "warning", workspace: "Arquivos" };
function useHarness(initial: GBAProjectData, path = "/project") {
  const [data, setData] = useState(initial);
  const dismissals = useProjectProblemDismissals([warning, budget], path, { data,
    onChange: keys => setData(previous => ({ ...previous, editorState: { ...(previous.editorState as object), ignoredWarnings: keys } })) });
  return { ...dismissals, data };
}

describe("project warning persistence", () => {
  beforeEach(() => localStorage.clear()); afterEach(cleanup);
  it("preserves multiple dismissals made in the same update", () => {
    const { result } = renderHook(() => useHarness({ name: "A" }));
    act(() => { result.current.ignoreWarning(warning); result.current.ignoreWarning(budget); });
    expect((result.current.data.editorState as any).ignoredWarnings).toHaveLength(2);
  });
  it("travels with a saved project into another profile and a different path", () => {
    const first = renderHook(() => useHarness({ name: "A", editorState: { canvasZoom: 2 } }));
    act(() => first.result.current.ignoreWarning(warning));
    const saved = JSON.parse(JSON.stringify(first.result.current.data));
    expect(saved.editorState.ignoredWarnings).toHaveLength(1);
    expect(saved.editorState.canvasZoom).toBe(2);
    first.unmount(); localStorage.clear();
    const reopened = renderHook(() => useHarness(saved, "/saved-as/new-project"));
    expect(reopened.result.current.visibleProblems).toEqual([budget]);
    act(() => reopened.result.current.restoreWarnings());
    const restored = reopened.result.current.data;
    reopened.unmount();
    expect(renderHook(() => useHarness(restored)).result.current.visibleProblems).toEqual([warning, budget]);
  });

  it("imports existing local dismissals once, and an explicit restore wins over the old cache", () => {
    const legacy = renderHook(() => useProjectProblemDismissals([warning], "/project"));
    act(() => legacy.result.current.ignoreWarning(warning)); legacy.unmount();
    const current = renderHook(() => useHarness({ name: "A" }));
    expect((current.result.current.data.editorState as any)?.ignoredWarnings).toHaveLength(1);
    expect(current.result.current.visibleProblems).toEqual([budget]);
    act(() => current.result.current.restoreWarnings());
    const saved = JSON.parse(JSON.stringify(current.result.current.data)); current.unmount();
    expect(renderHook(() => useHarness(saved)).result.current.visibleProblems).toEqual([warning, budget]);
  });
});
