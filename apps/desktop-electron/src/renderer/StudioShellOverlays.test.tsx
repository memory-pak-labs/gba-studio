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
import { useProjectProblemDismissals } from "./useProjectProblemDismissals.js";
import type { ProjectProblem } from "../shared/projectProblems.js";

function ProblemsHarness(): React.ReactElement {
  const problems: ProjectProblem[] = [
    { id: "budget", message: "Orçamento próximo do limite", detail: "Pressão máxima estimada: 88%.", targetName: "inventario", severity: "warning", workspace: "Arquivos" },
    { id: "missing", message: "Recurso ausente", severity: "error", workspace: "Arquivos" }
  ];
  const { visibleProblems, ignoredCount, ignoreWarning, ignoreAllWarnings, restoreWarnings } = useProjectProblemDismissals(problems, undefined);
  return <ProjectProblemsDrawer isOpen onClose={() => {}} onOpenProblem={() => {}} problems={visibleProblems} ignoredCount={ignoredCount} onIgnoreWarning={ignoreWarning} onIgnoreAllWarnings={ignoreAllWarnings} onRestoreWarnings={restoreWarnings} />;
}

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
          ignoredCount={0}
          onIgnoreWarning={vi.fn()}
          onIgnoreAllWarnings={vi.fn()}
          onRestoreWarnings={vi.fn()}
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

  it("ignora avisos individualmente, em lote e restaura sem ocultar erros", async () => {
    const user = userEvent.setup();
    render(<StudioI18nProvider><ProblemsHarness /></StudioI18nProvider>);
    expect(screen.getByText("inventario")).toBeInTheDocument();
    expect(screen.getByText("Pressão máxima estimada: 88%.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ignorar aviso: Recurso ausente" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ignorar aviso: Orçamento próximo do limite" }));
    expect(screen.queryByRole("button", { name: "Abrir Orçamento próximo do limite" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir Recurso ausente" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 aviso(s) ignorado(s)");
    await user.click(screen.getByRole("button", { name: "Restaurar avisos" }));
    await user.click(screen.getByRole("button", { name: "Ignorar avisos (1)" }));
    expect(screen.getByText("1 erro(s) · 0 aviso(s)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restaurar avisos" }));
    expect(screen.getByText("1 erro(s) · 1 aviso(s)")).toBeInTheDocument();
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
