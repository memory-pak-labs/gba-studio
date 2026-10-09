import { Copy, Eye, Frame, Grid3X3, Image, Magnet, MousePointer2, RectangleHorizontal, Trash2, Type, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import type { HudComponentKind, HudPresetPresentation, UpdateHudPresetFields } from "../shared/hudPresets";
import { updateHudComponentGeometry } from "../shared/hudSceneAuthoring";
import { hudKindLabels } from "./HudSceneInspector";

const hudToolKinds: HudComponentKind[] = ["text", "icon", "bar", "frame"];
const hudToolIcons: Record<HudComponentKind, LucideIcon> = { text: Type, icon: Image, bar: RectangleHorizontal, frame: Frame };

export interface HudCanvasToolbarProps {
  preset?: HudPresetPresentation | null;
  canEdit: boolean;
  selectedComponentID: string | null;
  onSelectComponent(id: string | null): void;
  onUpdateHudPreset?(id: string, fields: UpdateHudPresetFields): void;
  viewMode: "edit" | "preview";
  onViewMode(mode: "edit" | "preview"): void;
  gridVisible?: boolean;
  onToggleGrid?(): void;
}
export function HudCanvasToolbar(props: HudCanvasToolbarProps): React.ReactElement {
  const { preset, canEdit, selectedComponentID, onSelectComponent, onUpdateHudPreset } = props;
  const selected = preset?.components.find(item => item.id === selectedComponentID);
  const remove = () => {
    if (!preset || !selected || !canEdit || props.viewMode !== "edit") return;
    onUpdateHudPreset?.(preset.id, { components: preset.components.filter(item => item.id !== selected.id) });
    onSelectComponent(null);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true'], dialog[open]")) return;
      // HUD tool owns deletion, including a locked/read-only selection.
      event.preventDefault();
      remove();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [preset, canEdit, selectedComponentID, props.viewMode, onUpdateHudPreset, onSelectComponent]);
  const add = (kind: HudComponentKind) => {
    if (!preset || !canEdit || preset.components.length >= 64) return;
    const id = `hud-${kind}-${crypto.randomUUID()}`;
    onUpdateHudPreset?.(preset.id, { mode: "advanced", components: [...preset.components, { id, kind, label: hudKindLabels[kind], text: kind === "text" ? "Texto" : "", asset: "", x: 8, y: 8, width: kind === "bar" ? 64 : 32, height: kind === "frame" ? 24 : 8, zIndex: Math.min(15, preset.components.length), visible: true, anchor: "freeform" }] });
    onSelectComponent(id);
    props.onViewMode("edit");
  };
  return <div className="hud-canvas-toolbar" role="toolbar" aria-label="Ferramentas da HUD">
    <button type="button" aria-pressed={props.viewMode === "edit"} onClick={() => props.onViewMode("edit")}><MousePointer2 aria-hidden="true" size={16}/><span>Selecionar</span></button>
    {hudToolKinds.map(kind => {
      const Icon = hudToolIcons[kind];
      return <button type="button" key={kind} aria-label={`+ ${hudKindLabels[kind]}`} title={`Adicionar ${hudKindLabels[kind].toLocaleLowerCase()}`} disabled={!canEdit || !preset || preset.components.length >= 64} onClick={() => add(kind)}><Icon aria-hidden="true" size={16}/><span>{hudKindLabels[kind]}</span></button>;
    })}
    <span className="hud-canvas-toolbar-divider" aria-hidden="true"/>
    {props.onToggleGrid ? <button type="button" aria-pressed={props.gridVisible} onClick={props.onToggleGrid}><Grid3X3 aria-hidden="true" size={16}/><span>Grade</span></button> : null}
    <button type="button" title="Alinhar o elemento selecionado à grade de 8×8 px" disabled={!canEdit || !selected || !preset || props.viewMode !== "edit"} onClick={() => {
      if (!preset || !selected) return;
      onUpdateHudPreset?.(preset.id, { components: preset.components.map(component => component.id === selected.id ? updateHudComponentGeometry(component, {}) : component) });
    }}><Magnet aria-hidden="true" size={16}/><span>Encaixar</span></button>
    <button type="button" aria-label="Duplicar elemento" title="Duplicar elemento" disabled={!canEdit || !selected || !preset || preset.components.length >= 64 || props.viewMode !== "edit"} onClick={() => {
      if (!preset || !selected) return;
      const id = `${selected.id}-copy-${crypto.randomUUID()}`;
      onUpdateHudPreset?.(preset.id, { components: [...preset.components, { ...selected, id, label: `${selected.label} cópia` }] });
      onSelectComponent(id);
    }}><Copy aria-hidden="true" size={15}/></button>
    <button type="button" className="danger" aria-label="Remover elemento" disabled={!canEdit || !selected || props.viewMode !== "edit"} title="Excluir elemento (Delete ou Backspace)" onClick={remove}><Trash2 aria-hidden="true" size={15}/></button>
    <button type="button" aria-label="Prévia sem guias" title="Prévia sem guias" aria-pressed={props.viewMode === "preview"} onClick={() => props.onViewMode("preview")}><Eye aria-hidden="true" size={16}/><span>Prévia</span></button>
  </div>;
}
