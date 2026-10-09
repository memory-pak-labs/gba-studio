import { describe, expect, it } from "vitest";

import { validateControlledEntitySchemaCoverage } from "../../../../packages/project-contract/src/index.js";

describe("controlled entity project contract", () => {
  it("accepts the controlled entity of a required typed scene", () => {
    expect(validateControlledEntitySchemaCoverage({
      scenas: [{ name: "track", sceneType: "racing", playerActorName: "Lia Car" }],
      actors: [{ name: "Lia Car", roomName: "track", spriteSheet: "lia-car.png" }]
    })).toEqual([]);
  });

  it("keeps the runtime default when a required typed scene has no selected entity", () => {
    expect(validateControlledEntitySchemaCoverage({
      scenas: [{ name: "track", sceneType: "racing", playerActorName: "" }],
      actors: []
    })).toEqual([]);
  });

  it("keeps neutral, non-navigable and unrecognized scenes outside this gate", () => {
    expect(validateControlledEntitySchemaCoverage({
      scenas: [
        { name: "battle", sceneType: "battleRpg" },
        { name: "map", sceneType: "worldMap", runtime: { config: { navigable: false } } },
        { name: "legacy", sceneType: "legacyPrototype" }
      ],
      actors: []
    })).toEqual([]);
  });

  it("keeps the World Map runtime default when navigation is enabled without a selected marker", () => {
    expect(validateControlledEntitySchemaCoverage({
      scenas: [{ name: "map", sceneType: "worldMap", runtime: { config: { navigable: true } } }],
      actors: []
    })).toEqual([]);
  });

  it("rejects a selected controlled entity that belongs to another room", () => {
    expect(validateControlledEntitySchemaCoverage({
      scenas: [{ name: "track", sceneType: "racing", playerActorName: "Lia Car" }],
      actors: [{ name: "Lia Car", roomName: "garage", spriteSheet: "lia-car.png" }]
    })).toEqual([expect.objectContaining({
      roomName: "track",
      sceneType: "racing",
      code: "CONTROLLED_ENTITY_NOT_IN_ROOM",
      expectedRole: "vehicle"
    })]);
  });
});
