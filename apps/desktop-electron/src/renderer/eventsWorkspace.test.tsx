/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addEventStepInProject, deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace";
import type { GBAProjectData } from "../shared/projectFile";
import { EventInspectorPanel, EventsWorkspace } from "./eventsWorkspace";

describe("EventsWorkspace React smoke", () => {
  afterEach(cleanup);

  it("renders the events workspace and fires onAddEventStep from Adicionar", async () => {
    const user = userEvent.setup();
    const presentation = deriveEventsWorkspacePresentation({
      events: [{
        id: "event-boot",
        name: "room_boot",
        category: "Cena",
        steps: [{ command: "noop", isEnabled: true }]
      }]
    });
    const onAddEventStep = vi.fn();

    render(
      <EventsWorkspace
        presentation={presentation}
        projectData={{ events: [{ id: "event-boot", name: "room_boot", category: "Cena", steps: [{ command: "noop", isEnabled: true }] }] }}
        variables={[{ name: "score", kind: "variable" }]}
        onCreateEvent={vi.fn()}
        onCreateVariable={vi.fn()}
        onRemoveVariable={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={onAddEventStep}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Workspace Eventos" })).toBeInTheDocument();
    expect(screen.getByText("Editor de Eventos")).toBeInTheDocument();
    expect(screen.getByLabelText("Variaveis do projeto")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova variavel" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));

    expect(onAddEventStep).not.toHaveBeenCalled();

    const commandMenu = screen.getByRole("dialog", { name: "Adicionar evento em room_boot" });
    const firstSuggestion = commandMenu.querySelector("button.event-library-result");
    expect(firstSuggestion).not.toBeNull();
    await user.click(firstSuggestion as HTMLButtonElement);
    expect(onAddEventStep).not.toHaveBeenCalled();
    await user.click(within(commandMenu).getByRole("button", { name: "Adicionar evento selecionado" }));
    expect(onAddEventStep).toHaveBeenCalled();
  });

  it("edita o fluxo visual dentro do inspetor e mantém os campos avançados recolhidos", async () => {
    const user = userEvent.setup();
    const projectData = {
      events: [{
        id: "event-boot",
        name: "room_boot",
        category: "Cena",
        steps: [{ command: "noop", isEnabled: true }]
      }]
    };

    render(
      <EventInspectorPanel
        eventName="room_boot"
        triggerLabel="Ao Iniciar"
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Editor de room_boot" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Gatilho Ao Iniciar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voltar aos comportamentos" })).not.toBeInTheDocument();
    expect(screen.queryByText("Você está montando")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo de room_boot")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Passo 1: Sem operação" }));
    expect(screen.getByRole("region", { name: "Editar evento 1" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Editar room_boot")).not.toBeInTheDocument();

    await user.click(screen.getByText("Propriedades do script"));
    expect(screen.getByLabelText("Tipo de room_boot")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Começar com modelo de script" }));
    expect(screen.getByRole("dialog", { name: "Adicionar evento em room_boot" })).toBeInTheDocument();
  });

  it("adds a contextual block directly from the inspector library", async () => {
    const user = userEvent.setup();
    const onAddEventStep = vi.fn();
    const projectData = {
      events: [{
        id: "event-boot",
        name: "room_boot",
        category: "Cena",
        steps: [{ command: "noop", isEnabled: true }]
      }]
    };

    render(
      <EventInspectorPanel
        eventName="room_boot"
        triggerLabel="Ao Iniciar"
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={onAddEventStep}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));
    const library = screen.getByRole("dialog", { name: "Adicionar evento em room_boot" });
    const results = within(library).getByRole("region", { name: "Resultados da busca" });
    await user.click(results.querySelector("button.event-library-result") as HTMLButtonElement);
    expect(onAddEventStep).not.toHaveBeenCalled();
    await user.click(within(library).getByRole("button", { name: "Adicionar evento selecionado" }));
    expect(onAddEventStep).toHaveBeenCalledWith("event-boot", "room_boot", expect.any(String));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  });

  it("edita parâmetros simples dentro do evento no fluxo guiado", async () => {
    const user = userEvent.setup();
    const onUpdateEventStep = vi.fn();
    const projectData = {
      events: [
        {
          id: "event-boot",
          name: "room_boot",
          category: "Cena",
          steps: [{ command: "call_event room_boot", isEnabled: true }]
        },
        {
          id: "event-start",
          name: "player_start",
          category: "Cena",
          steps: []
        }
      ]
    };

    render(
      <EventInspectorPanel
        eventName="room_boot"
        triggerLabel="Ao Iniciar"
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onUpdateEventStep={onUpdateEventStep}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Passo 1: Chamar script" }));
    expect(screen.getByRole("region", { name: "Editar evento 1" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Script do evento")).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Script do evento"), "player_start");

    expect(onUpdateEventStep).toHaveBeenCalledWith("event-boot", 0, {
      command: "call_event player_start"
    });
  });

  it("insere um evento arrastado diretamente no ramo do evento", () => {
    const onInsertEventSteps = vi.fn();
    const projectData = {
      events: [{
        id: "event-door",
        name: "door_enter",
        category: "Cena",
        steps: [
          { command: "if_flag door_open", isEnabled: true },
          { command: "condition_end", isEnabled: true }
        ]
      }]
    };

    render(
      <EventInspectorPanel
        eventName="door_enter"
        triggerLabel="Ao entrar"
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onInsertEventSteps={onInsertEventSteps}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    fireEvent.drop(screen.getByRole("button", { name: "Adicionar evento em Se sim" }), {
      dataTransfer: {
        getData: (type: string) => type === "application/x-gba-command" ? "show_dialogue door_open" : ""
      }
    });

    expect(onInsertEventSteps).toHaveBeenCalledWith(
      "event-door",
      { kind: "trueBranch", conditionIndex: 0 },
      ["show_dialogue door_open"]
    );
  });

  it("expõe no fluxo o comando recém-adicionado para edição guiada", async () => {
    const user = userEvent.setup();
    const initialProjectData = {
      events: [
        {
          id: "event-boot",
          name: "room_boot",
          category: "Cena",
          steps: [
            { command: "play_music intro_theme.mod", isEnabled: true },
            { command: "show_dialogue intro_001", isEnabled: true }
          ]
        },
        { id: "event-start", name: "player_start", category: "Cena", steps: [] }
      ]
    };

    function LiveEventInspector(): React.ReactElement {
      const [projectData, setProjectData] = useState<GBAProjectData>(initialProjectData);
      return (
        <EventInspectorPanel
          eventName="room_boot"
          triggerLabel="Ao iniciar"
          onAddEventStep={(eventID, _eventName, command) => setProjectData((current) => addEventStepInProject(current, eventID, command ?? "noop"))}
          onBindEventToTarget={vi.fn()}
          onConnectEventGraphNodes={vi.fn()}
          onCreateBoundEventForTarget={vi.fn(() => null)}
          onCreateEvent={vi.fn()}
          onDuplicateEvent={vi.fn()}
          onExportEvent={vi.fn()}
          onRelayoutEventsGraph={vi.fn()}
          onRemoveEvent={vi.fn()}
          onRemoveEventGraphEdge={vi.fn()}
          onRemoveEventStep={vi.fn()}
          onRemoveEventTargetBinding={vi.fn()}
          onRenameEvent={vi.fn()}
          onRetargetEventGraphEdge={vi.fn()}
          onUpdateEventFields={vi.fn()}
          onUpdateEventGraphNodePosition={vi.fn()}
          onUpdateEventStep={vi.fn()}
          presentation={deriveEventsWorkspacePresentation(projectData)}
          projectData={projectData}
        />
      );
    }

    render(<LiveEventInspector />);
    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));
    await user.click(screen.getByRole("button", { name: "Chamar script" }));
    await user.click(screen.getByRole("button", { name: "Adicionar evento selecionado" }));

    expect(await screen.findByRole("button", { name: "Passo 3: Chamar script" })).toBeInTheDocument();
  });

  it("adds commands to the real no branch instead of a decorative branch", async () => {
    const user = userEvent.setup();
    const onInsertEventSteps = vi.fn();
    const projectData = {
      events: [{
        id: "event-door",
        name: "door_enter",
        category: "Cena",
        steps: [
          { command: "if_flag door_open", isEnabled: true },
          { command: "show_text welcome", isEnabled: true },
          { command: "condition_end", isEnabled: true }
        ]
      }]
    };

    render(
      <EventInspectorPanel
        eventName="door_enter"
        triggerLabel="Ao entrar"
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onInsertEventSteps={onInsertEventSteps}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Adicionar evento em Se não" }));
    const commandMenu = screen.getByRole("dialog", { name: "Adicionar evento em door_enter" });
    const firstSuggestion = commandMenu.querySelector("button.event-library-result");
    expect(firstSuggestion).not.toBeNull();
    await user.click(firstSuggestion as HTMLButtonElement);
    expect(onInsertEventSteps).not.toHaveBeenCalled();
    await user.click(within(commandMenu).getByRole("button", { name: "Adicionar evento selecionado" }));

    expect(onInsertEventSteps).toHaveBeenCalledWith("event-door", { kind: "falseBranch", conditionIndex: 0 }, expect.any(Array));
  });

  it("selects concrete steps before applying a batch editor action", async () => {
    const user = userEvent.setup();
    const onUpdateEventStep = vi.fn();
    const projectData = {
      events: [{ id: "event-boot", name: "room_boot", category: "Cena", steps: [{ command: "noop", isEnabled: true }] }]
    };

    render(
      <EventInspectorPanel
        eventName="room_boot"
        triggerLabel="Ao iniciar"
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onUpdateEventStep={onUpdateEventStep}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Selecionar passos" }));
    await user.click(screen.getByLabelText("Selecionar passo 1"));
    expect(screen.getByRole("button", { name: "Desativar 1 passo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desativar 1 passo" }));
    expect(onUpdateEventStep).toHaveBeenCalledWith("event-boot", 0, { isEnabled: false });
  });

  it("evita criar uma chamada recursiva quando há outro evento disponível", async () => {
    const user = userEvent.setup();
    const onAddEventStep = vi.fn();
    const projectData = {
      events: [
        { id: "event-boot", name: "room_boot", category: "Cena", steps: [] },
        { id: "event-start", name: "player_start", category: "Controle", steps: [] }
      ]
    };

    render(
      <EventInspectorPanel
        eventName="room_boot"
        triggerLabel="Ao Iniciar"
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={onAddEventStep}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));
    await user.click(screen.getByRole("button", { name: "Chamar script" }));
    await user.click(screen.getByRole("button", { name: "Adicionar evento selecionado" }));

    expect(onAddEventStep).toHaveBeenCalledWith("event-boot", "room_boot", "call_event player_start");
  });

  it("runs and debugs from the selected event with a readable flow summary", async () => {
    const user = userEvent.setup();
    const projectData = {
      scenas: [{ id: "room", name: "room", width: 10, height: 8 }],
      variables: [{ name: "score" }],
      events: [{ id: "event-score", name: "score_event", category: "Cena", steps: [{ command: "set_variable score 7", isEnabled: true }] }]
    };
    const presentation = deriveEventsWorkspacePresentation(projectData);
    const onUpdateEventStep = vi.fn();

    render(
      <EventsWorkspace
        presentation={presentation}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onUpdateEventStep={onUpdateEventStep}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    expect(screen.getByText(/^Executa 1 passo:/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Mapa" }));
    expect(screen.getByRole("navigation", { name: "Minimapa de eventos" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ao iniciar Definir variável para valor/ }));
    fireEvent.change(screen.getByLabelText("Valor do evento no card"), { target: { value: "9" } });
    expect(onUpdateEventStep).toHaveBeenLastCalledWith("event-score", 0, { command: "set_variable score 9" });
    await user.click(screen.getByRole("button", { name: "Abrir evento" }));
    await user.click(screen.getByRole("button", { name: "Executar daqui" }));
    expect(screen.getByText("Caminho executado")).toBeInTheDocument();
    expect(screen.getByText("score = 7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Depurar daqui" }));
    expect(screen.getByText("Breakpoint no evento score_event")).toBeInTheDocument();
  });

  it("renders the configured scene transition in the Preview result", async () => {
    const user = userEvent.setup();
    const projectData = {
      scenas: [
        { id: "room-start", name: "start", width: 10, height: 8 },
        { id: "room-shop", name: "shop", width: 10, height: 8 }
      ],
      events: [{ id: "event-shop", name: "open_shop", category: "Cena", steps: [{ command: "change_scene shop", isEnabled: true }] }],
      editorState: {
        scenaConnections: [{
          from: "start",
          to: "shop",
          transition: { style: "wipe", durationFrames: 12, fadeOut: true, fadeIn: true }
        }]
      },
      settings: { general: { startScene: "start" } }
    };

    render(
      <EventsWorkspace
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Executar daqui" }));
    expect(screen.getByRole("region", { name: "Transição de cena para shop" })).toBeInTheDocument();
    expect(screen.getByText("Máscara lateral")).toBeInTheDocument();
  });

  it("shows the shared scene event states for every scene context", async () => {
    const user = userEvent.setup();
    const projectData = {
      scenas: [
        { name: "arena", sceneType: "battleRpg", runtime: { type: "battleRpg" }, eventBindings: {} },
        { name: "town", sceneType: "topDown", eventBindings: {} }
      ],
      events: [
        { id: "event-win", name: "battle_won", category: "Cena", steps: [{ command: "noop", isEnabled: true }] }
      ]
    };

    render(
      <EventsWorkspace
        presentation={deriveEventsWorkspacePresentation(projectData)}
        projectData={projectData}
        onCreateEvent={vi.fn()}
        onUpdateEventFields={vi.fn()}
        onAddEventStep={vi.fn()}
        onUpdateEventStep={vi.fn()}
        onUpdateEventGraphNodePosition={vi.fn()}
        onRetargetEventGraphEdge={vi.fn()}
        onConnectEventGraphNodes={vi.fn()}
        onRemoveEventGraphEdge={vi.fn()}
        onBindEventToTarget={vi.fn()}
        onCreateBoundEventForTarget={vi.fn(() => null)}
        onRemoveEventTargetBinding={vi.fn()}
        onRemoveEventStep={vi.fn()}
        onRenameEvent={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onExportEvent={vi.fn()}
        onRemoveEvent={vi.fn()}
        onRelayoutEventsGraph={vi.fn()}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Mapa" }));
    await user.click(screen.getByRole("button", { name: "Contexto Cena: arena" }));
    expect(screen.getByLabelText("Ao iniciar de Cena: arena")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ao acertar Player de Cena: arena")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ao vencer de Cena: arena")).toBeInTheDocument();
    expect(screen.getByLabelText("Ao perder de Cena: arena")).toBeInTheDocument();
    expect(screen.getByLabelText("Ao fugir de Cena: arena")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Contexto Cena: town" }));
    expect(screen.getByLabelText("Ao iniciar de Cena: town")).toBeInTheDocument();
    expect(screen.getByLabelText("Ao acertar Player de Cena: town")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ao vencer de Cena: town")).not.toBeInTheDocument();
  });
});
