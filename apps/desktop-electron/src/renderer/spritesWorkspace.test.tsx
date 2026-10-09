/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlankProjectData } from "../shared/newProject.js";
import { deriveSpritesWorkspacePresentation } from "../shared/spritesWorkspace.js";
import { SpritesWorkspace } from "./spritesWorkspace.js";

function spritesWorkspaceHandlers(overrides: Record<string, unknown> = {}) {
  return {
    onCreateAnimation: vi.fn(),
    onImportSpriteSheets: vi.fn(async () => undefined),
    onUpdateAnimationFields: vi.fn(),
    onUpdateAnimationState: vi.fn(),
    onUpdateMetaspriteFrame: vi.fn(),
    onAddMetaspriteTile: vi.fn(),
    onRemoveMetaspriteTile: vi.fn(),
    onUpdateMetaspriteTile: vi.fn(),
    onMoveMetaspriteTiles: vi.fn(),
    onToggleMetaspriteTilesFlip: vi.fn(),
    onReorderMetaspriteTiles: vi.fn(),
    onRemoveMetaspriteTiles: vi.fn(),
    onFitAnimationHitbox: vi.fn(),
    onCopyAnimationGeometry: vi.fn(),
    onGenerateSpriteFromReference: vi.fn(),
    onRenameAnimation: vi.fn(),
    onDuplicateAnimation: vi.fn(),
    onRemoveAnimation: vi.fn(),
    onRenameSpriteSheet: vi.fn(),
    onDuplicateSpriteSheet: vi.fn(),
    onRemoveSpriteSheet: vi.fn(),
    ...overrides
  };
}

