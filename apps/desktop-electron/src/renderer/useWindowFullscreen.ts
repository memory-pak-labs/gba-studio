import { useEffect, useState } from "react";
import type { GBAStudioDesktopAPI } from "../shared/ipc";

export function useWindowFullscreen(
  api: Pick<GBAStudioDesktopAPI, "getWindowFullscreen" | "onWindowFullscreenChange"> = window.gbaStudio
): boolean {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    let changed = false;
    const unsubscribe = api.onWindowFullscreenChange(value => {
      changed = true;
      setFullscreen(value);
    });
    void api.getWindowFullscreen().then(value => {
      if (active && !changed) setFullscreen(value);
    }).catch(() => { /* Keep space for native controls if the initial query fails. */ });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  return fullscreen;
}
