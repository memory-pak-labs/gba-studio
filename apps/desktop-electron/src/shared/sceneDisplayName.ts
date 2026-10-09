const EXAMPLE_SCENE_PREFIX = "";

/**
 * Keeps the stable scene identifier for runtime references while presenting
 * the project-facing name without the legacy project prefix.
 */
export function sceneDisplayName(value: string | null | undefined): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return "Cena sem nome";
  return name.startsWith(EXAMPLE_SCENE_PREFIX)
    ? name.slice(EXAMPLE_SCENE_PREFIX.length) || name
    : name;
}
