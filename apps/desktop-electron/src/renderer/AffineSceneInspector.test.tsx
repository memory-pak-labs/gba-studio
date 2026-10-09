/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeAffineScenePresentation } from "../shared/affineScene";
import { AffineSceneInspector } from "./AffineSceneInspector";

describe("AffineSceneInspector", () => {
  afterEach(() => cleanup());

  it("mantém a camada opcional fechada até o usuário ativá-la", () => {
    const onChange = vi.fn();

    render(
      <AffineSceneInspector
        assetOptions={[{ label: "Onda affine", value: "onda_affine.png" }]}
        onChange={onChange}
        value={normalizeAffineScenePresentation(undefined)}
      />
    );

    expect(screen.getByRole("checkbox", { name: /^Ativar camada Affine/ })).not.toBeChecked();
    expect(screen.queryByLabelText("Asset Affine")).not.toBeInTheDocument();
  });

  it("expõe controles seguros e normaliza a alteração da camada", () => {
    const onChange = vi.fn();
    function Harness(): React.ReactElement {
      const [value, setValue] = useState(normalizeAffineScenePresentation(undefined));
      return <AffineSceneInspector assetOptions={[{ label: "Onda affine", value: "onda_affine.png" }]} onChange={(next) => {
        setValue(next);
        onChange(next);
      }} value={value} />;
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: /^Ativar camada Affine/ }));
    fireEvent.change(screen.getByLabelText("Asset Affine"), { target: { value: "onda_affine.png" } });
    fireEvent.change(screen.getByLabelText("Camada Affine"), { target: { value: "BG3" } });
    fireEvent.change(screen.getByLabelText("Rotação"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Escala X valor exato"), { target: { value: "1.5" } });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0]).toEqual(expect.objectContaining({
      assetId: "onda_affine.png",
      enabled: true,
      layer: "BG3",
      rotationDegrees: 45,
      scaleX: 1.5
    }));
    expect(screen.getByText("Camada decorativa · não altera colisão ou tilemap")).toBeInTheDocument();
  });
});
