/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProjectProblemsDrawer,
  StudioCommandPalette,
  WorkspaceNavigationTrail
} from "./StudioShellOverlays.js";
import { StudioI18nProvider } from "./i18n.js";

describe("StudioShellOverlays", () => {
  afterEach(cleanup);

  it("abre uma pendencia global no workspace e alvo corretos", async () => {
    const user = userEvent.setup();
    const onOpenProblem = vi.fn();
    render(
      <StudioI18nProvider>
        <ProjectProblemsDrawer
          isOpen
          onClose={vi.fn()}
          onOpenProblem={onOpenProblem}
          problems={[
            { id: "dialogue-intro", message: "Retrato ausente", severity: "error", workspace: "Dialogos", targetName: "intro" },
            { id: "audio-theme", message: "Audio sem uso", severity: "warning", workspace: "Audio", targetName: "theme.mod" }
          ]}
        />
      </StudioI18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Abrir Retrato ausente" }));
    expect(onOpenProblem).toHaveBeenCalledWith(expect.objectContaining({ workspace: "Dialogos", targetName: "intro" }));
  });

  it("filtra e executa comandos globais pelo nome", async () => {
    const user = userEvent.setup();
    const runAudio = vi.fn();
    const onClose = vi.fn();
    render(
      <StudioI18nProvider>
        <StudioCommandPalette
          actions={[
            { id: "workspace-editor", label: "Ir para Editor", keywords: ["room"], run: vi.fn() },
            { id: "workspace-audio", label: "Ir para Audio", keywords: ["musica", "som"], run: runAudio }
          ]}
          isOpen
          onClose={onClose}
        />
      </StudioI18nProvider>
    );

    await user.type(screen.getByRole("searchbox", { name: "Buscar comando global" }), "musica");
    expect(screen.queryByRole("button", { name: "Ir para Editor" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ir para Audio" }));
    expect(runAudio).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mostra a origem da navegacao e permite retornar", async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    render(
      <StudioI18nProvider>
        <WorkspaceNavigationTrail
          currentLabel="Evento idle_down_frame_1"
          onReturn={onReturn}
          sourceLabel="Sprites · idle_down · Quadro 1"
        />
      </StudioI18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Voltar para Sprites · idle_down · Quadro 1" }));
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("renderiza o chrome da paleta no idioma selecionado", () => {
    window.localStorage.setItem("gbaStudio.locale", "fr-FR");
    render(
      <StudioI18nProvider>
        <StudioCommandPalette actions={[]} isOpen onClose={vi.fn()} />
      </StudioI18nProvider>
    );

    expect(screen.getByRole("dialog", { name: "Commandes globales" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Rechercher une commande globale" })).toBeInTheDocument();
    expect(screen.getByText("Aucune commande trouvée.")).toBeInTheDocument();
  });
});
