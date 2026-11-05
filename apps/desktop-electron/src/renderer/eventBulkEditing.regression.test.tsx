/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { deriveEventsWorkspacePresentation, insertEventStepsInProject, updateEventFieldsInProject } from "../shared/eventsWorkspace.js";
import { EventInspectorPanel, EventsWorkspace } from "./eventsWorkspace.js";

afterEach(cleanup);

it.each(["inspector", "workspace"])("persists bulk deactivation and duplication in %s", async surface => {
  const data = { events: [{ id: "shared", name: "shared", category: "Custom", steps: [
    { command: "wait 10", isEnabled: true, marker: "preserve" },
    { command: "wait 20", isEnabled: true },
    { command: "wait 30", isEnabled: true }
  ] }] };
  const update = vi.fn();
  const insert = vi.fn();
  const add = vi.fn();
  const user = userEvent.setup();
  const Component = surface === "inspector" ? EventInspectorPanel : EventsWorkspace;
  render(<Component eventName="shared" triggerLabel="Script do projeto"
    presentation={deriveEventsWorkspacePresentation(data)} projectData={data}
    onUpdateEventFields={update} onUpdateEventStep={vi.fn()} onAddEventStep={add} onInsertEventSteps={insert}
    onCreateEvent={vi.fn()} onUpdateEventGraphNodePosition={vi.fn()}
    onRetargetEventGraphEdge={vi.fn()} onConnectEventGraphNodes={vi.fn()}
    onRemoveEventGraphEdge={vi.fn()} onBindEventToTarget={vi.fn()}
    onCreateBoundEventForTarget={vi.fn(() => null)} onRemoveEventTargetBinding={vi.fn()}
    onRemoveEventStep={vi.fn()} onRenameEvent={vi.fn()} onDuplicateEvent={vi.fn()}
    onExportEvent={vi.fn()} onRemoveEvent={vi.fn()} onRelayoutEventsGraph={vi.fn()}/>);
  await user.click(screen.getByRole("button", { name: "Selecionar passos" }));
  await user.click(screen.getByRole("checkbox", { name: "Selecionar passo 1" }));
  await user.click(screen.getByRole("checkbox", { name: "Selecionar passo 2" }));
  await user.click(screen.getByRole("button", { name: "Desativar 2 passos" }));
  expect(update).toHaveBeenCalledTimes(1);
  const next = updateEventFieldsInProject(data, update.mock.calls[0]![0], update.mock.calls[0]![1]);
  const restored = JSON.parse(JSON.stringify(next));
  expect(restored.events[0].steps).toEqual([
    { command: "wait 10", isEnabled: false, marker: "preserve" },
    { command: "wait 20", isEnabled: false },
    { command: "wait 30", isEnabled: true }
  ]);
  expect(data.events[0]!.steps.every(step => step.isEnabled)).toBe(true);
  await user.click(screen.getByRole("button", { name: "Duplicar 2 passos" }));
  expect(insert).toHaveBeenCalledExactlyOnceWith("shared", { kind: "root" }, ["wait 10", "wait 20"]);
  expect(add).not.toHaveBeenCalled();
  const duplicated = insertEventStepsInProject(data, "shared", { kind: "root" }, insert.mock.calls[0]![2]);
  expect(deriveEventsWorkspacePresentation(duplicated).groups[0]?.events[0]?.steps.map(step => step.command))
    .toEqual(["wait 10", "wait 20", "wait 30", "wait 10", "wait 20"]);
});
