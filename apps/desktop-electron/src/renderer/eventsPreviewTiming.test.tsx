/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import { EventInspectorPanel, EventsWorkspace } from "./eventsWorkspace.js";
import type { GBAProjectData } from "../shared/projectFile.js";

function show(commands: string[], inspector = false, extraEvents: Record<string, unknown>[] = [], extraProject: GBAProjectData = {}) {
  const projectData: GBAProjectData = {
    scenas: [{ name: "start", sceneType: "topdown", width: 30, height: 20 }],
    events: [{ id: "test", name: "test", category: "Cena", steps: commands.map(command => ({ command, isEnabled: true })) }, ...extraEvents],
    settings: { general: { startScene: "start" } }, ...extraProject
  };
  const Component = inspector ? EventInspectorPanel : EventsWorkspace;
  render(<Component eventName="test" triggerLabel="Script do projeto" presentation={deriveEventsWorkspacePresentation(projectData)} projectData={projectData}
    onCreateEvent={vi.fn()} onUpdateEventFields={vi.fn()} onAddEventStep={vi.fn()} onUpdateEventStep={vi.fn()}
    onUpdateEventGraphNodePosition={vi.fn()} onRetargetEventGraphEdge={vi.fn()} onConnectEventGraphNodes={vi.fn()}
    onRemoveEventGraphEdge={vi.fn()} onBindEventToTarget={vi.fn()} onCreateBoundEventForTarget={vi.fn(() => null)}
    onRemoveEventTargetBinding={vi.fn()} onRemoveEventStep={vi.fn()} onRenameEvent={vi.fn()} onDuplicateEvent={vi.fn()}
    onExportEvent={vi.fn()} onRemoveEvent={vi.fn()} onRelayoutEventsGraph={vi.fn()}/>);
  if (inspector) fireEvent.click(screen.getByText("Simular script"));
  fireEvent.click(screen.getByRole("button", { name: inspector ? "Executar simulação" : "Executar daqui" }));
}

describe("rendered event simulation timing", () => {
  afterEach(cleanup);

  it("shows an active wait and automatically renders the resumed result", async () => {
    show(["idle 12", "set_variable done 1"]);
    expect(screen.getByText("Aguardando evento")).toBeInTheDocument();
    expect(screen.getByText(/Espera: 12 quadros restantes/)).toBeInTheDocument();
    expect(screen.queryByText("done = 1")).not.toBeInTheDocument();
    expect(await screen.findByText("done = 1")).toBeInTheDocument();
    expect(screen.getByText("Caminho executado")).toBeInTheDocument();
    expect(screen.queryByText(/quadros restantes/)).not.toBeInTheDocument();
  });

  it("keeps invalid callback bindings visible", () => {
    show(["attach_adventure_callback on_room_exit missing"]);
    expect(screen.getByText("Execução com limitações")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Evento do callback não encontrado: missing");
  });

  it("makes the same yielding flow usable from the current event inspector", async () => {
    show(["idle 12", "set_variable done 1"], true);
    expect(screen.getByText("Aguardando evento")).toBeInTheDocument();
    expect(await screen.findByText("done = 1")).toBeInTheDocument();
    expect(screen.getByText("Caminho executado")).toBeInTheDocument();
  });

  it("lets the user trigger a bound adventure callback from the simulator", async () => {
    show(["attach_adventure_callback interact clicked"], true, [{ name: "clicked", steps: [{ command: "add_variable clicks 1" }] }]);
    fireEvent.click(screen.getByRole("button", { name: "Interagir" }));
    expect(await screen.findByText("clicks = 1")).toBeInTheDocument();
    expect(screen.getByText("Caminho executado")).toBeInTheDocument();
  });

  it("lets the user walk into a scripted portal and inspect its exit and destination", async () => {
    show(["attach_adventure_callback on_room_exit exit"], true, [
      { name: "exit", steps: [{ command: "add_variable exits 1" }] },
      { name: "portal", steps: [{ command: "change_scene other 4 5 right" }] }
    ], {
      scenas: [{ name: "start", sceneType: "topdown", width: 30, height: 20, playerActorName: "Player" },
        { name: "other", sceneType: "topdown", width: 30, height: 20 }],
      actors: [{ id: "player", name: "Player", roomName: "start", x: 2, y: 3 }],
      settings: { general: { startScene: "start" }, topdown: { gridSize: "8" } },
      editorState: { scenaConnections: [{ from: "start", to: "other", exit: { x: 3, y: 3, width: 1, height: 1 }, eventName: "portal" }] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Mover à direita" }));
    expect(await screen.findByText("exits = 1")).toBeInTheDocument();
    expect(screen.getByText(/Cena: other/)).toHaveTextContent("Posição: 4, 5");
    expect(screen.queryByText("Execução com limitações")).not.toBeInTheDocument();
  });
  it("accepts menu navigation and confirmation while the script awaits a response", async () => {
    show(["open_menu choices answer", "set_variable done 1"], true, [], {
      dialogues: [{ key: "choices", text: "Escolha", choices: ["Primeira", "Segunda"] }]
    });
    expect(screen.getByText("Aguardando resposta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Selecionar próxima opção" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("answer = 2")).toBeInTheDocument();
    expect(await screen.findByText("done = 1")).toBeInTheDocument();
  });

  it("shows the selected owned item and equipped slot during equipment input", () => {
    show(["add_item sword 1", "open_equip_menu 2 true"], true);
    expect(screen.getByRole("status")).toHaveTextContent("Equipamento 1: Nenhum");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByRole("status")).toHaveTextContent("Seleção: Remover equipamento");
    fireEvent.click(screen.getByRole("button", { name: "Selecionar próxima opção" }));
    expect(screen.getByRole("status")).toHaveTextContent("Seleção: sword");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByRole("status")).toHaveTextContent("Equipamento 1: sword");
  });

});
