import type { GBAProjectData } from "./projectFile.js";
import type { ProjectProblem } from "./projectProblems.js";

export function projectWarningKey(problem: ProjectProblem): string {
  return JSON.stringify([problem.workspace, problem.code ?? problem.id,
    problem.targetID ?? problem.targetName ?? null, problem.message, problem.detail ?? null]);
}

/** null means no project-owned choice yet; [] is an explicit restore. */
export function readProjectWarningDismissals(data: GBAProjectData | undefined): string[] | null {
  const state = data?.editorState;
  if (!state || typeof state !== "object" || Array.isArray(state) || !("ignoredWarnings" in state)) return null;
  const keys = (state as Record<string, unknown>).ignoredWarnings;
  return Array.isArray(keys) ? [...new Set(keys.filter((key): key is string => typeof key === "string"))] : [];
}

export function updateProjectWarningDismissals(data: GBAProjectData, keys: string[]): GBAProjectData {
  const state = data.editorState && typeof data.editorState === "object" && !Array.isArray(data.editorState) ? data.editorState : {};
  return { ...data, editorState: { ...state, ignoredWarnings: [...new Set(keys)] } };
}
