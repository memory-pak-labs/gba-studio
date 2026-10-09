/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MenuSceneItem } from "../shared/menuScene";
import { MenuActorControlInspector } from "./MenuActorControlInspector";

describe("MenuActorControlInspector", () => {
  afterEach(cleanup);

  it("explica o agrupamento visual e abre o evento do item lógico", () => {
    const onOpenEvent = vi.fn();
    const item = {
      id: "slot-1",
      label: "Slot 1 · Salvar agora",
      action: "select",
      eventName: "menu_salvar_slot_1"
    } as MenuSceneItem;

    render(
      <MenuActorControlInspector
        actorName="SLOT 1 · inferior esquerda"
        menuActorRole="option"
        menuItem={item}
        onOpenEvent={onOpenEvent}
        visualPartCount={4}
      />
    );

    expect(screen.getByText("Controle do menu")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("menu_salvar_slot_1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir evento do item" }));
    expect(onOpenEvent).toHaveBeenCalledWith("menu_salvar_slot_1");
  });
});
