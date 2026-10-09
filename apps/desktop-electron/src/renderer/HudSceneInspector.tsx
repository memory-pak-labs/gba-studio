import { HUD_VALUE_BINDING_LABELS } from "../shared/hudPresets";
import { HudElementBehaviorInspector } from "./HudElementBehaviorInspector";
import { InterfaceThemeInspector } from "./InterfaceThemeInspector";
import type { InterfaceThemeChange } from "../shared/interfaceThemes";
import { useEffect, useRef, useState } from "react";
import { InspectorNumber } from "./InspectorControls";
import { ProjectReferencePicker } from "./studioUi";
import { HudPreviewSnapshot } from "./hudPreviewSnapshot";
import type { GBAProjectData } from "../shared/projectFile";
import { projectAssetReferenceOptions } from "../shared/projectReferenceOptions";
import { deriveFontCatalog } from "../shared/fontCatalog";
import { resolveAssetURL } from "../shared/spriteAssetURL";
import { hudPresetUsages, updateHudComponentGeometry, HUD_PROJECT_PRESET_ID } from "../shared/hudSceneAuthoring";
import { DEFAULT_HUD_PRESET, HUD_CORNER_ANCHORS, deriveHudPresetBudget, hudAnchorOffsetsForComponent, type HudComponent, type HudComponentKind, type HudCornerAnchor, type HudPresetBinding, type HudPresetPresentation, type UpdateHudPresetFields } from "../shared/hudPresets";
import type { RoomsWorkspaceRoom } from "../shared/roomsWorkspace";

export interface HudSceneInspectorProps {
  onUpdateInterfaceTheme?(change: InterfaceThemeChange): void;
  binding: HudPresetBinding | null;
  previewPreset: HudPresetPresentation | null;
  onPreviewPreset(presetID: string | null): void;
  onBindHud?(roomID: string, presetID: string | null, screenID?: string): void;
  onCreateHudVariationForRoom?(roomID: string, sourcePresetID: string, screenID?: string): void | Promise<void>;
  onSelectComponent(componentID: string | null): void;
  onUpdateHudPreset?(presetID: string, fields: UpdateHudPresetFields): void;
  onSetActiveHudPreset?(presetID: string): void;
  onDuplicateHudPreset?(presetID: string): void;
  onRemoveHudPreset?(presetID: string): void;
  onImportAssets?(): void | Promise<void>;
  onEditSharedPreset(presetID: string): void;
  editingSharedPresetID: string | null;
  presets: HudPresetPresentation[];
  activePresetID: string;
  projectData?: GBAProjectData | null;
  projectPath?: string;
  room: RoomsWorkspaceRoom;
  selectedComponentID: string | null;
  viewMode: "edit" | "preview";
  onViewMode(mode: "edit" | "preview"): void;
  screenID?: string;
  screens?: Array<{ id: string; title: string }>;
  onSelectScreen?(id: string): void;
  unavailableReason?: string;
  readOnly?: boolean;
}

export const hudKindLabels: Record<HudComponentKind, string> = { frame: "Moldura", text: "Texto", bar: "Barra", icon: "Ícone" };
const anchors: Record<HudCornerAnchor, string> = { freeform: "Livre", "top-left": "Superior esquerdo", "top-right": "Superior direito", "bottom-left": "Inferior esquerdo", "bottom-right": "Inferior direito" };

export function hudAssetURL(data: GBAProjectData | null | undefined, path: string | undefined, name: string): string | null {
  const asset = (Array.isArray(data?.assets) ? data.assets : []).find(asset => asset.name === name || asset.id === name);
  if (!asset) return null;
  const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
  return resolveAssetURL(path, String(metadata.source ?? asset.relativePath ?? "") || null, String(asset.bundledDefaultAsset ?? metadata.bundledDefaultAsset ?? "") || null);
}

