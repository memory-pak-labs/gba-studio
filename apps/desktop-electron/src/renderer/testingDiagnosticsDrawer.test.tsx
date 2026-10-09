/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveAdvancedToolsPresentation } from "../shared/advancedTools.js";
import {
  appendHardwareProfilerFrame,
  createHardwareProfilerSession
} from "../shared/hardwareProfilerSessions.js";
import { TestingDiagnosticsDrawer } from "./testingDiagnosticsDrawer.js";

afterEach(cleanup);

const replay = {
  schema: 1 as const,
  id: "run-1",
  seed: 42,
  initialSaveSlot: null,
  initialVariables: {},
  initialInventory: {},
  runs: [{ frame: { held: ["A"], pressed: ["A"] }, frames: 1 }],
  checkpoints: {},
  frameCount: 1
};

describe("TestingDiagnosticsDrawer", () => {
  it("nao ocupa a interface quando esta fechado", () => {
    const projectData = {};
    const { container } = render(
      <TestingDiagnosticsDrawer
        isOpen={false}
        onChangeProjectData={vi.fn()}
        onClose={vi.fn()}
        onEnableTool={vi.fn()}
        presentation={deriveAdvancedToolsPresentation(projectData)}
        projectData={projectData}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("concentra replay, saves e Link Cable sem recriar o workspace removido", () => {
    const projectData = {
      rooms: [{ id: "start", name: "start" }],
      settings: { general: { startScene: "start" } },
      advancedTools: {
        inputReplays: [replay],
        saveLabSnapshots: [{ id: "save-1", name: "Início", slot: 0, variables: {}, inventory: {}, corruption: "none" }]
      }
    };
    const onRunReplay = vi.fn();
    const onToggleInputRecording = vi.fn();
    render(
      <TestingDiagnosticsDrawer
        isOpen
        onChangeProjectData={vi.fn()}
        onClose={vi.fn()}
        onEnableTool={vi.fn()}
        onRunReplay={onRunReplay}
        onToggleInputRecording={onToggleInputRecording}
        presentation={deriveAdvancedToolsPresentation(projectData)}
        projectData={projectData}
      />
    );

    expect(screen.getByLabelText("Testes e diagnóstico")).toBeInTheDocument();
    expect(screen.getByText("Gravação e reprodução de inputs")).toBeInTheDocument();
    expect(screen.getAllByText("Laboratório de saves")).toHaveLength(2);
    expect(screen.getByText("Link Cable")).toBeInTheDocument();
    expect(screen.queryByText("Terreno e autotile")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gravar sessão de Play" }));
    expect(onToggleInputRecording).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Executar replay" }));
    expect(onRunReplay).toHaveBeenCalledWith(expect.objectContaining({ id: "run-1", seed: 42 }));
  });

  it("identifica a cena e o runtime responsáveis pelos picos medidos", () => {
    const projectData = { rooms: [{ id: "stage", name: "falésias", sceneType: "platformer" }] };
    const profilerSession = appendHardwareProfilerFrame(createHardwareProfilerSession("play-1"), {
      frame: 420,
      roomIndex: 0,
      sceneName: "falésias",
      runtime: "platformer",
      cpu: 72.4,
      dma: 310,
      vram: 72_000,
      oam: 84,
      scanline: 1
    });

    render(
      <TestingDiagnosticsDrawer
        isOpen
        onChangeProjectData={vi.fn()}
        onClose={vi.fn()}
        onEnableTool={vi.fn()}
        presentation={deriveAdvancedToolsPresentation(projectData)}
        profilerSession={profilerSession}
        projectData={projectData}
      />
    );

    const sessions = screen.getByLabelText("Sessões do perfil de hardware");
    expect(within(sessions).getByText("falésias")).toBeInTheDocument();
    expect(within(sessions).getByText(/platformer · 1 frame/)).toBeInTheDocument();
    expect(within(sessions).getByText(/CPU 72,4%/)).toBeInTheDocument();
    expect(within(sessions).getByText(/VRAM 72.000 B/)).toBeInTheDocument();
  });

  it("exibe a telemetria de áudio recebida do Play", () => {
    render(
      <TestingDiagnosticsDrawer
        isOpen
        onChangeProjectData={vi.fn()}
        onClose={vi.fn()}
        onEnableTool={vi.fn()}
        presentation={deriveAdvancedToolsPresentation({})}
        projectData={{}}
        runtimeAudio={{
          pcmSourceBytes: 600,
          mixerBufferBytes: 4096,
          activeVoiceCount: 3,
          pcmUnderrunCount: 2,
          pcmSubmittedBlocks: 18
        }}
      />
    );

    const audio = screen.getByLabelText("Telemetria de áudio no Play");
    expect(within(audio).getByText(/600 B de fontes PCM/)).toBeInTheDocument();
    expect(within(audio).getByText(/3 vozes ativas/)).toBeInTheDocument();
    expect(within(audio).getByText(/2 underruns/)).toBeInTheDocument();
  });
});
