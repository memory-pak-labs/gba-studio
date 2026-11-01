import { useMemo, useState } from "react";
import type { ProjectProblem } from "../shared/projectProblems";

function warningKey(problem: ProjectProblem): string {
  // Scene indices in diagnostic IDs change on reorder. Follow the target and
  // content instead; changed warnings must become visible again.
  return JSON.stringify([problem.workspace, problem.code ?? problem.id,
    problem.targetID ?? problem.targetName ?? null, problem.message, problem.detail ?? null]);
}

function readDismissals(storageKey: string | null): string[] {
  if (!storageKey) return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function useProjectProblemDismissals(problems: ProjectProblem[], projectPath: string | undefined) {
  const storageKey = projectPath ? `gbaStudio.ignoredWarnings.v1:${projectPath}` : null;
  const initialKeys = useMemo(() => readDismissals(storageKey), [storageKey]);
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const stateKey = storageKey ?? "unsaved";
  const keys = overrides[stateKey] ?? initialKeys;
  const dismissed = new Set(keys);
  const visibleProblems = problems.filter(problem => problem.severity === "error" || !dismissed.has(warningKey(problem)));

  function updateKeys(nextKeys: string[]): void {
    setOverrides(previous => ({ ...previous, [stateKey]: nextKeys }));
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextKeys));
    } catch {
      // Keep the choice for this session when local storage is unavailable.
    }
  }

  function ignoreWarning(problem: ProjectProblem): void {
    if (problem.severity !== "warning") return;
    updateKeys([...new Set([...keys, warningKey(problem)])]);
  }

  function ignoreAllWarnings(): void {
    updateKeys([...new Set([...keys, ...problems.filter(problem => problem.severity === "warning").map(warningKey)])]);
  }

  return {
    visibleProblems,
    ignoredCount: problems.length - visibleProblems.length,
    ignoreWarning,
    ignoreAllWarnings,
    restoreWarnings: () => updateKeys([])
  };
}
