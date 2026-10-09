import { useMemo, useState } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import type { InputReplay } from "../shared/inputReplay";
import {
  addAdvancedToolResourceInProject,
  applyAutotileTerrainInProject,
  installGameplayComponentInProject,
  type GameplayComponentID,
  updateAdvancedToolResourceInProject
} from "../shared/advancedTools";
import {
  corruptSaveLabSnapshot,
  duplicateSaveLabSnapshot,
  type SaveLabSnapshot
} from "../shared/optionalProductionTools";
import { isInputReplay } from "../shared/inputReplay";

export type AdvancedToolEditorID =
  | "autotile"
  | "stateMachines"
  | "inputReplay"
  | "saveLab"
  | "particles"
  | "cinematicTimeline"
  | "effectsSequencer"
  | "fontLocalization"
  | "gameplayComponents";

interface AdvancedToolEditorsProps {
  projectData: GBAProjectData;
  onChangeProjectData(data: GBAProjectData): void;
  onRunReplay?(replay: InputReplay): void;
  visibleEditors?: readonly AdvancedToolEditorID[];
}

type Resource = Record<string, unknown>;

function isRecord(value: unknown): value is Resource {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resources(data: GBAProjectData, key: string): Resource[] {
  const tools = isRecord(data.advancedTools) ? data.advancedTools : {};
  const value = tools[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resourceID(resource: Resource): string {
  return text(resource.id);
}

function firstResource(data: GBAProjectData, key: string): Resource | null {
  return resources(data, key)[0] ?? null;
}

function patchResource(
  data: GBAProjectData,
  key: string,
  resource: Resource,
  patch: Resource,
  onChange: (data: GBAProjectData) => void
): void {
  onChange(updateAdvancedToolResourceInProject(data, key, resourceID(resource), patch));
}

function Field(props: {
  label: string;
  value: string | number;
  type?: "text" | "number";
  min?: number;
  max?: number;
  onChange(value: string): void;
}): React.ReactElement {
  return (
    <label className="advanced-editor-field">
      <span>{props.label}</span>
      <input
        aria-label={props.label}
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function AutotileEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const terrain = firstResource(projectData, "autotileSets");
  const [selected, setSelected] = useState<number[]>([1, 4, 5, 6, 9]);
  const room = (Array.isArray(projectData.rooms) ? projectData.rooms : [])
    .find(isRecord);
  if (!terrain) return null;
  const roomID = text(room?.id) || text(room?.name);
  return (
    <section className="advanced-editor-card">
      <h3>Autotile</h3>
      <p>Máscara visual de quatro vizinhos. O resultado é gravado no tilemap da cena, portanto o preview e a ROM usam os mesmos índices.</p>
      <div className="advanced-editor-row">
        <Field
          label="Nome do terreno"
          onChange={(value) => patchResource(projectData, "autotileSets", terrain, { name: value }, onChangeProjectData)}
          value={text(terrain.name, "Terreno")}
        />
        <Field
          label="Tile base"
          min={0}
          onChange={(value) => patchResource(projectData, "autotileSets", terrain, { baseTile: Number(value) || 0 }, onChangeProjectData)}
          type="number"
          value={number(terrain.baseTile)}
        />
      </div>
      <div className="autotile-preview" aria-label="Preview do autotile">
        {Array.from({ length: 16 }, (_, index) => (
          <button
            aria-pressed={selected.includes(index)}
            className={selected.includes(index) ? "selected" : ""}
            key={index}
            onClick={() => setSelected((current) => current.includes(index)
              ? current.filter((cell) => cell !== index)
              : [...current, index])}
            type="button"
          >
            {number(terrain.baseTile) + index}
          </button>
        ))}
      </div>
      <button
        disabled={!roomID || selected.length === 0}
        onClick={() => onChangeProjectData(applyAutotileTerrainInProject(
          projectData,
          roomID,
          selected,
          number(terrain.baseTile)
        ))}
        type="button"
      >
        Aplicar na primeira cena
      </button>
    </section>
  );
}

function StateMachineEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const machine = firstResource(projectData, "actorStateMachines");
  if (!machine) return null;
  const states = Array.isArray(machine.states) ? machine.states.filter(isRecord) : [];
  return (
    <section className="advanced-editor-card">
      <h3>Máquinas de estado</h3>
      <p>Os estados são compilados para procedimentos de eventos nativos durante a exportação.</p>
      <div className="advanced-editor-row">
        <Field
          label="Nome da máquina"
          onChange={(value) => patchResource(projectData, "actorStateMachines", machine, { name: value }, onChangeProjectData)}
          value={text(machine.name, "Inimigo")}
        />
        <label className="advanced-editor-field">
          <span>Estado inicial</span>
          <select
            aria-label="Estado inicial"
            onChange={(event) => patchResource(projectData, "actorStateMachines", machine, { initialState: event.currentTarget.value }, onChangeProjectData)}
            value={text(machine.initialState, text(states[0]?.id))}
          >
            {states.map((state) => <option key={text(state.id)}>{text(state.id)}</option>)}
          </select>
        </label>
      </div>
      <Field
        label="Estados"
        onChange={(value) => {
          const nextIDs = value.split(",").map((item) => item.trim()).filter(Boolean);
          const byID = new Map(states.map((state) => [text(state.id), state]));
          patchResource(projectData, "actorStateMachines", machine, {
            states: nextIDs.map((id) => byID.get(id) ?? { id, onEnter: [], onUpdate: [], onExit: [] }),
            initialState: nextIDs.includes(text(machine.initialState)) ? machine.initialState : nextIDs[0] ?? ""
          }, onChangeProjectData);
        }}
        value={states.map((state) => text(state.id)).join(", ")}
      />
      <div className="state-machine-preview">
        {states.map((state, index) => (
          <span key={text(state.id)}>
            {text(state.id)}
            {index < states.length - 1 ? " → " : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

function ReplayEditor({ projectData, onRunReplay }: AdvancedToolEditorsProps): React.ReactElement | null {
  const replays = resources(projectData, "inputReplays");
  if (replays.length === 0) return null;
  return (
    <section className="advanced-editor-card">
      <h3>Replays de teste</h3>
      <div className="advanced-resource-list">
        {replays.map((replay) => (
          <article key={resourceID(replay)}>
            <strong>{resourceID(replay)}</strong>
            <span>{number(replay.frameCount)} frames</span>
            <span>seed {number(replay.seed)}</span>
            <span>slot {replay.initialSaveSlot === null ? "novo" : number(replay.initialSaveSlot)}</span>
            {onRunReplay && isInputReplay(replay) ? (
              <button
                onClick={() => onRunReplay(replay)}
                type="button"
              >
                Executar replay
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function SaveLabEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const snapshots = resources(projectData, "saveLabSnapshots");
  const snapshot = snapshots[0];
  if (!snapshot) return null;
  const typed = snapshot as unknown as SaveLabSnapshot;
  return (
    <section className="advanced-editor-card">
      <h3>Laboratório de saves</h3>
      <div className="advanced-editor-row">
        <Field
          label="Nome do estado"
          onChange={(value) => patchResource(projectData, "saveLabSnapshots", snapshot, { name: value }, onChangeProjectData)}
          value={text(snapshot.name)}
        />
        <Field
          label="Slot"
          min={0}
          max={15}
          onChange={(value) => patchResource(projectData, "saveLabSnapshots", snapshot, { slot: Number(value) || 0 }, onChangeProjectData)}
          type="number"
          value={number(snapshot.slot)}
        />
      </div>
      <div className="advanced-editor-actions">
        <button
          onClick={() => onChangeProjectData(addAdvancedToolResourceInProject(
            projectData,
            "saveLabSnapshots",
            duplicateSaveLabSnapshot(typed, `save-${Date.now()}`, `${text(snapshot.name)} cópia`) as unknown as Resource
          ))}
          type="button"
        >
          Duplicar estado
        </button>
        {(["checksum", "truncate", "missing-slot"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onChangeProjectData(addAdvancedToolResourceInProject(
              projectData,
              "saveLabSnapshots",
              {
                ...corruptSaveLabSnapshot(typed, mode),
                id: `${resourceID(snapshot)}-${mode}`
              } as unknown as Resource
            ))}
            type="button"
          >
            Simular {mode}
          </button>
        ))}
      </div>
    </section>
  );
}

function ParticleEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const emitter = firstResource(projectData, "particleEmitters");
  if (!emitter) return null;
  const count = Math.min(32, Math.max(1, number(emitter.maxParticles, 1)));
  return (
    <section className="advanced-editor-card">
      <h3>Partículas</h3>
      <div className="advanced-editor-row">
        <Field
          label="Nome do emissor"
          onChange={(value) => patchResource(projectData, "particleEmitters", emitter, { name: value }, onChangeProjectData)}
          value={text(emitter.name)}
        />
        <label className="advanced-editor-field">
          <span>Preset</span>
          <select
            aria-label="Preset"
            onChange={(event) => patchResource(projectData, "particleEmitters", emitter, { preset: event.currentTarget.value }, onChangeProjectData)}
            value={text(emitter.preset, "dust")}
          >
            {["dust", "rain", "snow", "sparks", "smoke", "explosion"].map((preset) => <option key={preset}>{preset}</option>)}
          </select>
        </label>
        <Field
          label="Máximo de partículas"
          min={0}
          max={128}
          onChange={(value) => patchResource(projectData, "particleEmitters", emitter, { maxParticles: Number(value) || 0 }, onChangeProjectData)}
          type="number"
          value={number(emitter.maxParticles)}
        />
        <Field
          label="Máximo por scanline"
          min={0}
          max={128}
          onChange={(value) => patchResource(projectData, "particleEmitters", emitter, { maxPerScanline: Number(value) || 0 }, onChangeProjectData)}
          type="number"
          value={number(emitter.maxPerScanline)}
        />
      </div>
      <div className={`particle-preview preset-${text(emitter.preset, "dust")}`} aria-label="Preview de partículas">
        {Array.from({ length: count }, (_, index) => <i key={index} style={{ "--particle-index": index } as React.CSSProperties} />)}
      </div>
    </section>
  );
}

function TimelineEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const timeline = firstResource(projectData, "cinematicTimelines");
  if (!timeline) return null;
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks.filter(isRecord) : [];
  const addKeyframe = (): void => {
    const camera = tracks.find((track) => text(track.kind) === "camera") ?? { kind: "camera", keyframes: [] };
    const keyframes = Array.isArray(camera.keyframes) ? camera.keyframes : [];
    const nextCamera = { ...camera, keyframes: [...keyframes, { frame: Math.round(number(timeline.durationFrames, 60) / 2), command: "camera_move 1 0" }] };
    patchResource(projectData, "cinematicTimelines", timeline, {
      tracks: [...tracks.filter((track) => text(track.kind) !== "camera"), nextCamera]
    }, onChangeProjectData);
  };
  return (
    <section className="advanced-editor-card">
      <h3>Timeline cinematográfica</h3>
      <Field
        label="Duração da timeline"
        min={1}
        onChange={(value) => patchResource(projectData, "cinematicTimelines", timeline, { durationFrames: Number(value) || 1 }, onChangeProjectData)}
        type="number"
        value={number(timeline.durationFrames, 1)}
      />
      <div className="timeline-preview">
        {tracks.flatMap((track) => Array.isArray(track.keyframes)
          ? track.keyframes.filter(isRecord).map((keyframe, index) => (
              <i
                key={`${text(track.kind)}-${index}`}
                style={{ left: `${Math.min(100, number(keyframe.frame) / Math.max(1, number(timeline.durationFrames)) * 100)}%` }}
                title={`${text(track.kind)} · frame ${number(keyframe.frame)}`}
              />
            ))
          : [])}
      </div>
      <button onClick={addKeyframe} type="button">Adicionar keyframe de câmera</button>
    </section>
  );
}

function EffectsEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const sequence = firstResource(projectData, "effectSequences");
  if (!sequence) return null;
  const tracks = Array.isArray(sequence.tracks) ? sequence.tracks.filter(isRecord) : [];
  return (
    <section className="advanced-editor-card">
      <h3>Sequenciador de efeitos</h3>
      <div className="advanced-editor-row">
        <Field
          label="Duração dos efeitos"
          min={1}
          onChange={(value) => patchResource(projectData, "effectSequences", sequence, { durationFrames: Number(value) || 1 }, onChangeProjectData)}
          type="number"
          value={number(sequence.durationFrames, 1)}
        />
        <label className="advanced-editor-field">
          <span>Efeito principal</span>
          <select
            aria-label="Efeito principal"
            onChange={(event) => {
              const current = tracks[0] ?? { keyframes: [{ frame: 0, value: 0 }, { frame: number(sequence.durationFrames, 60), value: 16 }] };
              patchResource(projectData, "effectSequences", sequence, {
                tracks: [{ ...current, kind: event.currentTarget.value }, ...tracks.slice(1)]
              }, onChangeProjectData);
            }}
            value={text(tracks[0]?.kind, "fade")}
          >
            {["palette", "blend", "mosaic", "fade", "wave", "scanline"].map((kind) => <option key={kind}>{kind}</option>)}
          </select>
        </label>
      </div>
      <div className={`effects-preview effect-${text(tracks[0]?.kind, "fade")}`} />
    </section>
  );
}

function FontLocalizationEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const font = firstResource(projectData, "fontProjects");
  const locale = firstResource(projectData, "localizationInterchanges");
  if (!font && !locale) return null;
  const glyphs = font && Array.isArray(font.glyphs) ? font.glyphs.filter(isRecord) : [];
  return (
    <section className="advanced-editor-card">
      <h3>Fontes e localização</h3>
      {font ? (
        <>
          <div className="advanced-editor-row">
            <Field
              label="Nome da fonte"
              onChange={(value) => patchResource(projectData, "fontProjects", font, { name: value }, onChangeProjectData)}
              value={text(font.name)}
            />
            <Field
              label="Largura do glifo"
              min={1}
              max={16}
              onChange={(value) => patchResource(projectData, "fontProjects", font, { glyphWidth: Number(value) || 1 }, onChangeProjectData)}
              type="number"
              value={number(font.glyphWidth, 8)}
            />
            <Field
              label="Altura do glifo"
              min={1}
              max={16}
              onChange={(value) => patchResource(projectData, "fontProjects", font, { glyphHeight: Number(value) || 1 }, onChangeProjectData)}
              type="number"
              value={number(font.glyphHeight, 8)}
            />
          </div>
          <div className="glyph-preview">
            {glyphs.map((glyph) => <span key={text(glyph.character)}>{text(glyph.character, "?")}</span>)}
            <button
              onClick={() => patchResource(projectData, "fontProjects", font, {
                glyphs: [...glyphs, { character: String.fromCharCode(65 + glyphs.length % 26), width: number(font.glyphWidth, 8), pixels: "" }]
              }, onChangeProjectData)}
              type="button"
            >
              + glifo
            </button>
          </div>
        </>
      ) : null}
      {locale ? (
        <div className="advanced-editor-row">
          <Field
            label="Idioma de origem"
            onChange={(value) => patchResource(projectData, "localizationInterchanges", locale, { sourceLocale: value }, onChangeProjectData)}
            value={text(locale.sourceLocale, "pt-BR")}
          />
          <Field
            label="Idiomas de destino"
            onChange={(value) => patchResource(projectData, "localizationInterchanges", locale, {
              targetLocales: value.split(",").map((item) => item.trim()).filter(Boolean)
            }, onChangeProjectData)}
            value={Array.isArray(locale.targetLocales) ? locale.targetLocales.join(", ") : ""}
          />
        </div>
      ) : null}
    </section>
  );
}

const gameplayComponents: Array<{ id: GameplayComponentID; label: string }> = [
  { id: "dialogue", label: "Diálogo" },
  { id: "shop", label: "Loja" },
  { id: "quest", label: "Quest" },
  { id: "inventory", label: "Inventário" },
  { id: "checkpoint", label: "Checkpoint" },
  { id: "door", label: "Porta" },
  { id: "enemy", label: "Inimigo" },
  { id: "hud", label: "HUD" }
];

function GameplayComponentsEditor({ projectData, onChangeProjectData }: AdvancedToolEditorsProps): React.ReactElement | null {
  const bundle = firstResource(projectData, "gameplayComponents");
  const installed = useMemo(() => bundle && Array.isArray(bundle.installed)
    ? bundle.installed.filter((item): item is string => typeof item === "string")
    : [], [bundle]);
  if (!bundle) return null;
  return (
    <section className="advanced-editor-card">
      <h3>Biblioteca de gameplay</h3>
      <div className="gameplay-component-grid">
        {gameplayComponents.map((component) => (
          <button
            className={installed.includes(component.id) ? "installed" : ""}
            key={component.id}
            onClick={() => {
              const withEvent = installGameplayComponentInProject(projectData, component.id);
              onChangeProjectData(updateAdvancedToolResourceInProject(
                withEvent,
                "gameplayComponents",
                resourceID(bundle),
                { installed: [...new Set([...installed, component.id])] }
              ));
            }}
            type="button"
          >
            {installed.includes(component.id) ? "✓ " : "+ "}{component.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function AdvancedToolEditors(props: AdvancedToolEditorsProps): React.ReactElement {
  const visible = new Set<AdvancedToolEditorID>(props.visibleEditors ?? [
    "autotile",
    "stateMachines",
    "inputReplay",
    "saveLab",
    "particles",
    "cinematicTimeline",
    "effectsSequencer",
    "fontLocalization",
    "gameplayComponents"
  ]);
  return (
    <div className="advanced-tool-editors">
      {visible.has("autotile") ? <AutotileEditor {...props} /> : null}
      {visible.has("stateMachines") ? <StateMachineEditor {...props} /> : null}
      {visible.has("inputReplay") ? <ReplayEditor {...props} /> : null}
      {visible.has("saveLab") ? <SaveLabEditor {...props} /> : null}
      {visible.has("particles") ? <ParticleEditor {...props} /> : null}
      {visible.has("cinematicTimeline") ? <TimelineEditor {...props} /> : null}
      {visible.has("effectsSequencer") ? <EffectsEditor {...props} /> : null}
      {visible.has("fontLocalization") ? <FontLocalizationEditor {...props} /> : null}
      {visible.has("gameplayComponents") ? <GameplayComponentsEditor {...props} /> : null}
    </div>
  );
}
