/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectReferencePicker } from "./studioUi.js";

describe("ProjectReferencePicker", () => {
  afterEach(cleanup);

  it("busca e seleciona uma referencia pelo nome", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ProjectReferencePicker
        ariaLabel="Próxima cena"
        emptyLabel="Sequencial"
        onChange={onChange}
        options={[
          { value: "room-forest", label: "Floresta", detail: "Mundo 1" },
          { value: "room-castle", label: "Castelo", detail: "Mundo 2" }
        ]}
        value="room-forest"
      />
    );

    expect(screen.getByRole("combobox", { name: "Próxima cena" })).toHaveValue("Floresta");

    await user.click(screen.getByRole("combobox", { name: "Próxima cena" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar Próxima cena" }), "cast");
    expect(screen.queryByRole("option", { name: /Floresta/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Castelo.*Mundo 2/ }));
    expect(onChange).toHaveBeenCalledWith("room-castle");
  });

  it("preserva e sinaliza uma referencia invalida sem limpa-la silenciosamente", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ProjectReferencePicker
        ariaLabel="Fundo"
        emptyLabel="Sem fundo"
        onChange={onChange}
        options={[{ value: "forest.png", label: "Floresta" }]}
        value="missing.png"
      />
    );

    expect(screen.getByRole("combobox", { name: "Fundo" })).toHaveValue("missing.png");
    expect(screen.getByRole("combobox", { name: "Fundo" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Referência não encontrada");

    await user.click(screen.getByRole("combobox", { name: "Fundo" }));
    await user.click(screen.getByRole("option", { name: "Sem fundo" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("executa uma acao contextual e seleciona o valor retornado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCreate = vi.fn(async () => "event-created");

    render(
      <ProjectReferencePicker
        actions={[{ label: "Criar evento", run: onCreate }]}
        ariaLabel="Evento"
        onChange={onChange}
        options={[]}
        value=""
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Evento" }));
    await user.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("event-created");
    expect(screen.queryByRole("searchbox", { name: "Buscar Evento" })).not.toBeInTheDocument();
  });
});
