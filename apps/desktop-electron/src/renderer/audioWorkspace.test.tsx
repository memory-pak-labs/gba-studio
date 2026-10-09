/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAudioItemInProject, deriveAudioWorkspacePresentation } from "../shared/audioWorkspace.js";
import { createBlankProjectData } from "../shared/newProject.js";
import { AudioWorkspace } from "./audioWorkspace.js";

function audioWorkspaceHandlers(overrides: Record<string, unknown> = {}) {
  return {
    onCreateAudio: vi.fn(),
    onCreateAudioInstrument: vi.fn(),
    onUpdateAudioInstrument: vi.fn(),
    onRemoveAudioInstrument: vi.fn(),
    onUpdateAudioFields: vi.fn(),
    onUpdateAudioChannelFields: vi.fn(),
    onRenameAudioChannel: vi.fn(),
    onUpdateAudioChannelType: vi.fn(),
    onCreateAudioChannel: vi.fn(),
    onRemoveAudioChannel: vi.fn(),
    onSetAudioChannelNote: vi.fn(),
    onApplyAudioPatternPreset: vi.fn(),
    onMoveAudioChannelNote: vi.fn(),
    onTransposeAudioChannel: vi.fn(),
    onTransposeAudioChannelNote: vi.fn(),
    onUpdateAudioChannelNote: vi.fn(),
    onUpdateAudioPatternOrderSlot: vi.fn(),
    onCreateAudioPattern: vi.fn(),
    onRenameAudioPattern: vi.fn(),
    onRemoveAudioPattern: vi.fn(),
    onSetActivePattern: vi.fn(),
    onDuplicatePattern: vi.fn(),
    onClearPatternSequence: vi.fn(),
    onMovePatternOrderSlot: vi.fn(),
    onNormalizeAudio: vi.fn(),
    onRenameAudio: vi.fn(),
    onDuplicateAudio: vi.fn(),
    onExportAudio: vi.fn(),
    onImportAudio: vi.fn(),
    onRemoveAudio: vi.fn(),
    ...overrides
  };
}

