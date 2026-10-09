import { Play, Square, Plus, Minus, Search, Upload, Music2, AudioLines, ListFilter, AlertTriangle, SlidersHorizontal, X } from "lucide-react";
import { AudioGroovePiano, grooveTrackName, grooveHardwareLabel, grooveTrackTone } from "./AudioGroovePiano";
import type { UpdateAudioInstrumentFields } from "../shared/audioInstruments.js";
import { resolveAudioPreviewSourceURL, startComposedAudioPreview } from "./audioPreviewPlayback";
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  deriveAudioChannelMixing,
  deriveAudioExportSummary,
  deriveAudioPreviewPlaybackPlan,
  deriveAudioStepToolbarState,
  deriveAudioWorkspaceFilterChips,
  filterAudioWorkspaceItems,
  type AudioComposerTab,
  type AudioPreviewPlaybackNote,
  type AudioWorkspaceFilterStatus,
  type AudioWorkspaceItem,
  type AudioWorkspaceOriginFilter,
  type AudioWorkspacePreviewRow,
  type AudioWorkspacePresentation,
  type AudioWorkspaceSortOption,
  type UpdateAudioItemFields
} from "../shared/audioWorkspace";
import { InspectorRange } from "./InspectorControls";
import { ProjectReferencePicker, WorkspaceEmptyState } from "./studioUi";
import type { ProjectReferenceOption } from "./studioUi";
import { StudioContextMenu, type StudioContextMenuState } from "./StudioContextMenu";
import { WorkspaceInspectorRail } from "./WorkspaceInspectorRail";

interface SelectedAudioCell {
  audioID: string;
  channelID: string;
  stepIndex: number;
}

interface AudioContextMenuState extends StudioContextMenuState {
  audioID: string;
  kind: "audio" | "pattern";
  patternID?: string;
}

const composerTabs: { id: AudioComposerTab; label: string }[] = [
  { id: "piano", label: "Piano Roll" },
  { id: "tracker", label: "Tracker" },
  { id: "sequence", label: "Sequência atual" }
];

interface AudioWorkspaceProps {
  onCreateAudioInstrument?(audioID: string, channelID: string): void;
  onUpdateAudioInstrument?(id: string, fields: UpdateAudioInstrumentFields): void;
  onRemoveAudioInstrument?(id: string): void;
  presentation: AudioWorkspacePresentation | null;
  projectPath?: string;
  previewStopRequest?: number;
  sceneOptions?: ProjectReferenceOption[];
  focusedAssetName?: string | null;
  focusRequestID?: number | null;
  onCreateAudio(kind?: "Musica" | "SFX" | "Audio"): void;
  onUpdateAudioFields(audioID: string, fields: UpdateAudioItemFields): void;
  onUpdateAudioChannelFields(audioID: string, channelID: string, fields: { name?: string; type?: string; muted?: boolean; solo?: boolean; instrument?: string; envelope?: string; volume?: number; sampleAssetID?: string | null; sampleRootNote?: string; sampleLoop?: boolean; instrumentID?: string | null; pan?: number }): void;
  onRenameAudioChannel(audioID: string, channelID: string, currentName: string): void;
  onUpdateAudioChannelType(audioID: string, channelID: string, currentType: string): void;
  onCreateAudioChannel(audioID: string, patternID: string | null): void;
  onRemoveAudioChannel(audioID: string, channelID: string, currentName: string): void;
  onSetAudioChannelNote(audioID: string, channelID: string, stepIndex: number, note: string): void;
  onApplyAudioPatternPreset(audioID: string): void;
  onMoveAudioChannelNote(audioID: string, channelID: string, stepIndex: number, direction: -1 | 1): void;
  onTransposeAudioChannel(audioID: string, channelID: string, deltaSemitones: number): void;
  onTransposeAudioChannelNote(audioID: string, channelID: string, stepIndex: number, deltaSemitones: number): void;
  onUpdateAudioChannelNote(audioID: string, channelID: string, stepIndex: number, currentNote: string | null): void;
  onUpdateAudioPatternOrderSlot(audioID: string, slotIndex: number, patternID: string): void;
  onCreateAudioPattern(audioID: string): void;
  onRenameAudioPattern(audioID: string, patternID: string, currentName: string): void;
  onRemoveAudioPattern(audioID: string, patternID: string, currentName: string): void;
  onSetActivePattern(audioID: string, patternID: string): void;
  onDuplicatePattern(audioID: string, patternID: string, currentName: string): void;
  onClearPatternSequence(audioID: string): void;
  onMovePatternOrderSlot(audioID: string, slotIndex: number, direction: -1 | 1): void;
  onNormalizeAudio(audioID: string): void;
  onRenameAudio(audioID: string, currentName: string): void;
  onDuplicateAudio(audioID: string, currentName: string): void;
  onExportAudio(audioID: string, currentName: string): void;
  onImportAudio(): void;
  onRemoveAudio(audioID: string, currentName: string): void;
}

function statusLabel(item: AudioWorkspaceItem): string {
  if (item.status === "Bloqueado") return "Bloqueado";
  if (item.status === "Atencao") {
    return "Atenção";
  }

  return item.origin;
}

function audioFormatLabel(format: string): string {
  return format === "COMPOSED" ? "Composto" : format;
}

function audioFilterChipLabel(label: string): string {
  return label === "Musica" ? "Música" : label === "Atencao" ? "Atenção" : label;
}

function audioChannelToneClass(type: string, index: number): string {
  const normalizedType = type.toLowerCase();
  if (normalizedType.includes("pulse1")) return "tone-pulse1";
  if (normalizedType.includes("pulse2")) return "tone-pulse2";
  if (normalizedType.includes("wave")) return "tone-wave";
  if (normalizedType.includes("noise") || normalizedType.includes("sfx")) return "tone-noise";
  return index % 2 === 0 ? "tone-pulse1" : "tone-wave";
}

function audioChannelDisplayName(label: string, type: string, index: number): string {
  const normalizedType = type.toLowerCase();
  if (normalizedType.includes("pulse1")) return "PULSE 1";
  if (normalizedType.includes("pulse2")) return "PULSE 2";
  if (normalizedType.includes("wave")) return "WAVE";
  if (normalizedType.includes("noise")) return "NOISE";
  return label.trim().length > 0 ? label.toUpperCase() : `CANAL ${index + 1}`;
}

function audioEditor(
  item: AudioWorkspaceItem,
  sceneOptions: ProjectReferenceOption[],
  onUpdateAudioFields: AudioWorkspaceProps["onUpdateAudioFields"]
): React.ReactElement {
  return (
    <div className="audio-editor" aria-label={`Editar ${item.name}`}>
      <label><span>Tipo</span><input readOnly value={item.kind === "Musica" ? "Música" : item.kind} /></label>
      <label><span>Formato</span><input readOnly value={item.format} /></label>
      <div className="audio-reference-field">
        <span>Cena relacionada</span>
        <ProjectReferencePicker
          ariaLabel="Cena relacionada"
          emptyLabel="Sem cena"
          invalidLabel="Cena não encontrada"
          onChange={(assignedScene) => onUpdateAudioFields(item.id, { assignedScene })}
          options={[{ value: "Global", label: "Global", detail: "Todo o projeto" }, ...sceneOptions]}
          value={item.assignedScene ?? ""}
        />
      </div>
      <p className="muted">A cena relacionada organiza a biblioteca. Para tocar, use a música da cena ou um evento.</p>
      {item.origin === "Composto" ? <InspectorRange
        defaultValue={80}
        description="Ganho geral aplicado a todas as vozes da composição."
        label="Volume geral"
        max={100} min={0}
        onChange={(volume) => onUpdateAudioFields(item.id, { volume })}
        presets={[{ label: "0", value: 0 }, { label: "50", value: 50 }, { label: "80", value: 80 }, { label: "100", value: 100 }]}
        unit="%" value={item.volume ?? 80}
      /> : <p className="muted">Andamento e volume vêm do arquivo importado.</p>}
    </div>
  );
}

