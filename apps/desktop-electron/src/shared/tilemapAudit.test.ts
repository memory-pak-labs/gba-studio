import { describe, expect, it } from "vitest";
import { auditProjectTilemapWarnings, auditProjectTilemapBlockingErrors, tilemapAuditWarningLabels, tilemapGbaMaxTileIndex } from "./tilemapAudit.js";

describe("auditProjectTilemapWarnings", () => {
  it("validates affine racing editor source cells separately from deduplicated hardware tiles",()=>{
    const room={name:'race',runtime:{type:'racing',config:{presentation:'pseudo3d',topdownTrack:{},pseudo3dVisuals:{floorTilemapId:'floor.png'}}},tilemap:[0,1,4096]};
    const data={scenas:[room],assets:[{name:'floor.png',metadata:{width:512,height:512}}]};
    expect(auditProjectTilemapWarnings(data)).toEqual([]);
    room.tilemap=[4097];
    expect(auditProjectTilemapBlockingErrors(data).join(' ')).toMatch(/4097/);
  });
  it("flags tile indices above the GBA practical limit", () => {
    const warnings = auditProjectTilemapWarnings({
      scenas: [
        {
          name: "overworld",
          tilemap: [0, 1, tilemapGbaMaxTileIndex + 5]
        }
      ]
    });

    expect(warnings).toEqual([
      `${tilemapAuditWarningLabels.tileIndexAboveHardwareLimit} (overworld: max=${tilemapGbaMaxTileIndex + 5})`
    ]);
  });

  it("flags invalid negative tile indices but ignores the empty-tile sentinel", () => {
    const warnings = auditProjectTilemapWarnings({
      scenas: [
        {
          name: "broken",
          tilemap: [-1, -2, 0],
          layers: [
            { mapping: "BG2", tilemap: [0, -3, 1] }
          ]
        }
      ]
    });

    expect(warnings).toEqual([
      `${tilemapAuditWarningLabels.negativeTileIndex} (broken)`,
      `${tilemapAuditWarningLabels.negativeTileIndex} (broken/BG2)`
    ]);
  });

  it("returns no warnings for valid tilemaps", () => {
    expect(auditProjectTilemapWarnings({
      scenas: [{ name: "start", tilemap: [0, 1, 2, 3] }]
    })).toEqual([]);
  });
});

describe("auditProjectTilemapBlockingErrors", () => {
  it("returns prefixed blocking errors for invalid tilemaps", () => {
    const errors = auditProjectTilemapBlockingErrors({
      scenas: [{ name: "broken", tilemap: [tilemapGbaMaxTileIndex + 1] }]
    });

    expect(errors).toEqual([
      `Tilemap: ${tilemapAuditWarningLabels.tileIndexAboveHardwareLimit} (broken: max=${tilemapGbaMaxTileIndex + 1})`
    ]);
  });
});
