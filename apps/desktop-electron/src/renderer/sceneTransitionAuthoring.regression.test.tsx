/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { EventInspectorPanel } from "./eventsWorkspace";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace";

afterEach(cleanup);

it("selects a scene with spaces without changing the arrival coordinates", async () => {
  const user = userEvent.setup();
  const onUpdateEventStep = vi.fn();
  const projectData = {
    scenas: [{ name: "start" }, { name: "Casa de Teste" }],
    events: [{ id: "door", name: "door", category: "Cena", steps: [{ command: "change_scene start 4 5 right" }] }]
  };
  render(<EventInspectorPanel
    eventName="door" triggerLabel="Ao entrar" presentation={deriveEventsWorkspacePresentation(projectData)}
    projectData={projectData} onCreateEvent={vi.fn()} onUpdateEventFields={vi.fn()} onAddEventStep={vi.fn()}
    onUpdateEventStep={onUpdateEventStep} onUpdateEventGraphNodePosition={vi.fn()} onRetargetEventGraphEdge={vi.fn()}
    onConnectEventGraphNodes={vi.fn()} onRemoveEventGraphEdge={vi.fn()} onBindEventToTarget={vi.fn()}
    onCreateBoundEventForTarget={vi.fn(() => null)} onRemoveEventTargetBinding={vi.fn()} onRemoveEventStep={vi.fn()}
    onRenameEvent={vi.fn()} onDuplicateEvent={vi.fn()} onExportEvent={vi.fn()} onRemoveEvent={vi.fn()} onRelayoutEventsGraph={vi.fn()}
  />);
  await user.click(screen.getByRole("button", { name: "Passo 1: Trocar cena" }));
  await user.selectOptions(screen.getByLabelText("Cena do evento"), "Casa de Teste");
  expect(onUpdateEventStep).toHaveBeenCalledWith("door", 0, { command: 'change_scene "Casa de Teste" 4 5 right' });
});
