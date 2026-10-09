/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import type { ProjectHealthReport } from "../shared/projectHealth.js";
import { resolveSceneCapabilityManifest } from "../shared/sceneFeatureModules.js";
import { buildScenePreflightReport } from "../shared/scenePreflight.js";
import { deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace.js";
import { ProjectHealthWorkspace } from "./projectHealthWorkspace.js";

function report(): ProjectHealthReport {
  return {
    status: "warning",
    exportReady: true,
    counts: { info: 1, warning: 1, error: 0 },
    contract: {
      ok: true,
      issueCount: 0,
      validatorLabels: [],
      validatorCounts: [],
      summary: "Contrato pronto",
      detail: "Contrato válido."
    },
    diagnostics: [
      {
        id: "hud-warning",
        code: "hud.binding.missing",
        severity: "warning",
        scope: "scene",
        workspace: "Editor",
        sceneName: "Porto",
        targetName: "Porto",
        message: "HUD ausente",
        fixAction: "open_editor"
      },
      {
        id: "budget-info",
        code: "asset.budget.estimate",
        severity: "info",
        scope: "asset",
        workspace: "Arquivos",
        sceneName: "Porto",
        targetName: "Porto",
        message: "Orçamento estimado"
      }
    ],
    scenes: [
      {
        sceneName: "Porto",
        sceneType: "topdown",
        sceneLabel: "Aventura / Top-down",
        featureModules: ["movement", "quests", "shop"],
        enabledModules: ["movement", "quests"],
        runtimeCapabilities: ["topdown_movement", "quest_state"],
        assetRules: ["tilemap_4bpp", "actor_sprite_4bpp"],
        previewMode: "map",
        budget: { bgTiles: 512, objTiles: 256, oam: 64, vramBytes: 65536, eventBytes: 12288 },
        capabilityManifest: resolveSceneCapabilityManifest("topdown", [
          { id: "movement", enabled: true, settings: {} },
          { id: "quests", enabled: true, settings: {} }
        ]),
        preflight: buildScenePreflightReport({
          scenas: [{ name: "Porto", sceneType: "topdown" }]
        }, "Porto")
      }
    ]
  };
}

describe("ProjectHealthWorkspace", () => {
  afterEach(cleanup);

  it("renderiza o resumo, capacidades da cena e estado sem depender só de cor", () => {
    render(<ProjectHealthWorkspace report={report()} />);

    expect(screen.getByRole("region", { name: "Workspace Saúde" })).toBeInTheDocument();
    expect(screen.getByText("Saúde do projeto")).toBeInTheDocument();
    expect(screen.getByText("Porto")).toBeInTheDocument();
    expect(screen.getByText("Aventura / Top-down")).toBeInTheDocument();
    expect(screen.getAllByText("Atenção")).toHaveLength(1);
    expect(screen.getByText("HUD ausente")).toBeInTheDocument();
    expect(screen.getByTestId("project-health-status")).toHaveAttribute("data-project-health-status", "warning");
  });

  it("filtra diagnósticos e encaminha a ação para o inspector", async () => {
    const user = userEvent.setup();
    const onOpenDiagnostic = vi.fn();
    render(<ProjectHealthWorkspace onOpenDiagnostic={onOpenDiagnostic} report={report()} />);

    await user.click(screen.getByRole("button", { name: "Informações" }));
    expect(screen.getByText("Orçamento estimado")).toBeInTheDocument();
    expect(screen.queryByText("HUD ausente")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Avisos" }));
    await user.click(screen.getByRole("button", { name: "Abrir HUD ausente" }));
    expect(onOpenDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ id: "hud-warning" }));
  });

  it("mantém o preflight detalhado recolhido por cena", () => {
    render(<ProjectHealthWorkspace report={report()} />);

    const details = screen.getByText("Ver detalhes").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(within(details as HTMLElement).getByRole("region", { name: "Preflight da cena" })).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Diagnóstico físico")).toBeInTheDocument();
  });

  it("concentra os diagnósticos de autoria dentro dos detalhes da Saúde", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Saúde detalhada" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.name = "Porto";
    scene.width = 4;
    scene.height = 3;
    scene.backgroundAssetName = "mapa.png";
    scene.gbStudioUseBackgroundLayout = true;
    scene.collisionTypes = ["solid", ...Array.from({ length: 11 }, () => "free")];
    project.actors = [{ id: "actor-player", name: "Player", roomName: "Porto", x: 0, y: 0 }];
    project.triggers = [{ id: "trigger-exit", name: "Saída", roomName: "Porto", x: 3, y: 2, width: 2, height: 1 }];
    project.assets = [
      ...(Array.isArray(project.assets) ? project.assets : []),
      {
        id: "background-mapa",
        kind: "Background",
        name: "mapa.png",
        metadata: {
          assetcStatus: "attention",
          backgroundTileOptimizer: {
            enabled: true,
            maxSourcePixelErrorRatio: 0.13005208333333335,
            tileBudget: 439
          },
          height: 160,
          source: "Assets/backgrounds/mapa.png",
          width: 240
        }
      }
    ];

    render(
      <ProjectHealthWorkspace
        projectPath="/tmp/saude-detalhada.gba-project"
        report={report()}
        roomsPresentation={deriveRoomsWorkspacePresentation(project)}
      />
    );

    await user.click(screen.getByText("Ver detalhes"));
    expect(screen.getByRole("region", { name: "Diagnóstico geométrico da cena" })).toHaveTextContent("Trigger fora da grade: Saída.");
    expect(screen.getByRole("region", { name: "Diagnóstico de fidelidade visual da cena" })).toHaveTextContent("Revisar quantização");
    expect(screen.getByRole("button", { name: "Comparar PNG original e RGB555" })).toBeInTheDocument();
  });

  it("explica quando o relatório ainda não foi carregado", () => {
    render(<ProjectHealthWorkspace report={null} />);

    expect(screen.getByRole("status")).toHaveTextContent("Saúde indisponível");
    expect(screen.getByText(/abra ou crie um projeto/i)).toBeInTheDocument();
  });
});
