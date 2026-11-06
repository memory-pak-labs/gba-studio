/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { EventInspectorPanel } from "./eventsWorkspace";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace";

afterEach(cleanup);

it("preserves the actor name and hide action when choosing a name with spaces", async () => {
  const user = userEvent.setup();
  const onUpdateEventStep = vi.fn();
  const projectData = {
    scenas: [{ name: "Sala" }], actors: [{ id: "player", name: "Player" }, { id: "actor_2", name: "Actor 2" }],
    events: [{ id: "ev", name: "ev", category: "Ator", steps: [{ command: "set_actor_visible Player false" }] }]
  };
  render(<EventInspectorPanel
    eventName="ev" triggerLabel="Ao interagir" presentation={deriveEventsWorkspacePresentation(projectData)}
    projectData={projectData} onCreateEvent={vi.fn()} onUpdateEventFields={vi.fn()} onAddEventStep={vi.fn()}
    onUpdateEventStep={onUpdateEventStep} onUpdateEventGraphNodePosition={vi.fn()} onRetargetEventGraphEdge={vi.fn()}
    onConnectEventGraphNodes={vi.fn()} onRemoveEventGraphEdge={vi.fn()} onBindEventToTarget={vi.fn()}
    onCreateBoundEventForTarget={vi.fn(() => null)} onRemoveEventTargetBinding={vi.fn()} onRemoveEventStep={vi.fn()}
    onRenameEvent={vi.fn()} onDuplicateEvent={vi.fn()} onExportEvent={vi.fn()} onRemoveEvent={vi.fn()} onRelayoutEventsGraph={vi.fn()}
  />);
  const card = screen.getByRole("button", { name: "Passo 1: Definir visibilidade do ator" });
  expect(card).toHaveTextContent("Visível: false");
  await user.click(card);
  await user.selectOptions(screen.getByLabelText("Ator do evento"), "Actor 2");
  expect(onUpdateEventStep).toHaveBeenCalledWith("ev", 0, { command: 'set_actor_visible "Actor 2" false' });
});


it("preserves a legacy actor reference when editing another parameter", async () => {
  const user = userEvent.setup();
  const onUpdateEventStep = vi.fn();
  const projectData = {
    scenas: [{ name: "Sala" }], actors: [{ id: "player", name: "Player" }, { id: "actor_2", name: "Actor 2" }],
    events: [{ id: "ev", name: "ev", category: "Ator", steps: [{ command: "set_actor_visible Actor 2 false" }] }]
  };
  render(<EventInspectorPanel
    eventName="ev" triggerLabel="Ao interagir" presentation={deriveEventsWorkspacePresentation(projectData)}
    projectData={projectData} onCreateEvent={vi.fn()} onUpdateEventFields={vi.fn()} onAddEventStep={vi.fn()}
    onUpdateEventStep={onUpdateEventStep} onUpdateEventGraphNodePosition={vi.fn()} onRetargetEventGraphEdge={vi.fn()}
    onConnectEventGraphNodes={vi.fn()} onRemoveEventGraphEdge={vi.fn()} onBindEventToTarget={vi.fn()}
    onCreateBoundEventForTarget={vi.fn(() => null)} onRemoveEventTargetBinding={vi.fn()} onRemoveEventStep={vi.fn()}
    onRenameEvent={vi.fn()} onDuplicateEvent={vi.fn()} onExportEvent={vi.fn()} onRemoveEvent={vi.fn()} onRelayoutEventsGraph={vi.fn()}
  />);
  const card = screen.getByRole("button", { name: "Passo 1: Definir visibilidade do ator" });
  expect(card).toHaveTextContent("Visível: false");
  await user.click(card);
  fireEvent.change(screen.getByDisplayValue("false"), { target: { value: "true" } });
  expect(onUpdateEventStep).toHaveBeenCalledWith("ev", 0, { command: 'set_actor_visible "Actor 2" true' });
});

it("keeps both actors intact when the second condition target is edited", async () => {
  const user = userEvent.setup();
  const onUpdateEventStep = vi.fn();
  const projectData = {
    scenas: [{ name: "Sala" }],
    actors: [{ id: "player", name: "Player" }, { id: "actor_2", name: "Actor 2" }, { id: "actor_3", name: "Outro 1" }],
    events: [{ id: "ev", name: "ev", category: "Ator", steps: [{ command: 'if_actor_distance "Actor 2" player 4' }] }]
  };
  render(<EventInspectorPanel
    eventName="ev" triggerLabel="Ao interagir" presentation={deriveEventsWorkspacePresentation(projectData)}
    projectData={projectData} onCreateEvent={vi.fn()} onUpdateEventFields={vi.fn()} onAddEventStep={vi.fn()}
    onUpdateEventStep={onUpdateEventStep} onUpdateEventGraphNodePosition={vi.fn()} onRetargetEventGraphEdge={vi.fn()}
    onConnectEventGraphNodes={vi.fn()} onRemoveEventGraphEdge={vi.fn()} onBindEventToTarget={vi.fn()}
    onCreateBoundEventForTarget={vi.fn(() => null)} onRemoveEventTargetBinding={vi.fn()} onRemoveEventStep={vi.fn()}
    onRenameEvent={vi.fn()} onDuplicateEvent={vi.fn()} onExportEvent={vi.fn()} onRemoveEvent={vi.fn()} onRelayoutEventsGraph={vi.fn()}
  />);
  await user.click(screen.getByRole("button", { name: "Editar condição do passo 1" }));
  fireEvent.change(screen.getByDisplayValue("player"), { target: { value: "Outro 1" } });
  expect(onUpdateEventStep).toHaveBeenCalledWith("ev", 0, { command: 'if_actor_distance "Actor 2" "Outro 1" 4' });
});
