/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlankProjectData } from "../shared/newProject";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { desktopAssetURL } from "../shared/spriteAssetURL";
import { deriveHardwareProfilerPresentation } from "../shared/hardwareProfiler";
import { StudioI18nProvider } from "./i18n";
import { createAdvancedHudPresetInProject, DEFAULT_HUD_PRESET, setActiveHudPresetInProject } from "../shared/hudPresets";
import type { AssetPackBudgetReport } from "../shared/projectBudget";
import {
  createRoomInProject,
  deriveRoomsWorkspacePresentation,
  roomEntitySelectionFootprint,
  setActiveRoomInProject
} from "../shared/roomsWorkspace";
import type { EventsWorkspaceCommandSuggestion } from "../shared/eventsWorkspace";
import { RoomsWorkspace } from "./roomsWorkspace";

const greetingRecipe: EventsWorkspaceCommandSuggestion = {
  id: "recipe-greeting",
  label: "Cumprimentar o jogador",
  command: "show_dialogue greeting",
  category: "Diálogo",
  section: null,
  targetName: null,
  badge: "Receita",
  runtimeStatus: "recipe",
  commandTemplate: null,
  parameters: [],
  isFavorite: false,
  isRecipe: true,
  steps: [{ command: "show_dialogue greeting", category: "Diálogo", detail: "Exibe um diálogo." }]
};

function roomsWorkspaceHandlers(overrides: Record<string, unknown> = {}) {
  return {
    onCreateRoom: vi.fn(() => "room-2"),
    onSetActiveRoom: vi.fn(),
    onUpdateRoomFields: vi.fn(),
    onApplyTileBrush: vi.fn(),
    onSetActiveTileLayerMapping: vi.fn(),
    onToggleCollisionCell: vi.fn(),
    onSetCollisionType: vi.fn(),
    onApplyCollisionFill: vi.fn(),
    onSetHeightLevel: vi.fn(),
    onCreateRoomConnection: vi.fn(),
    onRemoveRoomConnection: vi.fn(),
    onUpdateRoomConnection: vi.fn(),
    onUpdateRoomEntity: vi.fn(),
    onUpdateHudPreset: vi.fn(),
    onPlaceRoomEntity: vi.fn(),
    onResizeRoomTrigger: vi.fn(),
    onCreateTrigger: vi.fn(),
    onCreateActor: vi.fn(),
    onNudgeRoomEntities: vi.fn(),
    onAlignRoomEntities: vi.fn(),
    onDistributeRoomEntities: vi.fn(),
    onDuplicateRoomEntities: vi.fn(),
    onRemoveRoomEntities: vi.fn(),
    onUpdateSceneMapPosition: vi.fn(),
    onUpdateSceneMapZoom: vi.fn(),
    onUpdateSceneOrganization: vi.fn(),
    onUpdateRoomBackgroundTilesetGrid: vi.fn(),
    onRenameRoom: vi.fn(),
    onRemoveRoom: vi.fn(),
    onSetStartRoom: vi.fn(),
    onRunRoom: vi.fn(),
    runRoomDisabled: false,
    onImportTileset: vi.fn(async () => undefined),
    onImportTiledMap: vi.fn(async () => undefined),
    onCreateEventReference: vi.fn(),
    onSynchronizePrefabs: vi.fn(),
    onCreatePrefabFromEntity: vi.fn(),
    onInstantiatePrefab: vi.fn(),
    onUpdatePrefab: vi.fn(),
    ...overrides
  };
}

async function focusScene(user: ReturnType<typeof userEvent.setup>, roomName: string): Promise<void> {
  await user.click(screen.getByRole("button", { name: `Editar cena ${roomName}` }));
}

async function focusActiveScene(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const focusButton = screen.getAllByRole("button", { name: /^Editar cena / })
    .find((button) => button.closest(".room-stage-card.is-active-room"))
    ?? screen.getAllByRole("button", { name: /^Editar cena / })[0];
  if (!focusButton) throw new Error("Nenhuma cena disponível para foco");
  await user.click(focusButton);
}

async function openSceneInspector(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const tab = screen.queryByRole("tab", { name: /^Cena$/ });
  await user.click(tab ?? screen.getByRole("button", { name: "Propriedades da cena" }));
}

