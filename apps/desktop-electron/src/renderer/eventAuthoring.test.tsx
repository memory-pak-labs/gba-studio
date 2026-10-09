/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveEventsWorkspacePresentation, type EventsCommandMenuTab } from "../shared/eventsWorkspace";
import { EventBlockLibrary } from "./EventBlockLibrary";
import { EventEditingContext } from "./EventEditingContext";
import { EventInspectorPanel } from "./eventsWorkspace";
import { RoomEventBindingsInspector } from "./RoomEventBindingsInspector";

const projectData = {
  scenas: [{ name: "porto" }, { name: "farol_interior" }],
  events: [{ id: "enter", name: "porto_ao_entrar", category: "Cena", steps: [
    { command: "change_scene farol_interior 22 24 up", isEnabled: true },
    { command: "custom_action original raw", isEnabled: false }
  ] }]
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

describe("event authoring flows", () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("requires confirmation, supports keyboard search, favorites and recent blocks", async () => {
    const user = userEvent.setup();
    const choose = vi.fn();
    function Library(): React.ReactElement {
      const [query, setQuery] = useState("");
      const [tab, setTab] = useState<EventsCommandMenuTab>("all");
      return <EventBlockLibrary allowRecipes stepIndex={null} suggestions={presentation.commandPalette}
        query={query} tab={tab} onChangeQuery={setQuery} onChangeTab={setTab}
        onChooseSuggestion={choose} onClose={vi.fn()}/>;
    }
    render(<Library/>);
    const results = screen.getByRole("region", { name: "Resultados da busca" });
    await user.type(screen.getByRole("searchbox"), "transição");
    await user.click(within(results).getByRole("button", { name: "Trocar cena" }));
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole("complementary", { name: "Descrição do evento" })).toHaveTextContent("Cena");
    const star = screen.getByRole("button", { name: /^(Adicionar|Remover) Trocar cena (aos|dos) favoritos$/ });
    if (star.getAttribute("aria-pressed") === "true") await user.click(star);
    await user.click(screen.getByRole("button", { name: "Adicionar Trocar cena aos favoritos" }));
    await user.click(screen.getByRole("button", { name: "Favoritos" }));
    expect(within(results).getByRole("button", { name: "Trocar cena" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adicionar evento selecionado" }));
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose.mock.calls[0]![0].command).toMatch(/^change_scene /);
    await user.click(screen.getByRole("button", { name: "Recentes" }));
    expect(within(results).getByRole("button", { name: "Trocar cena" })).toBeInTheDocument();
    expect(localStorage.getItem("gba-studio-event-recent")).toContain("scene.change");
    await user.click(screen.getByRole("searchbox"));
    await user.keyboard("{Enter}");
    expect(choose).toHaveBeenCalledTimes(2);
  });

  it("separates reference categories, shows actor subgroups and labels GBA extensions", async () => {
    const user = userEvent.setup();
    render(<EventBlockLibrary allowRecipes stepIndex={null} suggestions={presentation.commandPalette}
      query="" tab="all" onChangeQuery={vi.fn()} onChangeTab={vi.fn()}
      onChooseSuggestion={vi.fn()} onClose={vi.fn()}/>);
    const navigation = screen.getByRole("navigation", { name: "Categorias de eventos" });
    for (const name of ["Câmera", "Tela", "Cores", "Variáveis", "Fluxo de controle", "Matemática", "Campos do motor"]) {
      expect(within(navigation).getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) })).toBeInTheDocument();
    }
    await user.click(within(navigation).getByRole("button", { name: /^Ator\s*\d+$/ }));
    const results = screen.getByRole("region", { name: "Resultados da busca" });
    expect(within(results).getByRole("heading", { name: "Movimentação" })).toBeInTheDocument();
    expect(within(results).getByRole("heading", { name: "Propriedades" })).toBeInTheDocument();
    await user.click(within(navigation).getByRole("button", { name: "Todos" }));
    await user.click(within(results).getByRole("button", { name: "Trocar fundo da cutscene" }));
    expect(screen.getByRole("complementary", { name: "Descrição do evento" })).toHaveTextContent("Extensão GBA Studio");
  });

  it("lists duplicate screen actions once while retaining old favorites and recent IDs", async () => {
    const user = userEvent.setup();
    localStorage.setItem("gba-studio-event-favorites", JSON.stringify({ "command:screen.fade_in": true }));
    localStorage.setItem("gba-studio-event-recent", JSON.stringify(["command:screen.fade_in"]));
    render(<EventBlockLibrary allowRecipes stepIndex={null} suggestions={presentation.commandPalette}
      query="" tab="all" onChangeQuery={vi.fn()} onChangeTab={vi.fn()}
      onChooseSuggestion={vi.fn()} onClose={vi.fn()}/>);
    const results = screen.getByRole("region", { name: "Resultados da busca" });
    expect(within(results).getAllByRole("button", { name: "Aparecimento de tela gradual" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Recentes" }));
    expect(within(results).getByRole("button", { name: "Aparecimento de tela gradual" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Favoritos" }));
    expect(within(results).getByRole("button", { name: "Aparecimento de tela gradual" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover Aparecimento de tela gradual dos favoritos" }));
    expect(within(results).queryByRole("button", { name: "Aparecimento de tela gradual" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gba-studio-event-favorites")!)).toMatchObject({
      "command:camera.fade_in": false, "command:screen.fade_in": false
    });
  });

  it("closes with Escape from search and returns focus without inserting", async () => {
    const user = userEvent.setup();
    const choose = vi.fn();
    function Library(): React.ReactElement {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>Abrir</button>{open ?
        <EventBlockLibrary allowRecipes stepIndex={null} suggestions={presentation.commandPalette}
          query="" tab="all" onChangeQuery={vi.fn()} onChangeTab={vi.fn()}
          onChooseSuggestion={choose} onClose={() => setOpen(false)}/> : null}</>;
    }
    render(<Library/>);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus();
  });

  it("preserves selection and named parameters between compact and expanded editing", async () => {
    const user = userEvent.setup();
    const props = callbacks();
    const stateSelect = vi.fn();
    render(<><div className="rooms-event-focus-host"/><EventEditingContext.Provider value={{
      name: "Porto", activeKey: "onInit", states: [{ key: "onInit", label: "Ao iniciar" }, { key: "onExit", label: "Ao sair" }], onSelectState: stateSelect
    }}><EventInspectorPanel {...props} projectData={projectData} presentation={presentation}
      eventName="porto_ao_entrar" triggerLabel="Ao iniciar"/></EventEditingContext.Provider></>);
    await user.click(screen.getByRole("button", { name: "Passo 1: Trocar cena" }));
    expect(screen.getAllByLabelText("X (tiles) do evento")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Expandir eventos" }));
    const inspector = screen.getByRole("complementary", { name: "Parâmetros do evento selecionado" });
    expect(within(inspector).getByLabelText("X (tiles) do evento")).toHaveValue("22");
    await user.click(screen.getByRole("button", { name: "Adicionar evento" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Passo 1: Trocar cena" })).toHaveAttribute("aria-pressed", "true");
    expect(within(inspector).getByLabelText("X (tiles) do evento")).toHaveValue("22");
    await user.selectOptions(within(inspector).getByLabelText("Direção do evento"), "left");
    expect(props.onUpdateEventStep).toHaveBeenCalledWith("enter", 0, { command: "change_scene farol_interior 22 24 left" });
    await user.click(screen.getByRole("tab", { name: "Ao sair" }));
    expect(stateSelect).toHaveBeenCalledWith("onExit");
    await user.click(screen.getByRole("button", { name: "Voltar à cena" }));
    expect(screen.getByRole("button", { name: "Passo 1: Trocar cena" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByLabelText("X (tiles) do evento")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Expandir eventos" })).toHaveFocus();
  });

  it("keeps custom commands editable and removes the second flat step list from properties", async () => {
    const user = userEvent.setup();
    const props = callbacks();
    render(<EventInspectorPanel {...props} projectData={projectData} presentation={presentation}
      eventName="porto_ao_entrar" triggerLabel="Ao iniciar"/>);
    await user.click(screen.getByRole("button", { name: /Passo 2:/ }));
    const block = screen.getByRole("region", { name: "Editar evento 2" });
    expect(within(block).getByRole("checkbox")).not.toBeChecked();
    await user.click(within(block).getByText("Opções técnicas"));
    expect(within(block).getByLabelText("Comando do evento 2")).toHaveValue("custom_action original raw");
    fireEvent.change(within(block).getByLabelText("Comando do evento 2"), { target: { value: "custom_action changed raw" } });
    expect(props.onUpdateEventStep).toHaveBeenCalledWith("enter", 1, { command: "custom_action changed raw" });
    await user.click(screen.getByText("Propriedades do script"));
    expect(await screen.findByLabelText("Tipo de porto_ao_entrar")).toBeInTheDocument();
    expect(screen.queryByText("Avançado")).not.toBeInTheDocument();
    expect(document.querySelector(".event-properties .event-step-editor")).toBeNull();
    expect(props.onRemoveEventTargetBinding).not.toHaveBeenCalled();
  });

  it("keeps empty states expanded and creates their flow only after confirmation", async () => {
    const user = userEvent.setup();
    const props = callbacks();
    const create = vi.fn(() => "new_exit");
    const bind = vi.fn();
    render(<div className="rooms-editor-layout"><div className="rooms-event-focus-host"/>
      <section className="rooms-canvas-stage"><button type="button">Canvas</button></section>
      <aside className="rooms-side-stack"><RoomEventBindingsInspector
      room={{ name: "porto", eventBindings: { onInit: "porto_ao_entrar" } }}
      eventOptions={[{ value: "porto_ao_entrar", label: "Entrada" }]}
      commandSuggestions={presentation.commandPalette}
      onCreateEvent={create} onChangeBinding={bind}
      renderEventInspector={(eventName, triggerLabel) => <EventInspectorPanel {...props}
        projectData={projectData} presentation={presentation} eventName={eventName} triggerLabel={triggerLabel}/>} /></aside></div>);
    await user.click(screen.getByRole("button", { name: "Expandir eventos" }));
    const host = document.querySelector<HTMLElement>(".rooms-event-focus-host")!;
    expect(document.querySelector(".rooms-canvas-stage")).toHaveAttribute("inert");
    expect(document.querySelector(".rooms-side-stack")).toHaveAttribute("inert");
    await user.click(within(host).getByRole("tab", { name: "Ao sair" }));
    expect(within(host).getByRole("tab", { name: "Ao sair" })).toHaveFocus();
    expect(within(host).getByRole("button", { name: "Voltar à cena" })).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
    await user.click(within(host).getByRole("button", { name: "Começar script em Ao sair" }));
    await user.click(screen.getByRole("tab", { name: "Eventos" }));
    await user.type(screen.getByRole("searchbox"), "transição");
    await user.click(within(screen.getByRole("region", { name: "Resultados da busca" })).getByRole("button", { name: "Trocar cena" }));
    expect(create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Adicionar evento selecionado" }));
    expect(create).toHaveBeenCalledWith([expect.stringMatching(/^change_scene /)]);
    expect(bind).toHaveBeenCalledWith("onExit", "new_exit", { updateFrequencyFrames: null });
    await user.click(within(host).getByRole("tab", { name: "Ao iniciar" }));
    expect(within(host).getByRole("button", { name: "Passo 1: Trocar cena" })).toBeInTheDocument();
    await user.click(within(host).getByRole("button", { name: "Voltar à cena" }));
    expect(host).toBeEmptyDOMElement();
    expect(document.querySelector(".rooms-canvas-stage")).not.toHaveAttribute("inert");
    expect(document.querySelector(".rooms-side-stack")).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Expandir eventos" })).toHaveFocus();
  });

  it("uses one compact state control, preserves collision bindings and restores focus with Escape", async () => {
    const user = userEvent.setup();
    const bind = vi.fn();
    const create = vi.fn();
    render(<div className="rooms-editor-layout"><div className="rooms-event-focus-host"/>
      <aside className="rooms-side-stack"><RoomEventBindingsInspector
        room={{ name: "porto", eventBindings: { onHitGroup2: "porto_ao_entrar" } }}
        sceneType="topdown" eventOptions={[{ value: "porto_ao_entrar", label: "Entrada" }]}
        onCreateEvent={create} onChangeBinding={bind}
        renderEventInspector={(eventName, triggerLabel) => <EventInspectorPanel {...callbacks()}
          projectData={projectData} presentation={presentation} eventName={eventName} triggerLabel={triggerLabel}/>}/>
      </aside></div>);
    await user.selectOptions(screen.getByRole("combobox", { name: "Estado do evento" }), "onHitGroup2");
    expect(screen.getByRole("button", { name: "Passo 1: Trocar cena" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Expandir eventos" })).toHaveLength(1);
    expect(screen.queryByText("porto / Eventos")).not.toBeInTheDocument();
    expect(screen.queryByText("Configurado")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expandir eventos" }));
    const host = document.querySelector<HTMLElement>(".rooms-event-focus-host")!;
    expect(within(host).getByText("porto / Eventos")).toBeInTheDocument();
    await user.click(within(host).getByRole("tab", { name: "Ao sair" }));
    expect(within(host).getByText("Este estado ainda não tem eventos.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(host).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Expandir eventos" })).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Estado do evento" })).toHaveValue("onExit");
    expect(create).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Estado do evento" }), "onHitGroup2");
    await user.click(screen.getByRole("button", { name: "Expandir eventos" }));
    await user.keyboard("{Escape}");
    expect(host).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Expandir eventos" })).toHaveFocus();
  });

  it("keeps reference warnings visible when the contextual heading is hidden", () => {
    const brokenProject = { scenas: [], events: [projectData.events[0]] };
    render(<RoomEventBindingsInspector room={{ name: "porto", eventBindings: { onInit: "porto_ao_entrar" } }}
      eventOptions={[{ value: "porto_ao_entrar", label: "Entrada" }]} onCreateEvent={vi.fn()} onChangeBinding={vi.fn()}
      renderEventInspector={(eventName, triggerLabel) => <EventInspectorPanel {...callbacks()}
        projectData={brokenProject} presentation={deriveEventsWorkspacePresentation(brokenProject)}
        eventName={eventName} triggerLabel={triggerLabel}/>}/>);
    expect(screen.getByRole("status")).toHaveTextContent("pendências de referências");
    expect(screen.getByRole("button", { name: "Passo 1: Trocar cena" })).toBeInTheDocument();
    expect(screen.queryByText("porto / Eventos")).not.toBeInTheDocument();
  });
});
