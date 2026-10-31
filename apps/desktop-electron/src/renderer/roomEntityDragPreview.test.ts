/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { createRoomEntityDragPreview } from "./roomEntityDragPreview.js";

describe("room entity drag preview", () => {
  it("moves geometry and selected cells while preserving the sprite, then restores on cancel", () => {
    const canvas = document.createElement("div");
    canvas.innerHTML = '<span data-room-entity-key="actor:a" style="left:0%;top:0%;background-image:url(sprite.png);transform:scaleX(-1)"></span>'
      + '<span data-room-entity-key="actor:a" data-entity-overlay="hitbox" style="left:0%;top:0%"></span>'
      + '<span data-room-entity-key="actor:b" style="left:50%"></span>'
      + Array.from({ length: 16 }, (_, i) => `<button class="room-stage-cell${[0, 15].includes(i) ? " selected-entity-cell" : ""}"></button>`).join("");
    const sprite = canvas.querySelector<HTMLElement>("[data-room-entity-key='actor:a']")!;
    const hitbox = canvas.querySelector<HTMLElement>("[data-entity-overlay]")!;
    const other = canvas.querySelector<HTMLElement>("[data-room-entity-key='actor:b']")!;
    const original = sprite.style.cssText;
    const visual = createRoomEntityDragPreview(canvas, "actor:a", Array.from({ length: 16 }, (_, i) => i === 15));
    visual.paint({ left: "25%", top: "50%", zIndex: 22 }, { left: "25%", top: "75%" },
      { x: 1, y: 2, width: 1, height: 1 }, 4, 4);
    expect(sprite.style.left).toBe("25%");
    expect(sprite.style.backgroundImage).toBe("url(\"sprite.png\")");
    expect(sprite.style.transform).toBe("scaleX(-1)");
    expect(hitbox.style.top).toBe("75%");
    expect(other.style.left).toBe("50%");
    const cells = canvas.querySelectorAll(".room-stage-cell");
    expect(cells[0]!.classList.contains("selected-entity-cell")).toBe(false);
    expect(cells[9]!.classList.contains("selected-entity-cell")).toBe(true);
    expect(cells[15]!.classList.contains("selected-entity-cell")).toBe(true);
    visual.restore();
    expect(sprite.style.cssText).toBe(original);
    expect(cells[0]!.classList.contains("selected-entity-cell")).toBe(true);
    expect(cells[9]!.classList.contains("selected-entity-cell")).toBe(false);
    expect(cells[15]!.classList.contains("selected-entity-cell")).toBe(true);
  });
});
