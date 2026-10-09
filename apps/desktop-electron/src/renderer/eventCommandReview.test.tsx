/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace";
import { EventInspectorPanel } from "./eventsWorkspace";

const projectData = {
  scenas: [{ name: "start" }, { name: "menu", sceneType: "menu" }],
  events: [{ id: "review", name: "review", steps: [{ command: "open_menu", isEnabled: false }] }]
};
const presentation = deriveEventsWorkspacePresentation(projectData);
const callbacks = () => ({
  onCreateEvent: vi.fn(), onUpdateEventFields: vi.fn(), onAddEventStep: vi.fn(),
  onUpdateEventStep: vi.fn(), onUpdateEventGraphNodePosition: vi.fn(),
  onRetargetEventGraphEdge: vi.fn(), onConnectEventGraphNodes: vi.fn(),
  onRemoveEventGraphEdge: vi.fn(), onBindEventToTarget: vi.fn(),
  onCreateBoundEventForTarget: vi.fn(() => null), onRemoveEventTargetBinding: vi.fn(),
  onRemoveEventStep: vi.fn(), onRenameEvent: vi.fn(), onDuplicateEvent: vi.fn(),
  onExportEvent: vi.fn(), onRemoveEvent: vi.fn(), onRelayoutEventsGraph: vi.fn()
});

describe("historical block editing", () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it.each([false, true])("explains a saved unavailable block and cancels replacement without changing it (expanded=%s)", async expanded => {
    const user = userEvent.setup();
    const props = callbacks();
    const before = JSON.stringify(projectData);
    render(<><div className="rooms-event-focus-host"/><EventInspectorPanel {...props}
      projectData={projectData} presentation={presentation} eventName="review" triggerLabel="Ao iniciar"/></>);
    await user.click(screen.getByRole("button", { name: "Passo 1: Exibir menu" }));
    if (expanded) await user.click(screen.getByRole("button", { name: "Expandir eventos" }));
    const inspector = screen.getByRole("region", { name: "Editar evento 1" });
    expect(within(inspector).getByRole("status")).toHaveTextContent("opções");
    expect(within(inspector).getByRole("checkbox", { name: "Executar este evento" })).not.toBeChecked();
    expect(within(inspector).queryByText("Este evento não tem parâmetros editáveis.")).not.toBeInTheDocument();
    const replace = within(inspector).getByRole("button", { name: "Escolher outro evento" });
    await user.click(replace);
    await user.type(screen.getByRole("searchbox"), "trocar cena");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replace).toHaveFocus();
    expect(props.onUpdateEventStep).not.toHaveBeenCalled();
    expect(JSON.stringify(projectData)).toBe(before);
  });

  it("replaces the command only after confirmation, leaving its enabled state untouched", async () => {
    const user = userEvent.setup();
    const props = callbacks();
    render(<EventInspectorPanel {...props} projectData={projectData} presentation={presentation}
      eventName="review" triggerLabel="Ao iniciar"/>);
    await user.click(screen.getByRole("button", { name: "Passo 1: Exibir menu" }));
    await user.click(screen.getByRole("button", { name: "Escolher outro evento" }));
    await user.type(screen.getByRole("searchbox"), "trocar cena");
    await user.click(within(screen.getByRole("region", { name: "Resultados da busca" })).getByRole("button", { name: "Trocar cena" }));
    expect(props.onUpdateEventStep).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Trocar evento selecionado" }));
    expect(props.onUpdateEventStep).toHaveBeenCalledExactlyOnceWith("review", 0, { command: "change_scene menu" });
    expect(props.onAddEventStep).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