describe("AudioWorkspace React", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("abre o menu contextual do audio e do pattern", async () => {
    const user = userEvent.setup();
    const onDuplicateAudio = vi.fn();
    const onRenameAudioPattern = vi.fn();
    const project = createAudioItemInProject(createBlankProjectData({ name: "Menus de audio" }), {
      id: "audio-menu",
      kind: "Musica",
      name: "Tema"
    });

    render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        {...audioWorkspaceHandlers({ onDuplicateAudio, onRenameAudioPattern })}
      />
    );

    const audio = screen.getByRole("listitem", { name: "Selecionar áudio Tema" });
    fireEvent.contextMenu(audio, { clientX: 160, clientY: 160 });
    expect(screen.getByRole("menu", { name: "Ações para Tema" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(onDuplicateAudio).toHaveBeenCalledWith("audio-menu", "Tema");

    await user.click(screen.getByRole("button", { name: "Sequência atual" }));
    const pattern = screen.getAllByRole("button", { name: "Pattern 1" })[0]!;
    fireEvent.contextMenu(pattern, { clientX: 160, clientY: 160 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Renomear" }));
    expect(onRenameAudioPattern).toHaveBeenCalledWith("audio-menu", "audio-menu-pattern-1", "Pattern 1");
  });

  it("abre somente o compositor completo e cria nota ao clicar em uma celula vazia", async () => {
    const user = userEvent.setup();
    const onSetAudioChannelNote = vi.fn();
    const project = createAudioItemInProject(createBlankProjectData({ name: "Audio simples" }), {
      id: "audio-theme",
      kind: "Musica",
      name: "Tema"
    });

    render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        {...audioWorkspaceHandlers({ onSetAudioChannelNote })}
      />
    );

    expect(screen.queryByRole("button", { name: "Basico" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completo" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Modo do compositor")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /Adicionar C4 no passo/ })[0]!);
    expect(onSetAudioChannelNote).toHaveBeenCalledWith(
      "audio-theme",
      expect.any(String),
      expect.any(Number),
      expect.stringMatching(/^[A-G][#b]?\d$/)
    );
  });

  it("mantem os tres modos do compositor visiveis e alterna entre eles", async () => {
    const user = userEvent.setup();
    const project = createAudioItemInProject(createBlankProjectData({ name: "Modos do compositor" }), {
      id: "audio-modes",
      kind: "Musica",
      name: "Tema dos modos"
    });

    render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        {...audioWorkspaceHandlers()}
      />
    );

    const modeGroup = screen.getByRole("group", { name: "Modo do compositor" });
    expect(modeGroup).toHaveClass("audio-groove-view-modes");
    expect(screen.getByRole("button", { name: "Piano Roll" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tracker" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sequência atual" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Tracker" }));
    expect(screen.getByRole("button", { name: "Tracker" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Tracker por passos de Tema dos modos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sequência atual" }));
    expect(screen.getByRole("button", { name: "Sequência atual" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Sequência de padrões de Tema dos modos")).toBeInTheDocument();
  });

  it("expõe nomes acessíveis para o transporte e permite selecionar pelo card", async () => {
    const user = userEvent.setup();
    let project = createAudioItemInProject(createBlankProjectData({ name: "Transporte" }), {
      id: "audio-theme",
      kind: "Musica",
      name: "Tema"
    });
    project = createAudioItemInProject(project, { id: "audio-confirm", kind: "SFX", name: "Confirmar" });

    render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        {...audioWorkspaceHandlers()}
      />
    );

    expect(screen.getByRole("button", { name: "Tocar áudio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parar áudio" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Selecionar áudio Confirmar" }));
    expect(screen.getByRole("button", { name: "Selecionar áudio Confirmar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("concentra edição no dock e mantém mute e solo junto às faixas", () => {
    const project = createAudioItemInProject(createBlankProjectData({ name: "Canais no inspetor" }), {
      id: "audio-channels",
      kind: "Musica",
      name: "Tema dos canais"
    });
    const { container } = render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        {...audioWorkspaceHandlers()}
      />
    );

    expect(screen.getByLabelText("Controles da faixa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Renomear canal/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".audio-groove-track-switches")).toHaveLength(4);
    expect(screen.getByRole("slider", { name: "Volume da faixa" })).toBeInTheDocument();
  });

  it.each(["{Delete}", "{Backspace}"])(
    "apaga a nota selecionada pelo teclado com %s",
    async (key) => {
      const user = userEvent.setup();
      const onSetAudioChannelNote = vi.fn();
      const project = createAudioItemInProject(createBlankProjectData({ name: "Audio simples" }), {
        id: "audio-theme",
        kind: "Musica",
        name: "Tema"
      });
      const { container } = render(
        <AudioWorkspace
          presentation={deriveAudioWorkspacePresentation(project)}
          {...audioWorkspaceHandlers({ onSetAudioChannelNote })}
        />
      );
      const note = container.querySelector<HTMLButtonElement>(".audio-groove-cell.has-note");
      expect(note).not.toBeNull();

      await user.click(note!);
      await user.keyboard(key);

      expect(onSetAudioChannelNote).toHaveBeenCalledWith(
        "audio-theme",
        expect.any(String),
        expect.any(Number),
        ""
      );
    }
  );

  it("nao apaga a nota selecionada quando Backspace edita um campo de texto", async () => {
    const user = userEvent.setup();
    const onSetAudioChannelNote = vi.fn();
    const project = createAudioItemInProject(createBlankProjectData({ name: "Audio simples" }), {
      id: "audio-theme",
      kind: "Musica",
      name: "Tema"
    });
    const { container } = render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        {...audioWorkspaceHandlers({ onSetAudioChannelNote })}
      />
    );
    const note = container.querySelector<HTMLButtonElement>(".audio-groove-cell.has-note");
    expect(note).not.toBeNull();

    await user.click(note!);
    await user.click(screen.getByRole("searchbox", { name: "Buscar áudio" }));
    await user.keyboard("{Backspace}");

    expect(onSetAudioChannelNote).not.toHaveBeenCalled();
  });

  it("faz pre-escuta pela biblioteca sem trocar o audio selecionado", async () => {
    const user = userEvent.setup();
    let project = createAudioItemInProject(createBlankProjectData({ name: "Audicao" }), {
      id: "audio-theme",
      kind: "Musica",
      name: "Tema"
    });
    project = createAudioItemInProject(project, { id: "audio-confirm", kind: "SFX", name: "Confirmar" });

    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers()} />);

    expect(screen.getByRole("button", { name: "Selecionar áudio Tema" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ouvir Confirmar" }));

    expect(screen.getByRole("button", { name: "Selecionar áudio Tema" })).toBeInTheDocument();
    expect(screen.getByText("Prévia indisponível")).toBeInTheDocument();
  });

  it("mostra assistente de criacao e atalhos de reproducao", async () => {
    const user = userEvent.setup();
    const onCreateAudio = vi.fn();
    const project = createAudioItemInProject({
      ...createBlankProjectData({ name: "Audio guiado" }),
      scenas: [{ name: "Floresta", music: "Tema" }]
    }, { id: "audio-theme", kind: "Musica", name: "Tema" });

    render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        {...audioWorkspaceHandlers({ onCreateAudio })}
      />
    );

    expect(screen.getByText(/Espaço.*tocar.*parar/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Criar áudio" }));
    await user.click(screen.getByRole("button", { name: "Música em loop" }));
    expect(onCreateAudio).toHaveBeenCalledWith("Musica");
  });

  it("atribui musica a uma cena escolhida pelo nome", async () => {
    const user = userEvent.setup();
    const baseProject = createBlankProjectData({ name: "Audio referencial" });
    const project = createAudioItemInProject(baseProject, { id: "audio-theme", kind: "Musica", name: "Tema" });
    const onUpdateAudioFields = vi.fn();

    render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        sceneOptions={[
          { value: "room_1", label: "Entrada" },
          { value: "forest", label: "Floresta" }
        ]}
        {...audioWorkspaceHandlers({ onUpdateAudioFields })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Detalhes" }));
    await user.click(screen.getByText("Dados técnicos"));
    await user.click(screen.getByRole("combobox", { name: "Cena relacionada" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar Cena relacionada" }), "flor");
    await user.click(screen.getByRole("option", { name: "Floresta" }));

    expect(onUpdateAudioFields).toHaveBeenCalledWith("audio-theme", { assignedScene: "forest" });
  });

  it("trata a atribuicao Global de SFX como referencia valida", async () => {
    const baseProject = createBlankProjectData({ name: "SFX global" });
    const project = createAudioItemInProject(baseProject, { id: "audio-confirm", kind: "SFX", name: "Confirmar" });

    render(
      <AudioWorkspace
        presentation={deriveAudioWorkspacePresentation(project)}
        sceneOptions={[{ value: "room_1", label: "Entrada" }]}
        {...audioWorkspaceHandlers()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Detalhes" }));
    await userEvent.click(screen.getByText("Dados técnicos"));
    expect(screen.getByRole("combobox", { name: "Cena relacionada" })).toHaveValue("Global");
    expect(screen.getByRole("combobox", { name: "Cena relacionada" })).toHaveAttribute("aria-invalid", "false");
  });

  it("preserva a busca quando a apresentacao muda sem um novo pedido de foco", async () => {
    const user = userEvent.setup();
    let project = createAudioItemInProject(createBlankProjectData({ name: "Busca persistente" }), {
      id: "audio-theme",
      kind: "Musica",
      name: "Tema"
    });
    project = createAudioItemInProject(project, {
      id: "audio-confirm",
      kind: "SFX",
      name: "Confirmar"
    });
    const handlers = audioWorkspaceHandlers();
    const { rerender } = render(
      <AudioWorkspace
        focusRequestID={1}
        focusedAssetName="Confirmar"
        presentation={deriveAudioWorkspacePresentation(project)}
        {...handlers}
      />
    );
    const search = screen.getByRole("searchbox", { name: "Buscar áudio" });

    await user.type(search, "Tema");
    expect(search).toHaveValue("Tema");
    expect(screen.getByText("1 de 2 visíveis")).toBeInTheDocument();

    rerender(
      <AudioWorkspace
        focusRequestID={1}
        focusedAssetName="Confirmar"
        presentation={deriveAudioWorkspacePresentation({ ...project })}
        {...handlers}
      />
    );

    expect(search).toHaveValue("Tema");
    expect(screen.getByText("1 de 2 visíveis")).toBeInTheDocument();
  });

  it("mantem a biblioteca compacta e oferece filtros secundários sob demanda", async () => {
    const user = userEvent.setup();
    let project = createAudioItemInProject(createBlankProjectData({ name: "Biblioteca compacta" }), {
      id: "audio-theme",
      kind: "Musica",
      name: "Tema"
    });
    project = createAudioItemInProject(project, {
      id: "audio-confirm",
      kind: "SFX",
      name: "Confirmar"
    });

    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers()} />);

    expect(screen.queryByRole("group", { name: "Filtrar áudio por tipo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar música" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar SFX" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByRole("combobox", { name: "Tipo" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Formato" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Origem" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ordenar" })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo" }), "SFX");
    expect(screen.getByText("1 de 2 visíveis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Limpar filtros/ })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(screen.getByRole("combobox", { name: "Tipo" })).toHaveValue("");
    expect(screen.getByText("2 de 2 visíveis")).toBeInTheDocument();
  });
});

describe("contrato dos controles de áudio", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("encerra a prévia quando o Play solicita e permite ouvi-la novamente depois", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; buffer: unknown; onended: unknown; loop: boolean }[] = [];
    vi.stubGlobal("AudioContext", class {
      destination = {}; resume = vi.fn().mockResolvedValue(undefined); close = close;
      decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 });
      createBufferSource() {
        const source = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), buffer: null, onended: null, loop: false };
        sources.push(source); return source;
      }
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(new Uint8Array([1]))));
    const presentation = deriveAudioWorkspacePresentation({
      assets: [{ id: "wav", name: "hit.wav", kind: "SFX", metadata: { source: "assets/hit.wav" } }],
      audioItems: [{ id: "a", name: "Efeito", kind: "SFX", format: "WAV", sourceAssetID: "wav", loops: true }]
    });
    const handlers = audioWorkspaceHandlers();
    const { rerender } = render(<AudioWorkspace projectPath="/tmp/QA/p.gba-project" presentation={presentation} previewStopRequest={0} {...handlers} />);
    await userEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    await screen.findByText("Tocando Efeito (loop)");
    rerender(<AudioWorkspace projectPath="/tmp/QA/p.gba-project" presentation={presentation} previewStopRequest={1} {...handlers} />);
    expect(screen.getByRole("button", { name: "Parar áudio" })).toBeDisabled();
    expect(screen.queryByText("Tocando Efeito (loop)")).not.toBeInTheDocument();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    rerender(<AudioWorkspace projectPath="/tmp/QA/p.gba-project" presentation={presentation} previewStopRequest={2} {...handlers} />);
    expect(close).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    await screen.findByText("Tocando Efeito (loop)");
    expect(sources[1].start).toHaveBeenCalledOnce();
  });

  it("cancela o WAV ainda decodificando para não tocar depois do início do Play", async () => {
    let finishDecode!: (buffer: AudioBuffer) => void;
    const decode = vi.fn(() => new Promise<AudioBuffer>(resolve => { finishDecode = resolve; }));
    const close = vi.fn().mockResolvedValue(undefined), createSource = vi.fn();
    vi.stubGlobal("AudioContext", class {
      destination = {}; resume = vi.fn().mockResolvedValue(undefined); close = close;
      decodeAudioData = decode; createBufferSource = createSource;
    });
    const fetchFile = vi.fn().mockResolvedValue(new Response(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchFile);
    const presentation = deriveAudioWorkspacePresentation({
      assets: [{ id: "wav", name: "hit.wav", kind: "SFX", metadata: { source: "assets/hit.wav" } }],
      audioItems: [{ id: "a", name: "Efeito", kind: "SFX", format: "WAV", sourceAssetID: "wav" }]
    });
    const handlers = audioWorkspaceHandlers();
    const { rerender } = render(<AudioWorkspace projectPath="/tmp/QA/p.gba-project" presentation={presentation} previewStopRequest={0} {...handlers} />);
    await userEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    await waitFor(() => expect(decode).toHaveBeenCalledOnce());
    rerender(<AudioWorkspace projectPath="/tmp/QA/p.gba-project" presentation={presentation} previewStopRequest={1} {...handlers} />);
    await act(async () => { finishDecode({ duration: 1 } as AudioBuffer); });
    expect(close).toHaveBeenCalledOnce();
    expect((fetchFile.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect(createSource).not.toHaveBeenCalled();
    expect(screen.queryByText(/Tocando Efeito/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parar áudio" })).toBeDisabled();
  });
  it("escolhe um WAV pelo instrumento da nota sem trocar as notas do piano roll", async () => {
    const onUpdateAudioChannelFields = vi.fn();
    const project = { assets: [{ id: "wav", name: "Piano.wav", kind: "SFX", metadata: { source: "assets/Piano.wav" } }], audioItems: [{ id: "a", name: "Tema", kind: "Musica", format: "COMPOSED", patterns: [{ id: "p", name: "Intro", steps: 1, channels: [{ id: "voice", name: "Melodia", type: "pulse1", notes: ["C4"] }] }] }] };
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers({ onUpdateAudioChannelFields })} />);
    expect(screen.getByRole("combobox", { name: "Instrumento do canal" })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Selecionar C4 no passo/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Instrumento do canal" }), "sample:wav");
    expect(onUpdateAudioChannelFields).toHaveBeenCalledWith("a", "voice", { instrumentID: null, sampleAssetID: "wav", sampleRootNote: "C4", sampleLoop: false });
    expect(screen.getByRole("button", { name: /Selecionar C4 no passo/ })).toBeInTheDocument();
  });
  it("decodifica o instrumento WAV e agenda sua altura e envelope sem oscilador PSG", async () => {
    const rate = vi.fn(), stop = vi.fn(), start = vi.fn(), oscillator = vi.fn();
    const parameter = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
    const source = { buffer: null, loop: false, playbackRate: { setValueAtTime: rate }, connect: vi.fn(), start, stop };
    const decode = vi.fn().mockResolvedValue({ duration: 1 }); const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("AudioContext", class {
      currentTime = 0; destination = {}; resume = vi.fn().mockResolvedValue(undefined); close = close; decodeAudioData = decode;
      createBufferSource() { return source; }
      createGain() { return { gain: parameter, connect: vi.fn() }; }
      createOscillator = oscillator;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1]))));
    const project = { assets: [{ id: "wav", name: "Piano.wav", kind: "SFX", metadata: { source: "assets/Piano.wav" } }], audioItems: [{ id: "a", name: "Tema", kind: "Musica", format: "COMPOSED", loops: true, patterns: [{ id: "p", name: "Intro", steps: 1, channels: [{ id: "voice", name: "Melodia", type: "pulse1", notes: ["C5"], sampleAssetID: "wav", sampleRootNote: "C4", sampleLoop: true }] }] }] };
    const { unmount } = render(<AudioWorkspace projectPath="/tmp/Samples/p.gba-project" presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers()} />);
    await userEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    await screen.findByText("Tocando Tema (loop)");
    expect(decode).toHaveBeenCalledTimes(1);
    expect(source.loop).toBe(true);
    expect(rate.mock.calls[0][0]).toBeCloseTo(2);
    expect(start).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce();
    expect(oscillator).not.toHaveBeenCalled();
    unmount(); expect(close).toHaveBeenCalledOnce();
  });
  it("adiciona canais ao pattern ativo e mantém formato somente leitura", async () => {
    const user = userEvent.setup(); const onCreateAudioChannel = vi.fn();
    const project = { audioItems: [{ id: "a", name: "Tema", kind: "Musica", format: "COMPOSED", activePatternID: "p2", patterns: [
      { id: "p1", name: "Entrada", steps: 1, channels: [{ id: "c1", name: "Pulse", type: "pulse1", notes: ["C4"] }] },
      { id: "p2", name: "Fim", steps: 1, channels: [{ id: "c2", name: "Wave", type: "wave", notes: ["E4"] }] }
    ] }] };
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers({ onCreateAudioChannel })} />);
    await user.click(screen.getByRole("button", { name: "Detalhes" }));
    await user.click(screen.getByRole("button", { name: "Novo canal" }));
    expect(onCreateAudioChannel).toHaveBeenCalledWith("a", "p2");
    await user.click(screen.getByText("Dados técnicos"));
    expect(screen.getByDisplayValue("COMPOSED")).toHaveAttribute("readonly");
    expect(screen.queryByText("Início do loop")).not.toBeInTheDocument();
  });
  it("abre os detalhes fora do canvas e retorna o foco ao fechar com Escape", async () => {
    const user = userEvent.setup();
    const onSetAudioChannelNote = vi.fn();
    const project = createAudioItemInProject(createBlankProjectData({ name: "Detalhes compactos" }), {
      id: "audio-theme", kind: "Musica", name: "Tema"
    });
    const { container } = render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers({ onSetAudioChannelNote })} />);
    await user.click(container.querySelector<HTMLButtonElement>(".audio-groove-cell.has-note")!);
    const trigger = screen.getByRole("button", { name: "Detalhes" });
    await user.click(trigger);
    const panel = screen.getByRole("complementary", { name: "Dados de Tema" });
    expect(panel.closest(".audio-groove-composer")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Fechar detalhes" })).toHaveFocus();
    await user.keyboard("{Delete}");
    expect(onSetAudioChannelNote).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Dados de Tema" })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("decodifica o WAV real, respeita Loop e encerra na saída do workspace", async () => {
    const sources: { buffer: unknown; loop: boolean; onended: unknown; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }[] = [];
    const close = vi.fn().mockResolvedValue(undefined); const decode = vi.fn().mockResolvedValue({ duration: 1 });
    vi.stubGlobal("AudioContext", class {
      currentTime = 0; destination = {}; resume = vi.fn().mockResolvedValue(undefined); close = close; decodeAudioData = decode;
      createBufferSource() { const node = { buffer: null, loop: false, onended: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn() }; sources.push(node); return node; }
    });
    const fetchFile = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))); vi.stubGlobal("fetch", fetchFile);
    const project = { assets: [{ id: "s", name: "hit.wav", kind: "SFX", metadata: { source: "Assets/sfx/hit.wav" } }], audioItems: [{ id: "a", name: "Efeito", sourceAssetID: "s", kind: "SFX", format: "WAV", loops: true }] };
    const { unmount } = render(<AudioWorkspace projectPath="/tmp/Meu jogo/p.gba-project" presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers()} />);
    expect(screen.queryByRole("button", { name: "Piano Roll" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    await screen.findByText("Tocando Efeito (loop)");
    expect(fetchFile.mock.calls[0][0]).toContain("Meu%20jogo%2FAssets%2Fsfx%2Fhit.wav");
    expect(decode).toHaveBeenCalledTimes(1); expect(sources[0].loop).toBe(true); expect(sources[0].start).toHaveBeenCalledTimes(1);
    unmount(); expect(sources[0].stop).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
  });
  it("não toca um bip no lugar de MOD importado", async () => {
    const constructor = vi.fn(); vi.stubGlobal("AudioContext", constructor);
    const project = { assets: [{ id: "s", name: "tema.mod", kind: "Musica", metadata: { source: "Assets/music/tema.mod" } }], audioItems: [{ id: "a", name: "Tema", sourceAssetID: "s", kind: "Musica", format: "MOD" }] };
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(project)} {...audioWorkspaceHandlers()} />);
    await userEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    expect(screen.getByText("Ouça este formato no Play do jogo.")).toBeInTheDocument(); expect(constructor).not.toHaveBeenCalled();
  });
});


describe("groovebox e banco compartilhado", () => {
  afterEach(cleanup);
  it("edita o instrumento compartilhado e conserva os controles de volume por faixa", async () => {
    const onUpdateAudioInstrument = vi.fn(), onUpdateAudioChannelFields = vi.fn();
    const data = { assets: [{ id: "wav", name: "Piano.wav", kind: "SFX", metadata: { source: "assets/p.wav" } }],
      audioInstruments: [{ id: "piano", name: "Piano suave", sampleAssetID: "wav", sampleRootNote: "C4", sampleLoop: true, envelope: "Soft ADSR" }],
      audioItems: [{ id: "a", name: "Tema", kind: "Musica", format: "COMPOSED", patterns: [{ id: "p", name: "Tema", steps: 16,
        channels: [{ id: "c", name: "Melodia", type: "pulse1", instrumentID: "piano", notes: ["C4"] }] }] }] };
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(data)} {...audioWorkspaceHandlers({ onUpdateAudioInstrument, onUpdateAudioChannelFields })} />);
    expect(screen.getByRole("combobox", { name: "Instrumento do canal" })).toHaveValue("bank:piano");
    await userEvent.click(screen.getByRole("checkbox", { name: "Repetir sample" }));
    expect(onUpdateAudioInstrument).toHaveBeenCalledWith("piano", { sampleLoop: false });
    fireEvent.change(screen.getByRole("slider", { name: "Volume da faixa" }), { target: { value: "60" } });
    expect(onUpdateAudioChannelFields).toHaveBeenCalledWith("a", "c", { volume: 60 });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Envelope" }), "Short Decay");
    expect(onUpdateAudioInstrument).toHaveBeenCalledWith("piano", { envelope: "Short Decay" });
  });
  it("pagina padrões longos sem alterar notas ao selecionar um pad", async () => {
    const onSetAudioChannelNote = vi.fn();
    const data = { audioItems: [{ id: "a", name: "Tema", kind: "Musica", format: "COMPOSED", patterns: [{ id: "p", name: "Entrada", steps: 64,
      channels: [{ id: "c", name: "Melodia", type: "pulse1", notes: Array(64).fill("---") }] }] }] };
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(data)} {...audioWorkspaceHandlers({ onSetAudioChannelNote })} />);
    await userEvent.click(screen.getByRole("button", { name: "Próximos passos" }));
    await userEvent.click(screen.getByRole("button", { name: "Selecionar passo 17" }));
    expect(onSetAudioChannelNote).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Adicionar C4 no passo 17 de Melodia" }));
    expect(onSetAudioChannelNote).toHaveBeenCalledWith("a", "c", 16, "C4");
    expect(screen.queryByRole("button", { name: "Selecionar passo 1" })).not.toBeInTheDocument();
  });
});
