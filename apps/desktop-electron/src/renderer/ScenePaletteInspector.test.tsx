/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScenePaletteInspector } from "./ScenePaletteInspector";

describe("ScenePaletteInspector", () => {
  it("vincula a cena a uma família e exibe as paletas de fundo e OBJ", async () => {
    const user = userEvent.setup();
    const onChangeFamily = vi.fn();
    const onChangeBankPolicy = vi.fn();
    const onOpenColorsWorkspace = vi.fn();

    render(
      <ScenePaletteInspector
        families={[{
          id: "harbor",
          name: "Porto ao amanhecer",
          background: [0x0000, 0x001f],
          objects: [0x0000, 0x03e0]
        }]}
        onChangeBankPolicy={onChangeBankPolicy}
        onChangeFamily={onChangeFamily}
        onOpenColorsWorkspace={onOpenColorsWorkspace}
        paletteBankPolicy="shared-ui"
        selectedFamilyID="harbor"
      />
    );

    expect(screen.getByRole("region", { name: "Paletas da cena" })).toHaveTextContent("Porto ao amanhecer");
    expect(screen.getByRole("region", { name: "Paleta Fundo" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Paleta Sprites / OBJ" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(32);

    await user.selectOptions(screen.getByRole("combobox", { name: "Família de cores da cena" }), "");
    expect(onChangeFamily).toHaveBeenCalledWith(null);
    await user.selectOptions(screen.getByRole("combobox", { name: "Política de bancos BG" }), "full-screen");
    expect(onChangeBankPolicy).toHaveBeenCalledWith("full-screen");
    await user.click(screen.getByRole("button", { name: "Editar no workspace Cores" }));
    expect(onOpenColorsWorkspace).toHaveBeenCalledTimes(1);
  });
});
