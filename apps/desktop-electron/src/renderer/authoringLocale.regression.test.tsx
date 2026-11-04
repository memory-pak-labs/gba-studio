/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioI18nProvider, useStudioI18n } from "./i18n";
import { StudioDialogProvider, useStudioDialog } from "./studioDialog";
import { StudioToastProvider, useStudioToast } from "./studioToast";

function AuthoringHarness({ onResult }: { onResult: (value: string | boolean | null) => void }) {
  const { prompt, confirm } = useStudioDialog();
  const { pushToast } = useStudioToast();
  const { setLocale } = useStudioI18n();
  return <>
    <button onClick={async () => onResult(await prompt("Nome do novo evento", "novo_evento"))}>Create script</button>
    <button onClick={async () => onResult(await confirm("Continuar sem salvar as alteracoes do projeto?", {
      title: "Alteracoes nao salvas", confirmLabel: "Continuar sem salvar", variant: "danger"
    }))}>Discard</button>
    <button onClick={() => setLocale("es-ES")}>Spanish</button>
    <button onClick={() => pushToast("Projeto salvo: Minha Ilha.gba-project")}>Saved notification</button>
  </>;
}

function showHarness(onResult = vi.fn()) {
  render(<StudioI18nProvider><StudioDialogProvider><StudioToastProvider>
    <AuthoringHarness onResult={onResult}/>
  </StudioToastProvider></StudioDialogProvider></StudioI18nProvider>);
  return onResult;
}

describe("authoring locale regressions", () => {
  beforeEach(() => window.localStorage.setItem("gbaStudio.locale", "en-US"));
  afterEach(() => { cleanup(); window.localStorage.clear(); });

  it("localizes a new-script prompt while preserving the authored identifier", async () => {
    const result = showHarness();
    fireEvent.click(screen.getByRole("button", { name: "Create script" }));
    expect(screen.getByRole("dialog", { name: "Enter a value" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Value" }), { target: { value: "  minha_rotina  " } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(result).toHaveBeenCalledWith("minha_rotina"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("translates discard options and updates an open dialog when the locale changes", async () => {
    const result = showHarness();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue without saving" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Spanish" }));
    expect(screen.getByRole("dialog", { name: "Cambios sin guardar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar sin guardar" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(result).toHaveBeenCalledWith(false));
  });

  it("localizes a saved-project notification without translating its filename", () => {
    showHarness();
    fireEvent.click(screen.getByRole("button", { name: "Saved notification" }));
    expect(screen.getByText("Project saved: Minha Ilha.gba-project")).toBeVisible();
  });
});
