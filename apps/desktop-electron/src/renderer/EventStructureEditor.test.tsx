/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventStructureEditor } from "./EventStructureEditor";

describe("EventStructureEditor", () => {
  afterEach(cleanup);

  it("renders actual nested yes and no branches and inserts in the requested branch", () => {
    const onOpenCommandMenu = vi.fn();
    render(
      <EventStructureEditor
        eventName="door_enter"
        onOpenCommandMenu={onOpenCommandMenu}
        onSelectStep={vi.fn()}
        steps={[
          { command: "if_flag door_open", isEnabled: true },
          { command: "show_text welcome", isEnabled: true },
          { command: "else", isEnabled: true },
          { command: "if_variable has_key 1", isEnabled: true },
          { command: "show_text locked", isEnabled: true },
          { command: "condition_end", isEnabled: true },
          { command: "condition_end", isEnabled: true }
        ]}
      />
    );

    expect(screen.getByRole("region", { name: "Estrutura do script door_enter" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Se sim do passo 1" })).toHaveTextContent("show_text welcome");
    expect(screen.getByRole("region", { name: "Se não do passo 1" })).toHaveTextContent("if_variable has_key 1");
    expect(screen.getByRole("region", { name: "Se sim do passo 4" })).toHaveTextContent("show_text locked");
  });

  it("offers a real no branch insertion and presents rate limits as a layer", () => {
    const onOpenCommandMenu = vi.fn();
    render(
      <EventStructureEditor
        eventName="watcher_update"
        onOpenCommandMenu={onOpenCommandMenu}
        onSelectStep={vi.fn()}
        steps={[
          { command: "rate_limit 30 0", isEnabled: true },
          { command: "if_flag active", isEnabled: true },
          { command: "set_variable score 1", isEnabled: true },
          { command: "condition_end", isEnabled: true },
          { command: "rate_limit_end", isEnabled: true }
        ]}
      />
    );

    expect(screen.getByRole("region", { name: "Camada a cada 30 quadros" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar evento em Se não" }));
    expect(onOpenCommandMenu).toHaveBeenCalledWith({ kind: "falseBranch", conditionIndex: 1 });
  });

  it("renders semantic block labels and parameter chips when presentation data is available", () => {
    render(
      <EventStructureEditor
        eventName="talk_to_nara"
        onOpenCommandMenu={vi.fn()}
        onSelectStep={vi.fn()}
        stepPresentations={new Map([
          [0, {
            category: "Diálogo e menus",
            label: "Exibir diálogo",
            parameters: [{ id: "dialogue", label: "Diálogo", value: "nara_intro" }],
            section: "Conversas"
          }]
        ])}
        steps={[{ command: "show_dialogue nara_intro", isEnabled: true }]}
      />
    );

    expect(screen.getByRole("button", { name: "Passo 1: Exibir diálogo" })).toBeInTheDocument();
    expect(screen.getByText("Diálogo e menus · Conversas")).toBeInTheDocument();
    expect(screen.getByText("Diálogo: nara_intro")).toBeInTheDocument();
    expect(screen.queryByText("show_dialogue nara_intro")).not.toBeInTheDocument();
  });

  it("expands simple parameters inside the selected block", () => {
    const onUpdateStepParameter = vi.fn();
    const onToggleStep = vi.fn();
    const onRemoveStep = vi.fn();
    render(
      <EventStructureEditor
        activeStepIndex={0}
        eventName="wait_for_signal"
        onOpenCommandMenu={vi.fn()}
        onRemoveStep={onRemoveStep}
        onSelectStep={vi.fn()}
        onToggleStep={onToggleStep}
        onUpdateStepParameter={onUpdateStepParameter}
        stepPresentations={new Map([
          [0, {
            category: "Temporizador",
            label: "Aguardar",
            parameters: [{ id: "value", inputMode: "numeric", inline: true, label: "quadros", value: "30" }]
          }]
        ])}
        steps={[{ command: "wait 30", isEnabled: true }]}
      />
    );

    expect(screen.getByRole("region", { name: "Parâmetros do evento 1" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "quadros do evento 1" }), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Executar evento 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    expect(onUpdateStepParameter).toHaveBeenCalledWith(0, "value", "45");
    expect(onToggleStep).toHaveBeenCalledWith(0, false);
    expect(onRemoveStep).toHaveBeenCalledWith(0);
  });

  it("routes a dropped block to the selected conditional branch", () => {
    const onDropBlock = vi.fn();
    render(
      <EventStructureEditor
        eventName="door_enter"
        onDropBlock={onDropBlock}
        onOpenCommandMenu={vi.fn()}
        onSelectStep={vi.fn()}
        steps={[{ command: "if_flag door_open", isEnabled: true }, { command: "condition_end", isEnabled: true }]}
      />
    );

    fireEvent.drop(screen.getByRole("button", { name: "Adicionar evento em Se sim" }), {
      dataTransfer: {
        getData: (type: string) => type === "application/x-gba-command" ? "show_dialogue nara_intro" : ""
      }
    });

    expect(onDropBlock).toHaveBeenCalledWith(
      { kind: "trueBranch", conditionIndex: 0 },
      "show_dialogue nara_intro"
    );
  });
});
