import type { GBAStudioDesktopAPI } from "../shared/ipc.js";

declare global {
  interface Window {
    gbaStudio: GBAStudioDesktopAPI;
  }
}

export {};
