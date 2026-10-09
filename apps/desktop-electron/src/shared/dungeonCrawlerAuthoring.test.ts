import { describe, expect, it } from "vitest";

import { deriveDungeonCrawlerAuthoringSummary } from "./dungeonCrawlerAuthoring.js";

describe("dungeon crawler authoring contract", () => {
  it("accepts a first-person room with authored background and logic grid", () => {
    const summary = deriveDungeonCrawlerAuthoringSummary({
      actors: [{ height: 1, width: 1, x: 14, y: 5 }],
      background: "usina-submersa-gba.png",
      collisionTypes: ["free", "solid", "free", ...Array.from({ length: 597 }, () => "solid")],
      height: 20,
      triggers: [{ height: 1, width: 1, x: 1, y: 0 }],
      viewDistance: 5,
      width: 30
    });

    expect(summary).toMatchObject({
      actorCount: 1,
      blockedCellCount: 598,
      freeCellCount: 2,
      hasAuthoredBackground: true,
      triggerCount: 1
    });
    expect(summary.issues).toEqual([]);
  });

  it("reports actionable warnings for fallback visuals and invalid placements", () => {
    const summary = deriveDungeonCrawlerAuthoringSummary({
      actors: [{ height: 1, width: 1, x: 8, y: 7 }],
      background: null,
      collisionTypes: Array.from({ length: 64 }, () => "solid"),
      height: 8,
      triggers: [{ height: 2, width: 2, x: 7, y: 7 }],
      viewDistance: 9,
      width: 8
    });

    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "background_missing", severity: "warning" }),
      expect.objectContaining({ code: "room_below_gba_grid", severity: "warning" }),
      expect.objectContaining({ code: "view_distance_runtime_cap", severity: "warning" }),
      expect.objectContaining({ code: "actor_out_of_bounds", severity: "warning" }),
      expect.objectContaining({ code: "trigger_out_of_bounds", severity: "warning" }),
      expect.objectContaining({ code: "no_walkable_cells", severity: "warning" })
    ]));
  });
});
