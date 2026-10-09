export interface DroppedFileLike {
  name?: string;
  path?: string;
}

function isProjectPath(value: string | undefined): boolean {
  const lowercased = value?.trim().toLowerCase();
  return Boolean(lowercased && (
    lowercased.endsWith(".gba-project") ||
    lowercased.endsWith(".gbastudio") ||
    lowercased.endsWith(".gbsproj")
  ));
}

export function droppedProjectPath(files: DroppedFileLike[]): string | null {
  const project = files.find((file) => file.path && (isProjectPath(file.path) || isProjectPath(file.name)));
  return project?.path ?? null;
}
