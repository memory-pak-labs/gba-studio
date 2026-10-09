import { useEffect, useSyncExternalStore } from "react";
import { applyStudioTheme, readStudioTheme, writeStudioTheme, STUDIO_THEME_STORAGE_KEY, type StudioTheme } from "../shared/studioTheme";

const THEME_CHANGED_EVENT = "gba-studio:theme-changed";

function currentTheme(): StudioTheme {
  const applied = document.documentElement.getAttribute("data-studio-theme");
  return applied === "dark" || applied === "light" ? applied : readStudioTheme();
}

function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-studio-theme"] });
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STUDIO_THEME_STORAGE_KEY || event.key === null) {
      applyStudioTheme(readStudioTheme());
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGED_EVENT, onChange);
  return () => { observer.disconnect(); window.removeEventListener("storage", onStorage); window.removeEventListener(THEME_CHANGED_EVENT, onChange); };
}

export function useStudioTheme(): { theme: StudioTheme; setTheme(theme: StudioTheme): void } {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
  useEffect(() => { applyStudioTheme(currentTheme()); }, []);
  return {
    theme,
    setTheme(nextTheme) {
      writeStudioTheme(nextTheme);
      applyStudioTheme(nextTheme);
      window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
    }
  };
}
