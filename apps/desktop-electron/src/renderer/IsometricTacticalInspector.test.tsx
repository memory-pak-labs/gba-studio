/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IsometricTacticalInspector } from "./IsometricTacticalInspector";

describe("IsometricTacticalInspector", () => {
  afterEach(() => cleanup());

  it("mantém as sete capabilities desligadas até o usuário fazer opt-in", () => {
    const onChangeCapabilities = vi.fn();
    const onChangePresentation = vi.fn();

    render(
      <IsometricTacticalInspector
        capabilities={undefined}
        editorTools={["paint", "collision", "height", "actor", "room"]}
        onChangeCapabilities={onChangeCapabilities}
        onChangePresentation={onChangePresentation}
      />
    );

    expect(screen.getByRole("region", { name: "Autoria tática isométrica" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(screen.getAllByRole("checkbox").every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);
    expect(onChangeCapabilities).not.toHaveBeenCalled();
  });

  it("persiste somente a capability e o binding editados", () => {
    const onChangeCapabilities = vi.fn();
    const onChangePresentation = vi.fn();

    render(
      <IsometricTacticalInspector
        capabilities={[]}
        editorTools={["paint", "collision", "height", "actor", "room"]}
        onChangeCapabilities={onChangeCapabilities}
        onChangePresentation={onChangePresentation}
        presentation={{ units: [{ actorId: "nara", sheet: "nara-sheet" }], props: [] }}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Ativar capability Unidades táticas OBJ" }));
    expect(onChangeCapabilities).toHaveBeenCalledWith([{ id: "tactical_units", enabled: true, settings: {} }]);

    fireEvent.change(screen.getByRole("textbox", { name: "Asset da superfície BG2" }), { target: { value: "surface.png" } });
    expect(onChangePresentation).toHaveBeenCalledWith(expect.objectContaining({ surfaceAsset: "surface.png" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Animação attack_right da unidade 1" }), { target: { value: "nara_attack_right" } });
    expect(onChangePresentation).toHaveBeenLastCalledWith(expect.objectContaining({
      units: [expect.objectContaining({ animations: expect.objectContaining({ attack_right: "nara_attack_right" }) })]
    }));
  });

  it("expõe páginas BG2 e sua residência sem inventar páginas", () => {
    const onChangePresentation = vi.fn();
    render(
      <IsometricTacticalInspector
        capabilities={[{ id: "tactical_surface", enabled: true, settings: {} }]}
        editorTools={["room"]}
        onChangeCapabilities={vi.fn()}
        onChangePresentation={onChangePresentation}
        presentation={{
          surfacePages: [{ id: "p0", asset: "p0.png", bankGroup: "p0", world: { x: 0, y: 0, width: 240, height: 160 } }],
          surfaceResidency: { exclusiveBankGroups: ["p0"], maxResidentGroups: 1, prefetchMarginPixels: 16 },
          units: [],
          props: []
        }}
      />
    );
    expect(screen.getByText(/Catálogo: 1 páginas/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Bank group da página BG2 1" }), { target: { value: "p0-next" } });
    expect(onChangePresentation).toHaveBeenCalledWith(expect.objectContaining({
      surfacePages: [expect.objectContaining({ bankGroup: "p0-next" })]
    }));
  });
});
