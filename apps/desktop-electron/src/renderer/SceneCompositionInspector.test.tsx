/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSceneComposition, type SceneCompositionConfig } from "../shared/sceneComposition";
import { SceneCompositionInspector } from "./SceneCompositionInspector";

describe("SceneCompositionInspector", () => {
  afterEach(() => cleanup());

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
