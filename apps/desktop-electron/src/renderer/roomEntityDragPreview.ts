import type { CSSProperties } from "react";

const geometryProperties = ["left", "top", "width", "height", "clipPath", "zIndex"] as const;

/** Update the transient overlay without reconciling every tile in a large map. */
export function createRoomEntityDragPreview(canvas: HTMLElement, key: string, fixedSelectedCells: boolean[]) {
  const overlays = Array.from(canvas.querySelectorAll<HTMLElement>("[data-room-entity-key]"))
    .filter(element => element.dataset.roomEntityKey === key)
    .map(element => ({ element, original: Object.fromEntries(geometryProperties.map(property => [property, element.style[property]])) }));
  const cells = canvas.getElementsByClassName("room-stage-cell");
  const originalSelection = Array.from(canvas.querySelectorAll<HTMLElement>(".room-stage-cell.selected-entity-cell"));
  let selection: Element[] = originalSelection;
  const fixed = fixedSelectedCells.flatMap((selected, index) => selected && cells[index] ? [cells[index]!] : []);
  return {
    paint(sprite: CSSProperties, hitbox: CSSProperties, footprint: { x: number; y: number; width: number; height: number }, width: number, height: number) {
      for (const { element } of overlays) {
        const geometry = element.dataset.entityOverlay === "hitbox" ? hitbox : sprite;
        for (const property of geometryProperties) element.style[property] = String(geometry[property] ?? "");
      }
      for (const cell of selection) cell.classList.remove("selected-entity-cell");
      selection = [...fixed];
      for (let y = Math.max(0, footprint.y); y < Math.min(height, footprint.y + footprint.height); y++) {
        for (let x = Math.max(0, footprint.x); x < Math.min(width, footprint.x + footprint.width); x++) {
          const cell = cells[y * width + x];
          if (cell) selection.push(cell);
        }
      }
      for (const cell of selection) cell.classList.add("selected-entity-cell");
    },
    restore() {
      for (const { element, original } of overlays) Object.assign(element.style, original);
      for (const cell of selection) cell.classList.remove("selected-entity-cell");
      for (const cell of originalSelection) cell.classList.add("selected-entity-cell");
    }
  };
}