export function HudSceneInspector(props: HudSceneInspectorProps): React.ReactElement {
  const { binding, previewPreset, onPreviewPreset, presets, activePresetID, projectData, projectPath, room, selectedComponentID, onSelectComponent, onUpdateHudPreset } = props;
  const [section, setSection] = useState<"composition" | "appearance">("composition");
  const [elementTab, setElementTab] = useState<"properties" | "states" | "events">("properties");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const libraryRef = useRef<HTMLDialogElement>(null);
  const elementFieldsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setElementTab("properties"); elementFieldsRef.current?.scrollIntoView({ block: "nearest" }); }, [selectedComponentID]);
  useEffect(() => {
    if (libraryOpen) {
      libraryRef.current?.showModal();
      libraryRef.current?.querySelector("input")?.focus();
    }
    else libraryRef.current?.close();
  }, [libraryOpen]);
  const preset = previewPreset ?? binding?.preset ?? null;
  const uses = preset && projectData ? hudPresetUsages(projectData, preset.id) : [];
  const shared = Boolean(preset && (uses.some(use => use.id !== room.id) || preset.id === activePresetID));
  const canEdit = Boolean(!props.readOnly && !props.unavailableReason && preset && !preset.builtIn && onUpdateHudPreset && (!shared || props.editingSharedPresetID === preset.id));
  const selected = preset?.components.find(component => component.id === selectedComponentID) ?? null;
  const budget = preset ? deriveHudPresetBudget(preset) : null;
  const assets = projectData ? projectAssetReferenceOptions(projectData, ["Sprite", "UI", "Background"]) : [];
  const fonts = projectData ? deriveFontCatalog(projectData) : null;
  const updatePreset = (fields: UpdateHudPresetFields) => { if (canEdit && preset) onUpdateHudPreset?.(preset.id, fields); };
  const updateComponent = (fields: Partial<HudComponent>) => {
    if (!selected || !preset) return;
    const geometry = ["x", "y", "width", "height"].some(key => key in fields);
    const next = geometry ? updateHudComponentGeometry(selected, fields) : { ...selected, ...fields };
    updatePreset({ components: preset.components.map(component => component.id === selected.id ? next : component) });
  };
  const create = (sourceID: string) => { onPreviewPreset(null); void props.onCreateHudVariationForRoom?.(room.id, sourceID, props.screenID); };
  const bind = (id: string | null) => { props.onBindHud?.(room.id, id, props.screenID); onPreviewPreset(null); onSelectComponent(null); };
  return <div className="room-hud-scene-inspector" aria-label="Editor contextual de HUD">
    <section className="hud-authoring-section">
      <div className="hud-authoring-heading"><h5>HUD da cena</h5><span>240×160</span></div>
      {props.screens?.length ? <label>Tela do menu<select aria-label="Tela do menu para editar HUD" value={props.screenID} onChange={event => props.onSelectScreen?.(event.currentTarget.value)}>{props.screens.map(screen => <option key={screen.id} value={screen.id}>{screen.title || screen.id}</option>)}</select></label> : null}
      <label>HUD aplicada<select aria-label="Preset de HUD desta cena" disabled={!props.onBindHud || Boolean(props.unavailableReason)} value={binding?.requestedPresetId ?? ""} onChange={event => bind(event.currentTarget.value || null)}>
        <option value="">Sem HUD</option><option value={HUD_PROJECT_PRESET_ID}>Usar padrão do projeto</option>
        {presets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        {binding?.status === "missing" ? <option value={binding.requestedPresetId ?? ""}>Preset não encontrado</option> : null}
      </select></label>
      {binding?.status === "missing" ? <p className="hud-scope-notice" role="alert">Preset não encontrado: {binding.requestedPresetId}. A prévia usa {binding.preset.name}. Escolha uma HUD válida para corrigir o vínculo.</p> : null}
      {props.unavailableReason ? <p role="status">{props.unavailableReason}</p> : null}
      <div className="hud-authoring-actions"><button onClick={() => setLibraryOpen(true)} type="button">Biblioteca de HUDs</button><button disabled={!props.onCreateHudVariationForRoom || Boolean(props.unavailableReason)} onClick={() => create(DEFAULT_HUD_PRESET.id)} type="button">Nova HUD</button></div>
      {previewPreset ? <div className="hud-scope-notice"><strong>Prévia da biblioteca · {previewPreset.name}</strong><span>A seleção ainda não altera esta cena.</span><div className="hud-authoring-actions"><button disabled={Boolean(props.unavailableReason)} onClick={() => bind(previewPreset.id)} type="button">Usar nesta cena</button><button onClick={() => onPreviewPreset(null)} type="button">Voltar à HUD aplicada</button></div></div> : <p className="muted">{binding ? `${binding.preset.name} · ${binding.source === "project" ? "Padrão do projeto" : "Vinculada à cena"}` : "Nenhuma HUD aplicada. Escolha uma na biblioteca ou crie uma nova."}</p>}
      {preset ? <div className="hud-scope-notice"><span>{preset.builtIn ? "Modelo integrado · somente leitura" : shared ? "Preset compartilhado" : "Preset do projeto"} · {uses.length} cena(s)</span>{uses.length ? <details><summary>Onde é usada</summary><p>{uses.map(use => use.name).join(", ")}</p></details> : null}<div className="hud-authoring-actions"><button disabled={!props.onCreateHudVariationForRoom || Boolean(props.unavailableReason)} onClick={() => create(preset.id)} type="button">Personalizar nesta cena</button>{shared && !preset.builtIn && !canEdit ? <button onClick={() => props.onEditSharedPreset(preset.id)} type="button">Editar compartilhada</button> : null}</div></div> : null}
    </section>
    {preset ? <>
      <div className="hud-authoring-tabs" role="tablist" aria-label="Edição da HUD"><button role="tab" aria-selected={section === "composition"} onClick={() => setSection("composition")}>Composição</button><button role="tab" aria-selected={section === "appearance"} onClick={() => setSection("appearance")}>Aparência</button></div>
      {section === "composition" ? <section className="hud-authoring-section" aria-label="Componentes da HUD">

        {preset.mode === "standard" ? <p>HUD padrão. Personalize ou adicione um elemento para criar uma composição avançada.</p> : null}
        <details open={!selected}><summary>Elementos · {preset.components.length}</summary><div className="room-hud-component-list" role="listbox" aria-label="Componentes da HUD">{preset.components.map(component => <button role="option" key={component.id} aria-selected={selected?.id === component.id} className={selected?.id === component.id ? "is-selected" : ""} onClick={() => onSelectComponent(component.id)} type="button"><span>{component.label || hudKindLabels[component.kind]}</span><small>{hudKindLabels[component.kind]} · {component.x},{component.y}{!component.visible ? " · oculto" : ""}</small></button>)}</div>
        </details>
        <details><summary>Grupos por âncora</summary>{HUD_CORNER_ANCHORS.map(anchor => {
          const group = preset.components.filter(component => component.anchor === anchor);
          return <label className="hud-anchor-toggle" key={anchor}><input type="checkbox" disabled={!canEdit || !group.length}
            checked={group.length > 0 && group.every(component => component.visible)}
            onChange={event => updatePreset({ components: preset.components.map(component => component.anchor === anchor ? { ...component, visible: event.currentTarget.checked } : component) })} />
            {anchors[anchor]} · {group.length} elemento(s)</label>;
        })}</details>
        {selected ? <div className="room-hud-component-fields" ref={elementFieldsRef}><h5>{selected.label || hudKindLabels[selected.kind]}</h5>
          <div className="hud-authoring-tabs" role="tablist" aria-label="Elemento da HUD">{([["properties","Propriedades"],["states","Estados"],["events","Eventos"]] as const).map(([tab,label])=><button type="button" role="tab" key={tab} aria-selected={elementTab===tab} onClick={()=>setElementTab(tab)}>{label}</button>)}</div>
          {elementTab!=="properties" ? <HudElementBehaviorInspector data={projectData} value={selected.behavior} canEdit={canEdit} section={elementTab} onChange={behavior=>updateComponent({behavior})}/> : <>
          <label>Nome<input disabled={!canEdit} value={selected.label} onChange={event => updateComponent({ label: event.currentTarget.value })} /></label>
          {selected.valueBinding ? <p>Valor da partida: {HUD_VALUE_BINDING_LABELS[selected.valueBinding]}. {selected.kind === "text" ? "O texto abaixo é apenas uma prévia." : "Atualizado automaticamente durante o Play."}</p> : null}
          {selected.kind === "text" ? <label>Texto de prévia<input disabled={!canEdit} value={selected.text} onChange={event => updateComponent({ text: event.currentTarget.value })} /></label> : null}
          {selected.kind === "frame" || selected.kind === "icon" ? <label>{selected.kind === "frame" ? "Imagem da moldura" : "Sprite do ícone"}<ProjectReferencePicker ariaLabel={selected.kind === "frame" ? "Imagem da moldura" : "Sprite do ícone"} disabled={!canEdit} options={assets} emptyLabel={selected.kind === "frame" ? "Usar a skin da HUD" : "Sem sprite"} value={selected.asset} onChange={asset => updateComponent({ asset })} /></label> : null}
          <div className="room-hud-component-size-grid">{(["x", "y", "width", "height"] as const).map(field => <InspectorNumber key={field} disabled={!canEdit} label={{x:"X",y:"Y",width:"Largura",height:"Altura"}[field]} min={field === "width" || field === "height" ? 8 : 0} max={field === "x" ? 240-selected.width : field === "y" ? 160-selected.height : field === "width" ? 240 : 160} step={8} value={selected[field]} onChange={value => updateComponent({ [field]: value })} />)}</div>
          <label>Âncora<select disabled={!canEdit} value={selected.anchor ?? "freeform"} onChange={event => { const anchor = event.currentTarget.value as HudCornerAnchor; const offsets = hudAnchorOffsetsForComponent(selected, anchor); updateComponent({ anchor, anchorOffsetX: offsets.x, anchorOffsetY: offsets.y }); }}>{Object.entries(anchors).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><input type="checkbox" disabled={!canEdit} checked={selected.visible} onChange={event => updateComponent({ visible: event.currentTarget.checked })} /> Visível no jogo</label>
          <InspectorNumber disabled={!canEdit} label="Ordem da camada" min={0} max={15} value={selected.zIndex} onChange={zIndex => updateComponent({ zIndex })} />

          </>}
        </div> : <p>Selecione um elemento no canvas ou na lista. Arraste para mover; use as setas para ajustar na grade.</p>}
      </section> : <section className="hud-authoring-section" aria-label="Aparência da HUD">
        {projectData && props.onUpdateInterfaceTheme ? <InterfaceThemeInspector projectData={projectData} projectPath={projectPath} roomId={room.id} focus="hud" onChange={props.onUpdateInterfaceTheme} /> : null}
        <label>Nome da HUD<input disabled={!canEdit} value={preset.name} onChange={event => updatePreset({ name: event.currentTarget.value })} /></label>
        <label>Descrição<input disabled={!canEdit} value={preset.description} onChange={event => updatePreset({ description: event.currentTarget.value })} /></label>
        <label>Modo<select disabled={!canEdit} value={preset.mode} onChange={event => updatePreset({ mode: event.currentTarget.value as "standard" | "advanced" })}><option value="standard">Padrão</option><option value="advanced">Composição avançada</option></select></label>
        <div className="room-hud-component-size-grid"><InspectorNumber disabled={!canEdit} label="Largura da HUD" min={24} max={240} step={8} value={preset.width} onChange={width => updatePreset({ width })} /><InspectorNumber disabled={!canEdit} label="Altura da HUD" min={8} max={160} step={8} value={preset.height} onChange={height => updatePreset({ height })} /></div>
        <label>Posição da HUD<select disabled={!canEdit} value={preset.position} onChange={event => updatePreset({ position: event.currentTarget.value as "Superior" | "Inferior" })}><option>Superior</option><option>Inferior</option></select></label>
        <label>Imagem própria do preset<ProjectReferencePicker ariaLabel="Fundo da HUD" disabled={!canEdit} options={assets} value={presets.find(item => item.id === preset.id)?.backgroundImage ?? ""} emptyLabel="Usar moldura do tema" onChange={backgroundImage => updatePreset({ backgroundImage })} actions={props.onImportAssets ? [{label:"Importar imagem",run:() => props.onImportAssets?.()}] : []} /></label>
        <label>Seletor<ProjectReferencePicker ariaLabel="Seletor da HUD" disabled={!canEdit} options={assets} value={preset.selectorImage} emptyLabel="Sem seletor" onChange={selectorImage => updatePreset({ selectorImage })} /></label>
        <label>Fonte da HUD<select disabled={!canEdit} value={preset.font} onChange={event => updatePreset({ font: event.currentTarget.value })}><option value="">Fonte do projeto</option>{preset.font && !fonts?.fonts.some(font => font.value === preset.font) ? <option>{preset.font}</option> : null}{fonts?.fonts.map(font => <option key={font.id} value={font.value} disabled={!font.ready}>{font.name}</option>)}</select></label>
        <details><summary>Apresentação de batalha</summary><label><input disabled={!canEdit} type="checkbox" checked={preset.showHealthBars ?? true} onChange={event => updatePreset({ showHealthBars: event.currentTarget.checked })} /> Barras de HP</label><label><input disabled={!canEdit} type="checkbox" checked={preset.showExperienceBar ?? true} onChange={event => updatePreset({ showExperienceBar: event.currentTarget.checked })} /> Barra de experiência</label></details>
      </section>}
      <details className="hud-authoring-section"><summary>Gerenciar preset</summary><div className="hud-authoring-actions"><button disabled={!props.onDuplicateHudPreset} onClick={() => props.onDuplicateHudPreset?.(preset.id)} type="button">Duplicar preset</button><button disabled={!props.onSetActiveHudPreset || preset.id === activePresetID} onClick={() => props.onSetActiveHudPreset?.(preset.id)} type="button">Definir como padrão do projeto</button><button disabled={preset.builtIn || uses.length > 0 || !props.onRemoveHudPreset} onClick={() => { props.onRemoveHudPreset?.(preset.id); onPreviewPreset(null); }} type="button">Remover preset</button></div>{uses.length ? <small>Para remover, substitua a HUD nas cenas que a utilizam.</small> : null}</details>
      {budget ? <details className="hud-authoring-section"><summary>Orçamento estimado · {budget.status === "ok" ? "Dentro do limite" : "Revisar"}</summary><p>{budget.visibleComponentCount} elementos visíveis · {budget.estimatedOamEntries}/{budget.oamBudget} OBJ · {budget.estimatedVramTiles}/{budget.vramTileBudget} tiles VRAM</p><p>{budget.fallbackIconCount} ícone(s) sem imagem. A exportação valida o orçamento real da cena.</p>{preset.warning ? <p role="status">{preset.warning}</p> : null}</details> : null}
    </> : null}
    <dialog ref={libraryRef} className="hud-library-dialog" aria-label="Biblioteca de HUDs" onCancel={() => setLibraryOpen(false)} onClose={() => setLibraryOpen(false)}>
      <div className="hud-authoring-heading"><h3>Biblioteca de HUDs</h3><button onClick={() => setLibraryOpen(false)} type="button">Fechar</button></div>
      <label>Buscar HUD<input autoFocus value={query} onChange={event => setQuery(event.currentTarget.value)} type="search" /></label>
      <div className="hud-library-grid">{presets.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item => <button key={item.id} className="hud-library-card" onClick={() => { onPreviewPreset(item.id); onSelectComponent(null); setLibraryOpen(false); }} type="button"><HudPreviewSnapshot preset={item} backgroundAssetURL={hudAssetURL(projectData,projectPath,item.backgroundImage)} resolveComponentAssetURL={component => hudAssetURL(projectData,projectPath,component.asset || (component.kind === "frame" ? item.backgroundImage : ""))} /><strong>{item.name}</strong><small>{item.description}</small><span>Examinar preset</span></button>)}</div>
      {!presets.some(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ? <p>Nenhuma HUD encontrada.</p> : null}
    </dialog>
  </div>;
}
