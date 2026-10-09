import { describe, expect, it } from "vitest";

import { deriveSaveMenuBuilder, saveMenuSlotCards } from "./saveMenuBuilder.js";

describe("saveMenuBuilder", () => {
  it("builds Continue, Load and Delete actions with configurable metadata", () => {
    expect(deriveSaveMenuBuilder({
      slots: 3,
      continueLabel: "Continuar",
      loadLabel: "Carregar",
      deleteLabel: "Apagar",
      showPlayerName: true,
      showPlayTime: true,
      showLocation: true,
      selectedSlot: 2
    })).toEqual({
      enabled: true,
      slotCount: 3,
      selectedSlot: 2,
      layout: "cards",
      confirmDelete: true,
      actions: { continue: "Continuar", load: "Carregar", delete: "Apagar" },
      metadata: { playerName: true, playTime: true, location: true }
    });
  });

  it("formats visual slot cards with name, play time, location and selection", () => {
    const cards = saveMenuSlotCards(deriveSaveMenuBuilder({ slots: 2, selectedSlot: 1 }), [{
      slot: 1,
      playerName: "Lia",
      playTimeFrames: 216000,
      location: "Vila do Farol",
      present: true
    }]);

    expect(cards[0]).toMatchObject({ slot: 1, selected: true, playerName: "Lia", playTime: "1:00:00", location: "Vila do Farol" });
    expect(cards[1]).toMatchObject({ slot: 2, selected: false, present: false });
  });

  it("preserves an explicit save UI profile and custom label mode", () => {
    expect(deriveSaveMenuBuilder({ profileId: "portable", customLabels: true })).toMatchObject({
      profileId: "portable",
      customLabels: true
    });
  });
});
