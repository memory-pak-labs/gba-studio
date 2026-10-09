/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSceneResourceManifest, type SceneResourceManifest } from "../shared/sceneResourceContract";
import { SceneResourceInspector } from "./SceneResourceInspector";

describe("SceneResourceInspector", () => {
  afterEach(() => cleanup());

  it("mantém o manifesto vazio sem habilitar recursos por inferência", () => {
    render(
      <SceneResourceInspector
        assetOptions={[{ label: "Porto", value: "porto.png" }]}
        onChange={vi.fn()}
        value={defaultSceneResourceManifest()}
      />
    );

    expect(screen.getByText("0 recurso(s) declarado(s)")).toBeInTheDocument();
    expect(screen.getByText("Nenhum recurso opt-in. A cena usa apenas os assets do fluxo padrão.")).toBeInTheDocument();
    expect(screen.getByText("0 recurso(s) serão exportado(s).")).toBeInTheDocument();
  });

  it("cria um recurso ligado ao asset e expõe o contrato físico", () => {
    const onChange = vi.fn();
    function Harness(): React.ReactElement {
      const [value, setValue] = useState<SceneResourceManifest>(defaultSceneResourceManifest());
      return <SceneResourceInspector assetOptions={[{ label: "Porto", value: "porto.png" }]} onChange={(next) => {
        setValue(next);
        onChange(next);
      }} value={value} />;
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar recurso" }));

    expect(screen.getByText("1 recurso(s) declarado(s)")).toBeInTheDocument();
    expect(screen.getByLabelText("Asset do recurso porto.png")).toHaveValue("porto.png");
    expect(screen.getByLabelText("Modo de compressão do recurso porto.png")).toHaveValue("auto");
    expect(screen.getByText("Orçamento físico declarado")).toBeInTheDocument();

    expect([...screen.getByLabelText<HTMLSelectElement>("BPP do recurso porto.png").options].map(option => option.value)).toEqual(["4"]);
    fireEvent.change(screen.getByLabelText("Tipo do recurso porto.png"), { target: { value: "obj" } });
    fireEvent.change(screen.getByLabelText("BPP do recurso porto.png"), { target: { value: "8" } });

    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      resources: [{
        assetId: "porto.png",
        bpp: 8,
        enabled: true,
        required: true,
        compression: { strategy: "auto", tiles: "auto", tilemap: "auto", palette: "auto" }
      }]
    });
  });

  it("permite selecionar Huffman por componente no modo manual", () => {
    const onChange = vi.fn();
    function Harness(): React.ReactElement {
      const [value, setValue] = useState<SceneResourceManifest>(defaultSceneResourceManifest());
      return <SceneResourceInspector assetOptions={[{ label: "Porto", value: "porto.png" }]} onChange={(next) => {
        setValue(next);
        onChange(next);
      }} value={value} />;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar recurso" }));
    fireEvent.change(screen.getByLabelText("Modo de compressão do recurso porto.png"), { target: { value: "manual" } });
    fireEvent.change(screen.getByLabelText("Compressão dos tiles do recurso porto.png"), { target: { value: "huffman" } });

    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      resources: [{ compression: { strategy: "manual", tiles: "huffman", tilemap: "none", palette: "none" } }]
    });
  });
});
