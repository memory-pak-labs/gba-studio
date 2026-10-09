/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render as renderWithoutProviders, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectHealthReport } from "../shared/projectHealth.js";
import { deriveSettingsWorkspacePresentation } from "../shared/settingsWorkspace.js";
import { StudioI18nProvider } from "./i18n.js";
import { SettingsWorkspace } from "./settingsWorkspace.js";

function render(ui: ReactElement) {
  return renderWithoutProviders(<StudioI18nProvider>{ui}</StudioI18nProvider>);
}

function settingsHandlers(overrides: Record<string, unknown> = {}) {
  return {
    pathValidation: null,
    pathValidationRunning: false,
    engineStatus: null,
    doctorResult: null,
    doctorRunning: false,
    buildDryRunResult: null,
    buildDryRunRunning: false,
    hasEngineAssetc: false,
    hasEngineBuild: false,
    onUpdateSetting: vi.fn(),
    onSelectPath: vi.fn(),
    onValidatePaths: vi.fn(),
    onResetSection: vi.fn(),
    onRunEngineDoctor: vi.fn(),
    onRunEngineBuildDryRun: vi.fn(),
    ...overrides
  };
}

describe("SettingsWorkspace React", () => {
  it("applies an external export focus request once without pulling the user back after edits", async () => {
    const user = userEvent.setup();
    const handlers = settingsHandlers();
    const { rerender } = render(<SettingsWorkspace scope="export" presentation={deriveSettingsWorkspacePresentation({ settings: {} })} focusedSectionID="health" focusRequestID={1} {...handlers} />);
    await user.click(screen.getByRole("button", { name: "Projeto e ROM seção de ajustes" }));
    rerender(<StudioI18nProvider><SettingsWorkspace scope="export" presentation={deriveSettingsWorkspacePresentation({ settings: { general: { gameTitle: "Editado" } } })} focusedSectionID="health" focusRequestID={1} {...handlers} /></StudioI18nProvider>);
    expect(screen.getByRole("region", { name: "Editar Projeto e ROM" })).toBeInTheDocument();
  });
  it("edits the combined project/ROM fields through their original sections and routes search correctly", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn(), onSelectPath = vi.fn(), onValidatePaths = vi.fn();
    const project = { settings: { general: { startScene: "removed", startPlayer: "missing" }, build: { romFileName: "review.gba" } }, scenas: [{ name: "logo" }], actors: [{ name: "Nara" }] };
    render(<SettingsWorkspace scope="export" presentation={deriveSettingsWorkspacePresentation(project)} projectData={project} {...settingsHandlers({ onUpdateSetting, onSelectPath, onValidatePaths })} />);
    expect(screen.getByRole("combobox", { name: "Cena inicial" })).toHaveValue("removed");
    expect(screen.getByRole("option", { name: "Referência inválida (removed)" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Cena inicial" }), "logo");
    expect(onUpdateSetting).toHaveBeenLastCalledWith("general", "startScene", "logo");
    await user.selectOptions(screen.getByRole("combobox", { name: "Player inicial" }), "Nara");
    expect(onUpdateSetting).toHaveBeenLastCalledWith("general", "startPlayer", "Nara");
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da ROM" }), { target: { value: "changed.gba" } });
    expect(onUpdateSetting).toHaveBeenLastCalledWith("build", "romFileName", "changed.gba");
    await user.click(screen.getByRole("button", { name: "Escolher Pasta de exportação" }));
    expect(onSelectPath).toHaveBeenCalledWith("general", expect.objectContaining({ key: "exportFolder", pathPicker: "directory" }));
    await user.click(screen.getByRole("button", { name: "Verificar caminhos" }));
    expect(onValidatePaths).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Dados avançados da ROM"));
    fireEvent.change(screen.getByRole("textbox", { name: "Código do jogo" }), { target: { value: "TEST" } });
    expect(onUpdateSetting).toHaveBeenLastCalledWith("build", "gameCode", "TEST");
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar ajustes" }), { target: { value: "Código do jogo" } });
    expect(screen.getByRole("button", { name: "Abrir Projeto e ROM" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir Compilação" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Compilação seção de ajustes" }));
    expect(screen.queryByRole("textbox", { name: "Nome da ROM" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Cache incremental persistente" })).toBeInTheDocument();
  });

  it("keeps primary actions disabled during a build and displays real path status", () => {
    render(<SettingsWorkspace scope="export" presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...settingsHandlers({ onGenerateRom: vi.fn(), onPlayProject: vi.fn() })} pathValidation={{ ok: false, items: [] }} romRunning generateRomDisabled playProjectDisabled />);
    expect(screen.getByRole("status")).toHaveTextContent("Caminhos com pendências");
    expect(screen.getByRole("button", { name: "Gerando ROM..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Executar ROM" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verificar caminhos" })).toBeDisabled();
  });

  it("presents automatic tools and hardware as information and gates dry-run on a current export", async () => {
    const user = userEvent.setup();
    const presentation = deriveSettingsWorkspacePresentation({ settings: { audio: { sampleRate: 15768 }, build: { compilerPath: "/old/compiler" } } });
    const { rerender } = render(<SettingsWorkspace scope="export" presentation={presentation} {...settingsHandlers({ hasEngineBuild: true })} />);
    expect(screen.getByText("Caminhos ainda não verificados")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Compilação seção de ajustes" }));
    await user.click(screen.getByText("Toolchain e caminhos avançados"));
    expect(screen.getByLabelText("Compiler")).toHaveTextContent("Automático via devkitARM");
    expect(screen.queryByRole("textbox", { name: "Compiler" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gbsbuild dry-run" })).toBeDisabled();
    rerender(<StudioI18nProvider><SettingsWorkspace scope="export" presentation={presentation} {...settingsHandlers({ hasEngineBuild: true })} hasCurrentEngineExport /></StudioI18nProvider>);
    expect(screen.getByRole("button", { name: "gbsbuild dry-run" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Hardware GBA seção de ajustes" }));
    expect(screen.getByLabelText("Resolução")).toHaveTextContent("240 x 160");
    expect(screen.queryByRole("button", { name: "Restaurar padrão de Hardware GBA" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Áudio seção de ajustes" }));
    expect(screen.getByRole("combobox", { name: "Sample rate" })).toHaveValue("15768");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders editor settings without duplicating export configuration", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    const { container } = render(
      <SettingsWorkspace presentation={presentation} {...settingsHandlers()} />
    );

    expect(screen.getByRole("button", { name: "Seção de ajustes da interface" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Aplicativo" })).toHaveLength(1);
    expect(screen.queryByText("Presets do projeto")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Geral" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Build" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Tipos de Cena" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "UI / Diálogos seção de ajustes" })).not.toBeInTheDocument();
    expect(container.querySelector(".settings-value-list")).not.toBeInTheDocument();
  });

  it("renders the GBA controls as comma-separated keyboard bindings", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.click(screen.getByRole("button", { name: "Controles seção de ajustes" }));
    expect(screen.getByText("Separe várias teclas por vírgulas" )).toBeInTheDocument();

    const upInput = screen.getByLabelText("Cima");
    expect(upInput).toHaveValue("ArrowUp,w");
    expect(screen.getByLabelText("Baixo")).toHaveValue("ArrowDown,s");
    expect(screen.getByLabelText("Esquerda")).toHaveValue("ArrowLeft,a");
    expect(screen.getByLabelText("Direita")).toHaveValue("ArrowRight,d");
    expect(screen.getByLabelText("A")).toHaveValue("Alt,z,j");
    expect(screen.getByLabelText("B")).toHaveValue("Control,k,x");
    fireEvent.change(upInput, { target: { value: "ArrowUp,w,Space" } });
    expect(onUpdateSetting).toHaveBeenLastCalledWith("controls", "up", "ArrowUp,w,Space");
  });

  it("renders and edits the scene editor shortcut settings", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.click(screen.getByRole("button", { name: "Atalhos seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Editar Atalhos" })).toBeInTheDocument();
    expect(screen.getByText(/Clique em Capturar/)).toBeInTheDocument();
    const shortcutPanel = screen.getByRole("region", { name: "Configuração dos atalhos do editor" });
    expect(shortcutPanel.querySelector(".settings-shortcut-overview")).toBeNull();
    expect(shortcutPanel.querySelectorAll(".settings-shortcut-edit kbd")).toHaveLength(0);

    const selectInput = screen.getByLabelText("Selecionar");
    expect(selectInput).toHaveValue("V");
    expect(selectInput).toHaveAttribute("readonly");
    const captureButton = screen.getByRole("button", { name: "Capturar atalho de Selecionar" });
    await user.click(captureButton);
    expect(screen.getByRole("button", { name: "Pressione… atalho de Selecionar" })).toBeInTheDocument();
    fireEvent.keyDown(captureButton, { key: "x" });
    expect(onUpdateSetting).toHaveBeenLastCalledWith("shortcuts", "select", "x");
    expect(screen.getByRole("button", { name: "Restaurar atalho padrão de Selecionar" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Restaurar todos os atalhos" })).not.toBeInTheDocument();
  });

  it("explains when the Engine Pack was found through automatic detection", () => {
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        build: { enginePackPath: "GBAStudioEnginePack" }
      }
    });

    render(
      <SettingsWorkspace
        scope="export"
        title="Exportar"
        presentation={presentation}
        {...settingsHandlers()}
        pathValidation={{
          ok: true,
          items: [{
            id: "build.enginePackPath",
            label: "Engine Pack",
            path: "GBAStudioEnginePack",
            resolvedPath: "/workspace/packages/GBAStudioEngine/dist/GBAStudioEnginePack",
            mode: "directory",
            kind: "directory",
            exists: true,
            ok: true,
            missingTools: [],
            missingFiles: []
          }]
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Compilação seção de ajustes" }));
    expect(screen.getByText("Engine Pack detectado automaticamente.")).toBeInTheDocument();
    expect(screen.getByText("Usado: /workspace/packages/GBAStudioEngine/dist/GBAStudioEnginePack")).toBeInTheDocument();
  });

  it("captures modifier shortcuts and explains reserved commands", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.click(screen.getByRole("button", { name: "Atalhos seção de ajustes" }));
    const captureButton = screen.getByRole("button", { name: "Capturar atalho de Selecionar" });
    await user.click(captureButton);
    fireEvent.keyDown(captureButton, { code: "KeyB", key: "b", ctrlKey: true, shiftKey: true });
    expect(onUpdateSetting).toHaveBeenCalledWith("shortcuts", "select", "mod+shift+b");

    const paintCaptureButton = screen.getByRole("button", { name: "Capturar atalho de Pintura" });
    await user.click(paintCaptureButton);
    fireEvent.keyDown(paintCaptureButton, { key: "k", metaKey: true });
    expect(screen.getByText("Esse atalho é reservado para a Paleta de comandos.")).toBeInTheDocument();
    expect(onUpdateSetting).toHaveBeenCalledTimes(1);
  });

  it("shows shortcut descriptions and conflicts with accessible feedback", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const onResetSection = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({
      settings: { shortcuts: { select: "b", paint: "b" } }
    });

    render(<SettingsWorkspace presentation={presentation} {...settingsHandlers({ onUpdateSetting, onResetSection })} />);

    await user.click(screen.getByRole("button", { name: "Atalhos seção de ajustes" }));

    expect(screen.getByText("Selecionar e mover entidades")).toBeInTheDocument();
    expect(screen.getByText("Conflita com Pintura.")).toBeInTheDocument();
    expect(screen.getByText("Conflita com Selecionar.")).toBeInTheDocument();
    expect(screen.getByLabelText("Selecionar")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("2 atalhos precisam de atenção.")).toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: "Restaurar atalho padrão de Selecionar" }));
    expect(onUpdateSetting).toHaveBeenCalledWith("shortcuts", "select", "v");
    await user.click(screen.getByRole("button", { name: "Restaurar padrão de Atalhos" }));
    expect(onResetSection).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar restauração" }));
    expect(onResetSection).toHaveBeenCalledWith("shortcuts");
    expect(onUpdateSetting).toHaveBeenCalledTimes(1);
  });

  it("renders the Home credits content inside Ajustes", async () => {
    const user = userEvent.setup();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace presentation={presentation} {...settingsHandlers()} />);

    await user.click(screen.getByRole("button", { name: "Créditos seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Editar Créditos" })).toBeInTheDocument();
    expect(screen.getByText("Sobre o GBA Studio")).toBeInTheDocument();
    expect(screen.getByText("Matheus Melo")).toBeInTheDocument();
    expect(screen.getByText("Referências e agradecimentos")).toBeInTheDocument();
    expect(screen.getByText("devkitPro / devkitARM")).toBeInTheDocument();
    expect(screen.getByText(/não são afiliados, patrocinados ou endossados/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restaurar padrão de Créditos" })).not.toBeInTheDocument();
  });

  it("renders the dedicated Exportar workspace with ROM actions and export sections", async () => {
    const user = userEvent.setup();
    const onGenerateRom = vi.fn();
    const onPlayProject = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(
      <SettingsWorkspace
        scope="export"
        title="Exportar"
        presentation={presentation}
        {...settingsHandlers({ onGenerateRom, onPlayProject })}
      />
    );

    expect(screen.getByRole("heading", { level: 3, name: "Exportar" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Editar Projeto e ROM" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Compilação" })).not.toBeInTheDocument();
    const exportNav = screen.getByRole("complementary", { name: "Seções de exportar" });
    const labels = Array.from(exportNav.querySelectorAll(".settings-nav-item strong")).map(element => element.textContent);
    expect(labels).toEqual(["Projeto e ROM", "Compilação", "Hardware GBA", "Áudio", "Salvamento", "Runtime Universal", "Orçamentos", "Saúde do projeto"]);
    expect(screen.getByRole("button", { name: "Verificar caminhos" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Interface" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gerar ROM" }));
    await user.click(screen.getByRole("button", { name: "Executar ROM" }));

    expect(onGenerateRom).toHaveBeenCalledOnce();
    expect(onPlayProject).toHaveBeenCalledOnce();
  });

  it("renders the shared preflight report and routes export diagnostics", async () => {
    const user = userEvent.setup();
    const onOpenProjectDiagnostic = vi.fn();
    const report: ProjectHealthReport = {
      status: "warning",
      exportReady: true,
      counts: { info: 0, warning: 1, error: 0 },
      contract: {
        ok: true,
        issueCount: 0,
        validatorLabels: [],
        validatorCounts: [],
        summary: "Contrato pronto",
        detail: "Contrato válido."
      },
      diagnostics: [{
        id: "engine-pack-warning",
        code: "settings.warning",
        severity: "warning",
        scope: "export",
        workspace: "Exportar",
        targetName: "engine-pack",
        message: "Engine Pack ausente"
      }],
      scenes: []
    };

    render(
      <SettingsWorkspace
        scope="export"
        title="Exportar"
        presentation={deriveSettingsWorkspacePresentation({ settings: {} })}
        projectHealthReport={report}
        onOpenProjectDiagnostic={onOpenProjectDiagnostic}
        {...settingsHandlers()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Saúde seção de exportação" }));
    expect(screen.getByText("Exportação liberada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir Engine Pack ausente" }));
    expect(onOpenProjectDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ workspace: "Exportar" }));
  });

  it("moves Audio and Save Data out of the general settings workspace", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace presentation={presentation} {...settingsHandlers()} />);

    expect(screen.queryByRole("region", { name: "Editar Áudio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Save Data" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Áudio seção de ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Data seção de ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview seção de ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Runtime Universal seção de ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Projéteis seção de ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sprites seção de ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Backgrounds seção de ajustes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logs e orçamentos seção de ajustes" })).not.toBeInTheDocument();
  });

  it("renders scene rules in the dedicated Cenas workspace", async () => {
    const user = userEvent.setup();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers()} />);

    expect(screen.getByRole("heading", { level: 3, name: "Cenas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Editar Top-down" })).toBeInTheDocument();
    expect(screen.getByLabelText("Player padrão · Aventura / Top-down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Players e backgrounds seção de ajustes" }));
    const players = screen.getByRole("region", { name: "Editar Players e backgrounds" });
    expect(within(players).getByLabelText("Player padrão · Aventura / Top-down")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Tipos de Cena" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Disponibilidade dos tipos de cena" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Top-down" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Geral" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar paths" })).not.toBeInTheDocument();
  });

  it("keeps advanced scene tuning as a slider plus exact numeric value", async () => {
    const user = userEvent.setup();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers()} />);

    const topdown = screen.getByRole("region", { name: "Editar Top-down" });
    await user.click(within(topdown).getByText("Valores técnicos"));

    expect(within(topdown).getByRole("slider", { name: "Velocidade caminhada" })).toHaveAttribute("min", "0");
    expect(within(topdown).getByRole("slider", { name: "Velocidade caminhada" })).toHaveAttribute("max", "16");
    expect(within(topdown).getByRole("spinbutton", { name: "Velocidade caminhada valor exato" })).toBeInTheDocument();
  });

  it("separa regras de batalha dos valores técnicos e direciona a apresentação para HUDs", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.click(screen.getByRole("button", { name: "Batalha RPG seção de ajustes" }));
    const battle = screen.getByRole("region", { name: "Editar Batalha RPG" });
    expect(within(battle).getByText("Regras da batalha")).toBeInTheDocument();
    expect(within(battle).getByRole("checkbox", { name: "Permitir fuga" })).toBeChecked();
    expect(within(battle).getByRole("checkbox", { name: "Tipos elementais" })).toBeChecked();
    expect(within(battle).queryByRole("checkbox", { name: "Barra de experiência" })).not.toBeInTheDocument();
    expect(within(battle).queryByRole("checkbox", { name: "Barras de HP" })).not.toBeInTheDocument();
    expect(within(battle).getByText(/Editor → HUD → Aparência/)).toBeInTheDocument();

    await user.click(within(battle).getByRole("checkbox", { name: "Permitir fuga" }));
    expect(onUpdateSetting).toHaveBeenCalledWith("battleRpg", "escapeEnabled", false);
  });

  it("keeps technical tuning collapsed after the primary scene controls", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers()} />);

    const topdown = screen.getByRole("region", { name: "Editar Top-down" });
    const quickSettings = within(topdown).getByRole("region", { name: "Ajustes por intenção de Top-down" });
    const advancedSettings = topdown.querySelector("details");

    expect(quickSettings).toBeInTheDocument();
    expect(advancedSettings).toBeInTheDocument();
    expect(advancedSettings).not.toHaveAttribute("open");
    expect(topdown.lastElementChild).toBe(advancedSettings);
  });

  it("keeps the local Interface settings available without a project", () => {
    const onUpdateSetting = vi.fn();

    render(<SettingsWorkspace presentation={null} {...settingsHandlers({ onUpdateSetting })} />);

    expect(screen.getByRole("button", { name: "Seção de ajustes da interface" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Tamanho da interface" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Geral" })).not.toBeInTheDocument();
    expect(onUpdateSetting).not.toHaveBeenCalled();
  });

  it("keeps every scene type available while showing one profile at a time", async () => {
    const user = userEvent.setup();
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        sceneTypes: {
          enabled: {
            topdown: true,
            platformer: false,
            pointAndClick: true
          }
        }
      }
    });

    render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers()} />);

    expect(screen.getByRole("region", { name: "Editar Top-down" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Apontar e Clicar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Plataforma" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plataforma seção de ajustes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Plataforma seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Editar Plataforma" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Top-down" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apontar e Clicar seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Editar Apontar e Clicar" })).toBeInTheDocument();
  });

  it("finds a setting by intent and applies the selected intent", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });

    render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.type(screen.getByRole("searchbox", { name: "Buscar ajustes" }), "ritmo rapido");
    await user.click(screen.getByRole("button", { name: "Abrir Top-down" }));
    await user.click(screen.getByRole("button", { name: "Aplicar Rápido em Top-down" }));

    expect(onUpdateSetting).toHaveBeenCalledWith("topdown", "walkSpeed", 1.25);
    expect(onUpdateSetting).toHaveBeenCalledTimes(1);
  });

  it("shows changed fields and confirms before restoring defaults", async () => {
    const user = userEvent.setup();
    const onResetSection = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({
      settings: { general: { gameTitle: "Meu jogo", author: "OpenAI" } }
    });

    render(<SettingsWorkspace scope="export" title="Exportar" presentation={presentation} {...settingsHandlers({ onResetSection })} />);

    await user.click(screen.getByRole("button", { name: "Restaurar padrão de Projeto e ROM" }));
    expect(onResetSection).not.toHaveBeenCalled();
    expect(screen.getByText("Título, Autor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar restauração" }));
    expect(onResetSection).toHaveBeenCalledWith("general");
  });

  it("keeps hardware profiling controls in Exportar without rendering runtime data there", () => {
    const project = {
      settings: { debug: { showCpuUsage: true, showVramUsage: true } },
      scena: { id: "room-1", name: "campo" },
      scenas: [{ id: "room-1", name: "campo", width: 4, height: 4, tilemap: [1, 2, 3, 4] }]
    };

    render(
      <SettingsWorkspace
        scope="export"
        title="Exportar"
        presentation={deriveSettingsWorkspacePresentation(project)}
        {...settingsHandlers()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Orçamentos seção de ajustes" }));
    expect(screen.getByRole("checkbox", { name: "CPU" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "VRAM" })).toBeChecked();
    expect(screen.queryByRole("region", { name: "Depurador de hardware" })).not.toBeInTheDocument();
  });

  it("renders the MCP scope and persists its activation", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const registration = '{\n  "mcpServers": {}\n}';
    const codexRegistration = [
      "[mcp_servers.gba-studio]",
      "command = \"/Applications/GBA Studio.app/Contents/MacOS/GBA Studio\"",
      "args = [\"--mcp\", \"--project\", \"/projects/demo.gba-project\"]",
      "enabled = true",
      "default_tools_approval_mode = \"prompt\"",
      ""
    ].join("\n");
    const getMcpServerRegistration = vi.fn().mockResolvedValue(registration);
    const getCodexMcpServerRegistration = vi.fn().mockResolvedValue(codexRegistration);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    render(
      <SettingsWorkspace
        presentation={deriveSettingsWorkspacePresentation({ settings: {} })}
        {...settingsHandlers({
          onUpdateSetting,
          projectPath: "/projects/demo.gba-project",
          getMcpServerRegistration,
          getCodexMcpServerRegistration
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "MCP local seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Editar MCP local" })).toBeInTheDocument();
    expect(screen.getByText("Usar rede")).toBeInTheDocument();
    expect(screen.getByText("Bloqueado · stdio local")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar configuração" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar para Codex" })).toBeInTheDocument();
    expect(getMcpServerRegistration).toHaveBeenCalledWith({
      projectPath: "/projects/demo.gba-project",
      enginePackPath: undefined
    });
    expect(getCodexMcpServerRegistration).toHaveBeenCalledWith({
      projectPath: "/projects/demo.gba-project",
      enginePackPath: undefined
    });
    expect(await screen.findByRole("textbox", { name: "Configuração MCP para copiar" })).toHaveValue(registration);
    expect(await screen.findByRole("textbox", { name: "Configuração TOML do Codex para copiar" })).toHaveValue(codexRegistration);

    await user.click(screen.getByRole("checkbox", { name: "Ativar MCP local" }));
    expect(onUpdateSetting).toHaveBeenCalledWith("mcp", "enabled", true);
    await user.click(screen.getByRole("button", { name: "Copiar configuração" }));
    expect(writeText).toHaveBeenCalledWith(registration);
    expect(screen.getByText("Configuração copiada.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copiar para Codex" }));
    expect(writeText).toHaveBeenCalledWith(codexRegistration);
    expect(screen.getByText("Configuração do Codex copiada.")).toBeInTheDocument();
  });

  it("renders universal runtime capabilities and persists their opt-ins", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({
      settings: { runtimeCapabilities: { rtc: { enabled: true } } }
    });

    render(<SettingsWorkspace scope="export" title="Exportar" presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.click(screen.getByRole("button", { name: "Runtime Universal seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Capacidades universais do runtime" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Relógio em tempo real (RTC)" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Link cable / multiplayer" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Efeitos affine avançados" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Capacidades universais do runtime" })).getByRole("status")).toHaveTextContent("Não utilizada");

    await user.click(screen.getByRole("checkbox", { name: "Link cable / multiplayer" }));

    expect(onUpdateSetting).toHaveBeenCalledWith("runtimeCapabilities", "link.enabled", true);
  });

  it("renders the affine/bitmap composer and visual save menu builder", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({
      settings: {
        backgrounds: { graphicsMode: "Mode 2 - Affine", affineRotation: 45, affineScaleX: 1.5, affineScaleY: 1 },
        save: { slots: 3, selectedSlot: 2, showPlayerName: true, showPlayTime: true, showLocation: true }
      }
    });

    const { rerender } = render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.click(screen.getByRole("button", { name: "Backgrounds seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Padrão de vídeo dos backgrounds" })).toBeInTheDocument();
    expect(screen.getByText(/Use este modo como base do pipeline/)).toBeInTheDocument();
    expect(screen.getByText("Prévia da transformação")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: "Modo gráfico" })).toHaveLength(1);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo gráfico" }), "Mode 5 - Bitmap 160x128");
    expect(onUpdateSetting).toHaveBeenCalledWith("backgrounds", "graphicsMode", "Mode 5 - Bitmap 160x128");

    rerender(
      <StudioI18nProvider>
        <SettingsWorkspace scope="export" title="Exportar" presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />
      </StudioI18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Salvamento seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Construtor visual de saves" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selecionar slot 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Continuar")).toBeInTheDocument();
    expect(screen.getByText("Carregar")).toBeInTheDocument();
    expect(screen.getByText("Apagar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Selecionar slot 3" }));
    expect(onUpdateSetting).toHaveBeenCalledWith("save", "selectedSlot", 3);
  });

  it("keeps sprite names as strings when changing a scene type default player", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({
      assets: [
        { name: "hero-topdown.png", kind: "Sprite" },
        { name: "hero-platformer.png", kind: "Sprite" }
      ],
      settings: {
        sceneTypes: {
          defaultPlayerSprites: {
            topdown: "hero-topdown.png",
            platformer: "hero-platformer.png"
          }
        }
      }
    });

    render(<SettingsWorkspace scope="scene" title="Cenas" presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);

    await user.click(screen.getByRole("button", { name: "Plataforma seção de ajustes" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Player padrão · Plataforma" }),
      "hero-topdown.png"
    );
    expect(onUpdateSetting).toHaveBeenCalledWith(
      "sceneTypes",
      "defaultPlayerSprites.platformer",
      "hero-topdown.png"
    );
  });

  it("preserves custom values on navigation and exposes each scene configuration", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    const presentation = deriveSettingsWorkspacePresentation({ settings: { platformer: { gravity: 0.51, jumpButton: "Start" } } });
    render(<SettingsWorkspace scope="scene" presentation={presentation} {...settingsHandlers({ onUpdateSetting })} />);
    const navigation = screen.getByLabelText("Seções de cenas");
    const names = within(navigation).getAllByRole("button").map(button => button.getAttribute("aria-label")!);
    for (const name of names) {
      await user.click(screen.getByRole("button", { name }));
      expect(navigation.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
      const page = document.querySelector(".scene-defaults-page")!;
      const selected = presentation.sections.find(section => page.id === `settings-section-${section.id}`)!;
      for (const field of selected.editableFields) {
        const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const labels = Array.from(page.querySelectorAll("label, [aria-label]")).map(label => normalize(label.getAttribute("aria-label") ?? label.textContent ?? ""));
        // Every field remains reachable, including technical controls inside the disclosure.
        expect(labels.some(label => label.includes(normalize(field.label)) || label === "dash" && field.key === "dash"), `${selected.id}.${field.key}`).toBe(true);
      }
    }
    await user.click(screen.getByRole("button", { name: "Plataforma seção de ajustes" }));
    expect(screen.getByLabelText("Botão de pulo")).toHaveValue("Start");
    expect(screen.getByRole("status")).toHaveTextContent("Personalizado");
    await user.click(screen.getByText("Valores técnicos"));
    expect(screen.getByRole("spinbutton", { name: "Gravidade valor exato" })).toHaveValue(0.51);
    expect(onUpdateSetting).not.toHaveBeenCalled();
  });

  it("edits platform abilities and physical GBA buttons through the existing settings handler", async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    render(<SettingsWorkspace scope="scene" presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...settingsHandlers({ onUpdateSetting })} />);
    await user.click(screen.getByRole("button", { name: "Plataforma seção de ajustes" }));
    await user.click(screen.getByRole("checkbox", { name: "Pulo duplo" }));
    expect(onUpdateSetting).toHaveBeenLastCalledWith("platformer", "doubleJump", true);
    await user.selectOptions(screen.getByLabelText("Botão de pulo"), "L");
    expect(onUpdateSetting).toHaveBeenLastCalledWith("platformer", "jumpButton", "L");
    await user.click(screen.getByRole("button", { name: "Aplicar Flutuante em Plataforma" }));
    expect(onUpdateSetting).toHaveBeenCalledWith("platformer", "gravity", 0.32);
    expect(onUpdateSetting).toHaveBeenCalledWith("platformer", "maxFallSpeed", 4);
    expect(onUpdateSetting).toHaveBeenCalledWith("platformer", "doubleJump", true);
    expect(screen.getByRole("checkbox", { name: "Controle no ar" })).not.toBeVisible();
  });

  it("keeps profile reset confirmed and separate from its default player", async () => {
    const user = userEvent.setup();
    const onResetSection = vi.fn();
    const onUpdateSetting = vi.fn();
    render(<SettingsWorkspace scope="scene" presentation={deriveSettingsWorkspacePresentation({ settings: { platformer: { gravity: 0.51 } } })} {...settingsHandlers({ onResetSection, onUpdateSetting })} />);
    await user.click(screen.getByRole("button", { name: "Plataforma seção de ajustes" }));
    await user.click(screen.getByRole("button", { name: "Restaurar padrão de Plataforma" }));
    expect(onResetSection).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onResetSection).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Restaurar padrão de Plataforma" }));
    await user.click(screen.getByRole("button", { name: "Confirmar restauração" }));
    expect(onResetSection).toHaveBeenCalledExactlyOnceWith("platformer");
    expect(onUpdateSetting).not.toHaveBeenCalled();
  });

  it("applies a multi-field preset as one project edit", async () => {
    const user = userEvent.setup();
    const onApplySettingsPreset = vi.fn();
    const onUpdateSetting = vi.fn();
    render(<SettingsWorkspace scope="scene" presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...settingsHandlers({ onUpdateSetting })} onApplySettingsPreset={onApplySettingsPreset} />);
    await user.click(screen.getByRole("button", { name: "Plataforma seção de ajustes" }));
    await user.click(screen.getByRole("button", { name: "Aplicar Flutuante em Plataforma" }));
    expect(onApplySettingsPreset).toHaveBeenCalledExactlyOnceWith("platformer", [
      { fieldKey: "gravity", value: 0.32 },
      { fieldKey: "maxFallSpeed", value: 4 },
      { fieldKey: "doubleJump", value: true },
      { fieldKey: "airControl", value: true }
    ]);
    expect(onUpdateSetting).not.toHaveBeenCalled();
  });
});
