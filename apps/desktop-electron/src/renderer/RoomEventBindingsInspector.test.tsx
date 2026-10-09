/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomEventBindingsInspector } from "./RoomEventBindingsInspector";
import type { EventsWorkspaceCommandSuggestion } from "../shared/eventsWorkspace";

const greetingRecipe: EventsWorkspaceCommandSuggestion = {
  id: "recipe-greeting",
  label: "Cumprimentar o jogador",
  command: "show_dialogue greeting",
  category: "Diálogo",
  section: null,
  targetName: null,
  badge: "Modelo de script",
  runtimeStatus: "recipe",
  commandTemplate: null,
  parameters: [],
  isFavorite: false,
  isRecipe: true,
  steps: [{ command: "show_dialogue greeting", category: "Diálogo", detail: "Exibe um diálogo." }]
};

function selectState(label: string): void {
  const select = screen.getByRole("combobox", { name: "Estado do evento" }) as HTMLSelectElement;
  const option = Array.from(select.options).find(option => option.text === label
    || option.text.startsWith(`${label} · `) || option.text.endsWith(` · ${label}`));
  if (!option) throw new Error(`Estado indisponível: ${label}`);
  fireEvent.change(select, { target: { value: option.value } });
}

describe("RoomEventBindingsInspector", () => {
  afterEach(cleanup);

  it("shows room states from the export-backed runtime contract without decorative branches", () => {
    render(
      <RoomEventBindingsInspector
        contextKind="room"
        entity={{ id: "room-1", name: "overworld", sceneType: "topdown", eventBindings: { onInit: "room_boot" } }}
        eventOptions={[{ value: "room_boot", label: "room_boot" }]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("option", { name: "Ao iniciar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ao acertar Player" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao sair" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao interagir" })).toBeInTheDocument();
    selectState("Ao acertar Player");
    expect(screen.getByRole("option", { name: "Ao acertar Player · Grupo 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao acertar Player · Grupo 2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao acertar Player · Grupo 3" })).toBeInTheDocument();
    expect(screen.queryByText("Se sim")).not.toBeInTheDocument();
    expect(screen.queryByText("Se não")).not.toBeInTheDocument();
  });

  it("materializa o estado de acerto da cena mesmo vazio", () => {
    render(
      <RoomEventBindingsInspector
        contextKind="room"
        entity={{ id: "room-1", name: "arena", sceneType: "topdown", eventBindings: {} }}
        eventOptions={[{ value: "arena_hit_group_2", label: "arena_hit_group_2" }]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("option", { name: "Ao iniciar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ao acertar Player" })).toBeInTheDocument();
    selectState("Ao acertar Player");
    selectState("Grupo 2");

    expect(screen.queryByLabelText("Evento Grupo 2")).not.toBeInTheDocument();
    expect(screen.getByText("Este estado ainda não tem eventos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar script em Grupo 2" })).toBeInTheDocument();
  });

  it("shows the contextual actor lifecycle and only configures frequency for updates", () => {
    render(
      <RoomEventBindingsInspector
        contextKind="actor"
        entity={{ id: "actor-guide", name: "Guide", eventName: "guide_talk", eventBindings: { onInit: "guide_spawn" } }}
        eventOptions={[
          { value: "guide_spawn", label: "guide_spawn" },
          { value: "guide_talk", label: "guide_talk" }
        ]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("option", { name: "Ao iniciar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao interagir" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao atualizar" })).toBeInTheDocument();
    selectState("Ao atualizar");
    expect(screen.getByLabelText("Frequência de Ao atualizar")).toHaveValue("30");
    expect(screen.queryByText("Qualquer ator")).not.toBeInTheDocument();
  });

  it("materializa os três estados para atores de cenas de luta", () => {
    render(
      <RoomEventBindingsInspector
        contextKind="actor"
        entity={{ id: "actor-rival", name: "Rival", eventBindings: {} }}
        eventOptions={[]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        sceneType="luta"
      />
    );

    expect(screen.getByRole("combobox", { name: "Estado do evento" }).querySelectorAll("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: "Ao interagir" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao iniciar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao atualizar" })).toBeInTheDocument();
    expect(screen.getByText("Este estado ainda não tem eventos.")).toBeInTheDocument();
  });

  it("materializa Ao acertar somente depois que o ator recebe grupo de colisão", () => {
    const { rerender } = render(
      <RoomEventBindingsInspector
        collisionGroup={0}
        contextKind="actor"
        entity={{ id: "actor-guide", name: "Guide", eventBindings: {} }}
        eventOptions={[]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        sceneType="topdown"
      />
    );

    expect(screen.queryByRole("option", { name: "Ao acertar" })).not.toBeInTheDocument();
    rerender(
      <RoomEventBindingsInspector
        collisionGroup={2}
        contextKind="actor"
        entity={{ id: "actor-guide", name: "Guide", eventBindings: {} }}
        eventOptions={[]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("option", { name: "Ao acertar" })).toBeInTheDocument();
  });

  it("mostra a timeline nativa e o script da opção de menu no mesmo estado", () => {
    const onUpdateRuntimeState = vi.fn();
    render(<RoomEventBindingsInspector contextKind="actor" entity={{ name: "Prompt", inputBinding: "Start" }}
      ownerScene={{ runtime: { type: "menu", config: { screens: [{ id: "title", items: [{ id: "start", label: "Iniciar", action: "push_screen", targetScreenID: "options", eventName: "open" }] }] } } }}
      eventOptions={[{ value: "open", label: "open" }]} onChangeBinding={vi.fn()} onCreateEvent={vi.fn()} onUpdateRuntimeState={onUpdateRuntimeState}
      renderEventInspector={(name) => <div>Script {name}</div>} sceneType="menu" />);
    expect(screen.getByText("Script open")).toBeInTheDocument();
    expect(screen.getByLabelText("Ações de Selecionar · Iniciar")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Abrir tela"));
    fireEvent.change(screen.getByLabelText("Selecionar · Iniciar · Destino"), { target: { value: "credits" } });
    fireEvent.blur(screen.getByLabelText("Selecionar · Iniciar · Destino"));
    expect(onUpdateRuntimeState).toHaveBeenCalledWith("runtime:/screens/0/items/0/eventName", "targetScreenID", "credits");
  });

  it("materializa toda a sequência dentro de Ao iniciar, preservando os callbacks de cada quadro", () => {
    render(<RoomEventBindingsInspector contextKind="room" entity={{ name: "intro", runtime: { type: "cutscene", config: { steps: [{ backgroundAssetName: "bg.png", durationFrames: 60, eventName: "frame" }, { durationFrames: 120 }] } } }}
      eventOptions={[{ value: "frame", label: "frame" }]} onChangeBinding={vi.fn()} onCreateEvent={vi.fn()}
      renderEventInspector={(name) => <div>Script {name}</div>} sceneType="cutscene" />);
    expect(screen.queryByRole("option", { name: "Sequência" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado do evento" })).toHaveValue("onInit");
    expect(screen.getByText("Exibir fundo")).toBeInTheDocument();
    expect(screen.getByText("Script frame")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Quadro 2" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Duração e avanço")).toHaveLength(2);
    expect(screen.getByLabelText("Timeline da sequência em Ao iniciar")).toContainElement(screen.getByText("Script frame"));
    expect(screen.queryByText("Este estado ainda não tem eventos.")).not.toBeInTheDocument();
    selectState("Ao pular");
    expect(screen.queryByLabelText("Timeline da sequência em Ao iniciar")).not.toBeInTheDocument();
  });

  it("opens events first and confirms a script template before binding", () => {
    const onChangeBinding = vi.fn();
    const onCreateEvent = vi.fn(() => "guide_talk");
    render(
      <RoomEventBindingsInspector
        contextKind="actor"
        entity={{ id: "actor-guide", name: "Guide", eventBindings: {} }}
        commandSuggestions={[greetingRecipe]}
        eventOptions={[]}
        onChangeBinding={onChangeBinding}
        onCreateEvent={onCreateEvent}
        sceneType="topdown"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Começar script em Ao interagir" }));

    expect(onCreateEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Escolher evento para Ao interagir" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Eventos" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Modelos de script" }));

    if (screen.getByRole("tab", { name: "Modelos de script" }).getAttribute("aria-selected") !== "true") fireEvent.click(screen.getByRole("tab", { name: "Modelos de script" }));
    fireEvent.click(screen.getByRole("button", { name: "Cumprimentar o jogador" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar evento selecionado" }));

    expect(onCreateEvent).toHaveBeenCalledWith(["show_dialogue greeting"]);
    expect(onChangeBinding).toHaveBeenCalledWith("onInteract", "guide_talk", { updateFrequencyFrames: null });
  });

  it("delegates contextual behavior creation when the inspector can bind it atomically", () => {
    const onCreateBehavior = vi.fn(() => "guide_update");
    const onChangeBinding = vi.fn();
    render(
      <RoomEventBindingsInspector
        contextKind="actor"
        entity={{ id: "actor-guide", name: "Guide", eventBindings: {} }}
        commandSuggestions={[greetingRecipe]}
        eventOptions={[]}
        onChangeBinding={onChangeBinding}
        onCreateBehavior={onCreateBehavior}
        onCreateEvent={vi.fn()}
        sceneType="topdown"
      />
    );

    selectState("Ao atualizar");
    fireEvent.click(screen.getByRole("button", { name: "Começar script em Ao atualizar" }));

    expect(onCreateBehavior).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Escolher evento para Ao atualizar" })).toBeInTheDocument();
    if (screen.getByRole("tab", { name: "Modelos de script" }).getAttribute("aria-selected") !== "true") fireEvent.click(screen.getByRole("tab", { name: "Modelos de script" }));
    fireEvent.click(screen.getByRole("button", { name: "Cumprimentar o jogador" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar evento selecionado" }));

    expect(onCreateBehavior).toHaveBeenCalledWith({
      bindingKey: "onUpdate",
      initialCommands: ["rate_limit 30 0", "show_dialogue greeting", "rate_limit_end"],
      targetKind: "actor",
      targetName: "Guide"
    });
    expect(onChangeBinding).not.toHaveBeenCalled();
  });

  it("persists the selected update frequency for an existing behavior", () => {
    const onUpdateEventFrequency = vi.fn();
    render(
      <RoomEventBindingsInspector
        contextKind="actor"
        entity={{ id: "actor-guide", name: "Guide", eventBindings: { onUpdate: "guide_update" } }}
        eventOptions={[{ value: "guide_update", label: "guide_update" }]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        onUpdateEventFrequency={onUpdateEventFrequency}
        sceneType="topdown"
      />
    );

    selectState("Ao atualizar");
    fireEvent.change(screen.getByLabelText("Frequência de Ao atualizar"), { target: { value: "15" } });

    expect(onUpdateEventFrequency).toHaveBeenCalledWith("guide_update", 15);
  });

  it("keeps the selected state timeline inside the contextual Events tab", () => {
    render(
      <RoomEventBindingsInspector
        contextKind="trigger"
        entity={{ id: "trigger-door", name: "Door", eventBindings: { onEnter: "door_enter" } }}
        eventOptions={[{ value: "door_enter", label: "door_enter" }]}
        onChangeBinding={vi.fn()}
        onCreateEvent={vi.fn()}
        renderEventInspector={(eventName, triggerLabel) => (
          <section aria-label={`Editor de ${eventName}`}>
            <strong>{triggerLabel}</strong>
          </section>
        )}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("region", { name: "Editor de door_enter" })).toBeInTheDocument();
    expect(screen.getByLabelText("Script de Ao entrar na área")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ocultar timeline Ao entrar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar comportamento em Ao entrar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Evento Ao entrar")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado do evento" })).toHaveValue("onEnter");
  });

  it("mantém o grupo de colisão junto dos estados do ator", () => {
    const onChangeCollisionGroup = vi.fn();
    render(
      <RoomEventBindingsInspector
        collisionGroup={0}
        contextKind="actor"
        entity={{ id: "actor-guide", name: "Guide", eventBindings: {} }}
        eventOptions={[]}
        onChangeBinding={vi.fn()}
        onChangeCollisionGroup={onChangeCollisionGroup}
        onCreateEvent={vi.fn()}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("radiogroup", { name: "Grupo de colisão" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    expect(onChangeCollisionGroup).toHaveBeenCalledWith(3);
  });

  it("mantém o grupo do Player e expõe sua timeline própria sem duplicar um ator", () => {
    render(
      <RoomEventBindingsInspector
        collisionGroup={2}
        contextKind="actor"
        entity={{ id: "actor-player", name: "Player", eventBindings: { onInit: "player_boot" } }}
        eventOptions={[{ value: "player_boot", label: "player_boot" }]}
        isPlayer
        onChangeBinding={vi.fn()}
        onChangeCollisionGroup={vi.fn()}
        onCreateEvent={vi.fn()}
        renderEventInspector={(eventName, triggerLabel) => (
          <section aria-label={`Editor de ${eventName}`}>
            <strong>{triggerLabel}</strong>
          </section>
        )}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("radiogroup", { name: "Grupo de colisão" })).toBeInTheDocument();
    expect(screen.getByText("Sobre os eventos do Player").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("option", { name: "Ao iniciar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ao atualizar" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Ao interagir" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado do evento" }).querySelectorAll("option")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Editor de player_boot" })).toBeInTheDocument();
    expect(screen.getByLabelText("Timeline de Ao iniciar")).toBeInTheDocument();
  });
});
