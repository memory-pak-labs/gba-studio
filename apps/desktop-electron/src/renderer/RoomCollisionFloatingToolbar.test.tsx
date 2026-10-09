/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sceneTypeProfile } from "../shared/sceneTypeProfiles.js";
import { RoomCollisionFloatingToolbar } from "./RoomCollisionFloatingToolbar.js";

describe("RoomCollisionFloatingToolbar", () => {
  it("offers functional ramp tools and hides unsupported platformer effects", () => {
    render(<RoomCollisionFloatingToolbar
      allowedCollisionTypes={sceneTypeProfile("platformer").collisionTypes}
      collisionHoverPreviewEnabled
      onClearCollision={vi.fn()}
      onSetBorderCollision={vi.fn()}
      selectedCellIndex={null}
      selectedCollisionType="solid"
      setCollisionHoverPreviewEnabled={vi.fn()}
      setSelectedCollisionType={vi.fn()}
    />);

    expect(screen.getByRole("button", { name: "Tipo de colisao Rampa subindo à direita" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tipo de colisao Rampa subindo à esquerda" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tipo de colisao Agua" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tipo de colisao Evento" })).not.toBeInTheDocument();
  });
});
