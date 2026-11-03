import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectProblem } from "../shared/projectProblems";
import type { GBAProjectData } from "../shared/projectFile";
import { projectWarningKey as warningKey, readProjectWarningDismissals } from "../shared/projectWarningDismissals";

function readDismissals(storageKey: string | null): string[] {
  if (!storageKey) return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function useProjectProblemDismissals(problems: ProjectProblem[], projectPath: string | undefined,
  project?: { data: GBAProjectData | undefined; onChange(keys: string[]): void }) {
  const storageKey = projectPath ? `gbaStudio.ignoredWarnings.v1:${projectPath}` : null;
  const initialKeys = useMemo(() => readDismissals(storageKey), [storageKey]);
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const stateKey = storageKey ?? "unsaved";
  const persistedKeys = readProjectWarningDismissals(project?.data);
  const keys = project ? persistedKeys ?? initialKeys : overrides[stateKey] ?? initialKeys;
  const onChange = project?.onChange;
  useEffect(() => {
    // Bring existing local choices into the project once. An explicit [] must
    // never be replaced by an older cache after restoring warnings.
    if (project?.data && persistedKeys === null && initialKeys.length > 0) onChange?.(initialKeys);
  }, [project?.data, persistedKeys, initialKeys, onChange]);
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const dismissed = new Set(keys);
  const visibleProblems = problems.filter(problem => problem.severity === "error" || !dismissed.has(warningKey(problem)));

  function updateKeys(nextKeys: string[]): void {
    keysRef.current = nextKeys;
    if (project) {
      project.onChange(nextKeys);
      return;
    }
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
    updateKeys([...new Set([...keysRef.current, warningKey(problem)])]);
  }

  function ignoreAllWarnings(): void {
    updateKeys([...new Set([...keysRef.current, ...problems.filter(problem => problem.severity === "warning").map(warningKey)])]);
  }

  return {
    visibleProblems,
    ignoredCount: problems.length - visibleProblems.length,
    ignoreWarning,
    ignoreAllWarnings,
    restoreWarnings: () => updateKeys([])
  };
}
