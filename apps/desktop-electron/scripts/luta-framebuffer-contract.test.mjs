import { describe, expect, it } from "vitest";

import { resolveLutaFighterFramebufferMasks } from "./luta-framebuffer-contract.mjs";

describe("luta framebuffer contract", () => {
  it("reutiliza os alvos reais dos lutadores para mascarar somente os retangulos OAM", () => {
    const fighters = [
      {
        frameHeight: 64,
        frameWidth: 64,
        side: "player1",
        target: { x: 80, y: 24 }
      },
      {
        frameHeight: 64,
        frameWidth: 64,
        side: "player2",
        target: { x: 167, y: 24 }
      }
    ];

    expect(resolveLutaFighterFramebufferMasks({ fighters, sourceX: 0, sourceY: 0 })).toEqual([
      { height: 64, width: 64, x: 80, y: 24 },
      { height: 64, width: 64, x: 167, y: 24 }
    ]);
  });
});