function audioPatternSequence(
  item: AudioWorkspaceItem,
  onSetActivePattern: (patternID: string) => void,
  onUpdateAudioPatternOrderSlot: AudioWorkspaceProps["onUpdateAudioPatternOrderSlot"],
  onDuplicatePattern: AudioWorkspaceProps["onDuplicatePattern"],
  onClearPatternSequence: AudioWorkspaceProps["onClearPatternSequence"],
  onMovePatternOrderSlot: AudioWorkspaceProps["onMovePatternOrderSlot"],
  onCreateAudioPattern: AudioWorkspaceProps["onCreateAudioPattern"],
  onRenameAudioPattern: AudioWorkspaceProps["onRenameAudioPattern"],
  onRemoveAudioPattern: AudioWorkspaceProps["onRemoveAudioPattern"],
  onOpenPatternContextMenu: (event: React.MouseEvent<HTMLElement>, patternID: string, patternName: string) => void
): React.ReactElement {
  const activePatternID = item.activePatternID ?? item.patterns[0]?.id ?? null;

  return (
    <div className="audio-pattern-sequence" aria-label={`Sequência de padrões de ${item.name}`}>
      <div className="audio-sequence-toolbar" role="toolbar" aria-label="Ferramentas de sequencia">
        <button onClick={() => onCreateAudioPattern(item.id)} type="button">+ Adicionar</button>
        <button
          disabled={!activePatternID}
          onClick={() => activePatternID && onDuplicatePattern(item.id, activePatternID, item.activePatternName ?? "Pattern")}
          type="button"
        >
          Duplicar
        </button>
        <button
          disabled={!activePatternID}
          onClick={() => activePatternID && onRemoveAudioPattern(item.id, activePatternID, item.activePatternName ?? "Pattern")}
          type="button"
        >
          Remover
        </button>
        <button disabled={item.patternSequence.length === 0} onClick={() => onClearPatternSequence(item.id)} type="button">
          Limpar
        </button>
      </div>
      <div className="audio-sequence-active-pattern">
        <span>Pattern ativo</span>
        <strong>{item.activePatternName ?? "Sem pattern"}</strong>
        <em>{item.stepCount} passos</em>
      </div>
      <div className="audio-sequence-order" aria-label="Ordem de reprodução">
        <h5>Ordem de reprodução</h5>
        {item.patternSequence.length === 0 ? (
          <p className="muted">Nenhum pattern na sequência.</p>
        ) : (
          item.patternSequence.map((slot) => (
            <div className={slot.isMissing ? "audio-sequence-order-row missing" : "audio-sequence-order-row"} key={`${item.id}-order-${slot.index}`}>
              <span>{slot.index + 1}.</span>
              <strong>{slot.label}</strong>
              <div className="audio-sequence-order-actions">
                <button
                  aria-label={`Mover ${slot.label} para cima`}
                  disabled={slot.index === 0}
                  onClick={() => onMovePatternOrderSlot(item.id, slot.index, -1)}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Mover ${slot.label} para baixo`}
                  disabled={slot.index >= item.patternSequence.length - 1}
                  onClick={() => onMovePatternOrderSlot(item.id, slot.index, 1)}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Remover ${slot.label} da sequencia`}
                  onClick={() => onUpdateAudioPatternOrderSlot(item.id, slot.index, "")}
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="audio-pattern-chip-list" aria-label={`Padrões de ${item.name}`}>
        <h5>Padrões</h5>
        <div>
          {item.patterns.map((pattern) => (
            <button
              aria-pressed={pattern.id === activePatternID}
              className={pattern.id === activePatternID ? "active" : ""}
              key={pattern.id}
              onClick={() => onSetActivePattern(pattern.id)}
              onContextMenu={(event) => onOpenPatternContextMenu(event, pattern.id, pattern.name)}
              type="button"
            >
              {pattern.name}
            </button>
          ))}
        </div>
        {activePatternID ? (
          <div className="audio-pattern-chip-actions">
            <button onClick={() => onRenameAudioPattern(item.id, activePatternID, item.activePatternName ?? "Pattern")} type="button">
              Renomear
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function audioStepTracker(
  item: AudioWorkspaceItem,
  selectedCell: SelectedAudioCell | null,
  onSelectCell: (cell: SelectedAudioCell) => void,
  onApplyAudioPatternPreset: AudioWorkspaceProps["onApplyAudioPatternPreset"],
  onMoveAudioChannelNote: AudioWorkspaceProps["onMoveAudioChannelNote"],
  onSetAudioChannelNote: AudioWorkspaceProps["onSetAudioChannelNote"],
  playbackStepIndex: number | null
): React.ReactElement {
  const visibleCells = item.previewRows[0]?.cells ?? [];
  const stepCount = visibleCells.length;
  const toolbarState = deriveAudioStepToolbarState(item, selectedCell);
  const trackerGridStyle = {
    gridTemplateColumns: `52px repeat(${Math.max(item.previewRows.length, 1)}, minmax(110px, 1fr))`
  };

  return (
    <div className="audio-step-tracker" aria-label={`Tracker por passos de ${item.name}`}>
      <div className="audio-step-tracker-header">
        <div>
          <strong>Tracker por passos</strong>
          <span>Edite cada passo como uma tabela musical, sem sair do compositor visual.</span>
        </div>
        <div className="audio-step-badges">
          <span>{stepCount} passos</span>
          <span>{item.previewRows.length} canal(is)</span>
          <span>{item.noteCount} notas</span>
        </div>
      </div>
      <div className="audio-step-toolbar" role="toolbar" aria-label="Ações do tracker por passos">
        <button type="button" onClick={() => onApplyAudioPatternPreset(item.id)}>Preset do pattern</button>
        <button
          disabled={!toolbarState.canMoveLeft || !selectedCell}
          onClick={() => {
            if (selectedCell && toolbarState.canMoveLeft) {
              onMoveAudioChannelNote(item.id, selectedCell.channelID, selectedCell.stepIndex, -1);
              onSelectCell({ ...selectedCell, stepIndex: selectedCell.stepIndex - 1 });
            }
          }}
          type="button"
        >
          Mover esquerda
        </button>
        <button
          disabled={!toolbarState.canMoveRight || !selectedCell}
          onClick={() => {
            if (selectedCell && toolbarState.canMoveRight) {
              onMoveAudioChannelNote(item.id, selectedCell.channelID, selectedCell.stepIndex, 1);
              onSelectCell({ ...selectedCell, stepIndex: selectedCell.stepIndex + 1 });
            }
          }}
          type="button"
        >
          Mover direita
        </button>
        <button
          disabled={!toolbarState.canClearStep || !selectedCell}
          onClick={() => {
            if (selectedCell && toolbarState.canClearStep) {
              onSetAudioChannelNote(item.id, selectedCell.channelID, selectedCell.stepIndex, "");
            }
          }}
          type="button"
        >
          Limpar passo
        </button>
        <span className="audio-step-toolbar-status">
          {toolbarState.hasSelection
            ? `${toolbarState.selectedChannelLabel}: ${toolbarState.selectedNote ?? "vazio"}`
            : "Nenhum passo selecionado"}
        </span>
      </div>
      {item.previewRows.length === 0 ? (
        <p className="muted">Nenhum canal cadastrado para este áudio.</p>
      ) : (
        <div className="audio-step-table" role="table" aria-label="Notas por passo">
          <div className="audio-step-row header" role="row" style={trackerGridStyle}>
            <span role="columnheader">#</span>
            {item.previewRows.map((row, rowIndex) => (
              <span key={row.id} role="columnheader">{audioChannelDisplayName(row.label, row.type, rowIndex)}</span>
            ))}
          </div>
          {Array.from({ length: stepCount }, (_, stepIndex) => (
            <div
              className={[
                "audio-step-row",
                stepIndex % 2 === 0 ? "even" : "odd",
                playbackStepIndex === stepIndex ? "playing" : ""
              ].filter(Boolean).join(" ")}
              key={`step-${stepIndex}`}
              role="row"
              style={trackerGridStyle}
            >
              <span role="cell">{String(stepIndex + 1).padStart(2, "0")}</span>
              {item.previewRows.map((row) => {
                const cell = row.cells[stepIndex];
                const isSelected = selectedCell?.audioID === item.id
                  && selectedCell.channelID === row.id
                  && selectedCell.stepIndex === stepIndex;
                const isPlaying = playbackStepIndex === stepIndex;
                return (
                  <button
                    aria-label={cell?.note ? `${cell.note} no passo ${stepIndex + 1}` : `Passo vazio ${stepIndex + 1}`}
                    className={[
                      cell?.isActive ? "active" : "",
                      cell?.isPercussion ? "percussion" : "",
                      isSelected ? "selected" : "",
                      isPlaying ? "playing" : ""
                    ].filter(Boolean).join(" ")}
                    key={`${row.id}-${stepIndex}`}
                    onClick={() => onSelectCell({ audioID: item.id, channelID: row.id, stepIndex })}
                    role="cell"
                    type="button"
                  >
                    {cell?.note ?? "---"}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AudioWorkspace({
  onCreateAudioInstrument, onUpdateAudioInstrument, onRemoveAudioInstrument,
  presentation,
  projectPath,
  previewStopRequest = 0,
  sceneOptions = [],
  focusedAssetName,
  focusRequestID,
  onCreateAudio,
  onUpdateAudioFields,
  onUpdateAudioChannelFields,
  onRenameAudioChannel,
  onUpdateAudioChannelType,
  onCreateAudioChannel,
  onRemoveAudioChannel,
  onSetAudioChannelNote,
  onApplyAudioPatternPreset,
  onMoveAudioChannelNote,
  onTransposeAudioChannel,
  onTransposeAudioChannelNote,
  onUpdateAudioChannelNote,
  onUpdateAudioPatternOrderSlot,
  onCreateAudioPattern,
  onRenameAudioPattern,
  onRemoveAudioPattern,
  onSetActivePattern,
  onDuplicatePattern,
  onClearPatternSequence,
  onMovePatternOrderSlot,
  onNormalizeAudio,
  onRenameAudio,
  onDuplicateAudio,
  onExportAudio,
  onImportAudio,
  onRemoveAudio
}: AudioWorkspaceProps): React.ReactElement {
  const [selectedCell, setSelectedCell] = useState<SelectedAudioCell | null>(null);
  const [selectedAudioID, setSelectedAudioID] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<AudioContextMenuState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState<AudioWorkspaceOriginFilter>("");
  const [sortOption, setSortOption] = useState<AudioWorkspaceSortOption>("name-asc");
  const [filterStatus, setFilterStatus] = useState<AudioWorkspaceFilterStatus>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [composerTab, setComposerTab] = useState<AudioComposerTab>("piano");
  const [playbackStatus, setPlaybackStatus] = useState("Parado");
  const [playbackStepIndex, setPlaybackStepIndex] = useState<number | null>(null);
  const [auditionAudioID, setAuditionAudioID] = useState<string | null>(null);
  const [creationAssistantOpen, setCreationAssistantOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsID = useId();
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const detailsCloseRef = useRef<HTMLButtonElement>(null);
  const [previewScope, setPreviewScope] = useState<"pattern" | "sequence">("pattern");
  const playbackRef = useRef<{ context: AudioContext; stop(): void } | null>(null);
  const playbackRequest = useRef(0);
  useEffect(() => {
    if (detailsOpen) detailsCloseRef.current?.focus();
  }, [detailsOpen]);

  function closeDetails(): void {
    setDetailsOpen(false);
    detailsButtonRef.current?.focus();
  }

  useEffect(() => {
    setPlaybackStepIndex(null); setAuditionAudioID(null); setPlaybackStatus("Parado");
    return () => {
      playbackRequest.current += 1;
      const current = playbackRef.current;
      playbackRef.current = null;
      if (current) { current.stop(); void current.context.close(); }
    };
  }, [presentation, selectedAudioID, previewScope, previewStopRequest]);
  const focusedAudioID = useMemo(() => {
    if (!presentation || !focusedAssetName) return null;
    return presentation.items.find((candidate) => (
      candidate.id === focusedAssetName ||
      candidate.name === focusedAssetName ||
      candidate.exportID === focusedAssetName
    ))?.id ?? null;
  }, [focusedAssetName, presentation]);
  const visibleItems = useMemo(
    () => filterAudioWorkspaceItems(presentation?.items ?? [], {
      query: searchQuery,
      kind: selectedKind,
      format: selectedFormat,
      origin: selectedOrigin,
      status: filterStatus,
      sort: sortOption
    }),
    [filterStatus, presentation?.items, searchQuery, selectedFormat, selectedKind, selectedOrigin, sortOption]
  );
  const filterChips = useMemo(
    () => presentation ? deriveAudioWorkspaceFilterChips(presentation, {
      kind: selectedKind,
      format: selectedFormat,
      origin: selectedOrigin,
      status: filterStatus
    }) : null,
    [filterStatus, presentation, selectedFormat, selectedKind, selectedOrigin]
  );
  const activeFilterCount = [
    selectedKind,
    selectedFormat,
    selectedOrigin,
    filterStatus,
    sortOption !== "name-asc" ? sortOption : ""
  ].filter(Boolean).length;
  const activeExportDiagnostics = useMemo(
    () => {
      if (!presentation) return [];
      const activeItem = presentation.items.find((item) => item.id === selectedAudioID)
        ?? presentation.items[0]
        ?? null;
      return activeItem
        ? presentation.exportDiagnostics.filter((entry) => entry.audioID === activeItem.id)
        : [];
    },
    [presentation, selectedAudioID]
  );

  useEffect(() => {
    if (!focusedAudioID) return;

    setSearchQuery("");
    setSelectedKind("");
    setSelectedFormat("");
    setSelectedOrigin("");
    setSortOption("name-asc");
    setFilterStatus("");
    setFiltersOpen(false);
    setSelectedAudioID(focusedAudioID);
  }, [focusRequestID, focusedAudioID]);

  useEffect(() => {
    if (!presentation || presentation.items.length === 0 || selectedAudioID) return;
    setSelectedAudioID(presentation.items[0]?.id ?? null);
  }, [presentation, selectedAudioID]);

  useEffect(() => {
    if (!presentation || !selectedCell) return;
    const cell = selectedCell;
    const selectedItem = presentation.items.find((item) => item.id === cell.audioID);
    const selectedRow = selectedItem?.previewRows.find((row) => row.id === cell.channelID);
    const selectedNote = selectedRow?.cells.find((candidate) => candidate.index === cell.stepIndex)?.note;
    if (!selectedNote) return;

    function handlePianoRollDelete(event: KeyboardEvent): void {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable
        || target.closest(".audio-groove-details")
        || target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
      )) return;

      event.preventDefault();
      onSetAudioChannelNote(
        cell.audioID,
        cell.channelID,
        cell.stepIndex,
        ""
      );
    }

    window.addEventListener("keydown", handlePianoRollDelete);
    return () => window.removeEventListener("keydown", handlePianoRollDelete);
  }, [onSetAudioChannelNote, presentation, selectedCell]);

  function createFromAssistant(kind: "Musica" | "SFX"): void {
    onCreateAudio(kind);
    setCreationAssistantOpen(false);
  }

  function audioCreationAssistant(): React.ReactElement | null {
    if (!creationAssistantOpen) return null;
    return (
      <section aria-label="Assistente de criação de áudio" className="audio-creation-assistant" role="dialog">
        <div>
          <strong>Novo áudio</strong>
          <button aria-label="Fechar assistente" onClick={() => setCreationAssistantOpen(false)} type="button">×</button>
        </div>
        <p>Escolha um ponto de partida. Você poderá ajustar tudo depois.</p>
        <button aria-label="Música em loop" onClick={() => createFromAssistant("Musica")} type="button">
          <strong>Música em loop</strong>
          <span>4 canais GBA, pattern inicial e notas de exemplo.</span>
        </button>
        <button aria-label="SFX curto" onClick={() => createFromAssistant("SFX")} type="button">
          <strong>SFX curto</strong>
          <span>Efeito one-shot pronto para receber ou importar som.</span>
        </button>
        <button aria-label="Importar arquivo" onClick={() => { onImportAudio(); setCreationAssistantOpen(false); }} type="button">
          <strong>Importar arquivo</strong>
          <span>Use um MOD ou WAV existente como fonte.</span>
        </button>
      </section>
    );
  }

  if (!presentation) {
    return (
      <WorkspaceEmptyState
        title="Áudio"
        description="Abra um projeto para visualizar músicas, SFX, usos e dados do compositor."
      />
    );
  }

  const isEmptyLibrary = presentation.items.length === 0;

  if (isEmptyLibrary) {
    return (
      <section className="audio-workspace" aria-label="Workspace Áudio">
        <h3 className="studio-visually-hidden">Compositor de Áudio</h3>

        <div className="audio-layout audio-layout-empty">
          <aside className="audio-rail audio-rail-empty-state" aria-label="Biblioteca de áudio">
            <div className="audio-rail-header">
              <h4>Biblioteca</h4>
            </div>
            <section className="audio-rail-empty">
              <strong>A biblioteca de áudio está vazia.</strong>
              <p>Crie uma música ou SFX para começar a compor.</p>
              <div>
                <button onClick={() => setCreationAssistantOpen(true)} type="button">Criar música</button>
                <button onClick={() => setCreationAssistantOpen(true)} type="button">Criar SFX</button>
                <button onClick={onImportAudio} type="button">Importar MOD/WAV</button>
              </div>
              {audioCreationAssistant()}
            </section>
          </aside>

          <section className="audio-composer-stage audio-composer-empty-state" aria-label="Compositor de áudio">
            <div className="audio-empty-composer">
              <span>Compositor de áudio</span>
              <p>Crie ou importe um áudio para começar a compor.</p>
            </div>
          </section>

          <WorkspaceInspectorRail
            ariaLabel="Resumo de áudio"
            className="audio-side-panel"
            workspaceId="audio"
          >
            <p className="muted">Nenhum áudio selecionado.</p>
          </WorkspaceInspectorRail>
        </div>
      </section>
    );
  }

  const activeItem = visibleItems.find((item) => item.id === selectedAudioID)
    ?? presentation.items.find((item) => item.id === selectedAudioID)
    ?? visibleItems[0]
    ?? presentation.items[0]
    ?? null;

  function openAudioContextMenu(event: React.MouseEvent<HTMLElement>, item: AudioWorkspaceItem): void {
    event.preventDefault();
    event.stopPropagation();
    setSelectedAudioID(item.id);
    setContextMenu({ audioID: item.id, kind: "audio", label: item.name, x: event.clientX, y: event.clientY });
  }

  function openPatternContextMenu(event: React.MouseEvent<HTMLElement>, patternID: string, patternName: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (!activeItem) return;
    setContextMenu({ audioID: activeItem.id, kind: "pattern", label: patternName, patternID, x: event.clientX, y: event.clientY });
  }
  const selectedRow = activeItem?.previewRows.find(row => selectedCell?.audioID === activeItem.id && row.id === selectedCell.channelID) ?? activeItem?.previewRows[0];
  const channelMixing = deriveAudioChannelMixing(activeItem, selectedRow?.id ?? null);
  function updateInstrumentControls(fields: { envelope?: string; sampleRootNote?: string; sampleLoop?: boolean }): void {
    if (!activeItem || !selectedRow) return;
    if (selectedRow.instrumentID) onUpdateAudioInstrument?.(selectedRow.instrumentID, fields);
    else onUpdateAudioChannelFields(activeItem.id, selectedRow.id, fields);
  }
  const exportSummary = deriveAudioExportSummary(activeItem);
  const playingItem = presentation.items.find(item => item.id === auditionAudioID) ?? activeItem;
  const previewPlan = playingItem ? deriveAudioPreviewPlaybackPlan(playingItem, { scope: previewScope }) : null;

  function stopAudioPreview(nextStatus = "Parado"): void {
    playbackRequest.current += 1;
    const current = playbackRef.current;
    if (current) {
      current.stop();
      void current.context.close();
      playbackRef.current = null;
    }
    setPlaybackStepIndex(null);
    setAuditionAudioID(null);
    setPlaybackStatus(nextStatus);
  }

  function pulsePeriodicWave(context: AudioContext, duty: number): PeriodicWave {
    const dutyCycles = [0.125, 0.25, 0.5, 0.75];
    const cycle = dutyCycles[Math.max(0, Math.min(3, duty))] ?? 0.5;
    const harmonics = 32;
    const real = new Float32Array(harmonics + 1);
    const imaginary = new Float32Array(harmonics + 1);
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      real[harmonic] = 2 * Math.sin(Math.PI * harmonic * cycle) / (Math.PI * harmonic);
      imaginary[harmonic] = 2 * (1 - Math.cos(2 * Math.PI * harmonic * cycle)) / (2 * Math.PI * harmonic);
    }
    return context.createPeriodicWave(real, imaginary, { disableNormalization: false });
  }

  function connectPreviewGain(context: AudioContext, gain: GainNode, note?: AudioPreviewPlaybackNote): void {
    if (note?.pan !== undefined && typeof context.createStereoPanner === "function") {
      const pan = context.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, note.pan / 127));
      gain.connect(pan); pan.connect(context.destination);
    } else gain.connect(context.destination);
  }

  function playTone(
    context: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    note?: AudioPreviewPlaybackNote
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    if (note?.oscillator === "triangle") {
      oscillator.type = note.waveform === 3 ? "sawtooth" : note.waveform === 2 ? "sine" : "triangle";
    } else if (note?.oscillator === "square") {
      oscillator.setPeriodicWave(pulsePeriodicWave(context, note.duty));
    } else {
      oscillator.type = "square";
    }
    oscillator.frequency.setValueAtTime(frequency, startTime);
    const peak = Math.max(0.0001, 0.11 * ((note?.volume ?? 12) / 15));
    const attack = Math.min(duration * 0.5, (note?.attackFrames ?? 1) / 60);
    const release = Math.min(duration * 0.75, (note?.releaseFrames ?? 2) / 60);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + Math.max(0.005, attack));
    gain.gain.setValueAtTime(peak, Math.max(startTime + Math.max(0.005, attack), startTime + duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    connectPreviewGain(context, gain, note);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  function playNoise(context: AudioContext, startTime: number, duration: number, note?: AudioPreviewPlaybackNote): void {
    const sampleRate = context.sampleRate;
    const frameCount = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    let lfsr = note?.duty === 1 ? 0x7f : 0x7fff;
    const bitMask = note?.duty === 1 ? 0x40 : 0x4000;
    for (let index = 0; index < frameCount; index += 1) {
      const feedback = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (feedback ? bitMask : 0);
      data[index] = (lfsr & 1 ? 1 : -1) * (1 - index / frameCount);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.12 * ((note?.volume ?? 12) / 15), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.buffer = buffer;
    source.connect(gain);
    connectPreviewGain(context, gain, note);
    source.start(startTime);
  }

  async function playAudioPreview(item: AudioWorkspaceItem): Promise<void> {
    stopAudioPreview(`Preparando ${item.name}`);
    if (item.errors.length) { setPlaybackStatus(item.errors[0]); return; }
    if (item.origin === "Importado" && item.format !== "WAV") {
      setPlaybackStatus("Ouça este formato no Play do jogo."); return;
    }
    const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) { setPlaybackStatus("Prévia indisponível"); return; }
    const context = new Constructor();
    const request = playbackRequest.current;
    const abort = new AbortController();
    playbackRef.current = { context, stop: () => abort.abort() };
    const ended = () => { if (playbackRef.current?.context === context) stopAudioPreview(); };
    try {
      await context.resume();
      if (request !== playbackRequest.current) return;
      if (item.origin === "Importado") {
        const url = resolveAudioPreviewSourceURL(projectPath, item.source);
        if (!url) throw new Error("Salve o projeto para ouvir o arquivo importado.");
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error("Não foi possível abrir o arquivo de áudio.");
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (request !== playbackRequest.current) return;
        const source = context.createBufferSource(); source.buffer = buffer; source.loop = item.loops;
        source.connect(context.destination); source.onended = ended;
        playbackRef.current = { context, stop: () => { abort.abort(); source.onended = null; source.stop(); } };
        source.start();
      } else {
        const plan = deriveAudioPreviewPlaybackPlan(item, { scope: previewScope });
        if (plan.steps.every(step => step.notes.length === 0)) { stopAudioPreview("Sem notas audíveis nesta seleção."); return; }
        const sampleBuffers = new Map<string, AudioBuffer>();
        for (const source of new Set(plan.steps.flatMap(step => step.notes.flatMap(note => note.sample ? [note.sample.source] : [])))) {
          const url = resolveAudioPreviewSourceURL(projectPath, source);
          if (!url) throw new Error("Salve o projeto para ouvir o sample.");
          const response = await fetch(url, { signal: abort.signal });
          if (!response.ok) throw new Error("Não foi possível abrir o sample WAV.");
          sampleBuffers.set(source, await context.decodeAudioData(await response.arrayBuffer()));
        }
        if (request !== playbackRequest.current) return;
        const stop = startComposedAudioPreview(context, plan, {
          onStep: setPlaybackStepIndex, onEnded: ended,
          playNote: (note, when, duration) => {
            if (note.sample) {
              const source = context.createBufferSource(); const gain = context.createGain();
              source.buffer = sampleBuffers.get(note.sample.source)!; source.loop = note.sample.loop;
              source.playbackRate.setValueAtTime(note.sample.pitchRatio, when);
              const peak = 0.3 * note.volume / 15;
              const attack = Math.min(duration, note.attackFrames / 60);
              const release = Math.min(duration - attack, note.releaseFrames / 60);
              gain.gain.setValueAtTime(attack ? 0 : peak, when);
              if (attack) gain.gain.linearRampToValueAtTime(peak, when + attack);
              gain.gain.setValueAtTime(peak, when + duration - release);
              gain.gain.linearRampToValueAtTime(0, when + duration);
              source.connect(gain); connectPreviewGain(context, gain, note); source.start(when); source.stop(when + duration);
            } else if (note.isNoise) playNoise(context, when, duration, note);
            else playTone(context, note.frequency ?? 440, when, duration, note);
          }
        });
        playbackRef.current = { context, stop };
      }
      setAuditionAudioID(item.id);
      setPlaybackStatus(item.loops && item.kind !== "SFX" || item.origin === "Importado" && item.loops ? `Tocando ${item.name} (loop)` : `Tocando ${item.name}`);
    } catch (error) {
      if (request === playbackRequest.current) stopAudioPreview(error instanceof Error ? error.message : "Falha na prévia.");
    }
  }

  function selectRelativeAudio(direction: -1 | 1): void {
    if (visibleItems.length === 0) return;
    stopAudioPreview();
    const activeIndex = activeItem ? visibleItems.findIndex((item) => item.id === activeItem.id) : -1;
    const fallbackIndex = direction > 0 ? 0 : visibleItems.length - 1;
    const nextIndex = activeIndex >= 0
      ? (activeIndex + direction + visibleItems.length) % visibleItems.length
      : fallbackIndex;
    setSelectedAudioID(visibleItems[nextIndex]?.id ?? null);
    setSelectedCell(null);
  }

  return (
    <section
      className="audio-workspace"
      aria-label="Workspace Áudio"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.matches("input, textarea, select") || target.isContentEditable || target.closest(".audio-groove-details")) return;
        if (event.key === " ") {
          event.preventDefault();
          if (playbackStatus === "Parado" || playbackStatus === "Preview indisponivel") {
            if (activeItem) playAudioPreview(activeItem);
          } else {
            stopAudioPreview();
          }
        } else if (event.key === "Escape") {
          stopAudioPreview();
        } else if (event.key === "ArrowLeft") {
          selectRelativeAudio(-1);
        } else if (event.key === "ArrowRight") {
          selectRelativeAudio(1);
        }
      }}
      tabIndex={-1}
    >
      {contextMenu ? (
        <StudioContextMenu
          actions={contextMenu.kind === "audio"
            ? [
                {
                  label: "Renomear",
                  onSelect: () => onRenameAudio(contextMenu.audioID, contextMenu.label)
                },
                {
                  label: "Duplicar",
                  onSelect: () => onDuplicateAudio(contextMenu.audioID, contextMenu.label)
                },
                {
                  danger: true,
                  label: "Excluir",
                  onSelect: () => onRemoveAudio(contextMenu.audioID, contextMenu.label)
                }
              ]
            : [
                {
                  label: "Renomear",
                  onSelect: () => contextMenu.patternID && onRenameAudioPattern(contextMenu.audioID, contextMenu.patternID, contextMenu.label)
                },
                {
                  label: "Duplicar",
                  onSelect: () => contextMenu.patternID && onDuplicatePattern(contextMenu.audioID, contextMenu.patternID, contextMenu.label)
                },
                {
                  danger: true,
                  label: "Excluir",
                  onSelect: () => contextMenu.patternID && onRemoveAudioPattern(contextMenu.audioID, contextMenu.patternID, contextMenu.label)
                }
              ]}
          onClose={() => setContextMenu(null)}
          state={contextMenu}
        />
      ) : null}
      <h3 className="studio-visually-hidden">Compositor de Áudio</h3>

      {audioCreationAssistant()}

      <div className="audio-layout audio-groove-layout">
        <aside className="audio-rail audio-groove-library" aria-label="Biblioteca de áudio">
          <div className="audio-rail-header"><h4>Biblioteca</h4><div className="audio-groove-library-actions">
            <button aria-label="Criar áudio" title="Criar áudio" onClick={() => setCreationAssistantOpen(true)} type="button"><Plus size={18} /></button>
            <button aria-label="Importar áudio" title="Importar áudio" onClick={onImportAudio} type="button"><Upload size={16} /></button>
          </div></div>
          <label className="audio-groove-search"><span className="studio-visually-hidden">Buscar áudio</span><Search size={15} /><input type="search" aria-label="Buscar áudio" placeholder="Buscar…" value={searchQuery} onChange={event => setSearchQuery(event.currentTarget.value)} /></label>
          <button className="audio-groove-filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} type="button"><ListFilter size={14} />Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          {filtersOpen ? <div className="audio-groove-filters">
            <label>Tipo<select value={selectedKind} onChange={event => setSelectedKind(event.currentTarget.value)}><option value="">Todos</option>{filterChips?.kind.map(chip => <option key={chip.id} value={chip.value}>{audioFilterChipLabel(chip.label)}</option>)}</select></label>
            <label>Formato<select value={selectedFormat} onChange={event => setSelectedFormat(event.currentTarget.value)}><option value="">Todos</option>{filterChips?.format.map(chip => <option key={chip.id} value={chip.value}>{audioFormatLabel(chip.label)}</option>)}</select></label>
            <label>Origem<select value={selectedOrigin} onChange={event => setSelectedOrigin(event.currentTarget.value as AudioWorkspaceOriginFilter)}><option value="">Todas</option><option>Composto</option><option>Importado</option><option>Sem fonte</option></select></label>
            <label>Status<select value={filterStatus} onChange={event => setFilterStatus(event.currentTarget.value as AudioWorkspaceFilterStatus)}><option value="">Todos</option><option value="OK">OK</option><option value="Atencao">Atenção</option><option value="Bloqueado">Bloqueado</option></select></label>
            <label>Ordenar<select value={sortOption} onChange={event => setSortOption(event.currentTarget.value as AudioWorkspaceSortOption)}><option value="name-asc">Nome A–Z</option><option value="name-desc">Nome Z–A</option><option value="bpm-desc">BPM</option><option value="usage-desc">Uso no jogo</option></select></label>
          </div> : null}
          <div className="audio-groove-library-list" role="list" aria-label="Lista de áudio">
            {[{ kind: "Musica", label: "Músicas" }, { kind: "SFX", label: "Efeitos sonoros" }, { kind: "Audio", label: "Áudio" }].map(group => {
              const items = visibleItems.filter(item => item.kind === group.kind || group.kind === "Audio" && !["Musica", "SFX"].includes(item.kind));
              return items.length ? <div key={group.kind} className="audio-groove-library-group"><span>{group.kind === "Musica" ? <Music2 size={16} /> : <AudioLines size={16} />}{group.label}</span>
                {items.map(item => <article key={item.id} role="listitem" aria-label={`Selecionar áudio ${item.name}`} onContextMenu={event => openAudioContextMenu(event, item)}>
                  <button type="button" aria-label={`Selecionar áudio ${item.name}`} aria-pressed={activeItem?.id === item.id} className={activeItem?.id === item.id ? "selected" : ""}
                    onClick={() => { stopAudioPreview(); setSelectedAudioID(item.id); setSelectedCell(null); }}>
                    {item.kind === "Musica" ? <Music2 size={17} /> : <AudioLines size={17} />}<span title={item.name}>{item.name}</span>{item.status !== "OK" ? <AlertTriangle size={14} aria-label={statusLabel(item)} /> : null}
                  </button>
                  <button className="audio-groove-audition" type="button" aria-label={`Ouvir ${item.name}`} title={`Ouvir ${item.name}`} onClick={() => playAudioPreview(item)}><Play size={13} /></button>
                </article>)}
              </div> : null;
            })}
            {!visibleItems.length ? <p className="muted">Nenhum áudio encontrado.</p> : null}
          </div>
          <small className="muted">{visibleItems.length} de {presentation.items.length} visíveis</small>
          {activeFilterCount ? <button type="button" onClick={() => { setSearchQuery(""); setSelectedKind(""); setSelectedFormat(""); setSelectedOrigin(""); setFilterStatus(""); }}>Limpar filtros</button> : null}
        </aside>
        <section className="audio-composer-stage audio-groove-composer" aria-label="Compositor de áudio">
          <div className="audio-groove-transport" role="toolbar" aria-label="Transporte de áudio">
            <div className="audio-groove-song-title"><h3>{activeItem?.name ?? "Sem áudio"}</h3><span>{activeItem?.kind === "Musica" ? "Música" : activeItem?.kind === "SFX" ? "Efeito sonoro" : "Áudio"}</span></div>
            <button aria-label="Tocar áudio" className="audio-transport-play" disabled={!activeItem} onClick={() => activeItem && playAudioPreview(activeItem)} title="Tocar áudio" type="button"><Play size={22} fill="currentColor" /></button>
            <button aria-label="Parar áudio" disabled={!auditionAudioID && !playbackStatus.startsWith("Preparando")} onClick={() => stopAudioPreview()} title="Parar áudio" type="button"><Square size={18} fill="currentColor" /></button>
            <div className="audio-groove-tempo"><label><span className="studio-visually-hidden">BPM</span><input type="number" aria-label="BPM" min={40} max={240} value={activeItem?.bpm ?? 120} disabled={!activeItem || activeItem.origin !== "Composto"} onChange={event => activeItem && Number.isFinite(event.currentTarget.valueAsNumber) && onUpdateAudioFields(activeItem.id, { bpm: Math.max(40, Math.min(240, event.currentTarget.valueAsNumber)) })} /><span>BPM</span></label>
              <button type="button" aria-label="Diminuir BPM" disabled={!activeItem || activeItem.origin !== "Composto" || (activeItem.bpm ?? 120) <= 40} onClick={() => activeItem && onUpdateAudioFields(activeItem.id, { bpm: (activeItem.bpm ?? 120) - 1 })}><Minus size={14} /></button>
              <button type="button" aria-label="Aumentar BPM" disabled={!activeItem || activeItem.origin !== "Composto" || (activeItem.bpm ?? 120) >= 240} onClick={() => activeItem && onUpdateAudioFields(activeItem.id, { bpm: (activeItem.bpm ?? 120) + 1 })}><Plus size={14} /></button>
            </div>
            <label className="audio-groove-switch"><input type="checkbox" aria-label="Loop" checked={activeItem?.loops ?? false} disabled={!activeItem || activeItem.kind === "SFX" && activeItem.origin === "Composto"} onChange={event => activeItem && onUpdateAudioFields(activeItem.id, { loops: event.currentTarget.checked })} /><span>Repetir</span></label>
            {activeItem?.origin === "Composto" ? <div className="audio-groove-preview-scope" aria-label="Trecho da prévia"><span>Prévia</span><button type="button" aria-pressed={previewScope === "pattern"} onClick={() => setPreviewScope("pattern")}>Padrão</button><button type="button" aria-pressed={previewScope === "sequence"} onClick={() => setPreviewScope("sequence")}>Música</button></div> : null}
          </div>
          {activeItem?.origin === "Composto" ? <>
            <div className="audio-groove-patterns" aria-label={`Padrões de ${activeItem.name}`}>
              {activeItem.patterns.map(pattern => <button type="button" key={pattern.id} aria-pressed={activeItem.activePatternID === pattern.id} className={activeItem.activePatternID === pattern.id ? "active" : ""} onClick={() => { setSelectedCell(null); onSetActivePattern(activeItem.id, pattern.id); }} onContextMenu={event => openPatternContextMenu(event, pattern.id, pattern.name)}>{pattern.name}</button>)}
              <button aria-label="Criar padrão" title="Criar padrão" onClick={() => onCreateAudioPattern(activeItem.id)} type="button"><Plus size={16} /></button>
              <div className="audio-groove-view-modes" role="group" aria-label="Modo do compositor">{composerTabs.map(tab => <button key={tab.id} type="button" aria-pressed={composerTab === tab.id} onClick={() => setComposerTab(tab.id)}>{tab.label}</button>)}</div>
            </div>
            {composerTab === "piano" ? <AudioGroovePiano item={activeItem} selectedCell={selectedCell} selectedChannelID={channelMixing.channelID} playbackStep={previewScope === "pattern" && auditionAudioID === activeItem.id ? playbackStepIndex : null}
              onSelectCell={setSelectedCell} onSetNote={(channelID, step, note) => onSetAudioChannelNote(activeItem.id, channelID, step, note)} onUpdateChannel={(channelID, fields) => onUpdateAudioChannelFields(activeItem.id, channelID, fields)} /> : null}
            {composerTab === "tracker" ? audioStepTracker(activeItem, selectedCell, setSelectedCell, onApplyAudioPatternPreset, onMoveAudioChannelNote, onSetAudioChannelNote, previewScope === "pattern" && auditionAudioID === activeItem.id ? playbackStepIndex : null) : null}
            {composerTab === "sequence" ? audioPatternSequence(activeItem, patternID => onSetActivePattern(activeItem.id, patternID), onUpdateAudioPatternOrderSlot, onDuplicatePattern, onClearPatternSequence, onMovePatternOrderSlot, onCreateAudioPattern, onRenameAudioPattern, onRemoveAudioPattern, openPatternContextMenu) : null}
            <div className={`audio-groove-dock groove-${grooveTrackTone(selectedRow?.type ?? "pulse1")}`} aria-label="Controles da faixa">
              <div className="audio-groove-dock-track"><span className="audio-groove-track-dot" aria-hidden="true" /><div><strong>{selectedRow ? grooveTrackName(selectedRow.label, selectedRow.type) : "Canal"}</strong><small>{selectedRow ? grooveHardwareLabel(selectedRow.type) : ""}</small></div></div>
              <label className="audio-groove-instrument"><span>Instrumento</span><select aria-label="Instrumento do canal" disabled={!channelMixing.channelID} value={selectedRow?.instrumentID ? `bank:${selectedRow.instrumentID}` : channelMixing.sampleAssetID ? `sample:${channelMixing.sampleAssetID}` : channelMixing.instrument} onChange={event => {
                if (!channelMixing.channelID) return; const value = event.currentTarget.value;
                onUpdateAudioChannelFields(activeItem.id, channelMixing.channelID, value.startsWith("bank:") ? { instrumentID: value.slice(5), sampleAssetID: null } : value.startsWith("sample:") ? { instrumentID: null, sampleAssetID: value.slice(7), sampleRootNote: "C4", sampleLoop: false } : { instrumentID: null, instrument: value, sampleAssetID: null });
              }}>
                <optgroup label="Timbres PSG">{Array.from(new Set([channelMixing.instrument, ...(selectedRow?.type.includes("wave") ? ["Wave Bass", "Wave Organ", "Wave Saw"] : selectedRow?.type.includes("noise") ? ["Noise Kit", "Noise Short"] : ["Pulse Lead", "Pulse Warm", "Pulse Bright"])] )).map(instrument => <option key={instrument} value={instrument}>{instrument}</option>)}</optgroup>
                {activeItem.kind === "Musica" && !/noise|sfx/i.test(selectedRow?.type ?? "") ? <>
                  <optgroup label="Banco do projeto">{presentation.instruments?.map(instrument => <option key={instrument.id} value={`bank:${instrument.id}`}>{instrument.name}</option>)}</optgroup>
                  <optgroup label="Samples da biblioteca">{presentation.sampleInstruments?.map(sample => <option key={sample.id} value={`sample:${sample.id}`}>{sample.name}</option>)}</optgroup>
                </> : null}
              </select></label>
              <label className="audio-groove-slider"><span>Volume <output>{channelMixing.volume}%</output></span><input aria-label="Volume da faixa" type="range" min={0} max={100} value={channelMixing.volume} onChange={event => channelMixing.channelID && onUpdateAudioChannelFields(activeItem.id, channelMixing.channelID, { volume: event.currentTarget.valueAsNumber })} /></label>
              <label className="audio-groove-slider"><span>Panorama <output>{(selectedRow?.pan ?? 0) === 0 ? "Centro" : (selectedRow?.pan ?? 0) < 0 ? "Esquerda" : "Direita"}</output></span><input aria-label="Panorama da faixa" type="range" min={-127} max={127} value={selectedRow?.pan ?? 0} onChange={event => channelMixing.channelID && onUpdateAudioChannelFields(activeItem.id, channelMixing.channelID, { pan: event.currentTarget.valueAsNumber })} /></label>
              <label className="audio-groove-envelope"><span>Envelope</span><select aria-label="Envelope" value={channelMixing.envelope} onChange={event => updateInstrumentControls({ envelope: event.currentTarget.value })}><option value="Soft ADSR">Suave</option><option value="Short Decay">Curto</option></select></label>
              {channelMixing.sampleAssetID ? <label className="audio-groove-switch"><input aria-label="Repetir sample" type="checkbox" checked={channelMixing.sampleLoop} onChange={event => updateInstrumentControls({ sampleLoop: event.currentTarget.checked })} /><span>Repetir sample</span></label> : null}
              <button ref={detailsButtonRef} className="audio-groove-details-button" type="button" aria-controls={detailsID} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}><SlidersHorizontal size={16} />Detalhes</button>
            </div>
          </> : <div className="audio-empty-composer"><strong>Áudio importado</strong><p>{activeItem?.format === "WAV" ? "Tocar reproduz o arquivo WAV original." : "A prévia deste formato está disponível no Play do jogo."}</p><button ref={detailsButtonRef} type="button" aria-controls={detailsID} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}>Detalhes</button></div>}
          <div className="audio-groove-status" role="status"><span>{playbackStatus}{playbackStepIndex !== null ? ` · ${playbackStepIndex + 1}/${previewPlan?.stepCount ?? activeItem?.stepCount}` : ""}{activeItem?.errors.length ? " · Áudio bloqueado — consulte Detalhes" : ""}</span><span>Espaço: tocar / parar · Delete: apagar nota</span></div>
        </section>
          {activeItem && detailsOpen ? <aside id={detailsID} className="audio-groove-details" aria-label={`Dados de ${activeItem.name}`} onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeDetails(); }
          }}>
            <header className="audio-groove-details-header"><h4>Detalhes da composição</h4><button ref={detailsCloseRef} type="button" aria-label="Fechar detalhes" onClick={closeDetails}><X size={18} /></button></header>
            <div className="audio-groove-details-body">
            <div className="audio-actions"><button type="button" onClick={() => onRenameAudio(activeItem.id, activeItem.name)}>Renomear</button><button type="button" onClick={() => onDuplicateAudio(activeItem.id, activeItem.name)}>Duplicar</button><button type="button" onClick={() => onNormalizeAudio(activeItem.id)}>Corrigir parâmetros</button><button type="button" onClick={() => onExportAudio(activeItem.id, activeItem.name)}>Exportar JSON</button><button type="button" className="danger-button" onClick={() => onRemoveAudio(activeItem.id, activeItem.name)}>Remover</button></div>
            {activeItem.origin === "Composto" ? <>
              <div className="audio-groove-note-tools" role="toolbar" aria-label="Ferramentas do piano roll">
                <button type="button" onClick={() => onApplyAudioPatternPreset(activeItem.id)}>Preset do pattern</button><button type="button" disabled={activeItem.previewRows.length >= (activeItem.kind === "SFX" ? 1 : 4)} onClick={() => onCreateAudioChannel(activeItem.id, activeItem.activePatternID)}>Novo canal</button>
                <button type="button" disabled={!selectedCell} onClick={() => selectedCell && onUpdateAudioChannelNote(activeItem.id, selectedCell.channelID, selectedCell.stepIndex, selectedRow?.cells[selectedCell.stepIndex]?.note ?? null)}>Editar nota</button>
                <button type="button" disabled={!selectedCell} onClick={() => selectedCell && onSetAudioChannelNote(activeItem.id, selectedCell.channelID, selectedCell.stepIndex, "")}>Limpar nota</button>
                {[-1, 1].map(delta => <button type="button" key={delta} disabled={!selectedCell} onClick={() => selectedCell && onTransposeAudioChannelNote(activeItem.id, selectedCell.channelID, selectedCell.stepIndex, delta)}>Nota {delta > 0 ? "+1" : "-1"}</button>)}
              </div>
              {channelMixing.sampleAssetID ? <div className="audio-groove-sample-details"><label>Nota original do WAV<select aria-label="Nota original do WAV" value={channelMixing.sampleRootNote} onChange={event => updateInstrumentControls({ sampleRootNote: event.currentTarget.value })}>{Array.from({ length: 6 }, (_, octave) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map(note => `${note}${octave + 2}`)).flat().map(note => <option key={note}>{note}</option>)}</select></label>
                <button type="button" disabled={!onCreateAudioInstrument || !channelMixing.channelID} onClick={() => channelMixing.channelID && onCreateAudioInstrument?.(activeItem.id, channelMixing.channelID)}>Salvar instrumento no banco</button>
                {selectedRow?.instrumentID ? <p>Instrumento compartilhado: afinação, envelope e repetição atualizam todas as faixas que o usam. Volume e panorama pertencem a esta faixa.</p> : <p>Afine pela nota gravada no sample. C4 é o padrão.</p>}
              </div> : null}
              <details><summary>Gerenciar canais</summary>{activeItem.previewRows.map(row => <div className="audio-actions" key={row.id}><strong>{row.label}</strong><button type="button" onClick={() => onRenameAudioChannel(activeItem.id, row.id, row.label)}>Renomear canal</button><button type="button" onClick={() => onUpdateAudioChannelType(activeItem.id, row.id, row.type)}>Tipo</button><button type="button" onClick={() => onTransposeAudioChannel(activeItem.id, row.id, -12)}>−8va</button><button type="button" onClick={() => onTransposeAudioChannel(activeItem.id, row.id, 12)}>+8va</button><button className="danger-button" type="button" onClick={() => onRemoveAudioChannel(activeItem.id, row.id, row.label)}>Remover canal</button></div>)}</details>
            </> : null}
            <details><summary>Banco de instrumentos ({presentation.instruments?.length ?? 0})</summary>{presentation.instruments?.length ? presentation.instruments.map(instrument => <div className="audio-groove-bank-row" key={instrument.id}><label>Nome<input aria-label={`Nome do instrumento ${instrument.name}`} value={instrument.name} onChange={event => onUpdateAudioInstrument?.(instrument.id, { name: event.currentTarget.value })} /></label><span>{instrument.usageCount} faixa(s)</span><button className="danger-button" type="button" disabled={instrument.usageCount > 0 || !onRemoveAudioInstrument} onClick={() => onRemoveAudioInstrument?.(instrument.id)}>Remover instrumento</button></div>) : <p>Escolha um WAV e salve o instrumento para reutilizá-lo em outras músicas.</p>}</details>
            <details><summary>Dados técnicos</summary>{audioEditor(activeItem, sceneOptions, onUpdateAudioFields)}</details>
            <details open={activeItem.errors.length > 0}><summary>Validação GBA · {activeItem.status === "Atencao" ? "Atenção" : activeItem.status}</summary>{[...activeItem.errors, ...activeItem.warnings].length ? <ul>{[...activeItem.errors, ...activeItem.warnings].map(message => <li key={message}>{message}</li>)}</ul> : <p>Sem bloqueios detectados. A ROM será validada ao compilar.</p>}</details>
            {exportSummary ? <details><summary>Exportação</summary><p>{exportSummary.fileName} · {exportSummary.exportID}</p><p>{exportSummary.playbackBadge} · {exportSummary.playbackLabel}</p>{activeExportDiagnostics.length ? <ul>{activeExportDiagnostics.map(entry => <li key={entry.message}>{entry.message}</li>)}</ul> : null}</details> : null}
            </div>
          </aside> : null}
      </div>
    </section>
  );
}
