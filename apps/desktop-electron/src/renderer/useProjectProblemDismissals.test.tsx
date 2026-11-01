/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectProblem } from "../shared/projectProblems";
import { useProjectProblemDismissals } from "./useProjectProblemDismissals";

const warning: ProjectProblem = { id: "scene-0-budget", code: "asset.budget.warning", message: "Orçamento próximo do limite", severity: "warning", workspace: "Arquivos", targetName: "porto" };
const error: ProjectProblem = { ...warning, id: "error", severity: "error", message: "Recurso ausente" };

describe("useProjectProblemDismissals", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("ignora um aviso e restaura sem modificar os diagnósticos originais", () => {
    const problems = [warning, error];
    const { result } = renderHook(() => useProjectProblemDismissals(problems, "/project-a"));
    act(() => result.current.ignoreWarning(warning));
    expect(result.current.visibleProblems).toEqual([error]);
    expect(result.current.ignoredCount).toBe(1);
    expect(problems).toEqual([warning, error]);
    act(() => result.current.restoreWarnings());
    expect(result.current.visibleProblems).toEqual(problems);
  });

  it("ignora apenas os avisos atuais e mantém erros e novos avisos visíveis", () => {
    const { result, rerender } = renderHook(({ problems }) => useProjectProblemDismissals(problems, "/project-a"), { initialProps: { problems: [warning, error] } });
    act(() => result.current.ignoreAllWarnings());
    act(() => result.current.ignoreWarning(error));
    expect(result.current.visibleProblems).toEqual([error]);
    const newWarning = { ...warning, targetName: "farol" };
    rerender({ problems: [warning, error, newWarning] });
    expect(result.current.visibleProblems).toEqual([error, newWarning]);
  });

  it("persiste por caminho de projeto e não transfere escolhas ao trocar de projeto", () => {
    const first = renderHook(() => useProjectProblemDismissals([warning], "/project-a"));
    act(() => first.result.current.ignoreAllWarnings());
    first.unmount();
    const { result, rerender } = renderHook(({ path }) => useProjectProblemDismissals([warning], path), { initialProps: { path: "/project-a" } });
    expect(result.current.visibleProblems).toEqual([]);
    rerender({ path: "/project-b" });
    expect(result.current.visibleProblems).toEqual([warning]);
    rerender({ path: "/project-a" });
    expect(result.current.visibleProblems).toEqual([]);
    act(() => result.current.restoreWarnings());
    cleanup();
    expect(renderHook(() => useProjectProblemDismissals([warning], "/project-a")).result.current.visibleProblems).toEqual([warning]);
  });

  it("preserva o descarte ao reordenar cenas e reapresenta avisos alterados ou promovidos a erro", () => {
    const { result, rerender } = renderHook(({ problems }) => useProjectProblemDismissals(problems, "/project-a"), { initialProps: { problems: [warning] } });
    act(() => result.current.ignoreWarning(warning));
    rerender({ problems: [{ ...warning, id: "scene-9-budget" }] });
    expect(result.current.visibleProblems).toEqual([]);
    rerender({ problems: [{ ...warning, message: "Orçamento excedido" }] });
    expect(result.current.visibleProblems).toHaveLength(1);
    rerender({ problems: [{ ...warning, detail: "Pressão máxima estimada: 95%." }] });
    expect(result.current.visibleProblems).toHaveLength(1);
    rerender({ problems: [{ ...warning, severity: "error" }] });
    expect(result.current.visibleProblems).toHaveLength(1);
  });

  it("tolera dados locais inválidos sem ocultar diagnósticos", () => {
    vi.spyOn(localStorage, "getItem").mockReturnValue("{invalid");
    const { result } = renderHook(() => useProjectProblemDismissals([warning, error], "/project-a"));
    expect(result.current.visibleProblems).toEqual([warning, error]);
  });

  it("continua funcionando quando o armazenamento local está indisponível", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    const { result } = renderHook(() => useProjectProblemDismissals([warning, error], "/project-a"));
    act(() => result.current.ignoreAllWarnings());
    expect(result.current.visibleProblems).toEqual([error]);
    act(() => result.current.restoreWarnings());
    expect(result.current.visibleProblems).toEqual([warning, error]);
  });
});
