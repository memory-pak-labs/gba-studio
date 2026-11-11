/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioI18nProvider } from "./i18n";
import { StudioDialogProvider, useStudioDialog } from "./studioDialog";

function Harness({ result }: { result: (value: unknown) => void }) {
  const dialog = useStudioDialog();
  return <main data-testid="workspace">
    <button onClick={async () => result(await dialog.resolveDeletion("Remover fundo?", {
      usages: ["Cena: Praia"], replacements: [{ value: "outro", label: "Outro fundo" }], canUnlink: true,
      confirmLabel: "Remover"
    }))}>Excluir recurso</button>
    <button onClick={async () => result(await dialog.confirm("Continuar?"))}>Confirmar ação</button>
    <button onClick={async () => result(await dialog.prompt("Nome", "Minha cena"))}>Informar nome</button>
    <button>Outra aba</button>
  </main>;
}

function setup() {
  const result = vi.fn();
  const user = userEvent.setup();
  render(<StudioI18nProvider><StudioDialogProvider><Harness result={result}/></StudioDialogProvider></StudioI18nProvider>);
  return { result, user };
}

afterEach(cleanup);

it("keeps consecutive prompts queued in StrictMode", async () => {
  const result = vi.fn(), user = userEvent.setup();
  function Sequence() {
    const dialog = useStudioDialog();
    return <button onClick={async () => {
      const id = await dialog.prompt("ID da HUD", "hud_qa");
      const name = await dialog.prompt("Nome da HUD", "HUD QA");
      result({ id, name });
    }}>Criar HUD</button>;
  }
  render(<StrictMode><StudioI18nProvider><StudioDialogProvider><Sequence /></StudioDialogProvider></StudioI18nProvider></StrictMode>);
  await user.click(screen.getByRole("button", { name: "Criar HUD" }));
  await user.click(screen.getByRole("button", { name: "OK" }));
  expect(await screen.findByText("Nome da HUD")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("HUD QA");
  await user.click(screen.getByRole("button", { name: "OK" }));
  await waitFor(() => expect(result).toHaveBeenCalledWith({ id: "hud_qa", name: "HUD QA" }));
});

describe("keyboard isolation of studio dialogs", () => {
  it("wraps Tab from Cancel when the destructive action is disabled", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Excluir recurso" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("includes a newly enabled confirmation and replacement selector in the cycle", async () => {
    const { user, result } = setup();
    await user.click(screen.getByRole("button", { name: "Excluir recurso" }));
    await user.click(screen.getByRole("radio", { name: "Substituir" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Substituir por" }), "outro");
    const remove = screen.getByRole("button", { name: "Remover" });
    remove.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
    await user.click(remove);
    await waitFor(() => expect(result).toHaveBeenCalledWith({ kind: "replace", value: "outro" }));
    expect(screen.getByRole("button", { name: "Excluir recurso" })).toHaveFocus();
  });

  it("makes the background inert and restores focus and attributes on Escape", async () => {
    const { user, result } = setup();
    const trigger = screen.getByRole("button", { name: "Confirmar ação" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(screen.getByTestId("workspace").closest("[inert]")).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(result).toHaveBeenCalledWith(false));
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId("workspace").closest("[inert]")).toBeNull();
  });

  it("keeps prompt editing and Enter submission inside the dialog", async () => {
    const { user, result } = setup();
    await user.click(screen.getByRole("button", { name: "Informar nome" }));
    const input = await screen.findByRole("textbox", { name: "Valor" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.keyboard("Novo nome{Enter}");
    await waitFor(() => expect(result).toHaveBeenCalledWith("Novo nome"));
    expect(screen.getByRole("button", { name: "Informar nome" })).toHaveFocus();
  });

  it("does not dispatch scene shortcuts behind an open confirmation", async () => {
    const { user } = setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    try {
      await user.click(screen.getByRole("button", { name: "Confirmar ação" }));
      await user.keyboard("{ArrowRight}{Delete}{Escape}");
      expect(shortcut).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", shortcut); }
  });
});
