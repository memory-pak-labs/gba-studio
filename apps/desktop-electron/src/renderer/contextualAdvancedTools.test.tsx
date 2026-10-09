/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveAdvancedToolsPresentation } from "../shared/advancedTools.js";
import { WorkspaceAdvancedTools } from "./contextualAdvancedTools.js";
import { StudioI18nProvider } from "./i18n.js";

afterEach(cleanup);

describe("WorkspaceAdvancedTools", () => {
  it("mostra somente a ferramenta pertencente ao workspace atual", () => {
    const projectData = {
      rooms: [{ name: "start" }],
      settings: { general: { startScene: "start" } }
    };
    const onEnableTool = vi.fn();
    render(
      <StudioI18nProvider>
        <WorkspaceAdvancedTools
          onChangeProjectData={vi.fn()}
          onEnableTool={onEnableTool}
          presentation={deriveAdvancedToolsPresentation(projectData)}
          projectData={projectData}
          surface="Arquivos"
        />
      </StudioI18nProvider>
    );

    expect(screen.getByText("Fontes externas")).toBeInTheDocument();
    expect(screen.getByText("Aseprite e Tiled TSX")).toBeInTheDocument();
    expect(screen.queryByText("Gravação e reprodução de inputs")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao projeto" }));
    expect(onEnableTool).toHaveBeenCalledWith("asepriteTsx");
  });

  it("limita os editores visuais aos recursos da cena", () => {
    const projectData = {
      rooms: [{ id: "start", name: "start", width: 2, height: 2, tilemap: [0, 0, 0, 0] }],
      settings: { general: { startScene: "start" } },
      advancedTools: {
        autotileSets: [{ id: "terrain-1", name: "Terreno", baseTile: 16, topology: "four-neighbor" }],
        particleEmitters: [{ id: "emitter-1", name: "Poeira", preset: "dust", maxParticles: 12, maxPerScanline: 6, lifetimeFrames: 24 }],
        actorStateMachines: [{ id: "machine-1", name: "Inimigo", initialState: "idle", states: [{ id: "idle" }], transitions: [] }]
      }
    };
    render(
      <StudioI18nProvider>
        <WorkspaceAdvancedTools
          onChangeProjectData={vi.fn()}
          onEnableTool={vi.fn()}
          presentation={deriveAdvancedToolsPresentation(projectData)}
          projectData={projectData}
          sceneType="platformer"
          surface="Editor"
        />
      </StudioI18nProvider>
    );

    expect(screen.getByRole("heading", { name: "Autotile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partículas" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Máquinas de estado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Laboratório de saves" })).not.toBeInTheDocument();
  });

  it("mostra timeline em cutscene sem oferecer autotile ou partículas", () => {
    const projectData = {
      rooms: [{ id: "intro", name: "intro", sceneType: "cutscene" }],
      settings: { general: { startScene: "intro" } },
      advancedTools: {
        autotileSets: [{ id: "terrain-1", name: "Terreno", baseTile: 16, topology: "four-neighbor" }],
        particleEmitters: [{ id: "emitter-1", name: "Poeira", preset: "dust", maxParticles: 12, maxPerScanline: 6, lifetimeFrames: 24 }],
        cinematicTimelines: [{ id: "timeline-1", name: "Abertura", tracks: [] }]
      }
    };
    render(
      <StudioI18nProvider>
        <WorkspaceAdvancedTools
          onChangeProjectData={vi.fn()}
          onEnableTool={vi.fn()}
          presentation={deriveAdvancedToolsPresentation(projectData)}
          projectData={projectData}
          sceneType="cutscene"
          surface="Editor"
        />
      </StudioI18nProvider>
    );

    expect(screen.getByRole("heading", { name: "Timeline cinematográfica" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Autotile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Partículas" })).not.toBeInTheDocument();
  });

  it("monta os recursos no contexto local sem criar o painel global", () => {
    const projectData = {
      rooms: [{ id: "start", name: "start", width: 2, height: 2, tilemap: [0, 0, 0, 0] }],
      settings: { general: { startScene: "start" } },
      advancedTools: {
        autotileSets: [{ id: "terrain-1", name: "Terreno", baseTile: 16, topology: "four-neighbor" }]
      }
    };

    render(
      <StudioI18nProvider>
        <WorkspaceAdvancedTools
          onChangeProjectData={vi.fn()}
          onEnableTool={vi.fn()}
          presentation={deriveAdvancedToolsPresentation(projectData)}
          projectData={projectData}
          surface="Editor"
          title="Terreno e autotile"
          toolIDs={["autotile"]}
        />
      </StudioI18nProvider>
    );

    expect(screen.getByRole("heading", { name: "Terreno e autotile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Autotile" })).toBeInTheDocument();
    expect(document.querySelector("details")).not.toBeInTheDocument();
  });
});
