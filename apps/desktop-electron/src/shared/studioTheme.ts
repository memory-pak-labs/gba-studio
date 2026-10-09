export type StudioTheme = "light" | "dark";

export const STUDIO_THEME_STORAGE_KEY = "gba-studio:theme";

export function readStudioTheme(storage: Pick<Storage, "getItem"> = localStorage): StudioTheme {
  return storage.getItem(STUDIO_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function writeStudioTheme(theme: StudioTheme, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(STUDIO_THEME_STORAGE_KEY, theme);
}

export function toggleStudioTheme(theme: StudioTheme): StudioTheme {
  return theme === "dark" ? "light" : "dark";
}

export function applyStudioTheme(
  theme: StudioTheme,
  root: HTMLElement = document.documentElement
): void {
  root.setAttribute("data-studio-theme", theme);
  root.style.colorScheme = theme;
}
