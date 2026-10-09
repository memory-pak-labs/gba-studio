/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSceneMetatileAuthoring, type SceneMetatileAuthoringConfig } from "../shared/sceneMetatileContract";
import { SceneMetatileInspector } from "./SceneMetatileInspector";

describe("SceneMetatileInspector", () => {
  afterEach(() => cleanup());

  it("mantém metatiles desativados até o opt-in explícito", () => {
    render(
      <SceneMetatileInspector
        height={8}
        onChange={() => undefined}
        value={defaultSceneMetatileAuthoring()}
        width={10}
      />
    );

    expect(screen.getByRole("checkbox", { name: /Ativar autoria de metatiles/ })).not.toBeChecked();
    expect(screen.queryByText(/blocos lógicos/)).not.toBeInTheDocument();
  });

  it("cria a biblioteca e o mapa lógico ao ativar o contrato", () => {
    function Harness(): React.ReactElement {
      const [value, setValue] = useState<SceneMetatileAuthoringConfig>(defaultSceneMetatileAuthoring());
      return <SceneMetatileInspector height={8} onChange={setValue} value={value} width={10} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Ativar autoria de metatiles/ }));

    expect(screen.getByText("5 × 4 blocos lógicos")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mapa lógico de metatiles" })).toHaveValue("0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar metatile" }));
    expect(screen.getByText("2 definição(ões)")).toBeInTheDocument();
  });

  it("mostra a autoria quando a capability foi habilitada no registro da cena", () => {
    const onChange = vi.fn();
    render(
      <SceneMetatileInspector
        capabilityEnabled
        height={2}
        onChange={onChange}
        value={defaultSceneMetatileAuthoring()}
        width={4}
      />
    );

    expect(screen.getByRole("checkbox", { name: /Ativar autoria de metatiles/ })).toBeChecked();
    expect(screen.getByText("2 × 1 blocos lógicos")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do metatile 1" }), { target: { value: "Grama" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, library: [expect.objectContaining({ label: "Grama" })] }));
  });
});
