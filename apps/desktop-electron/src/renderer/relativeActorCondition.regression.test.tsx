/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { EventInspectorPanel } from "./eventsWorkspace";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace";

afterEach(cleanup);

it("selects both actors with spaces and changes the relative position without corrupting either name", async () => {
  const update = vi.fn();
  function Editor() {
    const [command, setCommand] = useState("if_actor_relative Player player left");
    const projectData = {
      scenas: [{ name: "Sala" }],
      actors: [{ name: "Player" }, { name: "Actor 3" }, { name: "Actor 4" }],
      events: [{ id: "vertical", name: "vertical", steps: [{ command }] }]
    };
    return <EventInspectorPanel eventName="vertical" triggerLabel="Ao iniciar"
      projectData={projectData} presentation={deriveEventsWorkspacePresentation(projectData)}
      onCreateEvent={vi.fn()} onUpdateEventFields={vi.fn()} onAddEventStep={vi.fn()}
      onUpdateEventStep={(_eventID, _index, patch) => { update(patch.command); if (patch.command) setCommand(patch.command); }}
      onUpdateEventGraphNodePosition={vi.fn()} onRetargetEventGraphEdge={vi.fn()}
      onConnectEventGraphNodes={vi.fn()} onRemoveEventGraphEdge={vi.fn()} onBindEventToTarget={vi.fn()}
      onCreateBoundEventForTarget={vi.fn(() => null)} onRemoveEventTargetBinding={vi.fn()} onRemoveEventStep={vi.fn()}
      onRenameEvent={vi.fn()} onDuplicateEvent={vi.fn()} onExportEvent={vi.fn()} onRemoveEvent={vi.fn()} onRelayoutEventsGraph={vi.fn()}/>;
  }
  render(<Editor/>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Editar condição do passo 1" }));
  await user.selectOptions(screen.getByLabelText("Ator do evento"), "Actor 3");
  await user.selectOptions(screen.getByLabelText("Outro ator do evento"), "Actor 4");
  await user.selectOptions(screen.getByLabelText("Posição relativa do evento"), "down");
  expect(update).toHaveBeenLastCalledWith('if_actor_relative "Actor 3" "Actor 4" down');
  await user.selectOptions(screen.getByLabelText("Posição relativa do evento"), "up");
  expect(update).toHaveBeenLastCalledWith('if_actor_relative "Actor 3" "Actor 4" up');
  expect(screen.getByLabelText("Outro ator do evento")).toHaveValue("Actor 4");
});
