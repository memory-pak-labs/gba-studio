/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioI18nProvider } from "./i18n";
import { WelcomeScreen } from "./WelcomeScreen";

describe("WelcomeScreen i18n", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    window.gbaStudio = {
      getRecentProjects: vi.fn(async () => [])
    } as unknown as typeof window.gbaStudio;
  });

  it("switches the welcome UI between English and Latin American Spanish", async () => {
    const user = userEvent.setup();

    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Ready to open a project."
          onCreateProject={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenRecentProject={vi.fn()}
        />
      </StudioI18nProvider>
    );

    await user.selectOptions(screen.getByLabelText("Idioma do app"), "en-US");

    expect(screen.getByLabelText("App language")).toHaveValue("en-US");
    expect(screen.getByRole("heading", { name: "Create project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start from example" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Blank project/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Choose when creating")).toBeInTheDocument();
    expect(screen.getByText("A folder named after the project will be created at the selected destination.")).toBeInTheDocument();
    expect(screen.getByText("Complete project with 30 scenes and 13 native runtimes for Game Boy Advance.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "First path" })).not.toBeInTheDocument();
    expect(screen.queryByText("Explore all 30 scenes, the different runtimes and the assets prepared for GBA.")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("App language"), "es-ES");

    expect(screen.getByLabelText("Idioma de la app")).toHaveValue("es-ES");
    expect(screen.getByRole("heading", { name: "Crear proyecto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar con el ejemplo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Proyecto en blanco/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plantillas" })).toBeInTheDocument();
    expect(screen.getByText("Proyecto completo con 30 escenas y 13 runtimes nativos para Game Boy Advance.")).toBeInTheDocument();
  });

  it("remove o bloco Primeiro caminho da Welcome", () => {
    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Pronto."
          onCreateProject={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenRecentProject={vi.fn()}
        />
      </StudioI18nProvider>
    );

    expect(screen.queryByRole("heading", { name: "Primeiro caminho" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Uma sequência curta para começar/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Templates" })).toBeInTheDocument();
  });

  it("exposes every language from the shared site catalog", () => {
    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Pronto."
          onCreateProject={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenRecentProject={vi.fn()}
        />
      </StudioI18nProvider>
    );

    const languageSelect = screen.getByRole("combobox");
    expect(Array.from(languageSelect.querySelectorAll("option")).map((option) => option.value)).toEqual([
      "pt-BR",
      "en-US",
      "es-ES",
      "fr-FR",
      "hi-IN",
      "zh-CN",
      "ar-SA",
      "ru-RU",
      "de-DE",
      "ja-JP",
      "ko-KR",
      "it-IT",
      "pl-PL",
      "nl-NL"
    ]);
  });

  it("usa o Exemplo GBA como fluxo de criacao principal", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Pronto."
          onCreateProject={onCreateProject}
          onOpenProject={vi.fn()}
          onOpenRecentProject={vi.fn()}
        />
      </StudioI18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Começar com o exemplo" }));

    expect(onCreateProject).toHaveBeenCalledWith("Novo projeto", "exemplo-gba");
  });

  it("bloqueia novas criacoes enquanto o destino esta sendo escolhido", async () => {
    const user = userEvent.setup();
    let finishCreation: (() => void) | undefined;
    const onCreateProject = vi.fn(() => new Promise<void>((resolve) => {
      finishCreation = resolve;
    }));
    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Pronto."
          onCreateProject={onCreateProject}
          onOpenProject={vi.fn()}
          onOpenRecentProject={vi.fn()}
        />
      </StudioI18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Começar com o exemplo" }));
    expect(screen.getByRole("button", { name: "Criando projeto..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Projeto em branco/ })).toBeDisabled();

    finishCreation?.();
    expect(await screen.findByRole("button", { name: "Começar com o exemplo" })).toBeEnabled();
  });

  it("abre exatamente o caminho do projeto recente exibido", async () => {
    const user = userEvent.setup();
    const currentProjectPath = "/Users/teste/Projeto atual/projeto_atual.gba-project";
    const onOpenProject = vi.fn();
    const onOpenRecentProject = vi.fn();
    window.gbaStudio.getRecentProjects = vi.fn(async () => [{
      name: "projeto_atual",
      path: currentProjectPath
    }]);

    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Pronto."
          onCreateProject={vi.fn()}
          onOpenProject={onOpenProject}
          onOpenRecentProject={onOpenRecentProject}
        />
      </StudioI18nProvider>
    );

    await user.click(await screen.findByRole("button", { name: "Continuar projeto_atual" }));

    expect(onOpenRecentProject).toHaveBeenCalledWith(currentProjectPath);
    expect(onOpenProject).not.toHaveBeenCalled();
  });

  it("mostra o Exemplo GBA e o projeto em branco na galeria", () => {
    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Pronto."
          onCreateProject={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenRecentProject={vi.fn()}
        />
      </StudioI18nProvider>
    );

    const templateCards = screen.getAllByRole("button").filter((button) => button.classList.contains("welcome-template-card"));
    expect(templateCards).toHaveLength(2);
    expect(screen.getByText("Projeto em branco")).toBeInTheDocument();
    expect(screen.queryByText("Showcase de Perfis")).not.toBeInTheDocument();
    expect(screen.getByText("Exemplo GBA Completo")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Preview do template Exemplo GBA Completo" })).toBeInTheDocument();
    expect(screen.queryByText("Butano Fighter Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo Topdown")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo Platformer")).not.toBeInTheDocument();
  });

  it("cria um projeto em branco com o nome escolhido e permite tentar novamente apos cancelar", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn(async () => {});
    render(<StudioI18nProvider><WelcomeScreen status="Pronto." onCreateProject={onCreateProject} onOpenProject={vi.fn()} onOpenRecentProject={vi.fn()} /></StudioI18nProvider>);
    await user.clear(screen.getByLabelText("Nome do projeto"));
    await user.type(screen.getByLabelText("Nome do projeto"), "Meu jogo");
    await user.click(screen.getByRole("button", { name: /Projeto em branco/ }));
    expect(onCreateProject).toHaveBeenCalledWith("Meu jogo", "blank");
    expect(screen.getByRole("button", { name: /Projeto em branco/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Projeto em branco/ }));
    expect(onCreateProject).toHaveBeenCalledTimes(2);
  });

  it("abre os creditos autorais e fecha o modal com Escape", async () => {
    const user = userEvent.setup();
    render(
      <StudioI18nProvider>
        <WelcomeScreen
          status="Pronto."
          onCreateProject={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenRecentProject={vi.fn()}
        />
      </StudioI18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Créditos" }));

    const dialog = screen.getByRole("dialog", { name: "Créditos" });
    expect(dialog).toHaveTextContent("GBA Studio e GBAStudio Engine são softwares autorais e independentes");
    expect(dialog).toHaveTextContent("Matheus Melo");
    expect(dialog).toHaveTextContent("GB Studio");
    expect(dialog).toHaveTextContent("Butano");
    expect(dialog).toHaveTextContent("devkitPro / devkitARM");
    expect(dialog).toHaveTextContent("mGBA");
    expect(dialog).not.toHaveTextContent("Electron, React, TypeScript, Vite e Lucide");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Créditos" })).not.toBeInTheDocument();
  });
});
