/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSceneComposition, type SceneCompositionConfig } from "../shared/sceneComposition";
import { SceneCompositionInspector } from "./SceneCompositionInspector";

describe("SceneCompositionInspector", () => {
  afterEach(() => cleanup());

  it("authors waves and background gradients without editing raw scanline tables", () => {
    const changed = vi.fn();
    function Harness() {
      const [value, setValue] = useState<SceneCompositionConfig>({ ...defaultSceneComposition(), enabled: true });
      return <SceneCompositionInspector assetOptions={[]} onChange={next => { changed(next); setValue(next); }} sceneType="topdown" value={value} />;
    }
    render(<Harness/>);
    expect(screen.getByLabelText("Prévia demonstrativa de ondulação e gradiente")).toHaveAttribute("width", "240");
    fireEvent.click(screen.getByRole("checkbox", { name: /^Ondulação$/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Camada da ondulação" }), { target: { value: "BG3" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /^Gradiente de fundo$/ }));
    fireEvent.change(screen.getByLabelText("Cor inicial do gradiente"), { target: { value: "#204060" } });
    const result = changed.mock.calls.at(-1)![0] as SceneCompositionConfig;
    expect(result.effects.raster?.ripple).toMatchObject({ enabled: true, layer: "BG3" });
    expect(result.effects.raster?.gradient).toMatchObject({ enabled: true, from: "#204060" });
    expect(result.effects.hblank.enabled).toBe(false);
  });

  it("mantém o modo tiled desabilitado até o opt-in explícito", () => {
    render(
      <SceneCompositionInspector
        assetOptions={[{ label: "Porto", value: "porto.png" }]}
        onChange={vi.fn()}
        sceneType="shmup"
        value={defaultSceneComposition()}
      />
    );

    expect(screen.getByRole("checkbox", { name: /^Ativar composição avançada/ })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Modo de vídeo da cena" })).toHaveValue("tilemap");
    expect(screen.getByText(/Sem opt-in/)).toBeInTheDocument();
  });

  it("cria uma camada bitmap quando o modo avançado é escolhido", () => {
    function Harness(): React.ReactElement {
      const [value, setValue] = useState<SceneCompositionConfig>(defaultSceneComposition());
      return <SceneCompositionInspector assetOptions={[{ label: "Porto", value: "porto.png" }]} onChange={setValue} sceneType="shmup" value={value} />;
    }

    render(<Harness />);

    fireEvent.change(screen.getByRole("combobox", { name: "Modo de vídeo da cena" }), { target: { value: "bitmap4" } });

    expect(screen.getByRole("checkbox", { name: /^Ativar composição avançada/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Asset da camada bitmap_1" })).toHaveValue("porto.png");
    expect(screen.getByText(/Contrato de composição compatível/)).toBeInTheDocument();
  });
});
