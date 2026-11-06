/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GBAProjectData } from "../shared/projectFile";
import { deriveProjectHealthReport } from "../shared/projectHealth";
import type { ProjectHealthAnalysis } from "./projectHealth.worker";
import { useProjectHealthReport } from "./useProjectHealthReport";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("coalesces edits and only uses results from the open project", () => {
  const sent = vi.fn();
  const terminate = vi.fn();
  const worker = {
    postMessage: sent,
    terminate,
    onmessage: (_event: { data: ProjectHealthAnalysis }) => {}
  };
  vi.stubGlobal("Worker", vi.fn(function () { return worker; }));
  const first: GBAProjectData = { name: "Primeiro projeto" };
  const second: GBAProjectData = { name: "Segundo projeto" };
  const editedSecond: GBAProjectData = { ...second, name: "Projeto editado" };
  const firstIdentity = {};
  const secondIdentity = {};
  const { result, rerender, unmount } = renderHook(({ data, identity }) => useProjectHealthReport(data, identity), {
    initialProps: { data: first, identity: firstIdentity }
  });

  expect(sent.mock.calls).toEqual([[first]]);
  expect(result.current).toEqual({ report: null, estimatedRomBytes: undefined, pending: true });
  rerender({ data: second, identity: secondIdentity });
  rerender({ data: editedSecond, identity: secondIdentity });
  expect(sent.mock.calls).toEqual([[first]]);

  const previousAnalysis = { report: deriveProjectHealthReport(first), estimatedRomBytes: 1 };
  act(() => worker.onmessage({ data: previousAnalysis }));
  expect(result.current).toEqual({ report: null, estimatedRomBytes: undefined, pending: true });
  expect(sent.mock.calls).toEqual([[first], [editedSecond]]);

  const currentAnalysis = { report: deriveProjectHealthReport(editedSecond), estimatedRomBytes: 2 };
  act(() => worker.onmessage({ data: currentAnalysis }));
  expect(result.current).toEqual({ ...currentAnalysis, pending: false });
  unmount();
  expect(terminate).toHaveBeenCalledOnce();
});
