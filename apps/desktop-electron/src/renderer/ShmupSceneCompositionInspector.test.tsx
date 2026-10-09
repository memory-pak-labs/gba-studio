/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeSceneComposition } from "../shared/sceneComposition";
import { ShmupSceneCompositionInspector } from "./ShmupSceneCompositionInspector";

describe("ShmupSceneCompositionInspector", () => {
  afterEach(() => cleanup());

  it("mostra o fallback tiled quando o Affine não tem opt-in", () => {
    const composition = normalizeSceneComposition({
      enabled: true,
      mode: "affine",
      layers: [{
        id: "day",
        kind: "affine_bg",
        role: "decorative",
        layer: "BG2",
        enabled: true,
        assetId: "day-bg.png"
      }]
    });

    render(
      <ShmupSceneCompositionInspector
        capabilityEnabled={false}
        composition={composition}
        roomHeight={20}
        roomWidth={90}
      />
    );

    const inspector = document.querySelector<HTMLElement>(".shmup-scene-composition-inspector");
    if (!inspector) throw new Error("Inspector de composição SHMUP não foi renderizado");
    expect(inspector).toHaveTextContent("Affine bloqueado · habilite o opt-in");
    expect(inspector).toHaveTextContent("1 incompatibilidade(s)");
    expect(inspector).toHaveTextContent("BG2 · Tiled regular");
    expect(inspector).toHaveTextContent("nenhum · fallback tiled");
    expect(within(inspector).getByText("Background Affine no SHMUP exige a capability affine_background habilitada explicitamente.")).toBeInTheDocument();
  });
});