describe("SpritesWorkspace React smoke", () => {
  afterEach(cleanup);

  it("oferece 8bpp como escolha avançada da folha sem alterar a imagem", async () => {
    const user = userEvent.setup(), handlers = spritesWorkspaceHandlers();
    render(<SpritesWorkspace presentation={deriveSpritesWorkspacePresentation(createBlankProjectData({ name: "Cores" }))} {...handlers} />);
    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByText("Folha de origem"));
    const selector = screen.getByLabelText("Formato de cores da folha");
    expect(selector).toHaveValue("4bpp");
    await user.selectOptions(selector, "8bpp");
    expect(handlers.onUpdateAnimationFields).toHaveBeenCalledWith(expect.any(String), { colorMode: "8bpp" });
    expect(screen.getByText(/Aplica-se a todas as animações da folha/)).toBeInTheDocument();
  });

  it("navega entre estados e direções sem alterar as animações do projeto", async () => {
    const user = userEvent.setup();
    const handlers = spritesWorkspaceHandlers();
    const project = createBlankProjectData({ name: "Navegação por estado" });
    const before = JSON.stringify(project);
    const { container } = render(<SpritesWorkspace presentation={deriveSpritesWorkspacePresentation(project)} {...handlers} />);
    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByRole("button", { name: "Selecionar animação Caminhar" }));
    await user.click(screen.getByRole("button", { name: "Direção Direita" }));
    expect(screen.getByRole("button", { name: "Direção Direita" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Selecionar animação Parado" }));
    expect(screen.getByRole("button", { name: "Direção Direita" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".sprite-playback-counter")).toHaveTextContent("1 / 1");
    expect(handlers.onUpdateAnimationFields).not.toHaveBeenCalled();
    expect(handlers.onUpdateAnimationState).not.toHaveBeenCalled();
    expect(JSON.stringify(project)).toBe(before);
  });

  it("mantém a edição dos quadros na faixa compacta e bloqueia remover o único quadro", async () => {
    const user = userEvent.setup();
    const onUpdateAnimationFields = vi.fn();
    render(<SpritesWorkspace presentation={deriveSpritesWorkspacePresentation(createBlankProjectData({ name: "Quadros" }))} {...spritesWorkspaceHandlers({ onUpdateAnimationFields })} />);
    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    expect(screen.getByRole("button", { name: "Remover ultimo quadro" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Adicionar quadro" }));
    expect(onUpdateAnimationFields).toHaveBeenCalledWith(expect.any(String), { frameCount: 2 });
  });

  it("reproduz a velocidade configurada acima de doze FPS", () => {
    vi.useFakeTimers();
    try {
      const presentation = deriveSpritesWorkspacePresentation(createBlankProjectData({ name: "Preview 60 FPS" }));
      for (const animation of presentation.animationsBySheet["player_topdown_4dir.png"]) animation.fps = 60;
      const { container } = render(<SpritesWorkspace presentation={presentation} {...spritesWorkspaceHandlers()} />);
      fireEvent.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
      fireEvent.click(screen.getByRole("button", { name: "Selecionar animação Caminhar" }));
      fireEvent.click(screen.getByRole("button", { name: "Reproduzir animação" }));
      act(() => { vi.advanceTimersByTime(17); });
      expect(container.querySelector(".sprite-playback-counter")).toHaveTextContent("2 / 2");
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("preserva o zoom manual durante a reprodução de quadros do mesmo tamanho", () => {
    vi.useFakeTimers();
    const resizeCallbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    try {
      const presentation = deriveSpritesWorkspacePresentation(createBlankProjectData({ name: "Zoom estável" }));
      for (const animation of presentation.animationsBySheet["player_topdown_4dir.png"]) animation.fps = 10;
      const { container } = render(<SpritesWorkspace presentation={presentation} {...spritesWorkspaceHandlers()} />);
      fireEvent.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
      fireEvent.click(screen.getByRole("button", { name: "Selecionar animação Caminhar" }));
      act(() => resizeCallbacks[0]([{ contentRect: { width: 600, height: 500 } } as ResizeObserverEntry], {} as ResizeObserver));
      fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom do canvas de sprite" }));
      const zoom = container.querySelector(".sprite-canvas-view-strip > span")?.textContent;
      fireEvent.click(screen.getByRole("button", { name: "Reproduzir animação" }));
      act(() => { vi.advanceTimersByTime(100); });
      expect(container.querySelector(".sprite-playback-counter")).toHaveTextContent("2 / 2");
      expect(container.querySelector(".sprite-canvas-view-strip > span")).toHaveTextContent(zoom!);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("seleciona o quadro novo quando a atualização do projeto chega depois do clique", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Atualização assíncrona" });
    const handlers = spritesWorkspaceHandlers();
    const { container, rerender } = render(<SpritesWorkspace presentation={deriveSpritesWorkspacePresentation(project)} {...handlers} />);
    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByRole("button", { name: "Selecionar animação Caminhar" }));
    await user.click(screen.getByRole("button", { name: "Adicionar quadro" }));
    const [id, fields] = handlers.onUpdateAnimationFields.mock.calls[0];
    const animation = (project.animations as Array<Record<string, unknown>>).find((candidate) => candidate.id === id)!;
    Object.assign(animation, fields);
    rerender(<SpritesWorkspace presentation={deriveSpritesWorkspacePresentation(project)} {...handlers} />);
    expect(container.querySelector(".sprite-playback-counter")).toHaveTextContent("3 / 3");
  });

  it("espelha a arte do tile sem inverter sua marca de seleção", () => {
    const project = createBlankProjectData({ name: "Flip no canvas" });
    const presentation = deriveSpritesWorkspacePresentation(project);
    const sheet = presentation.spriteSheets[0];
    const animation = presentation.animationsBySheet[sheet.name][0];
    animation.metaspriteFrames[0].tiles[0].flipX = true;
    animation.metaspriteFrames[0].tiles[0].flipY = true;
    const { container } = render(<SpritesWorkspace presentation={presentation} {...spritesWorkspaceHandlers()} />);
    const art = container.querySelector<HTMLElement>(".sprite-metasprite-tile-art");
    expect(art?.style.transform).toBe("scale(-1, -1)");
    expect(art?.parentElement?.style.transform).toBe("");
  });

  it("remove a faixa redundante do modo Animar", () => {
    const project = createBlankProjectData({ name: "Animar sprite" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers()}
      />
    );

    expect(screen.queryByRole("tablist", { name: "Modo do workspace de sprites" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Animar" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas de sprites" })).toBeInTheDocument();
  });

  it("encaminha o botao de adicionar ator para o importador de PNG", async () => {
    const user = userEvent.setup();
    const onImportSpriteSheets = vi.fn(async () => undefined);
    const project = createBlankProjectData({ name: "Adicionar ator" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({ onImportSpriteSheets })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Adicionar ator por PNG" }));

    expect(onImportSpriteSheets).toHaveBeenCalledTimes(1);
  });

  it("abre o menu contextual do ator e da animacao", () => {
    const onRenameSpriteSheet = vi.fn();
    const onDuplicateSpriteSheet = vi.fn();
    const onRemoveSpriteSheet = vi.fn();
    const onRenameAnimation = vi.fn();
    const onDuplicateAnimation = vi.fn();
    const onRemoveAnimation = vi.fn();
    const project = createBlankProjectData({ name: "Menus de sprites" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({
          onDuplicateAnimation,
          onDuplicateSpriteSheet,
          onRemoveAnimation,
          onRemoveSpriteSheet,
          onRenameAnimation,
          onRenameSpriteSheet
        })}
      />
    );

    const sheet = screen.getByRole("button", { name: "player_topdown_4dir.png" });
    fireEvent.contextMenu(sheet, { clientX: 100, clientY: 100 });
    expect(screen.getByRole("menu", { name: "Ações para player_topdown_4dir.png" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(onDuplicateSpriteSheet).toHaveBeenCalledWith(expect.any(String), "player_topdown_4dir.png");

    const animation = screen.getByRole("button", { name: "Selecionar animação Parado" });
    fireEvent.contextMenu(animation, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Renomear" }));
    expect(onRenameAnimation).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/idle_down/));
    expect(onDuplicateAnimation).not.toHaveBeenCalled();
    expect(onRemoveAnimation).not.toHaveBeenCalled();
    expect(onRenameSpriteSheet).not.toHaveBeenCalled();
    expect(onRemoveSpriteSheet).not.toHaveBeenCalled();
  });

  it("cria um pacote de animacao no ator selecionado", async () => {
    const user = userEvent.setup();
    const onCreateAnimation = vi.fn();
    const project = createBlankProjectData({ name: "Pacote de animacao" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({ onCreateAnimation })}
      />
    );

    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByRole("button", { name: "Adicionar pacote de animação" }));

    expect(onCreateAnimation).toHaveBeenCalledWith("player_topdown_4dir.png");
  });

  it("troca o sprite sheet por um seletor pesquisavel com nomes do projeto", async () => {
    const user = userEvent.setup();
    const onUpdateAnimationFields = vi.fn();
    const project = createBlankProjectData({ name: "Referencias de sprite" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({ onUpdateAnimationFields })}
      />
    );

    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByText("Folha de origem"));
    await user.click(screen.getByRole("combobox", { name: "Sheet" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar Sheet" }), "point");
    await user.click(screen.getByRole("option", { name: /actor_point_click\.png/ }));

    expect(onUpdateAnimationFields).toHaveBeenCalledWith(expect.any(String), {
      spriteSheet: "actor_point_click.png"
    });
  });

  it("troca a origem do tile por um sheet do projeto", async () => {
    const user = userEvent.setup();
    const onUpdateMetaspriteTile = vi.fn();
    const project = createBlankProjectData({ name: "Origem referencial" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({ onUpdateMetaspriteTile })}
      />
    );

    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByRole("tab", { name: "Tile" }));
    await user.click(screen.getByRole("combobox", { name: "Source" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar Source" }), "point");
    await user.click(screen.getByRole("option", { name: /actor_point_click\.png/ }));

    expect(onUpdateMetaspriteTile).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      fields: { sourceSheet: "actor_point_click.png" }
    }));
  });

  it("permite apagar X e digitar -16 antes de confirmar", async () => {
    const user = userEvent.setup();
    const onUpdateMetaspriteTile = vi.fn();
    const project = createBlankProjectData({ name: "Offset negativo" });
    render(<SpritesWorkspace presentation={deriveSpritesWorkspacePresentation(project)} {...spritesWorkspaceHandlers({ onUpdateMetaspriteTile })} />);
    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByRole("tab", { name: "Tile" }));
    const input = screen.getByRole("spinbutton", { name: "X" });
    await user.clear(input);
    expect(input).toHaveValue("");
    await user.type(input, "-16");
    expect(input).toHaveValue("-16");
    expect(onUpdateMetaspriteTile).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onUpdateMetaspriteTile).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ fields: { x: -16 } }));
  });

  it("importa um sprite diretamente pelo seletor de sheet", async () => {
    const user = userEvent.setup();
    const onImportSpriteSheets = vi.fn(async () => undefined);
    const project = createBlankProjectData({ name: "Importar pelo seletor" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({ onImportSpriteSheets })}
      />
    );

    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByText("Folha de origem"));
    await user.click(screen.getByRole("combobox", { name: "Sheet" }));
    await user.click(screen.getByRole("button", { name: "Importar sprite sheet" }));

    expect(onImportSpriteSheets).toHaveBeenCalledTimes(1);
  });

  it("organiza o inspetor em abas sem perder a animacao selecionada", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Inspetor em abas" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers()}
      />
    );

    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));

    expect(screen.getByRole("tablist", { name: "Seções do inspetor de sprite" })).toBeInTheDocument();
    expect(screen.queryByText(/frame\(s\)$/)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Animação" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Configurações de animação" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tile" }));
    expect(screen.getByText("Tile selecionado")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Configurações de animação" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Quadro" }));
    expect(screen.getByText("Tamanho do frame")).toBeInTheDocument();
    expect(screen.getByText("Caixa de colisão")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Eventos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eventos" })).not.toBeInTheDocument();
  });

  it("mostra e atualiza a origem do frame ativo, sem reutilizar a geometria global", async () => {
    const user = userEvent.setup();
    const onUpdateMetaspriteFrame = vi.fn();
    const project = createBlankProjectData({ name: "Origem por frame" });
    const animations = project.animations as Array<{
      frames?: Array<{ originX?: number; originY?: number }>;
      originX?: number;
      originY?: number;
    }>;
    const animation = animations[0];
    if (!animation?.frames?.[0]) throw new Error("A fixture precisa ter um frame de sprite");
    animation.originX = -6;
    animation.originY = 0;
    animation.frames[0].originX = -16;
    animation.frames[0].originY = -8;

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({ onUpdateMetaspriteFrame })}
      />
    );

    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.click(screen.getByRole("tab", { name: "Quadro" }));

    const geometry = screen.getByRole("region", { name: "Frame e colisão" });
    const positionX = geometry.querySelector('input[aria-label="X"]');
    const positionY = geometry.querySelector('input[aria-label="Y"]');
    expect(positionX).toHaveValue(-16);
    expect(positionY).toHaveValue(-8);

    fireEvent.change(positionX as HTMLInputElement, { target: { value: "-12" } });

    expect(onUpdateMetaspriteFrame).toHaveBeenCalledWith(expect.any(String), {
      frameIndex: 0,
      originX: -12,
      originY: -8
    });
  });

  it("altera o tipo do conjunto de animacoes e o espelhamento pelo inspetor", async () => {
    const user = userEvent.setup();
    const onUpdateAnimationState = vi.fn();
    const project = createBlankProjectData({ name: "Tipo de animacao" });

    render(
      <SpritesWorkspace
        presentation={deriveSpritesWorkspacePresentation(project)}
        {...spritesWorkspaceHandlers({ onUpdateAnimationState })}
      />
    );

    await user.click(screen.getByRole("button", { name: "player_topdown_4dir.png" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo de animação" }), "four_direction_movement");
    await user.click(screen.getByRole("checkbox", { name: "Espelhar esquerda a partir da direita" }));

    expect(onUpdateAnimationState).toHaveBeenNthCalledWith(1, "state-player-default", {
      animationType: "four_direction_movement"
    });
    expect(onUpdateAnimationState).toHaveBeenNthCalledWith(2, "state-player-default", {
      mirrorLeftFromRight: false
    });
  });
});