describe("RoomsWorkspace React smoke", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps composed isometric images out of tile painting while retaining height and collision editing", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Superfície isométrica" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "isometric";
    room.width = 4;
    room.height = 4;
    room.heightLevels = Array(16).fill(0);
    (room.heightLevels as number[])[10] = 1;
    room.backgroundAssetName = "surface.png";
    room.gbStudioUseBackgroundLayout = true;
    room.runtime = { type: "isometric", config: {
      tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24,
      worldMode: "scrollable_tiled_world", gameplayMode: "adventure",
      pagedSurface: { backgroundAsset: "surface.png", foregroundAsset: "front.png", width: 240, height: 160 }
    } };
    project.assets = ["surface.png", "front.png"].map(name => ({
      id: name, name, kind: "Background", metadata: { source: `Assets/backgrounds/${name}` }
    }));
    project.triggers = [{ id: "raised-exit", name: "Saída elevada", roomName: String(room.name), x: 2, y: 2, width: 1, height: 1 }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project}
      projectPath="/tmp/isometric-composed.gba-project" {...handlers} />);
    await focusActiveScene(user);
    const tools = container.querySelector<HTMLElement>(".room-editor-tool-group-focus")!;
    expect(within(tools).getByRole("button", { name: /Pintura - indisponível/ })).toBeDisabled();
    expect(within(tools).getByRole("button", { name: /Altura -/ })).toBeEnabled();
    expect(within(tools).getByRole("button", { name: /Colisao -/ })).toBeEnabled();
    expect(container.querySelector(".room-stage-isometric-grid-cell[data-cell-index='10']"))
      .toHaveAttribute("points", "120,48 136,56 120,64 104,56");
    const trigger = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-entity.trigger")!;
    expect(parseFloat(trigger.style.top)).toBeCloseTo(30);
    await user.keyboard("b");
    expect(within(tools).getByRole("button", { name: /Selecionar -/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(tools).getByRole("button", { name: /Altura -/ }));
    expect(container.querySelectorAll(".room-focused-scene-editor-frame .room-stage-height-badge")).toHaveLength(1);
    await openSceneInspector(user);
    expect(screen.getByRole("combobox", {name: "Tipo de cena"})).toHaveValue("isometricAdventure");
    expect(screen.getByRole("option", {name: "Isométrica · Batalha tática RPG"})).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Fundo" }));
    expect(screen.getByRole("combobox", { name: "Fundo isométrico BG2" })).toHaveValue("surface.png");
    expect(screen.getByRole("combobox", { name: "Frente isométrica BG3" })).toHaveValue("front.png");
    await user.selectOptions(screen.getByRole("combobox", { name: "Fundo isométrico BG2" }), "front.png");
    expect(handlers.onUpdateRoomFields).toHaveBeenLastCalledWith(String(room.id), expect.objectContaining({
      backgroundAssetName: "front.png",
      runtime: expect.objectContaining({ type: "isometric", config: expect.objectContaining({
        pagedSurface: { backgroundAsset: "front.png", foregroundAsset: "front.png", width: 240, height: 160 }
      }) })
    }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Frente isométrica BG3" }), "surface.png");
    expect(handlers.onUpdateRoomFields).toHaveBeenLastCalledWith(String(room.id), expect.objectContaining({
      runtime: expect.objectContaining({ config: expect.objectContaining({
        pagedSurface: { backgroundAsset: "surface.png", foregroundAsset: "surface.png", width: 240, height: 160 }
      }) })
    }));
  });

  it.each(["adventure", "tactical"])("follows mixed floor heights for triggers and camera zones in %s scenes", async gameplayMode => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Área com relevo" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    const heightLevels = Array(16).fill(0);
    heightLevels[10] = 3;
    Object.assign(room, { sceneType: "isometric", width: 4, height: 4, heightLevels,
      backgroundAssetName: "surface.png", gbStudioUseBackgroundLayout: true,
      runtime: { type: "isometric", config: {
        tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24, gameplayMode,
        ...(gameplayMode === "adventure"
          ? { worldMode: "scrollable_tiled_world", pagedSurface: { backgroundAsset: "surface.png", foregroundAsset: "surface.png", width: 240, height: 160 } }
          : { worldMode: "static_composition", tacticalPresentation: { surfacePages: [{ id: "floor", asset: "surface.png", world: { x: 0, y: 0, width: 240, height: 160 } }] } })
      } }, cameraZones: [{ id: "ramp-camera", name: "Rampa", area: { x: 1, y: 2, width: 2, height: 1 } }] });
    project.assets = [{ id: "floor", name: "surface.png", kind: "Background", metadata: { source: "Assets/backgrounds/surface.png" } }];
    project.actors = [];
    project.triggers = [{ id: "ramp-area", name: "Área da rampa", roomName: String(room.name), x: 1, y: 2, width: 2, height: 1 }];
    const { container } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project}
      projectPath="/tmp/isometric-terrain.gba-project" {...roomsWorkspaceHandlers()} />);
    await focusActiveScene(user);
    const stage = container.querySelector(".room-focused-scene-editor-frame")!;
    const trigger = stage.querySelector<HTMLElement>(".room-stage-entity.trigger")!;
    const camera = stage.querySelector<HTMLElement>(".room-camera-zone")!;
    for (const overlay of [trigger, camera]) {
      expect(parseFloat(overlay.style.top)).toBeCloseTo(20);
      expect(parseFloat(overlay.style.height)).toBeCloseTo(20);
      expect(overlay.style.clipPath).toContain("shape(nonzero");
      expect(overlay.style.clipPath).toContain("move to");
    }
  });

  it("materializa o Player no canvas sem contá-lo como ator comum", () => {
    const project = createBlankProjectData({ name: "Player visual" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.playerActorName = "Player";
    project.actors = [
      {
        id: "actor-player",
        name: "Player",
        roomName: room.name,
        spriteSheet: "player.png",
        x: 4,
        y: 4
      },
      {
        id: "actor-guide",
        name: "Guide",
        roomName: room.name,
        spriteSheet: "guide.png",
        x: 8,
        y: 4
      }
    ];

    const presentation = deriveRoomsWorkspacePresentation(project);
    const player = presentation.entities.find((entity) => entity.id === "actor-player");
    const guide = presentation.entities.find((entity) => entity.id === "actor-guide");

    expect(player?.isPlayer).toBe(true);
    expect(guide?.isPlayer).not.toBe(true);
  });

  it("substitui o Player da posição-base pela prévia do ponto de chegada", async () => {
    const user = userEvent.setup();
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Prévia de chegada" });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusScene(user, "porto_lumen");

    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas");
    expect(canvas?.querySelector(".room-stage-entity.actor.is-player")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Player Nara" }));
    expect(canvas?.querySelectorAll(".selected-entity-cell").length).toBeGreaterThan(0);
    const marker = canvas?.querySelector<HTMLElement>("[data-scene-event-marker='true']");
    expect(marker).not.toBeNull();
    expect(canvas?.querySelector(".room-arrival-source-label")?.textContent).toMatch(/^Chegada de /);
    expect(canvas?.querySelector(".is-player-default-label")?.textContent).toBe("Player · posição padrão");

    fireEvent.mouseEnter(marker!);

    expect(canvas?.querySelector("[data-player-arrival-preview='true']")).not.toBeNull();
    expect(canvas?.querySelector(".room-stage-entity.actor.is-player")).toBeNull();
    expect(canvas?.querySelectorAll(".selected-entity-cell")).toHaveLength(0);

    fireEvent.mouseLeave(marker!);

    expect(canvas?.querySelector("[data-player-arrival-preview='true']")).toBeNull();
    expect(canvas?.querySelector(".room-stage-entity.actor.is-player")).not.toBeNull();
    expect(canvas?.querySelectorAll(".selected-entity-cell").length).toBeGreaterThan(0);
  });

  it("seleciona a chegada e usa sua posição somente para testar a cena", async () => {
    const user = userEvent.setup();
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Teste de chegada" });
    const before = JSON.stringify(project);
    const onRunRoom = vi.fn();
    const onUpdateEventStep = vi.fn();
    const { container } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...roomsWorkspaceHandlers()} onRunRoom={onRunRoom} onUpdateEventStep={onUpdateEventStep} />);
    await focusScene(user, "porto_lumen");
    const marker = container.querySelector<HTMLButtonElement>(".room-focused-scene-editor-frame .room-scene-event-marker-point");
    expect(marker).not.toBeNull();
    await user.click(marker!);
    expect(screen.getByRole("region", { name: "Chegada de transição" })).toBeInTheDocument();
    const x = Number((screen.getByRole("spinbutton", { name: "X da chegada de transição" }) as HTMLInputElement).value);
    const y = Number((screen.getByRole("spinbutton", { name: "Y da chegada de transição" }) as HTMLInputElement).value);
    await user.click(screen.getByRole("button", { name: "Usar como início do teste" }));
    await user.click(screen.getByRole("button", { name: /Testar cena porto_lumen/ }));
    expect(onRunRoom).toHaveBeenCalledWith(expect.any(String), "porto_lumen", { x, y, direction: expect.any(String) });
    expect(JSON.stringify(project)).toBe(before);
    expect(container.querySelector(".room-test-start-marker")).not.toBeNull();
    fireEvent.change(screen.getByRole("spinbutton", { name: "X da chegada de transição" }), { target: { value: String(x + 1) } });
    expect(onUpdateEventStep).toHaveBeenCalledWith(marker!.closest("[data-scene-event-marker]")!.getAttribute("data-event-id"), Number(marker!.closest("[data-scene-event-marker]")!.getAttribute("data-step-index")), { command: expect.any(String) });
    expect(onUpdateEventStep.mock.calls[0][2].command).toContain(String(x + 1));
  });

  it("apresenta cenas do exemplo sem o prefixo legado do projeto", () => {
    const project = createBlankProjectData({ name: "Exemplo GBA" });
    const scenes = Array.isArray(project.scenas) ? project.scenas as Array<Record<string, unknown>> : [];
    const firstScene = scenes[0];
    if (!firstScene) throw new Error("O projeto de teste não possui cena inicial");
    project.scenas = scenes.map((scene, index) => index === 0
      ? { ...scene, name: "logo" }
      : scene);

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(screen.getByRole("button", { name: "Editar cena logo" })).toBeInTheDocument();
    expect(screen.queryByText("Somente leitura")).not.toBeInTheDocument();
    expect(screen.getAllByText("logo")).not.toHaveLength(0);
  });

  it("mantém a busca visível e filtra cenas no Explorer", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Busca de cenas" }), {
      anchorRoomID: "room-1",
      height: 20,
      id: "room-arena",
      name: "arena_arrancada",
      sceneType: "battleRpg",
      width: 30
    });
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    const explorer = screen.getByRole("complementary", { name: "Navegador do projeto" });
    await user.type(within(explorer).getByRole("searchbox", { name: "Buscar cenas" }), "arena");

    expect(within(explorer).getByText("arena_arrancada")).toBeInTheDocument();
    expect(within(explorer).queryByText("cena_1")).not.toBeInTheDocument();

    await user.click(within(explorer).getByRole("button", { name: "Limpar busca de cenas" }));
    expect(within(explorer).getByText("cena_1")).toBeInTheDocument();
  });

  it("permite criar um grupo de cenas pelo Explorer", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Grupos de cenas" });
    const handlers = roomsWorkspaceHandlers();
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await user.click(screen.getByRole("button", { name: "Novo grupo de cenas" }));
    const dialog = screen.getByRole("dialog", { name: "Novo grupo de cenas" });
    const input = within(dialog).getByRole("textbox", { name: "Nome do grupo" });
    await user.clear(input);
    await user.type(input, "Prólogo");
    await user.click(within(dialog).getByRole("button", { name: "Criar grupo" }));

    expect(handlers.onUpdateSceneOrganization).toHaveBeenCalledWith(expect.objectContaining({
      groups: [expect.objectContaining({ name: "Prólogo", sceneIDs: [] })]
    }));
  });

  it("seleciona cenas pelas caixas e cria um grupo com a seleção", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Seleção de cenas" }), {
      anchorRoomID: "room-1",
      height: 20,
      id: "room-second",
      name: "segunda_cena",
      sceneType: "topdown",
      width: 30
    });
    const handlers = roomsWorkspaceHandlers();
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    const explorer = screen.getByRole("complementary", { name: "Navegador do projeto" });
    await user.click(within(explorer).getByRole("button", { name: "Selecionar várias cenas" }));
    const firstScene = within(explorer).getByText("cena_1").closest("summary");
    const secondScene = within(explorer).getByText("segunda_cena").closest("summary");
    if (!firstScene || !secondScene) throw new Error("Cenas não encontradas no Explorer");
    await user.click(within(firstScene).getByRole("checkbox", { name: "Selecionar cena cena_1" }));
    await user.click(within(secondScene).getByRole("checkbox", { name: "Selecionar cena segunda_cena" }));
    expect(handlers.onSetActiveRoom).not.toHaveBeenCalled();

    await user.click(within(explorer).getByRole("button", { name: "Agrupar 2 cenas selecionadas" }));
    const dialog = screen.getByRole("dialog", { name: "Agrupar 2 cenas" });
    const input = within(dialog).getByRole("textbox", { name: "Nome do grupo" });
    await user.clear(input);
    await user.type(input, "Prólogo");
    await user.click(within(dialog).getByRole("button", { name: "Agrupar cenas" }));

    expect(handlers.onUpdateSceneOrganization).toHaveBeenCalledWith(expect.objectContaining({
      groups: [expect.objectContaining({ name: "Prólogo", sceneIDs: ["room-1", "room-second"] })]
    }));
  });

  it("mantém ações do grupo acessíveis sem aninhar controles na divulgação", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Ações dos grupos" });
    project.editorState = { sceneExplorer: { groups: [{ id: "story", name: "História", sceneIDs: ["room-1"] }] } };
    const handlers = roomsWorkspaceHandlers();
    const { container, rerender } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);

    const summary = container.querySelector<HTMLElement>(".scene-tree-group-row");
    const branch = summary?.closest("details");
    expect(summary?.querySelector("button, input, select, a, [tabindex]")).toBeNull();
    expect(branch).not.toHaveAttribute("open");
    const rename = screen.getByRole("button", { name: "Renomear grupo História" });
    rename.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Renomear grupo História" });
    const input = within(dialog).getByRole("textbox", { name: "Nome do grupo" });
    await user.clear(input);
    await user.type(input, "Prólogo");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(handlers.onUpdateSceneOrganization).toHaveBeenLastCalledWith(expect.objectContaining({
      groups: [expect.objectContaining({ id: "story", name: "Prólogo", sceneIDs: ["room-1"] })]
    }));
    expect(branch).not.toHaveAttribute("open");

    project.editorState = { sceneExplorer: handlers.onUpdateSceneOrganization.mock.lastCall?.[0] };
    rerender(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);
    await user.click(screen.getByRole("button", { name: "Remover grupo Prólogo" }));
    expect(handlers.onUpdateSceneOrganization).toHaveBeenLastCalledWith(expect.objectContaining({ groups: [], order: ["room-1"] }));
    expect(screen.getByText("cena_1", { selector: ".scene-tree-row strong" })).toBeInTheDocument();
    expect(handlers.onRemoveRoom).not.toHaveBeenCalled();
  });

  it("persiste a ordem ao arrastar uma cena no Explorer", () => {
    const project = createRoomInProject(createBlankProjectData({ name: "Ordem das cenas" }), {
      anchorRoomID: "room-1",
      height: 20,
      id: "room-second",
      name: "segunda_cena",
      sceneType: "topdown",
      width: 30
    });
    const handlers = roomsWorkspaceHandlers();
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    const explorer = screen.getByRole("complementary", { name: "Navegador do projeto" });
    const firstScene = within(explorer).getByText("cena_1").closest("summary");
    const secondScene = within(explorer).getByText("segunda_cena").closest("summary");
    if (!firstScene || !secondScene) throw new Error("Cenas não encontradas no Explorer");
    const dataTransfer = { dropEffect: "none", effectAllowed: "none", setData: vi.fn() };
    fireEvent.dragStart(secondScene, { dataTransfer });
    fireEvent.dragOver(firstScene, { dataTransfer, preventDefault: vi.fn() });
    fireEvent.drop(firstScene, { dataTransfer, preventDefault: vi.fn() });

    expect(handlers.onUpdateSceneOrganization).toHaveBeenCalledWith(expect.objectContaining({
      order: ["room-second", "room-1"]
    }));
  });

  it("mantém os estados de evento da cena exclusivamente na aba Eventos", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Eventos da cena" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.name = "arena";
    room.sceneType = "battleRpg";
    room.runtime = { type: "battleRpg", config: {} };

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(screen.queryByRole("group", { name: "Fluxo da cena" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conexões da cena ativa" })).not.toBeInTheDocument();

    await focusActiveScene(user);

    expect(screen.queryByRole("region", { name: "Eventos da cena" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Perfil" })).not.toBeInTheDocument();
    expect(screen.queryByText("Colisoes")).not.toBeInTheDocument();
    expect(screen.queryByText("Música")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Eventos" }));
    const sceneEvents = screen.getByLabelText("Eventos da cena arena");
    expect(within(sceneEvents).getByRole("combobox", { name: "Estado do evento" })).toBeInTheDocument();
    expect(sceneEvents).toHaveTextContent("Ao iniciar");
    expect(sceneEvents).not.toHaveTextContent("Ao acertar Player");
    expect(sceneEvents).toHaveTextContent("Ao vencer");
    expect(sceneEvents).toHaveTextContent("Ao perder");
    expect(sceneEvents).toHaveTextContent("Ao fugir");
    await user.selectOptions(screen.getByRole("combobox", { name: "Estado do evento" }), "onVictory");
    expect(screen.queryByRole("tab", { name: "Grupo 1" })).not.toBeInTheDocument();
  });

  it("mantém o card como visão geral e abre a edição por teclado", async () => {
    const project = createBlankProjectData({ name: "Navegação do editor" });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    const card = screen.getByLabelText("Card da cena cena_1 · visão geral somente leitura");
    expect(card).toHaveAttribute("data-scene-map-mode", "overview");
    fireEvent.keyDown(card, { key: "Enter" });

    expect(screen.getByRole("region", { name: "Editor da cena cena_1" })).toBeInTheDocument();
    expect(container.querySelector(".room-editor-tool-rail[data-editor-mode='scene-editor']")).not.toBeNull();
    expect(container.querySelector(".rooms-editor-mode-context")).toBeNull();
  });

  it("abre a edição ao dar duplo clique no card de visão geral", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Duplo clique no editor" });

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.dblClick(screen.getByLabelText("Card da cena cena_1 · visão geral somente leitura"));

    expect(screen.getByRole("region", { name: "Editor da cena cena_1" })).toBeInTheDocument();
  });

  it("reproduz a transformacao Affine OBJ opt-in no ator sem alterar o hitbox", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Preview Affine OBJ" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.runtime = {
      type: "topdown",
      config: {
        capabilities: [{
          id: "affine_obj",
          enabled: true,
          settings: {
            doubleSize: true,
            matrixIndex: 3,
            scaleX: 1.5,
            scaleY: 0.75,
            rotationDegrees: 45
          }
        }]
      }
    };

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);

    const actor = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-entity.actor.has-affine-obj");
    expect(actor).not.toBeNull();
    expect(actor).toHaveAttribute("data-affine-obj", "true");
    expect(actor).toHaveAttribute("data-affine-obj-double-size", "true");
    expect(actor).toHaveAttribute("data-affine-obj-matrix", "3");
    expect(actor?.style.transform).toBe("rotate(45deg) scale(1.5, 0.75)");
    expect(actor?.style.transformOrigin).toBe("center center");
    expect(actor?.style.overflow).toBe("visible");
    expect(container.querySelector(".room-focused-scene-editor-frame .room-stage-entity-hitbox")).not.toHaveClass("has-affine-obj");
    expect(container.querySelector(".scene-inspector-advanced")).toBeNull();
    expect(container.querySelector(".scene-feature-modules-advanced")).toBeNull();
  });

  it("não exibe metadados de campanha no Perfil de nenhuma cena", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Perfil sem campanha" });
    const baseScene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    project.scenas = [{
      ...baseScene,
      id: "room-port",
      name: "porto_lumen",
      displayName: "Jogo · Porto de Lúmen",
      campaign: {
        chapter: 2,
        title: "Capítulo 1 · Porto de Lúmen",
        objective: "Encontrar a estrutura da aeronave.",
        nextScene: "route",
        completionVariable: "farolParts.frame",
        controls: "Direcional move.",
        success: "Rota aberta.",
        failureRecovery: "Tente novamente."
      }
    }, {
      ...baseScene,
      id: "room-route",
      name: "route",
      displayName: "Capítulo 1 · Rota dos Faróis"
    }];

    const handlers = roomsWorkspaceHandlers();
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusScene(user, "porto_lumen");

    expect(screen.queryByRole("region", { name: "Resumo da campanha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar continuidade da campanha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar metadados de campanha" })).not.toBeInTheDocument();
  });

  it("executa qualquer cena diretamente também fora do modo de desenvolvimento", async () => {
    const user = userEvent.setup();
    const withSecondRoom = createRoomInProject(createBlankProjectData({ name: "Teste por cena" }), {
      anchorRoomID: "room-1",
      height: 18,
      id: "room-wide",
      name: "wide_stage",
      sceneType: "platformer",
      width: 161
    });
    const settings = withSecondRoom.settings as Record<string, Record<string, unknown>>;
    settings.debug.developerMode = true;
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(withSecondRoom)}
        projectData={withSecondRoom}
        {...handlers}
      />
    );

    const runButton = screen.getByRole("button", { name: "Executar somente a cena wide_stage" });
    await user.click(runButton);
    expect(handlers.onRunRoom).toHaveBeenCalledWith("room-wide", "wide_stage");

    cleanup();
    settings.debug.developerMode = false;
    const nonDeveloperHandlers = roomsWorkspaceHandlers();
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(withSecondRoom)}
        projectData={withSecondRoom}
        {...nonDeveloperHandlers}
      />
    );
    const nonDeveloperRunButton = screen.getByRole("button", { name: "Executar somente a cena wide_stage" });
    await user.click(nonDeveloperRunButton);
    expect(nonDeveloperHandlers.onRunRoom).toHaveBeenCalledWith("room-wide", "wide_stage");
  });

  it("abre uma cena 30x20 no viewport GBA sem minimapa", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Foco de cena" }), {
      anchorRoomID: "room-1",
      height: 20,
      id: "room-2",
      name: "forest",
      sceneType: "topdown",
      width: 30
    });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar cena forest" }));

    expect(screen.getByRole("button", { name: "Voltar à visão geral" })).toBeInTheDocument();
    expect(container.querySelector(".rooms-editor-mode-context")).toBeNull();
    const viewport = screen.getByRole("region", { name: "Viewport GBA da cena forest" });
    expect(viewport).toHaveAttribute("data-logical-height", "160");
    expect(viewport).toHaveAttribute("data-logical-width", "240");
    expect(screen.queryByRole("complementary", { name: "Minimapa da cena forest" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Editor focado da cena forest" })).toBeInTheDocument();
    expect(container.querySelectorAll(".room-stage-card-frame")).toHaveLength(0);
    expect(container.querySelector(".room-focused-scene-editor-frame .room-stage-card.is-focused-scene-editor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Voltar à visão geral" }));
    expect(container.querySelectorAll(".room-stage-card-frame")).toHaveLength(2);
  });

  it("mantém as ações da cena fora do viewport focado", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Ações fora do canvas" }), {
      anchorRoomID: "room-1",
      height: 20,
      id: "room-2",
      name: "forest",
      sceneType: "topdown",
      width: 30
    });
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);

    const viewport = screen.getByRole("region", { name: /Viewport GBA da cena/ });
    const sceneActions = screen.getByRole("group", { name: /Ações da cena/ });
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas");
    expect(sceneActions).not.toHaveTextContent("Conectar próxima");
    const runSceneButton = within(sceneActions).getByRole("button", { name: "Testar cena cena_1" });
    expect(runSceneButton).toBeInTheDocument();
    await user.click(runSceneButton);
    expect(handlers.onRunRoom).toHaveBeenCalledWith("room-1", "cena_1");
    expect(sceneActions).not.toHaveTextContent("Grades");
    expect(sceneActions).not.toHaveTextContent("Definir início");
    expect(viewport).not.toContainElement(sceneActions);
    expect(sceneActions.closest(".rooms-editor-secondary-toolbar")).not.toBeNull();
    expect(container.querySelector(".room-focused-scene-editor-frame .room-stage-card-actions")).toBeNull();
    expect(canvas).toHaveClass("is-grid-visible");

    const gridVisibilityToggle = screen.getByRole("button", { name: "Ocultar camada Grade" });
    expect(gridVisibilityToggle).toBeInTheDocument();
    expect(gridVisibilityToggle).not.toHaveTextContent("Grade");
    expect(gridVisibilityToggle.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Bloquear camada Grade" })).not.toHaveTextContent("Grade");
  });

  it("mostra a HUD resolvida no viewport focado e permite ocultar a camada", async () => {
    const user = userEvent.setup();
    const projectWithHud = createAdvancedHudPresetInProject(
      createBlankProjectData({ name: "HUD no editor" }),
      DEFAULT_HUD_PRESET.id,
      "hud-dungeon",
      "HUD Dungeon"
    );
    const room = (projectWithHud.scenas as Array<Record<string, unknown>>)[0]!;
    room.hudPresetId = "hud-dungeon";

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(projectWithHud)}
        projectData={projectWithHud}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);

    const hudOverlay = screen.getByRole("img", { name: "Preview da HUD HUD Dungeon · origem Sala" });
    expect(hudOverlay).toHaveClass("without-guides");
    expect(screen.queryByRole("separator", { name: /largura/i })).not.toBeInTheDocument();
    expect(hudOverlay).toHaveAttribute("data-hud-preset-id", "hud-dungeon");
    expect(hudOverlay).toHaveAttribute("data-hud-binding-source", "room");
    expect(hudOverlay).toHaveAttribute("data-hud-binding-status", "resolved");
    expect(hudOverlay).toHaveTextContent("Origem: Sala");
    expect(hudOverlay).toHaveStyle({ height: "160px", width: "240px" });
    expect(hudOverlay.querySelector('canvas[data-hud-preview-renderer="native-contract"]')).toHaveClass("room-hud-overlay-rendered");
    expect(hudOverlay.querySelector('[data-hud-component-id="hud-frame"]')).not.toBeNull();
    expect(hudOverlay.querySelector('[data-hud-component-id="hud-status"]')).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Ocultar camada HUD" }));
    expect(screen.queryByRole("img", { name: "Preview da HUD HUD Dungeon · origem Sala" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mostrar camada HUD" }));
    expect(screen.getByRole("img", { name: "Preview da HUD HUD Dungeon · origem Sala" })).toBeInTheDocument();
  });

  it("materializa a HUD de imagem da cena de luta no viewport sem preset", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "HUD de luta" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "luta";
    room.runtime = { type: "luta", config: { hudAssetName: "fight-hud.png" } };
    project.assets = [
      ...(Array.isArray(project.assets) ? project.assets : []),
      { id: "fight-hud", kind: "Background", name: "fight-hud.png", metadata: { source: "Assets/backgrounds/fight-hud.png" } }
    ];

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        projectPath="/tmp/hud-luta.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const hudOverlay = screen.getByRole("img", { name: "Prévia da HUD de luta fight-hud.png" });
    expect(hudOverlay).toHaveClass("is-viewport-anchored");
    expect(hudOverlay).toHaveStyle({ height: "160px", width: "240px" });
    expect(hudOverlay.querySelector("img")).toHaveAttribute("src", expect.stringContaining("fight-hud.png"));
    expect(screen.queryByRole("img", { name: /^Preview da HUD .*origem/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ocultar camada HUD" }));
    expect(screen.queryByRole("img", { name: "Prévia da HUD de luta fight-hud.png" })).not.toBeInTheDocument();
  });

  it("mantém a HUD fixa e selecionável em todos os perfis de cena com HUD", async () => {
    const sceneProfiles = [
      "topdown",
      "worldMap",
      "platformer",
      "isometric",
      "dungeonCrawler",
      "shmup",
      "battleRpg",
      "racing"
    ] as const;

    for (const sceneType of sceneProfiles) {
      const user = userEvent.setup();
      const projectWithHud = createAdvancedHudPresetInProject(
        createBlankProjectData({ name: `HUD ${sceneType}` }),
        DEFAULT_HUD_PRESET.id,
        "hud-all-scene-profiles",
        "HUD Todos os perfis"
      );
      const room = (projectWithHud.scenas as Array<Record<string, unknown>>)[0]!;
      room.sceneType = sceneType;
      room.hudPresetId = "hud-all-scene-profiles";
      room.runtime = { type: sceneType, config: {} };

      render(
        <RoomsWorkspace
          presentation={deriveRoomsWorkspacePresentation(projectWithHud)}
          projectData={projectWithHud}
          {...roomsWorkspaceHandlers()}
        />
      );

      await focusActiveScene(user);

      const hudOverlay = screen.getByRole("img", { name: "Preview da HUD HUD Todos os perfis · origem Sala" });
      expect(hudOverlay).toHaveClass("is-viewport-anchored");
      expect(hudOverlay.parentElement).toHaveClass("rooms-canvas-viewport-host");

      await user.click(screen.getByRole("button", { name: "HUD - 240×160" }));
      await user.click(screen.getByRole("button", { name: "Editar Status" }));
      expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("Status");

      cleanup();
    }
  });

  it("valida a HUD em todas as cenas que a declaram no Exemplo GBA", async () => {
    const project = buildProjectFromTemplate("exemplo-gba", { name: "HUDs do Exemplo GBA" });
    const sceneRecords = Array.isArray(project.scenas)
      ? project.scenas.filter((scene): scene is Record<string, unknown> => Boolean(scene && typeof scene === "object"))
      : [];
    const hudScenes = sceneRecords.filter((scene) => {
      const runtime = scene.runtime && typeof scene.runtime === "object" && !Array.isArray(scene.runtime)
        ? scene.runtime as Record<string, unknown>
        : {};
      const config = runtime.config && typeof runtime.config === "object" && !Array.isArray(runtime.config)
        ? runtime.config as Record<string, unknown>
        : {};
      const hasHudPreset = typeof scene.hudPresetId === "string" || typeof config.hudPresetId === "string";
      const hudIsEnabled = runtime.type !== "menu" || config.hudMode !== "none";
      return hasHudPreset && hudIsEnabled;
    });

    expect(hudScenes.map((scene) => scene.name)).toEqual([
      "mapa_rota",
      "mercado_suspenso",
      "usina_submersa",
      "usina_combate",
      "usina_saida",
      "tempestade",
      "guardiao_rele",
      "circuito_final",
      "carregar_jogo",
      "configuracoes",
      "creditos",
      "missoes",
      "inventario",
      "mapa_menu",
      "salvar",
      "menu_start"
    ]);

    for (const scene of hudScenes) {
      const user = userEvent.setup();
      render(
        <RoomsWorkspace
          presentation={deriveRoomsWorkspacePresentation(project)}
          projectData={project}
          {...roomsWorkspaceHandlers()}
        />
      );

      await focusScene(user, String(scene.name));

      const hudOverlay = screen.getByRole("img", { name: /^Preview da HUD / });
      expect(hudOverlay).toHaveClass("is-viewport-anchored");
      expect(hudOverlay.parentElement).toHaveClass("rooms-canvas-viewport-host");
      expect(hudOverlay.querySelector('canvas[data-hud-preview-renderer="native-contract"]')).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "HUD - 240×160" }));
      const editButtons = screen.getAllByRole("button", { name: /^Editar / });
      expect(editButtons.length).toBeGreaterThan(0);
      await user.click(editButtons[0]!);
      expect(screen.getByRole("textbox", { name: "Nome" })).toBeInTheDocument();

      cleanup();
    }
  });

  it("exibe sprites de componentes da HUD no canvas e permite escolher o asset no inspetor", async () => {
    const user = userEvent.setup();
    const project = buildProjectFromTemplate("exemplo-gba", { name: "Sprite de HUD no editor" });
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusScene(user, "mercado_suspenso");
    await user.click(screen.getByRole("button", { name: "HUD - 240×160" }));

    const hudOverlay = screen.getByLabelText(/^Preview da HUD /);
    expect(hudOverlay.querySelector('canvas[data-hud-preview-renderer="native-contract"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar Sinal" }));

    expect(screen.getByRole("combobox", { name: "Sprite do ícone" })).toHaveValue("dialogue-sigil.png");
    expect(screen.getByRole("heading", { name: "Sinal" })).toBeInTheDocument();
  });

  it("separa os guias de composição do controle da HUD e respeita Sem HUD", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Menu sem HUD" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "menu";
    room.runtime = {
      type: "menu",
      config: {
        screenType: "menu",
        role: "save",
        title: "Salvar",
        hudMode: "none",
        items: [{ id: "slot-1", label: "Slot 1", action: "select" }]
      }
    };

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);

    expect(screen.queryByRole("img", { name: "Prévia visual do menu Salvar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar camada Guias da composição" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar camada HUD" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Preview da HUD/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mostrar camada Guias da composição" }));
    expect(screen.getByRole("img", { name: "Prévia visual do menu Salvar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ocultar camada Guias da composição" }));
    expect(screen.queryByRole("img", { name: "Prévia visual do menu Salvar" })).not.toBeInTheDocument();

  });

  it("mostra o estado congelado dos módulos da HUD lateral no Dungeon Crawler", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "HUD lateral Dungeon" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.sceneType = "dungeonCrawler";
    scene.hudPresetId = "hud-usina-lateral";
    scene.runtime = {
      type: "dungeonCrawler",
      config: {
        modules: [
          { id: "map", enabled: true, settings: {} },
          { id: "compass", enabled: true, settings: {} },
          {
            id: "inventory",
            enabled: true,
            settings: { initialQuantity: 2, item: 2, label: "CÉLULA" }
          }
        ]
      }
    };
    const settings = project.settings as Record<string, unknown>;
    settings.hudPresets = [{
      id: "hud-usina-lateral",
      name: "HUD Usina · Lateral",
      description: "HUD lateral",
      backgroundImage: "",
      selectorImage: "",
      font: "",
      position: "Superior",
      width: 240,
      height: 160,
      mode: "advanced",
      components: [
        { id: "hud-usina-lateral-map-row-1", kind: "text", label: "Mapa 1", text: "", asset: "", x: 184, y: 8, width: 48, height: 8, zIndex: 1, visible: true },
        { id: "hud-usina-lateral-hp", kind: "text", label: "Vida", text: "", asset: "", x: 184, y: 56, width: 48, height: 8, zIndex: 1, visible: true },
        { id: "hud-usina-lateral-item", kind: "text", label: "Item", text: "", asset: "", x: 184, y: 64, width: 48, height: 8, zIndex: 1, visible: true },
        { id: "hud-usina-lateral-count", kind: "text", label: "Quantidade", text: "", asset: "", x: 184, y: 72, width: 48, height: 8, zIndex: 1, visible: true }
      ]
    }];

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);

    const hudOverlay = screen.getByRole("img", { name: "Preview da HUD HUD Usina · Lateral · origem Sala" });
    expect(hudOverlay).toHaveAttribute("data-hud-preview-state", "frozen");
    expect(hudOverlay.querySelector('[data-hud-component-id="hud-usina-lateral-map-row-1"]')).toHaveTextContent("??????");
    expect(hudOverlay.querySelector('[data-hud-component-id="hud-usina-lateral-hp"]')).toHaveTextContent("HP 03");
    expect(hudOverlay.querySelector('[data-hud-component-id="hud-usina-lateral-item"]')).toHaveTextContent("CÉLULA");
    expect(hudOverlay.querySelector('[data-hud-component-id="hud-usina-lateral-count"]')).toHaveTextContent("QTD 02");
  });

  it("mostra no viewport o HUD declarado pela tela de menu", async () => {
    const user = userEvent.setup();
    const projectWithHud = setActiveHudPresetInProject(
      createAdvancedHudPresetInProject(
        createBlankProjectData({ name: "HUD de menu" }),
        DEFAULT_HUD_PRESET.id,
        "hud-menu",
        "HUD Menu"
      ),
      DEFAULT_HUD_PRESET.id
    );
    const room = (projectWithHud.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "menu";
    room.hudPresetId = DEFAULT_HUD_PRESET.id;
    room.runtime = {
      type: "menu",
      config: {
        screenType: "menu",
        role: "settings",
        title: "Configurações",
        hudPresetId: "hud-menu",
        items: []
      }
    };
    const project = setActiveRoomInProject(projectWithHud, String(room.id));

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);

    const hudOverlay = screen.getByRole("img", { name: "Preview da HUD HUD Menu · origem Tela/menu" });
    expect(hudOverlay).toHaveAttribute("data-hud-preset-id", "hud-menu");
    expect(hudOverlay).toHaveAttribute("data-hud-binding-source", "scene");
    expect(hudOverlay).toHaveTextContent("Origem: Tela/menu");
  });

  it("mostra no Inspector quando o preset autoral da sala não existe no catálogo", () => {
    const project = createBlankProjectData({ name: "HUD órfã" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.hudPresetId = "hud-removida";

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
      {...roomsWorkspaceHandlers()}
    />
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar HUD" }));
    expect(screen.queryByRole("tab", { name: "HUDs" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Preset de HUD desta cena" })).toHaveValue("hud-removida");
    expect(screen.getByRole("alert")).toHaveTextContent("hud-removida");
  });

  it("abre a ferramenta HUD pelo resumo da cena e aplica vínculos explícitos", async () => {
    const user = userEvent.setup();
    const project = createAdvancedHudPresetInProject(
      createBlankProjectData({ name: "Seleção de HUD por cena" }),
      DEFAULT_HUD_PRESET.id,
      "hud-exploracao",
      "HUD Exploração"
    );
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    const onBindHud = vi.fn();
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
        onBindHud={onBindHud}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar HUD" }));

    expect(screen.getByRole("tabpanel", { name: "HUD" })).toHaveTextContent("HUD da cena");
    const hudSelect = screen.getByLabelText("Preset de HUD desta cena");
    expect(hudSelect).toHaveValue("");
    expect(screen.getByRole("option", { name: "Sem HUD" })).toBeInTheDocument();

    await user.selectOptions(hudSelect, "hud-exploracao");
    expect(onBindHud).toHaveBeenCalledWith(room.id, "hud-exploracao", undefined);

    await user.selectOptions(hudSelect, "");
    expect(onBindHud).toHaveBeenCalledWith(room.id, null, undefined);
  });

  it("mantém a autoria da HUD no Editor focado e seleciona componentes no viewport", async () => {
    const user = userEvent.setup();
    const project = createAdvancedHudPresetInProject(
      createBlankProjectData({ name: "HUD contextual" }),
      DEFAULT_HUD_PRESET.id,
      "hud-contextual",
      "HUD Contextual"
    );
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.hudPresetId = "hud-contextual";
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    expect(screen.queryByRole("button", { name: "HUD - 240×160" })).not.toBeInTheDocument();
    await focusActiveScene(user);
    await user.click(screen.getByRole("button", { name: "HUD - 240×160" }));

    expect(screen.getByRole("button", { name: "HUD - 240×160" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "HUD da cena" })).toBeInTheDocument();
    expect(screen.getByText("HUD aplicada")).toBeInTheDocument();
    expect(screen.queryByText("HUD efetiva")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personalizar nesta cena" })).toBeInTheDocument();
    expect(screen.getByLabelText("Preview da HUD HUD Contextual · origem Sala")).toHaveAttribute("role", "group");
    const statusComponent = screen.getByRole("button", { name: "Editar Status" });
    expect(statusComponent).toHaveAttribute("aria-pressed", "false");

    statusComponent.focus();
    await user.keyboard("{Enter}");
    expect(statusComponent).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("HP 03")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "X" }), { target: { value: "16" } });
    expect(handlers.onUpdateHudPreset).toHaveBeenCalledWith("hud-contextual", expect.objectContaining({
      components: expect.arrayContaining([expect.objectContaining({ id: "hud-status", x: 16 })])
    }));
  });

  it("mantém o canvas e a HUD na mesma cena ao navegar pelo explorador", async () => {
    const user = userEvent.setup();
    const project = createAdvancedHudPresetInProject(createBlankProjectData({ name: "Troca contextual" }), DEFAULT_HUD_PRESET.id, "hud-second", "Segunda HUD");
    const first = (project.scenas as Array<Record<string, unknown>>)[0]!;
    project.scenas = [first, { ...first, id: "second", name: "second", hudPresetId: "hud-second" }];
    render(<RoomsWorkspace projectData={project} presentation={deriveRoomsWorkspacePresentation(project)} {...roomsWorkspaceHandlers()} />);
    await focusActiveScene(user);
    await user.click(screen.getByRole("button", { name: "HUD - 240×160" }));
    fireEvent.click(screen.getByLabelText(/^second\. topdown/));
    expect(screen.getByLabelText("Viewport GBA da cena second")).toBeInTheDocument();
    expect(screen.getByLabelText("Preset de HUD desta cena")).toHaveValue("hud-second");
  });

  it("mostra e edita somente os dialogos usados pela cena selecionada", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Diálogos contextuais" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.name = "harbor";
    scene.eventBindings = { onInit: "harbor_init" };
    project.dialogues = [
      { actorId: "actor-guide", key: "harbor_intro", character: "Guia", text: "Entrada.", choices: [] },
      { key: "other_scene", character: "Outro", text: "Não deve aparecer.", choices: [] }
    ];
    project.actors = [{ id: "actor-guide", name: "Guia", roomName: "harbor", eventBindings: { onInteract: "harbor_init" } }];
    project.events = [
      {
        id: "event-harbor-init",
        name: "harbor_init",
        steps: [{ command: "show_dialogue harbor_intro" }]
      },
      {
        id: "event-other",
        name: "other_init",
        steps: [{ command: "show_dialogue other_scene" }]
      }
    ];
    const onUpdateDialogue = vi.fn();
    const onUpdateDialoguesUi = vi.fn();
    const handlers = roomsWorkspaceHandlers({ onUpdateDialogue });

    render(
      <StudioI18nProvider><RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
        onUpdateDialoguesUi={onUpdateDialoguesUi}
      /></StudioI18nProvider>
    );

    await focusActiveScene(user);
    await user.click(screen.getByRole("tab", { name: "Diálogos" }));

    expect(screen.getByRole("button", { name: "Selecionar diálogo harbor_intro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Selecionar diálogo other_scene" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Texto do diálogo" })).toHaveValue("Entrada.");

    fireEvent.change(screen.getByRole("textbox", { name: "Texto do diálogo" }), { target: { value: "Entrada atualizada." } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("harbor_intro", { text: "Entrada atualizada." });

    fireEvent.change(screen.getByRole("combobox", { name: "Ator da cena do diálogo" }), { target: { value: "" } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("harbor_intro", { actorId: "" });
    onUpdateDialogue.mockClear();
    await user.click(screen.getByRole("tab", { name: "Aparência" }));
    expect(screen.getByText("Aparência dos diálogos · Projeto")).toBeInTheDocument();
    expect(screen.getByLabelText("Prévia da aparência do diálogo")).toHaveTextContent("harbor_intro");
    fireEvent.change(screen.getByRole("combobox", { name: "Posição" }), { target: { value: "Superior" } });
    expect(onUpdateDialoguesUi).toHaveBeenCalledWith({ boxPosition: "Superior" });
    expect(onUpdateDialogue).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Fala" }));
    expect(screen.getByLabelText("Prévia da aparência do diálogo")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Cena" }));
    expect(screen.queryByLabelText("Prévia da aparência do diálogo")).not.toBeInTheDocument();
  });

  it("materializa a fala do ator ou Player somente na aba Diálogos e limpa a seleção anterior", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Prévia contextual" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.playerActorName = "Player";
    project.actors = [
      { id: "player", name: "Player", roomName: scene.name, x: 2, y: 2, eventBindings: { onInit: "player_intro" } },
      { id: "guide", name: "Guia", roomName: scene.name, x: 8, y: 2, eventBindings: { onInteract: "guide_intro" } },
      { id: "silent", name: "Silencioso", roomName: scene.name, x: 12, y: 2 }
    ];
    project.events = [
      { name: "player_intro", steps: [{ command: "call_event player_speech" }] },
      { name: "player_speech", steps: [{ command: "show_dialogue player_line" }] },
      { name: "guide_intro", steps: [{ command: "show_dialogue guide_line" }] }
    ];
    project.dialogues = [
      { key: "player_line", character: "Herói", text: "Primeira\nSegunda\nTerceira\nQuarta", choices: [] },
      { key: "guide_line", character: "Guia", text: "Olá", portraitSlot: "right", choices: [] }
    ];
    const onUpdateDialogue = vi.fn();
    const handlers = roomsWorkspaceHandlers({ onUpdateDialogue });
    render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);
    await focusActiveScene(user);
    await user.click(screen.getByRole("button", { name: "Player Player" }));
    expect(screen.queryByLabelText("Prévia da aparência do diálogo")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Diálogos" }));
    expect(screen.getByLabelText("Prévia da aparência do diálogo")).toHaveTextContent("player_line");
    expect(screen.getByRole("textbox", { name: "Texto do diálogo" })).toHaveValue("Primeira\nSegunda\nTerceira\nQuarta");
    expect(screen.queryByRole("button", { name: "Selecionar diálogo guide_line" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Eventos" }));
    expect(screen.queryByLabelText("Prévia da aparência do diálogo")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ator Guia" }));
    await user.click(screen.getByRole("tab", { name: "Diálogos" }));
    expect(screen.getByLabelText("Prévia da aparência do diálogo")).toHaveTextContent("guide_line");
    fireEvent.change(screen.getByRole("combobox", { name: "Posição do retrato" }), { target: { value: "left" } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("guide_line", { portraitSlot: "left" });
    await user.click(screen.getByRole("button", { name: "Ator Silencioso" }));
    expect(screen.queryByLabelText("Prévia da aparência do diálogo")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Texto do diálogo" })).not.toBeInTheDocument();
  });

  it("mantém cenas menores que a tela sem esticar o conteúdo na prévia nativa", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Cena pequena" }), {
      anchorRoomID: "room-1", id: "small", name: "small", sceneType: "topdown", width: 16, height: 12
    });
    // New scenes enforce the GBA minimum; imported older scenes can be smaller.
    const importedRoom = (project.scenas as Array<Record<string, unknown>>).find(room => room.id === "small")!;
    Object.assign(importedRoom, { width: 16, height: 12, tilemap: Array(16 * 12).fill(0) });
    const { container } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...roomsWorkspaceHandlers()} />);
    await user.click(screen.getByRole("button", { name: "Editar cena small" }));
    const native = container.querySelector(".room-focus-native-preview")!;
    expect(native.querySelector(".room-stage-card")).toHaveStyle({ width: "128px", height: "96px" });
    expect(native).toHaveAttribute("data-logical-width", "240");
    expect(native).toHaveAttribute("data-logical-height", "160");
  });

  it("alterna tela e mapa sem alterar a cena, a seleção ou o recorte da prévia nativa", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Modos de visualização" }), {
      anchorRoomID: "room-1", id: "room-wide", name: "wide", sceneType: "topdown", width: 60, height: 40
    });
    project.actors = [{ id: "guide", name: "Guia", roomName: "wide", x: 8, y: 7 }];
    const original = JSON.stringify(project);
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);
    await user.click(screen.getByRole("button", { name: "Editar cena wide" }));
    await user.click(screen.getByRole("button", { name: "Ator Guia" }));
    const viewport = screen.getByRole("region", { name: "Viewport GBA da cena wide" });
    const canvas = container.querySelector<HTMLElement>(".rooms-canvas-world-scroll")!;
    canvas.scrollLeft = 48; canvas.scrollTop = 32;
    fireEvent.scroll(canvas);
    const native = container.querySelector(".room-focus-native-preview")!;
    expect(native).toHaveAttribute("data-camera-x", "48");
    expect(native).toHaveAttribute("data-camera-y", "32");
    expect(native).toHaveAttribute("inert");
    expect(native).toHaveAttribute("data-logical-width", "240");
    await user.click(screen.getByRole("button", { name: "Mapa" }));
    expect(viewport).toHaveAttribute("data-view-mode", "map");
    expect(screen.getByLabelText("Recorte da tela GBA no mapa")).toBeInTheDocument();
    expect(container.querySelector(".room-focused-scene-editor-frame .room-stage-entity.selected")).toBeInTheDocument();
    canvas.scrollLeft = 96; fireEvent.scroll(canvas);
    expect(native).toHaveAttribute("data-camera-x", "48");
    await user.click(screen.getByRole("button", { name: "Tela ampliada" }));
    expect(viewport).toHaveAttribute("data-view-mode", "viewport");
    expect(canvas.scrollLeft).toBe(48);
    expect(canvas.scrollTop).toBe(32);
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -100, clientX: 100, clientY: 100 });
    expect(viewport).toHaveAttribute("data-view-mode", "viewport");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Prévia GBA" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Minimapa" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Minimapa" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Prévia GBA" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Recolher painel de prévia" }));
    expect(container.querySelector(".room-focus-native-preview")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expandir painel de prévia" }));
    expect(container.querySelector(".room-focus-native-preview")).toHaveAttribute("data-camera-x", "48");
    expect(JSON.stringify(project)).toBe(original);
    expect(handlers.onUpdateRoomFields).not.toHaveBeenCalled();
    expect(handlers.onUpdateRoomEntity).not.toHaveBeenCalled();
  });

  it("oferece minimapa quando a cena ultrapassa o viewport GBA", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Foco de cena grande" }), {
      anchorRoomID: "room-1",
      height: 40,
      id: "room-2",
      name: "continent",
      sceneType: "topdown",
      width: 60
    });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar cena continent" }));

    expect(screen.getByRole("region", { name: "Viewport GBA da cena continent" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Minimapa" }));
    const minimap = screen.getByRole("complementary", { name: "Minimapa da cena continent" });
    expect(minimap).toBeInTheDocument();
    expect(container.querySelector(".rooms-canvas-stage.has-focus-minimap")).toBeInTheDocument();
    expect(minimap.parentElement).toBe(container.querySelector(".room-focus-minimap-dock"));
    expect(minimap.closest(".room-scene-navigation")).toBeNull();
    expect(minimap.closest(".rooms-canvas-viewport-host")).toBeInTheDocument();
    expect(minimap.querySelector(".room-focus-minimap-preview .room-stage-card-header")).toBeNull();
    expect(minimap).toHaveTextContent("Minimapa");
    expect(container.querySelector(".rooms-canvas-world.is-focused-scene")).toHaveStyle({
      height: "320px",
      width: "480px"
    });
  });

  it("permite ocultar e revelar o minimapa pelo grupo de visibilidade", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Visibilidade do minimapa" }), {
      anchorRoomID: "room-1",
      height: 40,
      id: "room-2",
      name: "continent",
      sceneType: "topdown",
      width: 60
    });
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar cena continent" }));

    await user.click(screen.getByRole("tab", { name: "Minimapa" }));
    const minimapToggle = screen.getByRole("button", { name: "Ocultar painel de prévia" });
    expect(minimapToggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("complementary", { name: "Minimapa da cena continent" })).toBeInTheDocument();

    await user.click(minimapToggle);

    expect(screen.queryByRole("complementary", { name: "Minimapa da cena continent" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar painel de prévia" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Mostrar painel de prévia" }));

    expect(screen.getByRole("tab", { name: "Prévia GBA" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Minimapa" }));
    expect(screen.getByRole("complementary", { name: "Minimapa da cena continent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar painel de prévia" })).toHaveAttribute("aria-pressed", "true");
  });

  it("prioriza a câmera 240x160 e o minimapa de jogo para a corrida pseudo-3D em foco", async () => {
    const user = userEvent.setup();
    const project = setActiveRoomInProject(createRoomInProject(createBlankProjectData({ name: "Foco P3D" }), {
      anchorRoomID: "room-1", height: 40, id: "room-racing", name: "circuit", sceneType: "racing", width: 60
    }), "room-racing");
    const racingRoom = (project.scenas as Array<Record<string, unknown>>).find((scene) => scene.id === "room-racing");
    racingRoom!.runtime = {
      type: "racing",
      config: {
        presentation: "pseudo3d",
        showMinimap: true,
        pseudo3dVisuals: {
          horizonY: 48,
          panoramaBackgroundId: "sky.png",
          floorTilemapId: "floor.png",
          minimapAssetId: "minimap.png"
        }
      }
    };

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar cena circuit" }));

    expect(screen.getByRole("region", { name: "Câmera pseudo-3D da cena circuit" })).toHaveAttribute("data-logical-height", "160");
    expect(screen.getByRole("region", { name: "Câmera pseudo-3D da cena circuit" })).toHaveAttribute("data-logical-width", "240");
    expect(within(container.querySelector(".rooms-canvas-world-scroll") as HTMLElement).getByLabelText("Minimapa de corrida da cena circuit")).toBeInTheDocument();
    expect(container.querySelector(".room-focused-scene-editor-frame .racing-pseudo3d-camera-preview")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Minimapa da cena circuit" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir mapa técnico da cena circuit" }));

    expect(container.querySelector(".room-focused-scene-editor-frame [role=grid]")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Câmera pseudo-3D da cena circuit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar à prévia GBA da cena circuit" })).toBeInTheDocument();
  });

  it("impede que o pointerdown do foco escape para a navegacao do canvas", () => {
    const project = createBlankProjectData({ name: "Interacao do foco" });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const activeRoom = presentation.rooms.find((room) => room.isActive) ?? presentation.rooms[0];
    const escapedPointerDown = vi.fn();
    render(
      <div onPointerDown={escapedPointerDown}>
        <RoomsWorkspace
          presentation={presentation}
          projectData={project}
          {...roomsWorkspaceHandlers()}
        />
      </div>
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: `Editar cena ${activeRoom?.name}` }), {
      button: 0,
      pointerId: 1
    });

    expect(escapedPointerDown).not.toHaveBeenCalled();
  });

  it("mostra a biblioteca real de prefabs e permite sincronizar instancias", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Prefab library" });
    project.actorPrefabs = [{ id: "npc-base", name: "NPC Base" }];
    project.triggerPrefabs = [{ id: "door-base", name: "Porta Base" }];
    const handlers = roomsWorkspaceHandlers();
    render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);

    await user.click(screen.getByRole("tab", { name: "Pré-fabricados" }));
    expect(screen.getByText("NPC Base")).toBeInTheDocument();
    expect(screen.getByText("Porta Base")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aplicar pre-fabricados as instancias" }));
    expect(handlers.onSynchronizePrefabs).toHaveBeenCalledOnce();
  });

  it("cria, edita e instancia prefabs pela biblioteca", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Prefab authoring" });
    project.actorPrefabs = [{ id: "npc-base", name: "NPC Base", spriteSheet: "npc.png", animationName: "idle", collisionEnabled: true }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);

    await user.click(screen.getByRole("tab", { name: "Pré-fabricados" }));
    const playerRow = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Player"));
    expect(playerRow).not.toBeNull();
    await user.click(playerRow!);
    await user.click(screen.getByRole("button", { name: "Criar pre-fabricado do selecionado" }));
    expect(handlers.onCreatePrefabFromEntity).toHaveBeenCalledWith("actor", "actor-player");

    await user.click(screen.getByText("NPC Base"));
    fireEvent.change(screen.getByLabelText("Animacao do prefab NPC Base"), { target: { value: "walk" } });
    expect(handlers.onUpdatePrefab).toHaveBeenLastCalledWith("actor", "npc-base", { animationName: "walk" });
    await user.click(screen.getByRole("button", { name: "Instanciar NPC Base" }));
    expect(handlers.onInstantiatePrefab).toHaveBeenCalledWith("actor", "npc-base", expect.objectContaining({ roomID: "room-1" }));
  });

  it("oferece pincel de altura 0–3 somente para cenas isometricas", async () => {
    const user = userEvent.setup();
    const withRoom = createRoomInProject(createBlankProjectData({ name: "Altura isometrica" }), {
      anchorRoomID: "room-1",
      height: 4,
      id: "room-iso-height",
      name: "patio",
      sceneType: "isometric",
      width: 4
    });
    const project = setActiveRoomInProject(withRoom, "room-iso-height");
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />
    );

    await focusScene(user, "patio");
    const heightButton = container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Altura - Niveis 0 a 3']");
    expect(heightButton).not.toBeNull();
    await user.click(heightButton!);
    expect(screen.getByRole("region", { name: "Pincel de altura" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Altura" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Colisão" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nivel 2" }));
    const cell = container.querySelector<HTMLButtonElement>(".rooms-canvas-stage .room-stage-cell");
    expect(cell).not.toBeNull();
    fireEvent.pointerDown(cell!, { button: 0, pointerId: 7 });

    expect(handlers.onSetHeightLevel).toHaveBeenCalledWith("room-iso-height", 0, 2, expect.any(String));
  });

  it("mantém o diagnóstico geométrico fora do inspector de autoria", () => {
    const project = createBlankProjectData({ name: "Diagnóstico geométrico" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.width = 4;
    scene.height = 3;
    scene.backgroundAssetName = "background.png";
    scene.gbStudioUseBackgroundLayout = true;
    scene.collisionTypes = ["solid", ...Array.from({ length: 11 }, () => "free")];
    project.actors = [{ id: "actor-player", name: "Player", roomName: String(scene.name), x: 0, y: 0 }];
    project.triggers = [{ id: "trigger-exit", name: "Saída", roomName: String(scene.name), x: 3, y: 2, width: 2, height: 1 }];

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(screen.queryByRole("region", { name: "Diagnóstico geométrico da cena" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saúde da cena" })).toBeInTheDocument();
  });

  it("mantém a conversão RGB555 do canvas fora do diagnóstico detalhado", () => {
    const project = createBlankProjectData({ name: "Diagnóstico visual" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.backgroundAssetName = "mapa.png";
    project.assets = [
      ...(Array.isArray(project.assets) ? project.assets : []),
      {
        id: "background-mapa",
        kind: "Background",
        name: "mapa.png",
        metadata: {
          assetcStatus: "attention",
          backgroundTileOptimizer: {
            enabled: true,
            maxSourcePixelErrorRatio: 0.13005208333333335,
            tileBudget: 439
          },
          height: 160,
          source: "Assets/backgrounds/mapa.png",
          width: 240
        }
      }
    ];
    project.triggers = [{
      id: "trigger-visual-exit",
      name: "Saída",
      roomName: String(scene.name),
      x: 5,
      y: 4,
      width: 2,
      height: 1
    }];

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(screen.queryByRole("region", { name: "Diagnóstico de fidelidade visual da cena" })).not.toBeInTheDocument();
  });

  it("mantém ferramentas de autoria em menus e preserva apenas restrições específicas", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Menu tools" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "menu";
    room.runtime = { type: "menu", config: { screenType: "title" } };

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusScene(user, String(deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld"));
    const tool = (label: string): HTMLButtonElement | null => (
      container.querySelector(`.room-editor-tool-rail button[aria-label='${label}']`)
    );
    expect(tool("Selecionar - Mover")).not.toBeNull();
    expect(tool("Pintura - Tiles")).not.toBeNull();
    expect(tool("Cena - Camera")).toBeNull();
    expect(tool("Colisao - Solidos")).not.toBeNull();
    expect(tool("Colisao - Solidos")).not.toBeDisabled();
    expect(tool("Ator - OBJ")).not.toBeNull();
    expect(tool("Trigger - Eventos")).not.toBeNull();
    expect(tool("Trigger - Eventos")).not.toBeDisabled();
    expect(tool("Zonas de câmera - Áreas")).toBeNull();
  });

  it("resolve as ferramentas pelo perfil da cena isométrica em foco", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Perfil em foco" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-isometric-focus",
      name: "arena",
      sceneType: "isometric",
      width: 12
    });

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusScene(user, "arena");

    const collisionButton = container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Colisao - Solidos']"
    );
    expect(collisionButton).not.toBeNull();
    expect(collisionButton).not.toBeDisabled();
  });

  it("configura rampas isometricas pelo inspetor de colisao", async () => {
    const user = userEvent.setup();
    const withRoom = createRoomInProject(createBlankProjectData({ name: "Rampas isometricas" }), {
      anchorRoomID: "room-1",
      height: 4,
      id: "room-iso-ramp",
      name: "rampa",
      sceneType: "isometric",
      width: 4
    });
    const project = setActiveRoomInProject(withRoom, "room-iso-ramp");
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />
    );

    await focusScene(user, "rampa");
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Colisao - Solidos']")!);
    const cell = container.querySelector<HTMLButtonElement>(".rooms-canvas-stage .room-stage-cell")!;
    fireEvent.pointerDown(cell, { button: 0, pointerId: 8 });
    await user.click(screen.getByRole("button", { name: "Rampa subindo à direita" }));

    expect(handlers.onSetCollisionType).toHaveBeenLastCalledWith("room-iso-ramp", 0, "slope_up_right");
    expect(screen.getByRole("button", { name: "Rampa subindo à esquerda" })).toBeInTheDocument();
  });

  it("explica a grade física e a diferença entre rampa e escada no perfil plataforma", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Guia colisão plataforma" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "platformer";
    room.runtime = { type: "platformer", config: {} };
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />
    );

    await focusScene(user, String(room.name));
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Colisao - Solidos']")!);

    expect(screen.getByText(/cada célula representa 8×8 px/)).toBeInTheDocument();
    expect(screen.getByText(/rampas mostram a área triangular/)).toBeInTheDocument();
  });

  it("shows hardware budgets and live Play telemetry in the bottom debugger", () => {
    const project = createBlankProjectData({ name: "Debugger de hardware" });
    project.settings = {
      ...(project.settings ?? {}),
      debug: {
        showCpuUsage: true,
        showVramUsage: true,
        showOamUsage: false,
        showPaletteUsage: false,
        showRomUsage: true,
        showRamUsage: false
      }
    };
    const profiler = deriveHardwareProfilerPresentation(project, {
      telemetry: {
        cpuPercent: 41.2,
        emulationMs: 6.87,
        fps: 59.9,
        frameMs: 16.69,
        presentationFps: 59.9,
        emulationFps: 59.73,
        droppedFrames: 1,
        droppedFrameRatio: 0.0164,
        romBytes: 78_848,
        runtimeState: {
          schema: 2,
          frame: 120,
          currentRoom: 0,
          runtimeKind: 0,
          variables: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          flagBits: 3,
          player: { x: 80, y: 64, direction: 1 },
          actorCount: 1,
          firstActor: { x: 112, y: 64, direction: 2, visible: true },
          lastMusic: 0,
          lastSfx: 0,
          collision: { currentFlags: 32, currentSlope: 2, seenEffectBits: 224, seenSlopeBits: 20, blockedDirectionBits: 15 },
          triggerEnterCount: 2,
          triggerLeaveCount: 1,
          roomChangeCount: 1,
          timing: {
            cpuWorkTicks: 1200,
            vblankWaitTicks: 240,
            peakCpuWorkTicks: 1600,
            peakVblankWaitTicks: 320,
            missedFrameCount: 1,
            renderSkipCount: 0,
            frameSkipPolicy: 1
          },
          input: { held: 0, pressed: 0, released: 0 }
        }
      }
    });

    render(
      <RoomsWorkspace
        hardwareProfiler={profiler}
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(screen.getByRole("group", { name: "Depurador de hardware" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Métrica CPU" })).toHaveTextContent("41.2%");
    expect(screen.getByRole("article", { name: "Métrica VRAM" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Métrica ROM" })).toHaveTextContent("77.0 KB");
    expect(screen.queryByRole("article", { name: "Métrica OAM" })).not.toBeInTheDocument();
    expect(screen.getByText("59.9 FPS")).toBeInTheDocument();
    expect(screen.getByText("59.7 FPS emulados")).toBeInTheDocument();
    expect(screen.getByText("1.6% descartados")).toBeInTheDocument();
    expect(screen.getByText("6.87 ms de emulação")).toBeInTheDocument();
    const physical = screen.getByRole("region", { name: "Diagnóstico físico da cena" });
    expect(physical).toHaveTextContent("Estimativa do editor · plano do exportador · medição do runtime · limite seguro");
    expect(physical).toHaveTextContent("2/10 medidos");
    expect(within(physical).getByRole("table", { name: "Matriz de recursos físicos" })).toBeInTheDocument();
    expect(within(physical).getByRole("row", { name: /Tiles BG/ })).toHaveTextContent("0 tiles");
    expect(within(physical).getByRole("row", { name: /VBlank/ })).toHaveTextContent("320 ticks");
    expect(within(physical).getByRole("row", { name: /CPU/ })).toHaveTextContent("1600 ticks");
    expect(screen.getByRole("region", { name: "Estado nativo da ROM" })).toHaveTextContent("Sala 1");
    expect(screen.getByRole("region", { name: "Estado nativo da ROM" })).toHaveTextContent("VAR0 3 · FLAGS 0x00000003");
    expect(screen.getByRole("region", { name: "Estado nativo da ROM" })).toHaveTextContent("Player 80, 64 · dir 1");
    expect(screen.getByRole("region", { name: "Estado nativo da ROM" })).toHaveTextContent("Ator 1/1 · 112, 64 · dir 2");
    expect(screen.getByRole("region", { name: "Estado nativo da ROM" })).toHaveTextContent("Colisão 0x20 · rampa 2");
    expect(screen.getByRole("region", { name: "Estado nativo da ROM" })).toHaveTextContent("Efeitos 0xE0 · rampas 0x14 · bloqueios 0xF");
    expect(screen.getByRole("region", { name: "Estado nativo da ROM" })).toHaveTextContent("Triggers 2 enter / 1 leave · 1 troca(s)");
  });

  it("mantém o inspector focado em autoria e encaminha o preflight para a Saúde", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Preflight por perfil" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.sceneType = "luta";
    scene.runtime = { type: "luta", config: {} };
    scene.width = 40;
    scene.height = 20;
    const handlers = roomsWorkspaceHandlers();
    const onOpenProjectHealth = vi.fn();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        onOpenProjectHealth={onOpenProjectHealth}
        {...handlers}
      />
    );

    await focusScene(user, String(scene.name));

    const health = screen.getByRole("region", { name: "Saúde da cena" });
    expect(health).toHaveTextContent("Em revisão");
    const healthInfo = screen.getByRole("button", { name: "Informações sobre Saúde da cena" });
    await user.click(healthInfo);
    expect(healthInfo).toHaveAttribute("aria-expanded", "true");
    expect(health).toHaveTextContent("item(ns) aguardam revisão na Saúde do projeto.");
    expect(screen.queryByRole("region", { name: "Preflight da cena" })).not.toBeInTheDocument();
    expect(screen.queryByText("Estimativa do editor")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir Saúde do projeto" }));
    expect(onOpenProjectHealth).toHaveBeenCalledTimes(1);
  });

  it("shows isometric tile, VRAM, OAM and foreground metrics without debug toggles", () => {
    const withRoom = createRoomInProject(createBlankProjectData({ name: "Métricas isométricas" }), {
      id: "room-isometric-metrics",
      name: "market",
      width: 2,
      height: 2,
      sceneType: "isometric"
    });
    const project = setActiveRoomInProject(withRoom, "room-isometric-metrics");
    const room = (project.scenas as Array<Record<string, unknown>>).find((entry) => entry.id === "room-isometric-metrics")!;
    room.tileLayers = [
      { mapping: "BG2", tilemap: [1, 2, 3, 4] },
      { mapping: "BG1", tilemap: [-1, 7, -1, -1] }
    ];

    render(
      <RoomsWorkspace
        hardwareProfiler={deriveHardwareProfilerPresentation(project)}
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    const metrics = screen.getByRole("region", { name: "Métricas isométricas" });
    expect(metrics).toHaveTextContent("5 tiles atualizados");
    expect(metrics).toHaveTextContent("VRAM");
    expect(metrics).toHaveTextContent("1 / 128 OAM");
    expect(metrics).toHaveTextContent("1 tile BG1");
  });

  it("organiza o inspector da cena em abas contextuais", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Inspector contextual" });

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(screen.getByRole("tablist", { name: /Seções de/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cena" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Tipo de cena")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Essencial da cena" })).not.toHaveTextContent("Fundo");
    expect(screen.queryByRole("region", { name: "Autoria da cena" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Perfil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Avançado da cena" })).not.toBeInTheDocument();
    expect(screen.queryByText("Capacidades da cena")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Fundo" }));
    expect(screen.getByRole("region", { name: "Fundo da cena" })).toHaveTextContent("Modo de renderização");
    expect(screen.queryByRole("region", { name: "Camadas do fundo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Contrato físico do fundo" })).not.toBeInTheDocument();
    const backgroundInfo = screen.getByRole("button", { name: "Informações sobre Fundo da cena" });
    await user.click(backgroundInfo);
    expect(backgroundInfo).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(backgroundInfo.getAttribute("aria-describedby") ?? "")).toHaveTextContent("barra CAMADAS");
    expect(screen.queryByRole("region", { name: /Gerenciador das/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ferramentas visuais do fundo" })).not.toBeInTheDocument();
    expect(screen.getByText("Composição avançada")).toBeInTheDocument();
    expect(screen.getByText("Paralaxe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Informações sobre Paralaxe" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo de cena")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Câmera" }));
    expect(screen.getByRole("region", { name: "Câmera" })).toBeInTheDocument();
  });

  it("mantém um único acesso às propriedades da cena quando um ator está selecionado", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Cena no editor focado" });
    const room = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    project.actors = [{ id: "actor-focused-scene", name: "Ator focado", roomName: room.name, x: 1, y: 1 }];

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const canvas = document.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas");
    if (!canvas) throw new Error("Canvas da cena focada não encontrado");
    const actorCell = canvas.querySelectorAll<HTMLButtonElement>(".room-stage-cell")[1 + room.width];
    if (!actorCell) throw new Error("Célula do ator não encontrada");
    fireEvent.pointerDown(actorCell, { button: 0, buttons: 1, pointerId: 101 });
    fireEvent.pointerUp(actorCell, { button: 0, buttons: 0, pointerId: 101 });

    expect(screen.getByRole("tab", { name: "Objeto" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("X")).toHaveValue(1);
    expect(screen.queryByText("Ator selecionado")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Cena" })).not.toBeInTheDocument();
    const sceneButton = screen.getByRole("button", { name: "Propriedades da cena" });

    await user.click(sceneButton);

    expect(screen.getByLabelText("Tipo de cena")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cena" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Atributos do ator")).not.toBeInTheDocument();
  });

  it("não repete a identidade do gatilho no inspetor contextual", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Trigger identity" });
    const roomName = deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld";
    project.triggers = [{
      id: "trigger-gate",
      name: "Porta",
      roomName,
      x: 2,
      y: 2,
      width: 2,
      height: 1
    }];
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const sceneFolder = container.querySelector<HTMLElement>(".editor-tree-scene-branch.is-selected");
    if (!sceneFolder) throw new Error("Cena ativa não encontrada no Explorer");
    await user.click(within(sceneFolder).getByRole("button", { name: /Porta/ }));

    expect(screen.getByRole("tab", { name: "Objeto" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("X")).toHaveValue(2);
    expect(screen.getByLabelText("W")).toHaveValue(2);
    expect(screen.getByLabelText("H")).toHaveValue(1);
    expect(screen.queryByRole("tab", { name: "Área" })).not.toBeInTheDocument();
    expect(screen.queryByText("Atributos do trigger")).not.toBeInTheDocument();
    expect(screen.queryByText("Trigger selecionado")).not.toBeInTheDocument();
  });

  it("configura a camada Affine sem substituir o mapa e a mostra congelada no Foco", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Affine no editor" });
    const scenes = project.scenas as Array<Record<string, unknown>>;
    const firstScene = scenes[0]!;
    firstScene.runtime = {
      type: "topdown",
      config: {
        affine: {
          assetId: "ondas_affine.png",
          enabled: true,
          layer: "BG2",
          pivotX: 120,
          pivotY: 80,
          role: "decorative",
          rotationDegrees: 12,
          scaleX: 1.25,
          scaleY: 0.75,
          wrap: true
        }
      }
    };
    project.assets = [{
      id: "asset-affine",
      kind: "Background",
      metadata: { kind: "affine_bg", source: "Assets/ondas_affine.png" },
      name: "ondas_affine.png"
    }];
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    expect(screen.getByText("Affine · BG2")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Prévia congelada da camada Affine/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Editar cena / }));

    await user.click(screen.getByRole("tab", { name: "Fundo" }));
    expect(screen.getByLabelText("Asset Affine")).toHaveValue("ondas_affine.png");

    const affinePreview = screen.getByRole("img", { name: /Prévia congelada da camada Affine/ });
    expect(affinePreview).toHaveAttribute("data-affine-layer", "BG2");
    expect(affinePreview).toHaveAttribute("data-affine-preview-state", "frozen");
    expect(affinePreview).toHaveAttribute("data-affine-pa", "200");
    expect(screen.getByRole("checkbox", { name: /^Ativar camada Affine/ })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /^Ativar camada Affine/ }));
    expect(handlers.onUpdateRoomFields).toHaveBeenCalledWith("room-1", expect.objectContaining({
      runtime: expect.objectContaining({
        config: expect.objectContaining({
          affine: expect.objectContaining({ enabled: false })
        })
      })
    }));
  });

  it("shows only the selected detail and matching portrait in a standalone menu canvas", async () => {
    const user = userEvent.setup();
    const project = setActiveRoomInProject(createRoomInProject(createBlankProjectData({name:"Menu visibility"}), {
      id:"inventory",name:"inventory",width:30,height:20,sceneType:"menu"
    }),"inventory");
    const room = (project.scenas as Array<Record<string,unknown>>).find(r=>r.id==="inventory")!;
    room.runtime = {type:"menu",config:{screenType:"menu",items:[
      {id:"first",label:"First",action:"select"},{id:"second",label:"Second",action:"select"}
    ]}};
    project.variables = [{id:"gender",name:"gender",initialValue:0}];
    project.actors = [
      {id:"detail-first",name:"Detail first",roomName:"inventory",x:1,y:1,menuActorRole:"option",menuItemID:"first",menuActorSelectedOnly:true},
      {id:"detail-second",name:"Detail second",roomName:"inventory",x:1,y:1,menuActorRole:"option",menuItemID:"second",menuActorSelectedOnly:true},
      {id:"male",name:"Male",roomName:"inventory",x:2,y:2,menuActorRole:"decorative",menuVisibilityVariable:"gender",menuVisibilityValue:0},
      {id:"female",name:"Female",roomName:"inventory",x:2,y:2,menuActorRole:"decorative",menuVisibilityVariable:"gender",menuVisibilityValue:1}
    ];
    render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...roomsWorkspaceHandlers()} />);
    await focusScene(user,"inventory");
    const canvas = screen.getByRole("region", {name:"Editor focado da cena inventory"});
    expect([...canvas.querySelectorAll(".room-stage-entity.actor .room-stage-entity-label")].map(e=>e.textContent)).toEqual(["Detail first","Male"]);
  });

  it("mostra a composição visual de gênero e nome no viewport focado", async () => {
    const user = userEvent.setup();
    const withMenuScenes = createRoomInProject(createBlankProjectData({ name: "Menu de perfil" }), {
      id: "room-gender",
      name: "gender-select",
      width: 30,
      height: 20,
      sceneType: "menu"
    });
    const project = setActiveRoomInProject(withMenuScenes, "room-gender");
    const scenes = project.scenas as Array<Record<string, unknown>>;
    const genderRoom = scenes.find((scene) => scene.id === "room-gender")!;
    genderRoom.runtime = {
      type: "menu",
      config: {
        screenType: "menu",
        role: "gender_select",
        title: "Escolha de gênero",
        items: [
          { id: "male", label: "Masculino", action: "select", clickBox: { x: 32, y: 72, width: 80, height: 18 } },
          { id: "female", label: "Feminino", action: "select", clickBox: { x: 128, y: 72, width: 80, height: 18 } }
        ]
      }
    };
    const handlers = roomsWorkspaceHandlers();

    render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);
    await focusScene(user, "gender-select");
    await user.click(screen.getByRole("button", { name: "Mostrar camada Guias da composição" }));
    const genderPreview = screen.getByRole("img", { name: "Prévia visual da escolha de gênero" });
    expect(genderPreview).toBeInTheDocument();
    expect(genderPreview).toHaveAttribute("data-menu-preview-screen-type", "menu");
    expect(genderPreview).toHaveAttribute("data-menu-preview-role", "gender_select");
    expect(genderPreview).toHaveAttribute("data-menu-preview-selected-item", "male");
    expect(genderPreview).toHaveTextContent("gênero = 0");
    expect(genderPreview).toHaveTextContent("gênero = 1");

    genderRoom.runtime = {
      type: "menu",
      config: {
        screenType: "menu",
        role: "name_input",
        title: "Nome do jogador",
        textInput: {
          variableName: "player.name",
          maxLength: 8,
          x: 12,
          y: 6,
          width: 8,
          keyboard: { layout: "grid", x: 4, y: 8, width: 22, height: 6, allowLowercase: true }
        },
        items: []
      }
    };
    cleanup();
    render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);
    await focusScene(user, "gender-select");
    await user.click(screen.getByRole("button", { name: "Mostrar camada Guias da composição" }));
    const namePreview = screen.getByRole("img", { name: "Prévia visual da entrada do nome" });
    expect(namePreview).toHaveAttribute("data-menu-preview-cursor-index", "0");
    expect(namePreview).toHaveTextContent("player.name · 8 caracteres");
    expect(namePreview).toHaveTextContent("BACK");
    expect(namePreview).toHaveTextContent("DONE");
  });

  it("shows the compiler budget for the selected scene and runs a fresh analysis", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Orçamento no inspector" });
    const roomName = String((project.scenas as Array<Record<string, unknown>>)[0]?.name);
    const onAnalyzeProjectBudget = vi.fn();
    const report: AssetPackBudgetReport = {
      schema: 11,
      budget_summary: {
        bg_tiles: { used: 740, capacity: 896, remaining: 156, percent_used: 82, severity: "warning" },
        obj_tiles: { used: 96, capacity: 1024, remaining: 928, percent_used: 9, severity: "ok" },
        oam_sprites: { used: 18, capacity: 128, remaining: 110, percent_used: 14, severity: "ok" }
      },
      group_pressure_report: [{
        name: "scene_overworld",
        asset_count: 1,
        assets: ["tiles_overworld"],
        resources: {
          bg_tiles: { requested: 740, capacity: 896, remaining_after_group: 156, percent_of_pool: 82, bank_count: 3 },
          obj_tiles: { requested: 96, capacity: 1024, remaining_after_group: 928, percent_of_pool: 9, bank_count: 1 },
          oam_sprites: { requested: 18, capacity: 128, remaining_after_group: 110, percent_of_pool: 14, bank_count: 1 }
        }
      }],
      fragmentation_report: {
        bg_tiles: { used: 740, capacity: 896, remaining: 156, largest_free_block: 96, free_fragment_count: 2 }
      },
      compression_candidates: [{ asset: "tiles_overworld", resource: "bg_tiles", strategy: "rle_or_lz77_tilemap", reason: "large_repetitive_background_candidate" }],
      production_summary: { ready_for_large_project: true, blocking_overflow_count: 0, compression_candidate_count: 1, split_recommendation_count: 1 }
    };

    render(
      <RoomsWorkspace
        budgetReport={report}
        onAnalyzeProjectBudget={onAnalyzeProjectBudget}
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Orçamento" }));

    expect(screen.getByRole("region", { name: `Orçamento GBA da cena ${roomName}` })).toHaveTextContent("Relatório do compilador");
    expect(screen.getByRole("article", { name: "Pressão Tiles BG" })).toHaveTextContent("740 / 896");
    expect(screen.getByText("RLE ou LZ77")).toBeInTheDocument();
    expect(screen.getByText(/2 blocos livres/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Carga DMA por troca de banco" })).toHaveTextContent("26.3 KB / 32.0 KB");
    expect(screen.getByRole("region", { name: "Carga DMA por troca de banco" })).toHaveTextContent("Antecipe o prefetch");

    await user.click(screen.getByRole("button", { name: "Analisar orçamento agora" }));
    expect(onAnalyzeProjectBudget).toHaveBeenCalledTimes(1);
  });

  it("mantém o inspetor da câmera focado nas configurações da cena", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Configuração da camera" });
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Câmera" }));
    await user.selectOptions(screen.getByLabelText("Modo da câmera"), "follow_player");

    expect(handlers.onUpdateRoomFields).toHaveBeenCalledWith("room-1", { cameraMode: "follow_player" });
    expect(screen.getByText("Esta cena já ocupa o viewport GBA completo; limites e zonas só se aplicam a cenas maiores.")).toBeInTheDocument();
    expect(screen.queryByText("Zonas de câmera")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "X" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Zoom da câmera")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher tile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Centralizar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Timeline cinematográfica" })).not.toBeInTheDocument();
  });

  it("expõe limites e zonas apenas quando a cena excede o viewport GBA", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Cena ampla" });
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    room.width = 40;
    room.height = 24;
    room.cameraBounds = { x: 2, y: 2, width: 30, height: 20 };

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Câmera" }));

    expect(screen.getByRole("spinbutton", { name: "X" })).toHaveValue(2);
    expect(screen.getByText("Zonas de câmera")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar zona" })).toBeInTheDocument();
  });

  it("mantem Projeto e Pre-fabricados em abas exclusivas no navegador inferior", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Navegador contextual" });

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    const navigator = screen.getByRole("tablist", { name: "Navegador do projeto" });
    expect(navigator).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Projeto" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Projeto" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pre-fabricados" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Pré-fabricados" }));
    expect(screen.getByRole("region", { name: "Pre-fabricados" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Projeto" })).not.toBeInTheDocument();
  });

  it("organiza cada cena como uma pasta compacta com atores e gatilhos filhos", async () => {
    const user = userEvent.setup();
    const blankProject = createBlankProjectData({ name: "Arvore por cena" });
    const roomName = deriveRoomsWorkspacePresentation(blankProject).rooms[0]?.name ?? "overworld";
    const project = {
      ...blankProject,
      actors: [{ id: "actor-player", name: "Player", roomName, x: 2, y: 3, spriteSheet: "player.png" }],
      triggers: [{ id: "trigger-door", name: "Porta", roomName, x: 4, y: 5, width: 2, height: 1, eventName: "door_enter" }]
    };
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    const sceneFolder = container.querySelector<HTMLElement>(".editor-tree-scene-branch.is-selected");
    expect(sceneFolder).not.toBeNull();
    expect(within(sceneFolder!).getByRole("button", { name: /Player/ })).toBeInTheDocument();
    expect(within(sceneFolder!).getByRole("button", { name: /Porta/ })).toBeInTheDocument();
    expect(within(sceneFolder!).queryByText("Atores")).not.toBeInTheDocument();
    expect(within(sceneFolder!).queryByText("Gatilhos")).not.toBeInTheDocument();

    await user.click(within(sceneFolder!).getByRole("button", { name: /Porta/ }));
    expect(handlers.onSetActiveRoom).toHaveBeenCalledWith("room-1", roomName);
  });

  it("dedica toda a lateral ao inspector de pintura", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Pintura dedicada" });

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusScene(user, String(deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld"));
    await user.click(screen.getByRole("button", { name: "Pintura - Tiles" }));

    expect(screen.getByRole("heading", { name: "Pintura" })).toBeInTheDocument();
  });

  it("mantem mapa do projeto e edicao de room no mesmo canvas", () => {
    const project = createRoomInProject(createBlankProjectData({ name: "Dois modos" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-2",
      name: "second_room",
      sceneType: "topdown",
      width: 8
    });

    render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...roomsWorkspaceHandlers()} />);

    expect(screen.queryByRole("button", { name: "Editar room" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mapa do projeto" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Card da cena second_room · visão geral somente leitura")).toBeInTheDocument();
    expect(screen.queryByLabelText("Barra de contexto da room")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Camadas da room")).not.toBeInTheDocument();
  });

  it("creates a room from a selected preset", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Preset UI" });
    const onCreateRoom = vi.fn(() => "room-2");
    const onSetActiveRoom = vi.fn();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers({ onCreateRoom, onSetActiveRoom })}
      />
    );

    await user.click(screen.getByLabelText("Modelos de cena"));
    await user.click(screen.getByRole("button", { name: "Interior" }));
    await user.click(screen.getByRole("button", { name: "Criar cena" }));

    expect(onCreateRoom).toHaveBeenCalledWith(undefined, expect.any(String), "interior");
    expect(onSetActiveRoom).toHaveBeenCalledWith("room-2", expect.any(String));
  });

  it("mantém as ações secundárias da cena no menu do card", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Ações secundárias" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-2",
      name: "forest",
      sceneType: "topdown",
      width: 8
    });
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    expect(screen.queryByRole("button", { name: "Adicionar cena à direita de forest" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar próxima cena a partir de forest" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mais opções da cena forest" }));

    const menu = screen.getByRole("list", { name: "Ações para forest" });
    expect(within(menu).getByRole("button", { name: "Adicionar cena ao lado" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Conectar próxima cena" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Testar cena" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Definir como cena inicial" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: "Testar cena" }));
    expect(handlers.onRunRoom).toHaveBeenCalledWith("room-2", "forest");

    await user.click(screen.getByRole("button", { name: "Mais opções da cena forest" }));
    await user.click(screen.getByRole("button", { name: "Conectar próxima cena" }));
    expect(handlers.onCreateRoomConnection).toHaveBeenCalledWith("forest", "cena_1", "");
  });

  it("move a cena pelo menu contextual para um grupo existente", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Mover cenas" });
    project.editorState = {
      sceneExplorer: {
        groups: [{ id: "story", name: "História", sceneIDs: [] }]
      }
    };
    const handlers = roomsWorkspaceHandlers();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mais opções da cena cena_1" }));
    const menu = screen.getByRole("list", { name: "Ações para cena_1" });
    await user.click(within(menu).getByRole("button", { name: "Mover para o grupo" }));

    expect(within(menu).getByRole("group", { name: "Grupos de cenas" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "História" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: "História" }));

    expect(handlers.onUpdateSceneOrganization).toHaveBeenCalledWith(expect.objectContaining({
      groups: [{ id: "story", name: "História", sceneIDs: ["room-1"] }]
    }));
    expect(screen.queryByRole("list", { name: "Ações para cena_1" })).not.toBeInTheDocument();
  });

  it("keeps the canvas free from the room context and floating layers bars", () => {
    const project = createBlankProjectData({ name: "Room contextual" });
    const presentation = deriveRoomsWorkspacePresentation(project);

    render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(screen.queryByLabelText("Camadas da room")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Barra de contexto da room")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Executar daqui" })).not.toBeInTheDocument();
  });

  it("renders actor sprites on inactive room cards", async () => {
    const user = userEvent.setup();
    const blankProject = createBlankProjectData({ name: "Inactive sprite" });
    const project = createRoomInProject(blankProject, {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-2",
      name: "iso",
      sceneType: "isometric",
      width: 8
    });
    project.actors = [
      ...(Array.isArray(project.actors) ? project.actors : []),
      {
        id: "actor-iso",
        name: "Iso Hero",
        roomName: "iso",
        x: 2,
        y: 3,
        spriteSheet: "hero-strip.png",
        animationName: "idle"
      }
    ];
    project.assets = [
      ...(Array.isArray(project.assets) ? project.assets : []),
      {
        id: "asset-hero-strip",
        name: "hero-strip.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/hero-strip.png" }
      }
    ];
    project.animations = [
      ...(Array.isArray(project.animations) ? project.animations : []),
      {
        id: "animation-hero-idle",
        name: "idle",
        spriteSheet: "hero-strip.png",
        frameWidth: 16,
        frameHeight: 16,
        frames: [{
          frameIndex: 0,
          width: 16,
          height: 16,
          originX: 8,
          originY: 16,
          tiles: [{ sourceSheet: "hero-strip.png", sliceX: 16, sliceY: 0, tileWidth: 16, tileHeight: 16 }]
        }]
      }
    ];

    const { container, unmount } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        projectPath="/tmp/inactive-sprite.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    const inactiveCard = container.querySelector('[aria-label="Card da cena iso · visão geral somente leitura"]');
    const actor = inactiveCard?.querySelector<HTMLElement>('.room-stage-entity.actor[title="Iso Hero"]');
    const spriteProbe = Array.from(
      inactiveCard?.querySelectorAll<HTMLImageElement>(".room-stage-sprite-probe") ?? []
    ).find((probe) => probe.src.includes("hero-strip.png")) ?? null;
    expect(actor).toHaveClass("has-sprite");
    expect(inactiveCard?.querySelector(".room-stage-card-preview-layer"))
      .toHaveAttribute("data-card-preview-mode", "isometric-tilemap");
    expect(inactiveCard?.querySelector<HTMLElement>(".room-stage-card-canvas")?.style.backgroundColor).toBe("");
    expect(actor?.style.backgroundImage).toContain("hero-strip.png");
    expect(spriteProbe).not.toBeNull();
    Object.defineProperty(spriteProbe!, "naturalWidth", { configurable: true, value: 64 });
    Object.defineProperty(spriteProbe!, "naturalHeight", { configurable: true, value: 16 });
    fireEvent.load(spriteProbe!);
    await waitFor(() => {
      expect(actor?.style.backgroundSize).toBe("400% 100%");
      expect(actor?.style.backgroundPosition).toBe("33.33333333333333% 0%");
    });
    unmount();
  });

  it("renders a GB Studio background layout below the editable grid and toggles collision visibility independently of the tool", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "GB Studio background layout" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.width = 80;
    room.height = 18;
    room.backgroundAssetName = "parallax-gba.png";
    room.gbStudioUseBackgroundLayout = true;
    room.backgroundRenderMode = "tilemap";
    room.tilemap = Array.from({ length: 80 * 18 }, (_value, index) => index === 0 ? 1 : 0);
    room.tileLayers = [
      { mapping: "BG2", tilemap: Array.from({ length: 80 * 18 }, (_value, index) => index === 0 ? 1 : 0) },
      { mapping: "BG1", tilemap: Array.from({ length: 80 * 18 }, () => 0) }
    ];
    room.collisionTypes = Array.from({ length: 80 * 18 }, (_value, index) => (
      index === 0 ? "solid" : "free"
    ));
    project.assets = [
      ...(Array.isArray(project.assets) ? project.assets : []),
      {
        id: "background-parallax",
        kind: "Background",
        name: "parallax-gba.png",
        metadata: { source: "Assets/backgrounds/parallax-gba.png" }
      }
    ];
    project.actors = [{
      id: "actor-layout",
      name: "Hero",
      roomName: String(room.name),
      x: 2,
      y: 3,
      spriteSheet: "hero.png",
      animationName: "idle"
    }];
    project.triggers = [{
      id: "trigger-layout",
      name: "Saida",
      roomName: String(room.name),
      x: 4,
      y: 3,
      width: 2,
      height: 1
    }];

    const presentation = deriveRoomsWorkspacePresentation(project);
    const { container } = render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        projectPath="/tmp/exemplo.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    expect(container.querySelector<HTMLElement>(".room-stage-card-canvas-readonly .room-stage-background-layout"))
      .not.toBeNull();

    await focusScene(user, String(presentation.rooms.find((room) => room.isActive)?.name ?? presentation.rooms[0]?.name ?? "overworld"));
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas");
    const background = canvas?.querySelector<HTMLImageElement>(".room-stage-background-layout");
    expect(presentation.rooms[0]?.gbStudioUseBackgroundLayout).toBe(true);
    expect(background?.src).toBe(desktopAssetURL("/tmp/Assets/backgrounds/parallax-gba.png"));
    expect(canvas?.querySelectorAll(".room-stage-cell")).toHaveLength(80 * 18);
    expect(canvas?.querySelector(".room-stage-cell.has-isometric-foreground")).toBeNull();
    expect(canvas?.querySelector(".room-stage-cell-tile")).toBeNull();
    expect(canvas?.querySelector(".room-stage-cell .tile-overlay-collision")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Ocultar camada Colisão" }));
    expect(canvas?.querySelector(".room-stage-cell .tile-overlay-collision")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mostrar camada Colisão" }));
    expect(canvas?.querySelector(".room-stage-cell .tile-overlay-collision")).not.toBeNull();
    await user.click(container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Colisao - Solidos']"
    )!);
    expect(canvas?.querySelector('[role="status"][aria-label="Colisão sobre preview RGB555"]')).not.toBeNull();
    const freeCollisionCell = canvas?.querySelector<HTMLButtonElement>(
      "button[aria-label='Pintar colisão 2']"
    );
    expect(freeCollisionCell).not.toBeNull();
    expect(freeCollisionCell).not.toHaveClass("has-collision");
    expect(canvas?.querySelector(".room-stage-cell-tile")).toBeNull();
    expect(canvas?.querySelector(".room-stage-cell .tile-overlay-collision")).not.toBeNull();
    await user.click(container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Pintura - Tiles']"
    )!);
    expect(canvas?.querySelector(".room-stage-cell-tile")).not.toBeNull();
    await user.click(container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Selecionar - Mover']"
    )!);
    expect(canvas?.querySelector(".room-stage-cell-tile")).toBeNull();
    expect(canvas?.querySelector(".room-stage-cell .tile-overlay-collision")).not.toBeNull();
    expect(canvas?.querySelector(".room-stage-entity.actor")).not.toBeNull();
    expect(canvas?.querySelector(".room-stage-entity-hitbox[data-entity-overlay='hitbox']")).not.toBeNull();
    expect(canvas?.querySelector(".room-stage-entity.trigger")).not.toBeNull();
    expect(background?.compareDocumentPosition(canvas!.querySelector(".room-stage-cell")!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renderiza as páginas da superfície tática no mapa e no editor", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Prévia tática" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "isometric";
    room.width = 12;
    room.height = 8;
    room.backgroundAssetName = "tactical-reference.png";
    room.gbStudioUseBackgroundLayout = true;
    room.runtime = {
      type: "isometric",
      config: {
        tileWidth: 32,
        tileHeight: 16,
        worldMode: "static_composition",
        gameplayMode: "tactical",
        tacticalPresentation: {
          surfacePages: [
            { id: "r0c0", asset: "page-00.png", bankGroup: "page-00", world: { x: 0, y: 0, width: 240, height: 160 } },
            { id: "r0c1", asset: "page-01.png", bankGroup: "page-01", world: { x: 240, y: 0, width: 240, height: 160 } },
            { id: "r1c0", asset: "page-10.png", bankGroup: "page-10", world: { x: 0, y: 160, width: 240, height: 160 } },
            { id: "r1c1", asset: "page-11.png", bankGroup: "page-11", world: { x: 240, y: 160, width: 240, height: 160 } }
          ],
          units: [],
          props: []
        }
      }
    };
    project.assets = [
      { id: "asset-reference", kind: "Background", name: "tactical-reference.png", metadata: { source: "Assets/backgrounds/tactical-reference.png" } },
      ...["page-00.png", "page-01.png", "page-10.png", "page-11.png"].map((name) => ({
        id: `asset-${name}`,
        kind: "Background",
        name,
        metadata: { source: `Assets/backgrounds/${name}` }
      }))
    ];

    const presentation = deriveRoomsWorkspacePresentation(project);
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        projectPath="/tmp/tactical-preview.gba-project"
        {...handlers}
      />
    );

    expect(container.querySelectorAll(".room-stage-card-canvas-readonly .room-stage-tactical-surface-page")).toHaveLength(4);
    expect(container.querySelector(".room-stage-card-dimensions")).toHaveTextContent("480 × 320 px");
    expect(container.querySelector(".room-stage-card-canvas-readonly .room-stage-card-preview-layer"))
      .toHaveAttribute("data-card-preview-mode", "tactical-surface");
    expect(container.querySelector(".room-stage-card-canvas-readonly .room-stage-background-layout")).toBeNull();

    await focusActiveScene(user);
    const canvas = container.querySelector(".room-focused-scene-editor-frame .room-stage-card-canvas");
    expect(canvas?.querySelectorAll(".room-stage-tactical-surface-page")).toHaveLength(4);
    expect(container.querySelector(".room-scene-navigation-size")).toHaveTextContent("480 × 320 px · 12 × 8 células");
    expect(screen.getByLabelText("Largura (células)")).toHaveAttribute("min", "1");
    expect(screen.getByLabelText("Altura (células)")).toHaveAttribute("min", "1");
    expect(canvas?.querySelector(".room-stage-background-layout")).toBeNull();
    await openSceneInspector(user);
    await user.click(screen.getByRole("tab", { name: "Fundo" }));
    expect(screen.getAllByRole("combobox", { name: /^Superfície isométrica/ })).toHaveLength(4);
    await user.selectOptions(screen.getByRole("combobox", { name: "Superfície isométrica 2" }), "page-10.png");
    const config = handlers.onUpdateRoomFields.mock.calls.at(-1)?.[1].runtime.config;
    expect(config.tacticalPresentation.surfacePages.map((page: {asset: string}) => page.asset))
      .toEqual(["page-00.png", "page-10.png", "page-10.png", "page-11.png"]);
    expect(config.tacticalPresentation.surfacePages[1]).toMatchObject({ id: "r0c1", bankGroup: "page-01", world: { x: 240, y: 0, width: 240, height: 160 } });
  });

  it("recorta o padding do PNG tático antes de compor a superfície completa", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Composição tática completa" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "isometric";
    room.width = 12;
    room.height = 8;
    room.backgroundAssetName = "tactical-reference.png";
    room.gbStudioUseBackgroundLayout = true;
    room.runtime = {
      type: "isometric",
      config: {
        tileWidth: 32,
        tileHeight: 16,
        worldMode: "static_composition",
        gameplayMode: "tactical",
        tacticalPresentation: {
          surfacePages: [
            { id: "r0c0", asset: "page-00.png", bankGroup: "page-00", world: { x: 0, y: 0, width: 240, height: 160 } },
            { id: "r0c1", asset: "page-01.png", bankGroup: "page-01", world: { x: 240, y: 0, width: 240, height: 160 } },
            { id: "r1c0", asset: "page-10.png", bankGroup: "page-10", world: { x: 0, y: 160, width: 240, height: 160 } },
            { id: "r1c1", asset: "page-11.png", bankGroup: "page-11", world: { x: 240, y: 160, width: 240, height: 160 } }
          ],
          units: [],
          props: []
        }
      }
    };
    project.assets = [
      {
        id: "asset-reference",
        kind: "Background",
        name: "tactical-reference.png",
        metadata: { height: 320, source: "Assets/backgrounds/tactical-reference.png", width: 480 }
      },
      ...["page-00.png", "page-01.png", "page-10.png", "page-11.png"].map((name) => ({
        id: `asset-${name}`,
        kind: "Background",
        name,
        metadata: { source: `Assets/backgrounds/${name}` }
      }))
    ];

    const presentation = deriveRoomsWorkspacePresentation(project);
    const { container } = render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        projectPath="/tmp/tactical-complete.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    const overviewPage = container.querySelector<HTMLElement>(".room-stage-card-canvas-readonly .room-stage-tactical-surface-page");
    expect(container.querySelectorAll(".room-stage-card-canvas-readonly .room-stage-tactical-surface-page")).toHaveLength(4);
    expect(overviewPage).toHaveAttribute("data-tactical-surface-source-crop", "256x256-to-240x160");
    expect(overviewPage?.querySelector(".room-stage-tactical-surface-page-image")).not.toBeNull();
    const sourceImage = overviewPage?.querySelector<HTMLImageElement>(".room-stage-tactical-surface-page-image");
    Object.defineProperties(sourceImage!, {
      naturalWidth: { configurable: true, value: 240 },
      naturalHeight: { configurable: true, value: 160 }
    });
    fireEvent.load(sourceImage!);
    await waitFor(() => {
      expect(overviewPage).toHaveAttribute("data-tactical-surface-source-crop", "240x160-to-240x160");
      expect(sourceImage).toHaveStyle({ width: "100%", height: "100%" });
    });
    expect(container.querySelector(".room-stage-card-canvas-readonly .room-stage-background-layout")).toBeNull();

    await focusActiveScene(user);
    const canvas = container.querySelector(".room-focused-scene-editor-frame .room-stage-card-canvas");
    expect(canvas?.querySelectorAll(".room-stage-tactical-surface-page")).toHaveLength(4);
    expect(canvas?.querySelector(".room-stage-tactical-surface-page-image")).not.toBeNull();
    expect(canvas?.querySelector(".room-stage-background-layout")).toBeNull();
    expect(canvas?.querySelector(".room-stage-background-grid")).toBeNull();
    const geometryOverlay = canvas?.querySelector<SVGElement>(".room-stage-isometric-grid");
    expect(geometryOverlay).toHaveAttribute("data-world-size", "480x320");
    expect(geometryOverlay).toHaveAttribute("data-camera-bounds", "0,0,240,160");
    expect(geometryOverlay?.querySelector(".room-stage-isometric-grid-world-bounds")).not.toBeNull();
    expect(geometryOverlay?.querySelector(".room-stage-isometric-grid-camera-bounds")).not.toBeNull();
    expect(geometryOverlay?.querySelector(".room-stage-isometric-grid-grid-bounds")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Ocultar overlay Câmera" }));
    expect(geometryOverlay?.querySelector(".room-stage-isometric-grid-camera-bounds")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mostrar overlay Câmera" }));
    expect(geometryOverlay?.querySelector(".room-stage-isometric-grid-camera-bounds")).not.toBeNull();
  });

  it("controls canvas layer visibility and prevents painting on a locked layer", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Canvas layers" });
    const initialRoom = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    const roomName = initialRoom.name;
    project.actors = [{ id: "actor-player", name: "Player", roomName, x: 0, y: 0 }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas");
    expect(canvas).toHaveClass("is-grid-visible");

    await user.click(screen.getByRole("button", { name: "Ocultar camada Grade" }));
    expect(canvas).not.toHaveClass("is-grid-visible");

    await user.click(screen.getByRole("button", { name: "Bloquear camada Colisão" }));
    await user.click(screen.getByRole("button", { name: "Colisao - Solidos" }));
    const collisionCell = canvas?.querySelector<HTMLButtonElement>(".room-stage-cell");
    expect(collisionCell).not.toBeNull();
    fireEvent.pointerDown(collisionCell!, { button: 0, buttons: 1, pointerId: 51 });
    fireEvent.pointerUp(collisionCell!, { button: 0, buttons: 0, pointerId: 51 });

    expect(handlers.onSetCollisionType).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Desbloquear camada Colisão" }));
    fireEvent.pointerDown(collisionCell!, { button: 0, buttons: 1, pointerId: 52 });
    expect(handlers.onSetCollisionType).toHaveBeenCalledWith(initialRoom.id, 0, "solid", expect.any(String));
  });

  it("apaga colisão com o botão direito sem abrir o menu contextual", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Collision erase" });
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Colisao - Solidos']")!);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas")!;
    const cell = canvas.querySelector<HTMLButtonElement>(".room-stage-cell")!;
    fireEvent.pointerDown(cell, { button: 2, buttons: 2, pointerId: 81 });
    fireEvent.pointerUp(cell, { button: 2, buttons: 0, pointerId: 81 });

    expect(handlers.onSetCollisionType).toHaveBeenCalledWith("room-1", 0, "free", expect.any(String));
  });

  it("preenche uma região de colisão pelo modo Preencher", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Collision fill" });
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Colisao - Solidos']")!);
    await user.click(screen.getByRole("button", { name: /Preencher Região/ }));
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas")!;
    const cell = canvas.querySelector<HTMLButtonElement>(".room-stage-cell")!;
    fireEvent.pointerDown(cell, { button: 0, buttons: 1, pointerId: 83 });
    fireEvent.pointerUp(cell, { button: 0, buttons: 0, pointerId: 83 });

    expect(handlers.onApplyCollisionFill).toHaveBeenCalledWith("room-1", 0, "solid", expect.any(String));
    expect(handlers.onSetCollisionType).not.toHaveBeenCalled();
  });

  it("captura o tipo de colisão com Alt sem pintar a célula", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Collision sampler" });
    const scenes = project.scenas as Array<Record<string, unknown>>;
    const firstScene = scenes[0]!;
    firstScene.collisionTypes = ["water", ...Array.from({ length: 599 }, () => "free")];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Colisao - Solidos']")!);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas")!;
    const cell = canvas.querySelector<HTMLButtonElement>(".room-stage-cell")!;
    fireEvent.pointerDown(cell, { altKey: true, button: 0, buttons: 1, pointerId: 82 });

    expect(handlers.onSetCollisionType).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tipo de colisao Agua" })).toHaveAttribute("aria-pressed", "true");
  });

  it("preserva entidade selecionada quando a camada correspondente está bloqueada", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Locked entity" });
    const initialRoom = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    project.actors = [{ id: "actor-player", name: "Player", roomName: initialRoom.name, x: 0, y: 0 }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas")!;
    const firstCell = canvas.querySelector<HTMLButtonElement>(".room-stage-cell")!;
    fireEvent.pointerDown(firstCell, { button: 0, buttons: 1, pointerId: 61 });
    fireEvent.pointerUp(firstCell, { button: 0, buttons: 0, pointerId: 61 });
    expect(screen.getAllByText("Player").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Bloquear camada Atores" }));
    fireEvent.keyDown(window, { key: "Delete" });

    expect(handlers.onRemoveRoomEntities).not.toHaveBeenCalled();
    expect(screen.getAllByText("Player").length).toBeGreaterThan(0);
  });

  it("não move trigger ao clicar em uma célula vazia no modo seleção", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Seleção sem movimento" });
    const initialRoom = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    project.triggers = [{
      id: "trigger-door",
      name: "Porta",
      roomName: initialRoom.name,
      x: 1,
      y: 1,
      width: 2,
      height: 2
    }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas")!;
    const cells = Array.from(canvas.querySelectorAll<HTMLButtonElement>(".room-stage-cell"));
    const triggerCell = cells[1 + initialRoom.width]!;
    const emptyCell = cells[10 + 10 * initialRoom.width]!;
    fireEvent.pointerDown(triggerCell, { button: 0, buttons: 1, pointerId: 71 });
    fireEvent.pointerUp(triggerCell, { button: 0, buttons: 0, pointerId: 71 });
    await waitFor(() => expect(screen.getAllByText("Porta").length).toBeGreaterThan(0));

    fireEvent.pointerDown(emptyCell, { button: 0, buttons: 1, pointerId: 72 });
    fireEvent.pointerUp(emptyCell, { button: 0, buttons: 0, pointerId: 72 });

    expect(handlers.onPlaceRoomEntity).not.toHaveBeenCalled();
    expect(handlers.onResizeRoomTrigger).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Cena" })).toHaveAttribute("aria-selected", "true");
  });

  it("troca a ferramenta focada pelos atalhos e não captura teclas de campos editáveis", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Atalhos de ferramentas" });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const rail = container.querySelector<HTMLElement>(".room-editor-tool-rail.is-scene-focus")!;
    fireEvent.keyDown(window, { key: "b" });
    expect(rail.querySelector("button[aria-label='Pintura - Tiles']")).toHaveAttribute("aria-pressed", "true");

    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "c" });
    expect(rail.querySelector("button[aria-label='Pintura - Tiles']")).toHaveAttribute("aria-pressed", "true");
    input.remove();
  });

  it("abre as configurações da cena com R sem criar uma ferramenta concorrente no canvas", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Configuração da cena" });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const rail = container.querySelector<HTMLElement>(".room-editor-tool-rail.is-scene-focus")!;
    expect(rail.querySelector("button[aria-label='Cena - Camera']")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Zonas de câmera - Áreas" }));
    expect(screen.getByRole("tab", { name: /^Câmera$/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(window, { key: "r" });

    expect(screen.getByRole("tab", { name: /^Cena$/ })).toHaveAttribute("aria-selected", "true");
    expect(rail.querySelector("button[aria-label='Selecionar - Mover']")).toHaveAttribute("aria-pressed", "true");
  });

  it("usa atalhos personalizados do projeto e ignora ferramentas indisponíveis", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Atalhos personalizados" });
    project.settings = { shortcuts: { select: "x", paint: "p", collision: "q" } };
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const rail = container.querySelector<HTMLElement>(".room-editor-tool-rail.is-scene-focus")!;
    fireEvent.keyDown(window, { key: "x" });
    expect(rail.querySelector("button[aria-label='Selecionar - Mover']")).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "p" });
    expect(rail.querySelector("button[aria-label='Pintura - Tiles']")).toHaveAttribute("aria-pressed", "true");

    cleanup();
    const cutsceneProject = createBlankProjectData({ name: "Atalho indisponível" });
    const { container: cutsceneContainer } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation({
          ...cutsceneProject,
          scenas: [{ ...(cutsceneProject.scenas as Array<Record<string, unknown>>)[0], sceneType: "cutscene" }]
        })}
        projectData={cutsceneProject}
        {...roomsWorkspaceHandlers()}
      />
    );
    await focusActiveScene(user);
    fireEvent.keyDown(window, { key: "q" });
    expect(cutsceneContainer.querySelector("button[aria-label='Selecionar - Mover']")).toHaveAttribute("aria-pressed", "true");
  });

  it("ativa um atalho personalizado com modificadores", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Atalhos com modificadores" });
    project.settings = { shortcuts: { select: "mod+shift+x" } };
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const rail = container.querySelector<HTMLElement>(".room-editor-tool-rail.is-scene-focus")!;
    fireEvent.keyDown(window, { key: "x", ctrlKey: true, shiftKey: true });
    expect(rail.querySelector("button[aria-label='Selecionar - Mover']")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(rail.querySelector("button[aria-label='Pintura - Tiles']")!);
    fireEvent.keyDown(window, { key: "x", shiftKey: true });
    expect(rail.querySelector("button[aria-label='Pintura - Tiles']")).toHaveAttribute("aria-pressed", "true");
  });

  it("move entidades com setas, duplica com Ctrl+D e usa Escape em três níveis", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Atalhos de edição" });
    const room = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    project.actors = [{ id: "actor-shortcut", name: "Shortcut", roomName: room.name, x: 1, y: 1 }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas")!;
    const actorCell = canvas.querySelectorAll<HTMLButtonElement>(".room-stage-cell")[1 + room.width]!;
    fireEvent.pointerDown(actorCell, { button: 0, buttons: 1, pointerId: 91 });
    fireEvent.pointerUp(actorCell, { button: 0, buttons: 0, pointerId: 91 });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });

    expect(handlers.onNudgeRoomEntities).toHaveBeenNthCalledWith(1, room.id, ["actor:actor-shortcut"], 1, 0, 1);
    expect(handlers.onNudgeRoomEntities).toHaveBeenNthCalledWith(2, room.id, ["actor:actor-shortcut"], 0, 1, 8);
    expect(handlers.onDuplicateRoomEntities).toHaveBeenCalledWith(room.id, ["actor:actor-shortcut"]);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(canvas.querySelector(".room-stage-entity.actor.selected")).toBeNull();
    expect(screen.getByRole("region", { name: `Editor da cena ${room.name}` })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: `Editor da cena ${room.name}` })).not.toBeInTheDocument();
  });

  it("mantém a prévia do ator durante o arraste e persiste apenas ao soltar", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Arraste de ator" });
    const room = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    project.actors = [{ id: "actor-drag", name: "Drag", roomName: room.name, x: 1, y: 1 }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ bottom: room.height * 10, height: room.height * 10, left: 0, right: room.width * 10, top: 0, width: room.width * 10 })
    });
    const cells = canvas.querySelectorAll<HTMLButtonElement>(".room-stage-cell");
    const startCell = cells[1 + room.width]!;
    const targetCell = cells[3 + (2 * room.width)]!;
    const actorOverlay = canvas.querySelector<HTMLElement>(".room-stage-entity.actor")!;
    const initialStyle = actorOverlay.getAttribute("style");

    fireEvent.pointerDown(startCell, { button: 0, buttons: 1, pointerId: 92 });
    fireEvent.pointerMove(canvas, { buttons: 1, clientX: 35, clientY: 25, pointerId: 92 });

    expect(handlers.onPlaceRoomEntity).not.toHaveBeenCalled();
    await waitFor(() => expect(actorOverlay.getAttribute("style")).not.toBe(initialStyle));

    fireEvent.pointerUp(targetCell, { button: 0, buttons: 0, clientX: 35, clientY: 25, pointerId: 92 });

    expect(handlers.onPlaceRoomEntity).toHaveBeenCalledTimes(1);
    expect(handlers.onPlaceRoomEntity).toHaveBeenCalledWith(
      "actor",
      "actor-drag",
      { roomID: room.id, x: 3, y: 2 },
      expect.any(String)
    );
  });

  it("stacks authored BG3, BG2 and BG1 full-scene images in GBA draw order", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Layered platformer preview" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.width = 2;
    room.height = 2;
    room.sceneType = "platformer";
    room.backgroundAssetName = "terrain.png";
    room.gbStudioUseBackgroundLayout = true;
    room.tilemap = [0, 0, 0, 0];
    room.tileLayers = [
      { mapping: "BG3", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["sky.png", "sky.png", "sky.png", "sky.png"] },
      { mapping: "BG2", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["terrain.png", "terrain.png", "terrain.png", "terrain.png"] },
      { mapping: "BG1", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["details.png", "details.png", "details.png", "details.png"] },
      { mapping: "BG0", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] }
    ];
    project.settings = { backgrounds: { graphicsMode: "Mode 0 - Tilemaps" } };
    project.assets = [
      { id: "asset-sky", name: "sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/sky.png" } },
      { id: "asset-terrain", name: "terrain.png", kind: "Background", metadata: { source: "Assets/backgrounds/terrain.png" } },
      { id: "asset-details", name: "details.png", kind: "Background", metadata: { source: "Assets/backgrounds/details.png" } }
    ];

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        projectPath="/tmp/layered-platformer.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const layers = Array.from(container.querySelectorAll<HTMLImageElement>(".rooms-canvas-world-scroll .room-stage-background-layout"));
    expect(layers.map((layer) => layer.dataset.backgroundLayer)).toEqual(["BG3", "BG2", "BG1"]);
    expect(layers.map((layer) => decodeURIComponent(layer.src))).toEqual([
      expect.stringContaining("Assets/backgrounds/sky.png"),
      expect.stringContaining("Assets/backgrounds/terrain.png"),
      expect.stringContaining("Assets/backgrounds/details.png")
    ]);
  });

  it("uses RGB555-compiled background and object images in the active scene card", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Active RGB555 preview" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.backgroundAssetName = "scene.png";
    room.gbStudioUseBackgroundLayout = true;
    room.backgroundRenderMode = "tilemap";
    room.paletteFamilyID = "scene-family";
    project.paletteFamilies = [{
      id: "scene-family",
      name: "Cena",
      background: [0x0000, 0x001f],
      objects: [0x0000, 0x03e0]
    }];
    project.assets = [
      {
        id: "background-scene",
        kind: "Background",
        name: "scene.png",
        metadata: { source: "Assets/backgrounds/scene.png" }
      },
      {
        id: "sprite-hero",
        kind: "Sprite",
        name: "hero.png",
        metadata: { source: "Assets/sprites/hero.png" }
      }
    ];
    project.actors = [{
      id: "actor-hero",
      name: "Hero",
      roomName: String(room.name),
      x: 2,
      y: 3,
      spriteSheet: "hero.png",
      animationName: "idle"
    }];

    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([250, 20, 20, 255]) })),
      imageSmoothingEnabled: true,
      putImageData: vi.fn()
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,rgb555-compiled");

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        projectPath="/tmp/active-rgb555.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    const presentation = deriveRoomsWorkspacePresentation(project);
    await focusScene(user, String(presentation.rooms.find((room) => room.isActive)?.name ?? presentation.rooms[0]?.name ?? "overworld"));
    const activeCard = container.querySelector(".room-focused-scene-editor-frame .room-stage-card")!;
    const background = activeCard.querySelector<HTMLImageElement>(".room-stage-background-layout")!;
    const tilesetProbe = activeCard.querySelector<HTMLImageElement>(".room-stage-tileset-probe")!;
    const spriteProbe = activeCard.querySelector<HTMLImageElement>(".room-stage-sprite-probe")!;
    const actor = activeCard.querySelector<HTMLElement>(".room-stage-entity.actor")!;
    Object.defineProperties(tilesetProbe, {
      naturalHeight: { configurable: true, value: 160 },
      naturalWidth: { configurable: true, value: 240 }
    });
    Object.defineProperties(spriteProbe, {
      naturalHeight: { configurable: true, value: 16 },
      naturalWidth: { configurable: true, value: 16 }
    });

    fireEvent.load(tilesetProbe);
    fireEvent.load(spriteProbe);

    await waitFor(() => {
      expect(background.src).toContain("rgb555-compiled");
      expect(actor.style.backgroundImage).toContain("rgb555-compiled");
    });
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.putImageData).toHaveBeenCalled();
  });

  it("mantem o slot visual 32x32 inteiro no canvas de uma cena isometrica", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Atlas isometrico" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "isometric";
    room.width = 4;
    room.height = 4;
    room.backgroundAssetName = "isometric.png";
    room.backgroundRenderMode = "tilemap";
    room.backgroundTileWidth = 32;
    room.backgroundTileHeight = 16;
    room.backgroundAtlasTileWidth = 32;
    room.backgroundAtlasTileHeight = 32;
    room.tilemap = Array.from({ length: 16 }, () => 1);
    room.tileLayers = [{ mapping: "BG2", tilemap: Array.from({ length: 16 }, () => 1) }];
    project.assets = [{
      id: "asset-isometric",
      kind: "Background",
      name: "isometric.png",
      metadata: {
        atlasTileHeight: 32,
        atlasTileWidth: 32,
        source: "Assets/backgrounds/isometric.png",
        tileHeight: 16,
        tileWidth: 32
      }
    }];

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        projectPath="/tmp/atlas-isometric.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas");
    const tileset = canvas?.querySelector<HTMLImageElement>(".room-stage-tileset-probe");
    expect(tileset).not.toBeNull();
    Object.defineProperties(tileset!, {
      naturalHeight: { configurable: true, value: 256 },
      naturalWidth: { configurable: true, value: 256 }
    });
    fireEvent.load(tileset!);

    await waitFor(() => {
      const tile = canvas?.querySelector<HTMLElement>(".room-stage-cell-tile");
      expect(tile).not.toBeNull();
      expect(tile?.style.getPropertyValue("--room-stage-atlas-width-ratio")).toBe("1");
      expect(tile?.style.getPropertyValue("--room-stage-atlas-height-ratio")).toBe("2");
    });
  });

  it("apoia os atores no centro do losango e respeita a altura como a ROM", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Arena elevada" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    Object.assign(room, {
      sceneType: "isometric", width: 6, height: 6,
      backgroundAssetName: "floor.png", gbStudioUseBackgroundLayout: true,
      runtime: { type: "isometric", config: { worldMode: "static_composition", gameplayMode: "tactical", tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 40,
        tacticalPresentation: {surfacePages: [{id: "floor", asset: "floor.png", bankGroup: "floor", world: {x: 0, y: 0, width: 240, height: 160}}], units: [], props: []}
      } }
    });
    project.assets = [
      {id: "floor", kind: "Background", name: "floor.png", metadata: {source: "Assets/backgrounds/floor.png", width: 240, height: 160}},
      {id: "unit", kind: "Sprite", name: "unit.png", metadata: {source: "Assets/sprites/unit.png"}}
    ];
    project.animations = [{
      id: "unit-idle", name: "idle", spriteSheet: "unit.png", frameWidth: 48, frameHeight: 40,
      originX: 24, originY: 40,
      frames: [{frameIndex: 0, width: 48, height: 40, originX: 24, originY: 40,
        tiles: [{sourceSheet: "unit.png", sliceX: 0, sliceY: 0, tileWidth: 48, tileHeight: 40}]}]
    }];
    project.actors = [
      {id: "lower", name: "Lower unit", x: 1, y: 4, z: 0},
      {id: "upper", name: "Upper unit", x: 4, y: 1, z: 1}
    ].map(actor => ({...actor, roomName: String(room.name), spriteSheet: "unit.png", animationName: "idle"}));
    const {container} = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} projectPath="/tmp/arena-elevated.gba-project" {...roomsWorkspaceHandlers()} />);
    await focusActiveScene(user);
    const stage = container.querySelector('.room-focused-scene-editor-frame')!;
    const [lower, upper] = Array.from(stage.querySelectorAll<HTMLElement>('.room-stage-entity.actor'));
    // Engine positions: top = originY + (x+y)*8 - z*8 + 8 - frameHeight.
    expect(parseFloat(lower.style.top)).toBeCloseTo(30);
    expect(parseFloat(upper.style.top)).toBeCloseTo(25);
    expect(parseFloat(lower.style.left)).toBeCloseTo(20);
    expect(parseFloat(upper.style.left)).toBeCloseTo(60);
  });

  it("renderiza o frame logico completo de um ator isometrico formado por quatro tiles", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Frame isometrico completo" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.sceneType = "isometric";
    room.width = 4;
    room.height = 4;
    project.assets = [{
      id: "asset-actor-strip",
      kind: "Sprite",
      name: "actor-strip.png",
      metadata: { source: "Assets/sprites/actor-strip.png" }
    }];
    project.actors = [{
      id: "actor-iso-frame",
      name: "Iso Frame",
      roomName: String(room.name),
      x: 1,
      y: 1,
      spriteSheet: "actor-strip.png",
      animationName: "idle"
    }];
    project.animations = [{
      id: "animation-iso-frame",
      name: "idle",
      spriteSheet: "actor-strip.png",
      frameWidth: 48,
      frameHeight: 48,
      frames: [{
        frameIndex: 0,
        width: 48,
        height: 48,
        originX: 24,
        originY: 48,
        tiles: [
          { sourceSheet: "actor-strip.png", sliceX: 0, sliceY: 0, tileWidth: 32, tileHeight: 32 },
          { sourceSheet: "actor-strip.png", sliceX: 0, sliceY: 32, tileWidth: 32, tileHeight: 16 },
          { sourceSheet: "actor-strip.png", sliceX: 32, sliceY: 0, tileWidth: 16, tileHeight: 32 },
          { sourceSheet: "actor-strip.png", sliceX: 32, sliceY: 32, tileWidth: 16, tileHeight: 16 }
        ]
      }]
    }];

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        projectPath="/tmp/iso-frame.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    const focused = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame")!;
    const actor = focused.querySelector<HTMLElement>(".room-stage-entity.actor")!;
    const spriteProbe = focused.querySelector<HTMLImageElement>(".room-stage-sprite-probe")!;
    Object.defineProperties(spriteProbe, {
      naturalHeight: { configurable: true, value: 48 },
      naturalWidth: { configurable: true, value: 960 }
    });
    fireEvent.load(spriteProbe);

    await waitFor(() => {
      expect(actor.style.backgroundSize).toBe("2000% 100%");
      expect(actor).toHaveAttribute("data-sprite-frame-width", "48");
      expect(actor).toHaveAttribute("data-sprite-frame-height", "48");
    });
  });

  it("mantém a grade técnica fora dos cards da visão geral", () => {
    const blankProject = createBlankProjectData({ name: "Clean inactive background" });
    const project = createRoomInProject(blankProject, {
      anchorRoomID: "room-1",
      height: 20,
      id: "room-2",
      name: "inactive_layout",
      sceneType: "topdown",
      width: 30
    });
    for (const room of project.scenas as Array<Record<string, unknown>>) {
      room.backgroundAssetName = "background.png";
      room.gbStudioUseBackgroundLayout = true;
      room.backgroundRenderMode = "tilemap";
    }
    project.assets = [
      ...(Array.isArray(project.assets) ? project.assets : []),
      {
        id: "background-clean-preview",
        kind: "Background",
        name: "background.png",
        metadata: { source: "Assets/backgrounds/background.png" }
      }
    ];

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        projectPath="/tmp/clean-inactive-background.gba-project"
        {...roomsWorkspaceHandlers()}
      />
    );

    const inactiveCard = container.querySelector(".room-stage-card-canvas-readonly")?.closest(".room-stage-card") ?? null;
    const activeCard = Array.from(container.querySelectorAll(".room-stage-card"))
      .find((card) => card !== inactiveCard) ?? null;
    expect(container.querySelector(".rooms-canvas-world-scroll")).toHaveClass("is-scene-map-overview");
    expect(activeCard?.querySelector(".room-stage-background-grid")).toBeNull();
    expect(inactiveCard?.querySelector(".room-stage-background-layout, canvas.room-stage-card-preview-canvas")).not.toBeNull();
    expect(inactiveCard?.querySelector(".room-stage-background-grid")).toBeNull();
    expect((inactiveCard?.querySelector(".room-stage-card-canvas") as HTMLElement | null)?.style.backgroundImage).toBe("");
    expect(screen.queryByRole("button", { name: /grades dos cards/i })).not.toBeInTheDocument();
    expect(activeCard?.querySelector(".room-stage-card-canvas > .room-stage-card-grid-toggle")).toBeNull();
    expect(inactiveCard?.querySelector(".room-stage-card-canvas > .room-stage-card-grid-toggle")).toBeNull();
  });

  it("renders the rooms workspace and creates a room from Nova room", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Smoke Rooms" });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const onCreateRoom = vi.fn((_anchorRoomID?: string, _roomName?: string) => "room-2");

    render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        {...roomsWorkspaceHandlers({ onCreateRoom })}
      />
    );

    expect(screen.getByRole("region", { name: "Workspace Rooms" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Nova cena" })[0]!);
    expect(screen.getByRole("dialog", { name: "Nova cena" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Criar cena" }));

    expect(onCreateRoom).toHaveBeenCalled();
    expect(onCreateRoom.mock.calls[0]?.[1]).toEqual(expect.any(String));
  });

  it("escolhe o evento de uma conexao pelo nome do projeto", async () => {
    const user = userEvent.setup();
    const withSecondRoom = createRoomInProject(createBlankProjectData({ name: "Eventos referenciais" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-2",
      name: "forest",
      sceneType: "topdown",
      width: 8
    });
    withSecondRoom.events = [
      { id: "event-door", name: "Abrir porta", command: "noop" },
      { id: "event-warp", name: "Viajar", command: "noop" }
    ];

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(withSecondRoom)}
        projectData={withSecondRoom}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Conexões" }));
    const eventPickers = screen.getAllByRole("combobox", { name: "Evento da nova conexão" });
    await user.click(eventPickers[0]!);
    await user.type(screen.getByRole("searchbox", { name: "Buscar Evento da nova conexão" }), "via");
    await user.click(screen.getByRole("option", { name: /Viajar/ }));

    expect(eventPickers[0]).toHaveValue("Viajar");
  });

  it("cria um evento diretamente pelo seletor da conexao", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Criar evento referencial" });
    const onCreateEventReference = vi.fn(async () => "evento_criado");

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers({ onCreateEventReference })}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Conexões" }));
    const eventPicker = screen.getByRole("combobox", { name: "Evento da nova conexão" });
    await user.click(eventPicker);
    await user.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(onCreateEventReference).toHaveBeenCalledTimes(1);
    expect(eventPicker).toHaveValue("evento_criado");
  });

  it("edita a transicao da conexao pelo inspetor contextual", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Transicoes de cenas" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-transition-target",
      name: "forest",
      sceneType: "topdown",
      width: 8
    });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const sourceRoom = presentation.rooms.find((room) => room.isActive) ?? presentation.rooms[0]!;
    const targetRoom = presentation.rooms.find((room) => room.name !== sourceRoom.name)!;
    project.editorState = {
      ...(project.editorState ?? {}),
      scenaConnections: [{
        eventName: "change_scene",
        from: sourceRoom.name,
        to: targetRoom.name
      }]
    };
    const onUpdateRoomConnection = vi.fn();

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers({ onUpdateRoomConnection })}
      />
    );

    await focusScene(user, sourceRoom.name);
    await user.click(screen.getByRole("tab", { name: "Conexões" }));
    await user.click(screen.getByRole("button", { name: new RegExp(`${sourceRoom.name}.*${targetRoom.name}`) }));
    await user.click(screen.getByRole("tab", { name: "Transição" }));

    expect(screen.getByRole("region", { name: "Configuração da transição" })).toHaveTextContent("Corte imediato");
    const transitionType = screen.getByRole("combobox", { name: "Tipo de transição" });
    expect(screen.getByRole("spinbutton", { name: "Duração da transição em frames" })).toBeDisabled();
    await user.selectOptions(transitionType, "fade");

    expect(onUpdateRoomConnection).toHaveBeenCalledWith(0, { transition: { style: "fade" } });
  });

  it("exibe somente as conexoes da cena selecionada no mapa", () => {
    let project = createRoomInProject(createBlankProjectData({ name: "Mapa focado" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-forest",
      name: "forest",
      sceneType: "topdown",
      width: 8
    });
    project = createRoomInProject(project, {
      anchorRoomID: "room-forest",
      height: 8,
      id: "room-cave",
      name: "cave",
      sceneType: "topdown",
      width: 8
    });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const sourceRoom = presentation.rooms.find((room) => room.isActive) ?? presentation.rooms[0]!;
    const targetRoom = presentation.rooms.find((room) => room.name === "forest")!;
    const thirdRoom = presentation.rooms.find((room) => room.name === "cave")!;
    project.editorState = {
      ...(project.editorState ?? {}),
      scenaConnections: [
        { eventName: "change_scene", from: sourceRoom.name, to: targetRoom.name },
        { eventName: "change_scene", from: targetRoom.name, to: thirdRoom.name }
      ]
    };

    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    const world = container.querySelector<HTMLElement>(".rooms-canvas-world");
    const paths = Array.from(container.querySelectorAll<SVGPathElement>(".room-card-connector-path"));
    expect(world?.dataset.sceneMapSelection).toBe(sourceRoom.name);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.dataset.connectorFrom).toBe(sourceRoom.name);
    expect(paths[0]?.dataset.connectorTo).toBe(targetRoom.name);
    expect(container.querySelector(`.room-stage-card-frame.selected .room-stage-card`)).toHaveAttribute(
      "aria-label",
      `Card da cena ${sourceRoom.name} · visão geral somente leitura`
    );
  });

  it("exposes Importar mapa Tiled in the paint inspector", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Tiled Rooms" });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const onImportTiledMap = vi.fn(async () => undefined);

    render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        {...roomsWorkspaceHandlers({ onImportTiledMap })}
      />
    );

    await focusScene(user, String(presentation.rooms.find((room) => room.isActive)?.name ?? presentation.rooms[0]?.name ?? "overworld"));
    await user.click(screen.getByRole("button", { name: "Pintura - Tiles" }));
    expect(screen.getByRole("button", { name: "Importar mapa Tiled" })).toBeInTheDocument();
  });

  it("uses only free tileset selection instead of fixed brush sizes", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Selecao livre" });

    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusScene(user, String(deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld"));
    await user.click(screen.getByRole("button", { name: "Pintura - Tiles" }));

    expect(screen.getByText("Seleção livre")).toBeInTheDocument();
    expect(screen.getByText("Arraste sobre o tileset para montar o pincel.")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: "Camada" })).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Tamanho do tile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "8x8" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "16x16" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "32x32" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "64x64" })).not.toBeInTheDocument();
  });

  it("turns a dragged tileset rectangle into the brush painted on the room", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Pincel retangular" });
    (project.scenas as Array<Record<string, unknown>>)[0]!.backgroundAssetName = "tiles.png";
    project.assets = [{
      kind: "tileset",
      metadata: {
        bundledDefaultAsset: "isometric-sandbox-tiles",
        tileHeight: 8,
        tileWidth: 8
      },
      name: "tiles.png"
    }];
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusScene(user, String(deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld"));
    await user.click(screen.getByRole("button", { name: "Pintura - Tiles" }));
    const tileset = container.querySelector<HTMLImageElement>(".room-paint-tileset-preview img");
    expect(tileset).not.toBeNull();
    Object.defineProperties(tileset!, {
      naturalHeight: { configurable: true, value: 32 },
      naturalWidth: { configurable: true, value: 32 }
    });
    tileset!.getBoundingClientRect = () => ({
      bottom: 32,
      height: 32,
      left: 0,
      right: 32,
      toJSON: () => ({}),
      top: 0,
      width: 32,
      x: 0,
      y: 0
    });
    tileset!.setPointerCapture = vi.fn();
    tileset!.hasPointerCapture = vi.fn(() => true);
    tileset!.releasePointerCapture = vi.fn();
    fireEvent.load(tileset!);

    fireEvent.pointerDown(tileset!, { buttons: 1, clientX: 1, clientY: 1, pointerId: 1 });
    fireEvent.pointerMove(tileset!, { buttons: 1, clientX: 9, clientY: 9, pointerId: 1 });
    fireEvent.pointerUp(tileset!, { buttons: 0, clientX: 9, clientY: 9, pointerId: 1 });

    expect(screen.getByText(/Pincel 2×2/)).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("gridcell", { name: "Pintar tile 1" }), { buttons: 1, pointerId: 2 });
    expect(handlers.onApplyTileBrush).toHaveBeenCalledWith("room-1", expect.objectContaining({
      cellIndex: 0,
      stamp: { height: 2, tileIDs: [1, 2, 5, 6], width: 2 },
      tileID: 1,
      tool: "brush"
    }), expect.any(String));
  });

  it("keeps primary editor tools in the left rail while the top toolbar stays contextual", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Toolbar Rooms" });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const { container } = render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    const toolRail = container.querySelector(".rooms-canvas-stage > .room-editor-tool-rail");

    expect(toolRail).not.toBeNull();
    expect(toolRail?.querySelector(".rooms-canvas-zoom")).not.toBeNull();
    expect(container.querySelector(".rooms-editor-secondary-toolbar")).toBeNull();
    expect(toolRail).toHaveAttribute("data-editor-mode", "project-overview");
    expect(toolRail?.querySelector("button[aria-label='Pintura - Tiles']")).toBeNull();

    await focusScene(user, String(presentation.rooms.find((room) => room.isActive)?.name ?? presentation.rooms[0]?.name ?? "overworld"));
    const focusToolRail = container.querySelector(".rooms-canvas-stage > .room-editor-tool-rail");
    expect(focusToolRail).toHaveAttribute("data-editor-mode", "scene-editor");
    expect(focusToolRail?.querySelector(".room-editor-tool-rail-stack.is-scene-focus")).not.toBeNull();
    expect(focusToolRail?.querySelector(".room-editor-tool-rail-divider")).toBeNull();
    expect(container.querySelector(".room-scene-navigation .room-scene-navigation-zoom")).toBeInTheDocument();
    expect(focusToolRail?.querySelector("button[aria-label='Voltar à visão geral']")).toBeNull();
    const paintButton = focusToolRail?.querySelector<HTMLButtonElement>("button[aria-label='Pintura - Tiles']");
    expect(paintButton).not.toBeNull();
    await user.click(paintButton!);

    const topToolbar = container.querySelector(".rooms-editor-secondary-toolbar");
    expect(topToolbar).not.toBeNull();
    expect(topToolbar?.querySelector(".rooms-canvas-zoom")).toBeNull();
    expect(topToolbar?.querySelector(".room-editor-tool-rail")).toBeNull();
    expect(topToolbar?.querySelector(".rooms-editor-primary-tools")).toBeNull();
    expect(topToolbar?.querySelector("button[aria-label='Voltar à visão geral']")).not.toBeNull();
    expect(topToolbar?.querySelector(".room-paint-floating-toolbar")).not.toBeNull();
    expect(topToolbar?.querySelector(".room-paint-floating-toolbar")).toBeVisible();
    const paintMode = within(topToolbar as HTMLElement).getByRole("combobox", { name: "Modo" });
    await user.selectOptions(paintMode, "fill");
    expect(paintMode).toHaveValue("fill");
    expect(topToolbar?.querySelector(".room-canvas-layer-toolbar")).toBeNull();
    const dock = container.querySelector(".room-scene-navigation");
    expect(dock?.querySelector(".room-canvas-layer-toolbar")).toBeInTheDocument();
    expect(dock).toHaveAttribute("aria-label", "Camadas e navegação");
    const layers = dock!.querySelector("details")!;
    expect(layers).not.toHaveAttribute("open");
    await user.click(within(dock as HTMLElement).getByText("Camadas"));
    expect(layers).toHaveAttribute("open");
    await user.keyboard("{Escape}");
    expect(layers).not.toHaveAttribute("open");
    expect(layers.querySelector("summary")).toHaveFocus();

    await user.click(within(focusToolRail as HTMLElement).getByRole("button", { name: /^HUD -/ }));
    const hudToolbar = screen.getByRole("toolbar", { name: "Ferramentas da HUD" });
    expect(hudToolbar).toBeVisible();
    expect(within(hudToolbar).getByRole("button", { name: "+ Texto" })).toBeVisible();
    expect(within(hudToolbar).getByRole("button", { name: "+ Ícone" })).toBeVisible();
    expect(within(hudToolbar).getByRole("button", { name: "+ Barra" })).toBeVisible();
    expect(within(hudToolbar).getByRole("button", { name: "+ Moldura" })).toBeVisible();
    const gridButton = within(hudToolbar).getByRole("button", { name: "Grade" });
    const gridWasVisible = gridButton.getAttribute("aria-pressed");
    await user.click(gridButton);
    expect(gridButton).toHaveAttribute("aria-pressed", gridWasVisible === "true" ? "false" : "true");

  });

  it("compacta conectores e chrome dos cards conforme o zoom do mapa de cenas", () => {
    const project = createRoomInProject(createBlankProjectData({ name: "Zoom visual do canvas" }), {
      anchorRoomID: "room-1",
      height: 18,
      id: "room-compact-target",
      name: "compact_target",
      sceneType: "topdown",
      width: 20
    });
    const [sourceRoom, targetRoom] = deriveRoomsWorkspacePresentation(project).rooms;
    project.editorState = {
      ...(project.editorState ?? {}),
      sceneMapZoom: 1,
      scenaConnections: [{ eventName: "change_scene", from: sourceRoom.name, to: targetRoom.name }]
    };
    const handlers = roomsWorkspaceHandlers();
    const { container, rerender } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    const compactStage = container.querySelector<HTMLElement>(".rooms-canvas-stage")!;
    const compactWorld = container.querySelector<HTMLElement>(".rooms-canvas-world")!;
    const compactCard = container.querySelector<HTMLElement>(".room-stage-card-frame.selected .room-stage-card")!;
    const compactMarker = container.querySelector<SVGMarkerElement>("#room-card-connector-arrow")!;
    const compactActionSize = Number.parseFloat(compactWorld.style.getPropertyValue("--room-map-action-size"));
    const compactStroke = Number.parseFloat(compactWorld.style.getPropertyValue("--room-map-connector-stroke"));
    const compactMarkerWidth = Number.parseFloat(compactMarker.getAttribute("markerWidth") ?? "");

    expect(compactStage.dataset.cardDensity).toBe("compact");
    expect(Number.parseFloat(compactCard.style.height)).toBe(231.71);
    expect(compactMarker.getAttribute("markerUnits")).toBe("userSpaceOnUse");
    expect(compactActionSize).toBeLessThanOrEqual(21);
    expect(compactStroke).toBeGreaterThan(0);
    expect(compactMarkerWidth).toBeGreaterThan(0);

    project.editorState = {
      ...(project.editorState as Record<string, unknown>),
      sceneMapZoom: 2
    };
    rerender(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    const comfortableStage = container.querySelector<HTMLElement>(".rooms-canvas-stage")!;
    const comfortableWorld = container.querySelector<HTMLElement>(".rooms-canvas-world")!;
    const comfortableMarker = container.querySelector<SVGMarkerElement>("#room-card-connector-arrow")!;
    const comfortableStroke = Number.parseFloat(comfortableWorld.style.getPropertyValue("--room-map-connector-stroke"));
    const comfortableMarkerWidth = Number.parseFloat(comfortableMarker.getAttribute("markerWidth") ?? "");

    expect(comfortableStage.dataset.cardDensity).toBe("comfortable");
    expect(comfortableStroke).toBeGreaterThan(compactStroke);
    expect(comfortableMarkerWidth).toBeGreaterThan(compactMarkerWidth);
  });

  it("anchors button and wheel zoom at the pointer after the new map geometry is rendered", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Pointer zoom" });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const handlers = roomsWorkspaceHandlers();
    const { container, rerender } = render(<RoomsWorkspace presentation={presentation} projectData={project} sceneMapZoom={1} {...handlers} />);
    const scroll = container.querySelector<HTMLDivElement>(".rooms-canvas-world-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 600 }, clientHeight: { value: 400 } });
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({ left: 100, top: 40, width: 600, height: 400 } as DOMRect);
    scroll.scrollLeft = 400; scroll.scrollTop = 200;
    fireEvent.pointerMove(scroll, { clientX: 280, clientY: 150 });
    await user.click(screen.getByRole("button", { name: "Aumentar zoom do canvas" }));
    expect(handlers.onUpdateSceneMapZoom).toHaveBeenLastCalledWith(1.25);
    expect(scroll.scrollLeft).toBe(400);
    rerender(<RoomsWorkspace presentation={presentation} projectData={project} sceneMapZoom={1.25} {...handlers} />);
    expect(scroll.scrollLeft).toBe(545);
    expect(scroll.scrollTop).toBe(278);

    fireEvent(scroll, Object.assign(new Event("wheel", { bubbles: true, cancelable: true }), {
      ctrlKey: true, deltaY: 120, clientX: 280, clientY: 150
    }));
    const zoom = 1.25 / 1.1;
    expect(handlers.onUpdateSceneMapZoom).toHaveBeenLastCalledWith(zoom);
    rerender(<RoomsWorkspace presentation={presentation} projectData={project} sceneMapZoom={zoom} {...handlers} />);
    expect(Math.abs((scroll.scrollLeft + 180) / zoom - 580)).toBeLessThan(1);
    expect(Math.abs((scroll.scrollTop + 110) / zoom - 310)).toBeLessThan(1);
  });

  it("mantém câmera restrita e libera colisão e triggers para diálogos", async () => {
    const user = userEvent.setup();
    const project = setActiveRoomInProject(createRoomInProject(createBlankProjectData({ name: "Cutscene tools" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-cutscene-tools",
      name: "intro",
      sceneType: "cutscene",
      width: 8
    }), "room-cutscene-tools");
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);

    const collisionButton = screen.getByRole("button", { name: "Colisao - Solidos" });
    const triggerButton = screen.getByRole("button", { name: "Trigger - Eventos" });
    expect(collisionButton).not.toBeDisabled();
    expect(triggerButton).not.toBeDisabled();
    expect(screen.queryByRole("region", { name: "Recursos indisponíveis nesta cena" })).not.toBeInTheDocument();
    expect(container.querySelector(".room-editor-tool-rail button[aria-label^='Colisao - indisponível']")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Eventos" }));
    expect(screen.queryByRole("region", { name: "Recursos indisponíveis nesta cena" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Cena" }));
    expect(screen.queryByRole("region", { name: "Recursos indisponíveis nesta cena" })).not.toBeInTheDocument();
  });

  it("oferece criação explícita de gatilho no estado vazio do inspetor", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Trigger inspector" });
    const onCreateTrigger = vi.fn(() => "trigger-created");
    const handlers = roomsWorkspaceHandlers({ onCreateTrigger });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Trigger - Eventos']")!);
    expect(screen.getByText("Nenhum gatilho vinculado a esta cena.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Criar gatilho" }));

    expect(onCreateTrigger).toHaveBeenCalledWith(expect.objectContaining({
      height: 2,
      roomID: "room-1",
      width: 2
    }));
  });

  it("desenha um novo gatilho por arraste mesmo quando outro gatilho está selecionado", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Trigger drag" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    project.triggers = [{
      id: "trigger-existing",
      name: "Existente",
      roomName: String(room.name),
      x: 1,
      y: 1,
      width: 1,
      height: 1
    }];
    const onCreateTrigger = vi.fn(() => "trigger-created");
    const handlers = roomsWorkspaceHandlers({ onCreateTrigger });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    await user.click(screen.getByRole("button", { name: "Trigger - Eventos" }));

    const canvas = container.querySelector<HTMLElement>(".room-focused-scene-editor-frame .room-stage-card-canvas");
    const cells = Array.from(canvas?.querySelectorAll<HTMLButtonElement>(".room-stage-cell") ?? []);
    const width = Number(room.width ?? 1);
    const startCell = cells[4 + 4 * width]!;
    const endCell = cells[6 + 5 * width]!;
    fireEvent.pointerDown(startCell, { button: 0, buttons: 1, pointerId: 41 });
    fireEvent.pointerEnter(endCell, { buttons: 1, pointerId: 41 });
    fireEvent.pointerUp(endCell, { button: 0, buttons: 0, pointerId: 41 });

    expect(onCreateTrigger).toHaveBeenCalledWith({
      height: 2,
      roomID: "room-1",
      width: 3,
      x: 4,
      y: 4
    }, expect.any(String));
    expect(handlers.onResizeRoomTrigger).not.toHaveBeenCalled();
  });

  it("preenche uma área retangular com o tipo de colisão ativo", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Rectangle collision" });
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Colisao - Solidos']")!);
    await user.click(screen.getByRole("button", { name: "Retângulo Área" }));

    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(".room-stage-cell"));
    fireEvent.pointerDown(cells[1]!, { buttons: 1, pointerId: 11 });
    fireEvent.pointerEnter(cells[22]!, { buttons: 1, pointerId: 11 });
    fireEvent.pointerUp(cells[22]!, { buttons: 0, pointerId: 11 });

    expect(handlers.onUpdateRoomFields).toHaveBeenCalledWith("room-1", expect.objectContaining({
      collisionTypes: expect.arrayContaining(["solid"])
    }), expect.any(String));
  });

  it("remove a prévia de retângulo ao sair do modo de colisão", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Collision preview cleanup" });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Colisao - Solidos']"
    )!);
    await user.click(screen.getByRole("button", { name: "Retângulo Área" }));

    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(".room-stage-cell"));
    fireEvent.pointerDown(cells[1]!, { button: 0, buttons: 1, pointerId: 91 });
    expect(container.querySelectorAll(".room-stage-cell.collision-rectangle-preview")).not.toHaveLength(0);

    await user.click(container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Selecionar - Mover']"
    )!);
    expect(container.querySelectorAll(".room-stage-cell.collision-rectangle-preview")).toHaveLength(0);
  });

  it("remove a prévia de gatilho ao sair do modo de gatilhos", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Trigger preview cleanup" });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Trigger - Eventos']"
    )!);

    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(".room-stage-cell"));
    fireEvent.pointerDown(cells[1]!, { button: 0, buttons: 1, pointerId: 92 });
    expect(container.querySelectorAll(".room-stage-cell.trigger-placement-preview")).not.toHaveLength(0);

    await user.click(container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Selecionar - Mover']"
    )!);
    expect(container.querySelectorAll(".room-stage-cell.trigger-placement-preview")).toHaveLength(0);
  });

  it("mantém colisão e gatilho por arraste disponíveis no Dungeon Crawler", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Dungeon tools" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.sceneType = "dungeonCrawler";
    scene.width = 30;
    scene.height = 20;
    scene.collisionTypes = Array.from({ length: 600 }, () => "free");
    const onCreateTrigger = vi.fn(() => "trigger-created");
    const handlers = roomsWorkspaceHandlers({ onCreateTrigger });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    const collisionButton = container.querySelector<HTMLButtonElement>(
      ".room-editor-tool-rail button[aria-label='Colisao - Solidos']"
    );
    expect(collisionButton).not.toBeNull();
    await user.click(collisionButton!);
    await user.click(screen.getByRole("button", { name: "Retângulo Área" }));

    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(
      ".room-focused-scene-editor-frame .room-stage-cell"
    ));
    fireEvent.pointerDown(cells[1]!, { button: 0, buttons: 1, pointerId: 51 });
    fireEvent.pointerEnter(cells[32]!, { buttons: 1, pointerId: 51 });
    fireEvent.pointerUp(cells[32]!, { button: 0, buttons: 0, pointerId: 51 });

    expect(handlers.onUpdateRoomFields).toHaveBeenCalledWith("room-1", expect.objectContaining({
      collisionTypes: expect.arrayContaining(["solid"])
    }), expect.any(String));

    await user.click(screen.getByRole("button", { name: "Trigger - Eventos" }));
    fireEvent.pointerDown(cells[124]!, { button: 0, buttons: 1, pointerId: 52 });
    fireEvent.pointerEnter(cells[156]!, { buttons: 1, pointerId: 52 });
    fireEvent.pointerUp(cells[156]!, { button: 0, buttons: 0, pointerId: 52 });

    expect(onCreateTrigger).toHaveBeenCalledWith({
      height: 2,
      roomID: "room-1",
      width: 3,
      x: 4,
      y: 4
    }, expect.any(String));
  });

  it("permite pintar colisão e criar gatilho em uma cena Luta", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Luta tools" });
    const scene = (project.scenas as Array<Record<string, unknown>>)[0]!;
    scene.sceneType = "luta";
    scene.runtime = { type: "luta", config: {} };
    scene.width = 8;
    scene.height = 6;
    scene.collisionTypes = Array.from({ length: 48 }, () => "free");
    const onCreateTrigger = vi.fn(() => "trigger-created");
    const handlers = roomsWorkspaceHandlers({ onCreateTrigger });
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await focusActiveScene(user);
    const collisionButton = screen.getByRole("button", { name: "Colisao - Solidos" });
    const triggerButton = screen.getByRole("button", { name: "Trigger - Eventos" });
    expect(collisionButton).not.toBeDisabled();
    expect(triggerButton).not.toBeDisabled();

    await user.click(collisionButton);
    await user.click(screen.getByRole("button", { name: "Retângulo Área" }));
    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(".room-stage-cell"));
    fireEvent.pointerDown(cells[1]!, { buttons: 1, pointerId: 61 });
    fireEvent.pointerEnter(cells[10]!, { buttons: 1, pointerId: 61 });
    fireEvent.pointerUp(cells[10]!, { buttons: 0, pointerId: 61 });

    expect(handlers.onUpdateRoomFields).toHaveBeenCalledWith("room-1", expect.objectContaining({
      collisionTypes: expect.arrayContaining(["solid"])
    }), expect.any(String));

    await user.click(triggerButton);
    fireEvent.pointerDown(cells[9]!, { buttons: 1, pointerId: 62 });
    fireEvent.pointerEnter(cells[18]!, { buttons: 1, pointerId: 62 });
    fireEvent.pointerUp(cells[18]!, { buttons: 0, pointerId: 62 });
    expect(onCreateTrigger).toHaveBeenCalledWith(expect.objectContaining({ roomID: "room-1" }), expect.any(String));
  });

  it("monta a timeline de vitória no estado correto da batalha", async () => {
    const user = userEvent.setup();
    const withRoom = createRoomInProject(createBlankProjectData({ name: "Battle Results" }), {
      anchorRoomID: "room-1", height: 8, id: "room-battle", name: "arena", sceneType: "battleRpg", width: 8
    });
    const project = setActiveRoomInProject({
      ...withRoom,
      events: [{ id: "event-hit", name: "battle_hit", category: "Cena", steps: [{ command: "wait 1" }] }],
      scenas: (withRoom.scenas as Array<Record<string, unknown>>).map((scene) => scene.id === "room-battle"
        ? { ...scene, eventBindings: { onVictory: "battle_hit" } }
        : scene)
    }, "room-battle");
    const handlers = roomsWorkspaceHandlers({
      renderEventInspector: (eventName: string, triggerLabel: string) => (
        <section aria-label={`Fluxo de blocos ${triggerLabel}`}>
          <strong>{eventName}</strong>
        </section>
      )
    });
    const { container } = render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(project)} projectData={project} {...handlers} />);
    await openSceneInspector(user);

    await user.click(screen.getByRole("tab", { name: /^Eventos$/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Estado do evento" }), "onVictory");
    expect(screen.getByRole("region", { name: "Fluxo de blocos Ao vencer" })).toHaveTextContent("battle_hit");
    expect(screen.queryByRole("tab", { name: "Ao acertar Player" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Evento Ao vencer")).not.toBeInTheDocument();
    expect(container.querySelector(".room-event-profile-events")).toBeNull();
  });

  it("prepares the actor tool to create a new actor instead of selecting Player", async () => {
    const user = userEvent.setup();
    const blankProject = createBlankProjectData({ name: "Focused actor" });
    const roomName = deriveRoomsWorkspacePresentation(blankProject).rooms[0]?.name ?? "overworld";
    const project = {
      ...blankProject,
      actors: [{ id: "actor-player", name: "Player", roomName, x: 2, y: 3 }]
    };
    const handlers = roomsWorkspaceHandlers();
    const props = {
      ...handlers,
      focusedTargetName: roomName,
      focusRequestID: 1,
      projectData: project
    };
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        {...props}
      />
    );

    await focusActiveScene(user);
    const actorButton = container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Ator - OBJ']");
    expect(actorButton).not.toBeNull();
    await user.click(actorButton!);
    expect(screen.queryByText("Atributos do ator")).not.toBeInTheDocument();
  });

  it("keeps the selected entity when switching to the selector move tool", async () => {
    const user = userEvent.setup();
    const blankProject = createBlankProjectData({ name: "Move selector" });
    const roomName = deriveRoomsWorkspacePresentation(blankProject).rooms[0]?.name ?? "overworld";
    const project = {
      ...blankProject,
      actors: [{ id: "actor-player", name: "Player", roomName, x: 2, y: 3 }]
    };
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    await user.click(screen.getByRole("tab", { name: "Pré-fabricados" }));
    const playerRow = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Player") && button.textContent?.includes(roomName));
    expect(playerRow).not.toBeNull();
    await user.click(playerRow!);
    expect(screen.getByLabelText("X")).toHaveValue(2);
    expect(screen.getByLabelText("Y")).toHaveValue(3);

    const selectButton = container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Selecionar - Mover']");
    expect(selectButton).not.toBeNull();
    await user.click(selectButton!);

    expect(screen.getByLabelText("X")).toHaveValue(2);
    expect(screen.getByLabelText("Y")).toHaveValue(3);
  });

  it("explica que comportamentos em lote não aceitam uma seleção mista", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Grupo misto" });
    const room = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    project.triggers = [{
      id: "trigger-gate",
      name: "Gate",
      roomName: room.name,
      width: 1,
      height: 1,
      x: 5,
      y: 5
    }];
    const presentation = deriveRoomsWorkspacePresentation(project);
    const player = presentation.entities.find((entity) => entity.kind === "actor" && entity.name === "Player")!;
    const playerFootprint = roomEntitySelectionFootprint(player, room.sceneType);
    const { container } = render(
      <RoomsWorkspace
        presentation={presentation}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await focusActiveScene(user);
    await user.click(container.querySelector<HTMLButtonElement>(".room-editor-tool-rail button[aria-label='Selecionar - Mover']")!);
    const cells = container.querySelectorAll<HTMLButtonElement>(".rooms-canvas-stage .room-stage-cell");
    fireEvent.pointerDown(cells[playerFootprint.x + playerFootprint.y * room.width]!, { button: 0, pointerId: 31 });
    fireEvent.pointerUp(cells[playerFootprint.x + playerFootprint.y * room.width]!, { button: 0, pointerId: 31 });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Player" })).toBeInTheDocument());
    fireEvent.pointerDown(cells[5 + 5 * room.width]!, { button: 0, ctrlKey: true, pointerId: 32 });
    fireEvent.pointerUp(cells[5 + 5 * room.width]!, { button: 0, ctrlKey: true, pointerId: 32 });

    await waitFor(() => expect(screen.getByRole("heading", { name: "Grupo misto de 2 entidades" })).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Eventos" }));
    expect(screen.getByRole("region", { name: "Comportamento em grupo indisponível" })).toHaveTextContent(
      "Selecione apenas atores ou apenas triggers"
    );
    expect(screen.queryByRole("button", { name: /Adicionar comportamento em grupo/ })).not.toBeInTheDocument();
  });

  it("prioriza Objeto e Eventos e mantém Sprite e Movimento em Mais", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Actor animation set" });
    const roomName = deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld";
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Pré-fabricados" }));
    const playerRow = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Player") && button.textContent?.includes(roomName));
    expect(playerRow).not.toBeNull();
    await user.click(playerRow!);
    expect(screen.getByRole("tab", { name: "Eventos" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Ator" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sprite" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Objeto" })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByRole("spinbutton", { name: "X" }), { target: { value: "7" } });
    expect(handlers.onUpdateRoomEntity).toHaveBeenCalledWith("actor", "actor-player", { x: 7 });
    handlers.onUpdateRoomEntity.mockClear();
    await user.click(screen.getByLabelText("Mais seções do inspetor"));
    expect(screen.getByRole("tab", { name: "Movimento" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sprite e animação" })).toBeInTheDocument();
    expect(handlers.onUpdateRoomEntity).not.toHaveBeenCalled();
  });

  it("keeps the actor collision group in Events and removes duplicate static controls", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Actor collision" });
    const roomName = deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld";
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...handlers}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Pré-fabricados" }));
    const playerRow = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Player") && button.textContent?.includes(roomName));
    expect(playerRow).not.toBeNull();
    await user.click(playerRow!);

    await user.click(screen.getByRole("tab", { name: "Eventos" }));
    await user.click(screen.getByRole("radio", { name: "3" }));

    expect(handlers.onUpdateRoomEntity).toHaveBeenCalledWith("actor", "actor-player", { collisionGroup: 3 });
    expect(screen.queryByLabelText("Máscara")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Prioridade de push")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pode ser empurrado")).not.toBeInTheDocument();
  });

  it("abre posição e sprite do ator e mantém detalhes técnicos recolhidos", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Actor sections" });
    const roomName = deriveRoomsWorkspacePresentation(project).rooms[0]?.name ?? "overworld";
    project.actors = [{
      battle: {
        abilities: ["attack"],
        attack: 7,
        defense: 2,
        maxHp: 24,
        side: "none",
        speed: 5,
        spriteScale: 1
      },
      id: "actor-sections",
      name: "Nara",
      roomName,
      x: 2,
      y: 3
    }];
    const { container } = render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...roomsWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Pré-fabricados" }));
    const actorRow = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Nara") && button.textContent?.includes(roomName));
    expect(actorRow).not.toBeNull();
    await user.click(actorRow!);

    expect(screen.getByRole("region", { name: "Batalha RPG" }).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("region", { name: "Colisão ator-ator" }).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("tab", { name: "Eventos" })).toBeInTheDocument();
  });

  it("prioriza a cena solicitada pela revisão sobre a cena ativa e a organização automática", () => {
    const initial = createRoomInProject(createBlankProjectData({ name: "Destino da revisão" }), {
      anchorRoomID: "room-1", id: "room-review", name: "review_target", sceneType: "platformer", width: 30, height: 20
    });
    const firstID = deriveRoomsWorkspacePresentation(initial).rooms.find(room => room.id !== "room-review")!.id;
    const project = setActiveRoomInProject(initial, firstID);
    const onOrganizeSceneMap = vi.fn();
    const handlers = roomsWorkspaceHandlers();
    const { container } = render(<RoomsWorkspace
      presentation={{ ...deriveRoomsWorkspacePresentation(project), sceneMapPositions: {} }}
      projectData={project} {...handlers} onOrganizeSceneMap={onOrganizeSceneMap}
      focusedTargetName="review_target" focusRequestID={456} focusInspectorTab="hud" />);
    expect(container.querySelector(".rooms-inspector-header")?.textContent).toContain("review_target");
    expect(handlers.onSetActiveRoom).toHaveBeenCalledWith("room-review", "review_target");
    expect(onOrganizeSceneMap).not.toHaveBeenCalled();
  });

  it("abre a revisão de colisão na cena solicitada sem pintar nem alterar campos", () => {
    const project = createBlankProjectData({ name: "Revisão de colisão" });
    const presentation = deriveRoomsWorkspacePresentation(project);
    const handlers = roomsWorkspaceHandlers();
    render(<RoomsWorkspace presentation={presentation} projectData={project} {...handlers}
      focusedTargetName={presentation.rooms[0].name} focusRequestID={123} focusInspectorTab="collision" />);
    expect(screen.getByRole("tab", { name: "Colisão" })).toBeInTheDocument();
    expect(handlers.onSetCollisionType).not.toHaveBeenCalled();
    expect(handlers.onUpdateRoomFields).not.toHaveBeenCalled();
    expect(handlers.onApplyCollisionFill).not.toHaveBeenCalled();
  });

  it("abre a aba Eventos do inspetor quando focusInspectorTab === 'events'", () => {
    const blankProject = createBlankProjectData({ name: "Focar aba Eventos" });
    const handlers = roomsWorkspaceHandlers();
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(blankProject)}
        projectData={blankProject}
        {...handlers}
        focusInspectorTab="events"
      />
    );
    expect(screen.getByRole("tab", { name: "Eventos" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado do evento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar script em Ao iniciar" })).toBeInTheDocument();
  });

  it("encaminha modelos de script para o seletor da cena", () => {
    const blankProject = createBlankProjectData({ name: "Receitas da cena" });
    render(
      <RoomsWorkspace
        commandSuggestions={[greetingRecipe]}
        focusInspectorTab="events"
        presentation={deriveRoomsWorkspacePresentation(blankProject)}
        projectData={blankProject}
        {...roomsWorkspaceHandlers()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Começar script em Ao iniciar" }));

    expect(screen.getByRole("dialog", { name: "Escolher evento para Ao iniciar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Modelos de script" }));
    expect(screen.getByRole("button", { name: "Cumprimentar o jogador" })).toBeInTheDocument();
  });
});
