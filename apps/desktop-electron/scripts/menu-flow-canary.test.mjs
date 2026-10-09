import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(scriptDir, "..", "fixtures", "menu-flow-canary.mjs");

describe("menu flow runtime canary", () => {
  it("routes Logo to Title to Menu and starts topdown gameplay", async () => {
    const { buildMenuFlowCanaryManifest } = await import(pathToFileURL(fixturePath).href);
    const manifest = buildMenuFlowCanaryManifest("/engine-pack/templates/exported_mixed");
    expect(manifest.kind).toBe("mixed");
    expect(manifest.runtime_dispatch).toMatchObject({
      initial_runtime: "menu",
      runtimes: ["menu", "topdown"]
    });
    expect(manifest.menu_project.screens.map((screen) => screen.screen_type)).toEqual(["logo", "title", "menu"]);
    expect(manifest.menu_project.screens[0]).toMatchObject({ auto_advance_frames: 240, next_screen: 1 });
    expect(manifest.menu_project.screens[1].items[0]).toMatchObject({ action: "open_screen", target_screen: 2 });
    expect(manifest.menu_project.screens[2].items[0].on_select).toEqual([
      { op: "warp_runtime", runtime: "topdown", room: 0, x: 24, y: 40 }
    ]);
    expect(manifest.topdown_project.rooms[0].visual_tiles).toHaveLength(800);
  });
});
