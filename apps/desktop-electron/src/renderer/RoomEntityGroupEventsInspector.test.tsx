/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomEntityGroupEventsInspector } from "./RoomEntityGroupEventsInspector";
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

describe("RoomEntityGroupEventsInspector", () => {
  afterEach(cleanup);

  it("chooses a recipe before creating one independent update behavior for every selected actor", () => {
    const onCreateBehaviors = vi.fn(() => ["guide_onupdate", "merchant_onupdate"]);
    render(
      <RoomEntityGroupEventsInspector
        entities={[
          { id: "actor-guide", kind: "actor", name: "Guide" },
          { id: "actor-merchant", kind: "actor", name: "Merchant" }
        ]}
        commandSuggestions={[greetingRecipe]}
        onCreateBehaviors={onCreateBehaviors}
        sceneType="topdown"
      />
    );

    expect(screen.getByRole("region", { name: "Grupo de 2 atores" })).toHaveTextContent("Guide, Merchant");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar comportamento em grupo em Ao atualizar" }));

    expect(onCreateBehaviors).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Escolher evento para o grupo em Ao atualizar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Modelos de script" }));
    fireEvent.click(screen.getByRole("button", { name: "Cumprimentar o jogador" }));
    expect(onCreateBehaviors).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar evento selecionado" }));

    expect(onCreateBehaviors).toHaveBeenCalledWith({
      initialCommands: ["rate_limit 30 0", "show_dialogue greeting", "rate_limit_end"],
      targets: [
        { bindingKey: "onUpdate", targetKind: "actor", targetName: "Guide" },
        { bindingKey: "onUpdate", targetKind: "actor", targetName: "Merchant" }
      ]
    });
    expect(screen.getByRole("status")).toHaveTextContent("2 comportamentos independentes criados.");
  });
});
