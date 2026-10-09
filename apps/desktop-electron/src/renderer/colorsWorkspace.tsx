import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  decodeRgb555,
  formatRgb555Hex,
  encodeRgb555,
  parseRgb555Hex
} from "../shared/rgb555.js";
import type {
  ColorsWorkspacePresentation,
  PaletteFamilyPresentation,
  PaletteSlot
} from "../shared/colorsWorkspace/core.js";
import type { GBAProjectData } from "../shared/projectFile";

interface ColorsWorkspaceProps {
  projectData: GBAProjectData | null;
  presentation: ColorsWorkspacePresentation | null;
  onCreatePaletteFamily(): void;
  onDuplicatePaletteFamily(familyID: string): void;
  onRenamePaletteFamily(familyID: string, newName: string): void;
  onRemovePaletteFamily(familyID: string): void;
  onSetPaletteColor(familyID: string, slot: PaletteSlot, colorIndex: number, rgb555: number): void;
  onResetPaletteColor(familyID: string, slot: PaletteSlot, colorIndex: number): void;
  onOptimizeDuplicateColors(familyID: string): void;
  onSelectPaletteFamily(familyID: string | null): void;
  onReorderPaletteFamilies(fromIndex: number, toIndex: number): void;
  onReorderPaletteColor(familyID: string, slot: PaletteSlot, fromIndex: number, toIndex: number): void;
  onCopyPaletteSlot(familyID: string, slot: PaletteSlot): void;
  onPastePaletteSlot(familyID: string, slot: PaletteSlot, clipboardPalette: number[]): void;
  onGenerateAutomaticFamilies(): void;
}

function rgbToCssColor(rgb555: number): string {
  const [r, g, b] = decodeRgb555(rgb555);
  return `rgb(${r}, ${g}, ${b})`;
}

function isLightColor(rgb555: number): boolean {
  const [r, g, b] = decodeRgb555(rgb555);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

interface FamilyDragState {
  pointerID: number;
  fromIndex: number;
  startY: number;
  offsetY: number;
  elementHeight: number;
  dropIndex: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: "family" | "color";
  familyID?: string;
  colorIndex?: number;
  slot?: PaletteSlot;
}

function ContextMenu({
  state,
  onAction,
  onClose
}: {
  state: ContextMenuState;
  onAction(action: string, data?: Record<string, unknown>): void;
  onClose(): void;
}): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const familyItems = [
    { label: "Duplicar", action: "duplicate" },
    { label: "Renomear", action: "rename" },
    { label: "Remover", action: "remove" },
    { label: "Otimizar duplicadas", action: "optimize" },
    { label: "Copiar paleta BG", action: "copyBg" },
    { label: "Copiar paleta OBJ", action: "copyObj" },
    { label: "Colar paleta BG", action: "pasteBg" },
    { label: "Colar paleta OBJ", action: "pasteObj" }
  ];

  const colorItems = [
    { label: "Restaurar cor", action: "resetColor" },
    { label: "Copiar cor", action: "copyColor" },
    { label: "Colar cor", action: "pasteColor" }
  ];

  const items = state.type === "family" ? familyItems : colorItems;

  return (
    <div
      ref={menuRef}
      className="colors-context-menu"
      style={{ left: state.x, top: state.y }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          className="colors-context-menu-item"
          onClick={() => {
            onAction(item.action, {
              familyID: state.familyID,
              colorIndex: state.colorIndex,
              slot: state.slot
            });
            onClose();
          }}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function exportPaletteToGPL(families: PaletteFamilyPresentation[]): string {
  let gpl = "GIMP Palette\n";
  gpl += "Name: GBA Studio Palette\n";
  gpl += "Columns: 16\n";
  gpl += "#\n";

  for (const family of families) {
    gpl += `\n# ${family.name}\n`;
    for (let i = 0; i < family.background.length; i++) {
      const [r, g, b] = decodeRgb555(family.background[i]);
      gpl += `${r.toString().padStart(3)} ${g.toString().padStart(3)} ${b.toString().padStart(3)}\tBG_${i.toString().padStart(2, "0")}\n`;
    }
    for (let i = 0; i < family.objects.length; i++) {
      const [r, g, b] = decodeRgb555(family.objects[i]);
      gpl += `${r.toString().padStart(3)} ${g.toString().padStart(3)} ${b.toString().padStart(3)}\tOBJ_${i.toString().padStart(2, "0")}\n`;
    }
  }
  return gpl;
}

function exportPaletteToPAL(families: PaletteFamilyPresentation[]): ArrayBuffer {
  const colors: number[] = [];
  for (const family of families) {
    for (const color of family.background) {
      colors.push(color & 0x7fff);
    }
    for (const color of family.objects) {
      colors.push(color & 0x7fff);
    }
  }

  const buffer = new ArrayBuffer(4 + colors.length * 2);
  const view = new Uint8Array(buffer);
  view[0] = 0x52;
  view[1] = 0x41;
  view[2] = 0x57;
  view[3] = 0x20;

  for (let i = 0; i < colors.length; i++) {
    const offset = 4 + i * 2;
    view[offset] = colors[i] & 0xff;
    view[offset + 1] = (colors[i] >> 8) & 0xff;
  }

  return buffer;
}

function parseGPL(content: string): number[][] {
  const families: number[][] = [];
  let currentPalette: number[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("GIMP") || trimmed.startsWith("Name:") || trimmed.startsWith("Columns:")) {
      if (trimmed.startsWith("#") && !trimmed.startsWith("##") && currentPalette.length > 0) {
        families.push(currentPalette);
        currentPalette = [];
      }
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseInt(parts[0], 10);
      const g = parseInt(parts[1], 10);
      const b = parseInt(parts[2], 10);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        currentPalette.push(encodeRgb555(r, g, b));
      }
    }
  }

  if (currentPalette.length > 0) {
    families.push(currentPalette);
  }

  return families;
}

function parsePAL(buffer: Uint8Array): number[][] {
  if (buffer.length < 4) return [];
  if (buffer[0] !== 0x52 || buffer[1] !== 0x41 || buffer[2] !== 0x57 || buffer[3] !== 0x20) {
    return [];
  }

  const colors: number[] = [];
  for (let i = 4; i < buffer.length - 1; i += 2) {
    const value = buffer[i] | (buffer[i + 1] << 8);
    colors.push(value & 0x7fff);
  }

  const families: number[][] = [];
  for (let i = 0; i < colors.length; i += 16) {
    families.push(colors.slice(i, i + 16));
  }

  return families;
}

function ColorsLibraryPanel({
  families,
  selectedFamilyID,
  onCreateFamily,
  onSelectFamily,
  onDuplicateFamily,
  onRenameFamily,
  onRemoveFamily,
  onOptimizeFamily,
  onCopyPaletteSlot,
  onPastePaletteSlot,
  onSearch,
  searchQuery,
  setSearchQuery,
}: {
  families: PaletteFamilyPresentation[];
  selectedFamilyID: string | null;
  onCreateFamily(): void;
  onSelectFamily(id: string | null): void;
  onDuplicateFamily(id: string): void;
  onRenameFamily(id: string, newName: string): void;
  onRemoveFamily(id: string): void;
  onOptimizeFamily(id: string): void;
  onCopyPaletteSlot(id: string, slot: PaletteSlot): void;
  onPastePaletteSlot(id: string, slot: PaletteSlot): void;
  onSearch(query: string): void;
  searchQuery: string;
  setSearchQuery(query: string): void;
}): React.ReactElement {
  const [filterType, setFilterType] = useState<"all" | "manual" | "auto">("all");
  const [filterSlot, setFilterSlot] = useState<"all" | "bg" | "obj" | "problems">("all");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const filteredFamilies = families.filter((family) => {
    if (filterType === "manual" && family.origin !== "manual") return false;
    if (filterType === "auto" && family.origin === "manual") return false;
    if (filterSlot === "bg" && family.background.length === 0) return false;
    if (filterSlot === "obj" && family.objects.length === 0) return false;
    if (filterSlot === "problems" && !family.hasProblems) return false;
    if (searchQuery) {
      const query = searchQuery.toLocaleLowerCase("pt-BR");
      return family.name.toLocaleLowerCase("pt-BR").includes(query);
    }
    return true;
  });

  useEffect(() => {
    if (selectedFamilyID && !filteredFamilies.some((family) => family.id === selectedFamilyID)) {
      onSelectFamily(null);
    }
  }, [filteredFamilies, onSelectFamily, selectedFamilyID]);

  const handleContextMenu = useCallback((e: React.MouseEvent, familyId: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: "family",
      familyID: familyId
    });
  }, []);

  const handleContextMenuAction = useCallback((action: string, data?: Record<string, unknown>) => {
    const familyID = data?.familyID as string | undefined;
    if (!familyID) return;

    const family = families.find((item) => item.id === familyID);
    if (!family) return;

    switch (action) {
      case "duplicate":
        onDuplicateFamily(familyID);
        break;
      case "rename": {
        const nextName = window.prompt("Renomear família", family.name);
        if (nextName === null) return;
        const trimmed = nextName.trim();
        if (trimmed) {
          onRenameFamily(familyID, trimmed);
        }
        break;
      }
      case "remove":
        if (window.confirm(`Remover a família ${family.name}?`)) {
          onRemoveFamily(familyID);
        }
        break;
      case "optimize":
        onOptimizeFamily(familyID);
        break;
      case "copyBg":
        onCopyPaletteSlot(familyID, "background");
        break;
      case "copyObj":
        onCopyPaletteSlot(familyID, "objects");
        break;
      case "pasteBg":
        onPastePaletteSlot(familyID, "background");
        break;
      case "pasteObj":
        onPastePaletteSlot(familyID, "objects");
        break;
    }
  }, [
    families,
    onDuplicateFamily,
    onRenameFamily,
    onRemoveFamily,
    onOptimizeFamily,
    onCopyPaletteSlot,
    onPastePaletteSlot
  ]);

  return (
    <div className="colors-panel">
      <div className="colors-panel-header">
        <div className="colors-panel-header-row">
          <h4>Biblioteca</h4>
          <button
            className="colors-create-family-button"
            onClick={onCreateFamily}
            type="button"
          >
            <Plus aria-hidden="true" size={14} strokeWidth={2.4} />
            <span>Nova família</span>
          </button>
        </div>
        <p>Famílias reutilizáveis</p>
        <div className="colors-search">
          <svg className="colors-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            aria-label="Buscar família de cores"
            placeholder="Buscar"
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); onSearch(e.target.value); }}
          />
        </div>
        <div className="colors-filter-chips" role="group" aria-label="Origem das famílias">
          <button
            className={`colors-filter-chip${filterType === "all" ? " active" : ""}`}
            onClick={() => setFilterType("all")}
            type="button"
          >
            Todas
          </button>
          <button
            className={`colors-filter-chip${filterType === "auto" ? " active" : ""}`}
            onClick={() => setFilterType("auto")}
            type="button"
          >
            Automáticas
          </button>
          <button
            className={`colors-filter-chip${filterType === "manual" ? " active" : ""}`}
            onClick={() => setFilterType("manual")}
            type="button"
          >
            Manuais
          </button>
        </div>
        <div className="colors-filter-chips" role="group" aria-label="Uso e problemas das famílias">
          <button
            className={`colors-filter-chip${filterSlot === "all" ? " active" : ""}`}
            onClick={() => setFilterSlot("all")}
            type="button"
          >
            Todas
          </button>
          <button
            className={`colors-filter-chip${filterSlot === "bg" ? " active" : ""}`}
            onClick={() => setFilterSlot("bg")}
            type="button"
          >
            BG
          </button>
          <button
            className={`colors-filter-chip${filterSlot === "obj" ? " active" : ""}`}
            onClick={() => setFilterSlot("obj")}
            type="button"
          >
            OBJ
          </button>
          <button
            className={`colors-filter-chip attention${filterSlot === "problems" ? " active" : ""}`}
            onClick={() => setFilterSlot("problems")}
            type="button"
          >
            Com problemas
          </button>
        </div>
      </div>
      <div className="colors-panel-body">
        <ul className="colors-family-list">
          {filteredFamilies.map((family) => (
            <li key={family.id}>
              <button
                className={`colors-family-item${selectedFamilyID === family.id ? " selected" : ""}`}
                onClick={() => onSelectFamily(family.id)}
                onContextMenu={(e) => handleContextMenu(e, family.id)}
                type="button"
              >
                <span className="colors-family-item-name">{family.name}</span>
                <span className="colors-family-item-meta">
                  {family.background.length + family.objects.length} var. · {family.usageCount} uso(s)
                </span>
              </button>
            </li>
          ))}
          {filteredFamilies.length === 0 ? (
            <li>
              <div className="colors-empty-state" role="status" aria-live="polite">
                <strong>Nenhuma família encontrada neste filtro.</strong>
                <span>Ajuste ou limpe os filtros para continuar.</span>
              </div>
            </li>
          ) : null}
        </ul>
      </div>
      {contextMenu?.type === "family" ? (
        <ContextMenu
          state={contextMenu}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

interface ColorDragState {
  pointerID: number;
  familyID: string;
  slot: PaletteSlot;
  fromIndex: number;
  startY: number;
  elementSize: number;
  dropIndex: number;
}

function ColorsFamilyEditor({
  family,
  onDuplicate,
  onRename,
  onRemove,
  onSetPaletteColor,
  onResetPaletteColor,
  onOptimizeDuplicates,
  onReorderColor,
  onCopyPaletteSlot,
}: {
  family: PaletteFamilyPresentation;
  onDuplicate(id: string): void;
  onRename(id: string, name: string): void;
  onRemove(id: string): void;
  onSetPaletteColor(id: string, slot: PaletteSlot, index: number, value: number): void;
  onResetPaletteColor(id: string, slot: PaletteSlot, index: number): void;
  onOptimizeDuplicates(id: string): void;
  onReorderColor(id: string, slot: PaletteSlot, fromIndex: number, toIndex: number): void;
  onCopyPaletteSlot(id: string, slot: PaletteSlot): void;
}): React.ReactElement {
  const [activeSlot, setActiveSlot] = useState<PaletteSlot>("background");
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(family.name);
  const [colorClipboard, setColorClipboard] = useState<number | null>(null);
  const [colorHexValue, setColorHexValue] = useState(formatRgb555Hex(0));
  const colorDragStateRef = useRef<ColorDragState | null>(null);
  const [colorDragOverIndex, setColorDragOverIndex] = useState<number | null>(null);
  const [colorDragPreviewIndex, setColorDragPreviewIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const palette = activeSlot === "background" ? family.background : family.objects;
  const selectedColor = palette[selectedColorIndex] ?? 0;

  const handleSelectColor = useCallback((index: number) => {
    setSelectedColorIndex(index);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (renameValue.trim()) {
      onRename(family.id, renameValue.trim());
    }
    setRenaming(false);
  }, [family.id, renameValue, onRename]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (renaming) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setSelectedColorIndex((prev) => Math.min(15, prev + 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSelectedColorIndex((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedColorIndex((prev) => Math.min(15, prev + 4));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedColorIndex((prev) => Math.max(0, prev - 4));
          break;
        case "Enter":
          e.preventDefault();
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          onResetPaletteColor(family.id, activeSlot, selectedColorIndex);
          break;
        case "b":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveSlot("background");
          }
          break;
        case "o":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveSlot("objects");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedColorIndex, renaming, family.id, activeSlot, onResetPaletteColor]);

  useEffect(() => {
    setColorHexValue(formatRgb555Hex(selectedColor));
  }, [selectedColor]);

  const handleColorDragStart = useCallback((
    e: React.PointerEvent,
    colorIndex: number,
    element: HTMLButtonElement
  ) => {
    const rect = element.getBoundingClientRect();
    const state: ColorDragState = {
      pointerID: e.pointerId,
      familyID: family.id,
      slot: activeSlot,
      fromIndex: colorIndex,
      startY: e.clientY,
      elementSize: rect.width,
      dropIndex: colorIndex
    };
    colorDragStateRef.current = state;
    setColorDragPreviewIndex(colorIndex);

    element.setPointerCapture(e.pointerId);
    element.addEventListener("pointermove", handleColorDragMove);
    element.addEventListener("pointerup", handleColorDragEnd);
    element.addEventListener("pointercancel", handleColorDragCancel);
  }, [family.id, activeSlot]);

  const handleColorDragMove = useCallback((e: PointerEvent) => {
    const state = colorDragStateRef.current;
    if (!state || e.pointerId !== state.pointerID) return;
    e.preventDefault();

    const deltaY = e.clientY - state.startY;
    const deltaX = e.clientX - (e.target as HTMLElement).getBoundingClientRect().left;
    const deltaSlots = Math.round(deltaY / state.elementSize) * 4 + Math.round(deltaX / state.elementSize);
    const newDropIndex = Math.max(0, Math.min(15, state.fromIndex + deltaSlots));
    state.dropIndex = newDropIndex;
    setColorDragOverIndex(newDropIndex);
  }, []);

  const handleColorDragEnd = useCallback((e: PointerEvent) => {
    const state = colorDragStateRef.current;
    if (!state || e.pointerId !== state.pointerID) return;

    const target = e.currentTarget as HTMLElement;
    target.removeEventListener("pointermove", handleColorDragMove);
    target.removeEventListener("pointerup", handleColorDragEnd);
    target.removeEventListener("pointercancel", handleColorDragCancel);

    if (state.dropIndex !== state.fromIndex) {
      onReorderColor(state.familyID, state.slot, state.fromIndex, state.dropIndex);
    }

    colorDragStateRef.current = null;
    setColorDragOverIndex(null);
    setColorDragPreviewIndex(null);
  }, [onReorderColor, handleColorDragMove]);

  const handleColorDragCancel = useCallback((e: PointerEvent) => {
    const state = colorDragStateRef.current;
    if (!state || e.pointerId !== state.pointerID) return;

    const target = e.currentTarget as HTMLElement;
    target.removeEventListener("pointermove", handleColorDragMove);
    target.removeEventListener("pointerup", handleColorDragEnd);
    target.removeEventListener("pointercancel", handleColorDragCancel);

    colorDragStateRef.current = null;
    setColorDragOverIndex(null);
    setColorDragPreviewIndex(null);
  }, [handleColorDragMove, handleColorDragEnd]);

  const handleContextMenu = useCallback((e: React.MouseEvent, colorIndex: number) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: "color",
      familyID: family.id,
      colorIndex,
      slot: activeSlot
    });
  }, [family.id, activeSlot]);

  const handleContextMenuAction = useCallback((action: string, data?: Record<string, unknown>) => {
    const colorIndex = data?.colorIndex as number;
    const slot = data?.slot as PaletteSlot;
    if (typeof colorIndex !== "number" || (slot !== "background" && slot !== "objects")) return;

    const colorValue = slot === "background" ? family.background[colorIndex] : family.objects[colorIndex];

    switch (action) {
      case "resetColor": onResetPaletteColor(family.id, slot, colorIndex); break;
      case "copyColor":
        if (typeof colorValue === "number") setColorClipboard(colorValue);
        break;
      case "pasteColor":
        if (colorClipboard !== null) {
          onSetPaletteColor(family.id, slot, colorIndex, colorClipboard);
        }
        break;
    }
  }, [colorClipboard, family.background, family.id, family.objects, onResetPaletteColor, onSetPaletteColor]);

  const handleApplyColor = useCallback(() => {
    const parsed = parseRgb555Hex(colorHexValue);
    if (parsed === null) {
      setColorHexValue(formatRgb555Hex(selectedColor));
      return;
    }
    onSetPaletteColor(family.id, activeSlot, selectedColorIndex, parsed);
  }, [activeSlot, colorHexValue, family.id, onSetPaletteColor, selectedColor, selectedColorIndex]);

  return (
    <div className="colors-panel">
      <div className="colors-panel-header">
        <div className="colors-family-header">
          <span className="colors-family-label">Família</span>
          <div className="colors-family-title-row">
            {renaming ? (
              <input
                autoFocus
                className="colors-family-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleConfirmRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
              />
            ) : (
              <h4 className="colors-family-name">{family.name}</h4>
            )}
            <div className="colors-family-actions">
              <button
                aria-label="Copiar paleta"
                className="colors-icon-button"
                onClick={() => onCopyPaletteSlot(family.id, activeSlot)}
                title="Copiar paleta"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 11V3.5C3 2.67 3.67 2 4.5 2H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                aria-label="Renomear família"
                className="colors-icon-button"
                onClick={() => { setRenaming(true); setRenameValue(family.name); }}
                title="Renomear"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                aria-label="Remover família"
                className="colors-icon-button"
                onClick={() => onRemove(family.id)}
                title="Remover"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4H14M5 4V2H11V4M6 7V12M10 7V12M3 4L4 14H12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="colors-family-variant-row">
            <button className="colors-variant-button active" type="button">Padrão</button>
            <button className="colors-variant-add" type="button">+</button>
          </div>
        </div>
        <div className="colors-toolbar">
          <button onClick={() => onDuplicate(family.id)} type="button">Duplicar</button>
          <button onClick={() => { setRenaming(true); setRenameValue(family.name); }} type="button">Renomear</button>
          <button aria-label="Remover família" onClick={() => onRemove(family.id)} type="button">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4H14M5 4V2H11V4M6 7V12M10 7V12M3 4L4 14H12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={() => onOptimizeDuplicates(family.id)} type="button">Otimizar duplicadas</button>
        </div>
        <div className="colors-slot-toggle">
          <button
            className={`colors-filter-chip${activeSlot === "background" ? " active" : ""}`}
            onClick={() => setActiveSlot("background")}
            type="button"
          >
            BG
          </button>
          <button
            className={`colors-filter-chip${activeSlot === "objects" ? " active" : ""}`}
            onClick={() => setActiveSlot("objects")}
            type="button"
          >
            OBJ
          </button>
        </div>
      </div>
      <div className="colors-panel-body">
        <div className="colors-palette-grid" aria-label={`Paleta ${activeSlot === "background" ? "BG" : "OBJ"}`} ref={gridRef} tabIndex={0}>
          {Array.from({ length: 16 }, (_, index) => {
            const isColorDragOver = colorDragOverIndex === index && colorDragPreviewIndex !== index;
            const color = palette[index] ?? 0;
            const light = isLightColor(color);
            return (
              <button
                className={`colors-palette-swatch${selectedColorIndex === index ? " selected" : ""}${isColorDragOver ? " drag-over" : ""}${colorDragPreviewIndex === index ? " dragging" : ""}${light ? " light" : " dark"}`}
                style={{ backgroundColor: rgbToCssColor(color) }}
                onClick={() => handleSelectColor(index)}
                onContextMenu={(e) => handleContextMenu(e, index)}
                onPointerDown={(e) => {
                  const btn = e.currentTarget;
                  handleColorDragStart(e, index, btn);
                }}
                aria-label={`Slot ${index}: ${formatRgb555Hex(color)}`}
                title={`Slot ${index}: ${formatRgb555Hex(color)}`}
                type="button"
                key={index}
              >
                <span className="colors-palette-swatch-index">{index}</span>
              </button>
            );
          })}
        </div>
        <div className="colors-color-editor">
          <div className="colors-color-preview-row">
            <div
              className="colors-color-preview-swatch"
              style={{ backgroundColor: rgbToCssColor(selectedColor) }}
            />
            <div className="colors-color-hex-group">
              <span className="colors-color-hex-label">RGB555 hexadecimal</span>
              <div className="colors-color-hex-input-row">
                <input
                  className="colors-color-hex-input"
                  value={colorHexValue}
                  onChange={(e) => setColorHexValue(e.target.value)}
                  onBlur={handleApplyColor}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleApplyColor();
                    }
                  }}
                  maxLength={4}
                />
                <button
                  className="colors-color-apply-button"
                  onClick={handleApplyColor}
                  type="button"
                >
                  Aplicar cor
                </button>
                <button
                  className="colors-color-reset-button"
                  onClick={() => onResetPaletteColor(family.id, activeSlot, selectedColorIndex)}
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8C2 4.69 4.69 2 8 2C11.31 2 14 4.69 14 8C14 11.31 11.31 14 8 14C5.94 14 4.12 12.95 3.05 11.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M2 5V8H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Restaurar variação
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {contextMenu?.type === "color" ? (
        <ContextMenu
          state={contextMenu}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

function ColorsConsumersPanel({
  bankUsage,
  paletteBudgetWarnings,
  paletteConflicts,
  roomName
}: {
  bankUsage: ColorsWorkspacePresentation["bankUsage"];
  paletteBudgetWarnings: ColorsWorkspacePresentation["paletteBudgetWarnings"];
  paletteConflicts: ColorsWorkspacePresentation["paletteConflicts"];
  roomName: string | null;
}): React.ReactElement {
  return (
    <div className="colors-panel inspector-readable">
      <div className="colors-panel-header">
        <div className="colors-consumers-header">
          <h4>Consumidores e bancos</h4>
        </div>
        {roomName ? <p>{roomName}</p> : null}
        </div>
        <div className="colors-panel-body">
          <div className="colors-consumers-panel">
          <div className="colors-budget-stats">
            <div className="colors-budget-stat">
              <span className="colors-budget-stat-label">FONTE</span>
              <span className="colors-budget-stat-value">Cenas atribuídas</span>
            </div>
            <div className="colors-budget-stat">
              <span className="colors-budget-stat-label">BG OCUPADOS</span>
              <span className="colors-budget-stat-value">{bankUsage.bgOccupied}/{bankUsage.bgCapacity}</span>
            </div>
            <div className="colors-budget-stat">
              <span className="colors-budget-stat-label">OBJ OCUPADOS</span>
              <span className="colors-budget-stat-value">{bankUsage.objOccupied}/{bankUsage.objCapacity}</span>
            </div>
          </div>
          <p className="colors-panel-help">
            {bankUsage.assignedRoomCount} cenas usam uma família; {bankUsage.unassignedRoomCount} estão sem família.
            {bankUsage.unknownFamilyCount > 0 ? ` ${bankUsage.unknownFamilyCount} têm uma família inexistente.` : ""}
          </p>
          {bankUsage.consumers.length > 0 ? (
            <div className="colors-consumer-list" aria-label="Cenas consumidoras">
              {bankUsage.consumers.map((consumer) => (
                <div className="colors-consumer-row" key={consumer.roomID}>
                  <span>{consumer.roomName}</span>
                  <span>
                    {consumer.familyName ?? "Sem família"} · {consumer.backgroundBankLimit} BG
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {paletteConflicts.some((conflict) => !conflict.resolvedByExport) ? (
            <div aria-live="polite" className="colors-palette-conflicts">
              <h5>Conflitos que exigem revisão</h5>
              {paletteConflicts.filter((conflict) => !conflict.resolvedByExport).map((conflict) => (
                <p key={`${conflict.kind}:${conflict.assetName}`}>
                  {conflict.kind === "sprite" ? "Sprite" : "Background"} <strong>{conflict.assetName}</strong> é usado por
                  {" "}{conflict.roomNames.join(", ")} com famílias incompatíveis ou ausentes.
                  {" "}
                  <span className="colors-conflict-resolution">
                    {conflict.resolution === "sprite-variant"
                      ? "Use uma variante da folha por família ou unifique a família das cenas."
                      : "Reempacote o background ou revise explicitamente a política dos consumidores."}
                  </span>
                  <small>
                    {conflict.references.map((reference) => (
                      `${reference.roomName}: ${reference.source === "family"
                        ? reference.familyName ?? reference.familyID
                        : reference.source === "intrinsic" ? "paleta intrínseca" : "família ausente"}`
                    )).join(" · ")}
                  </small>
                </p>
              ))}
            </div>
          ) : null}
          {paletteBudgetWarnings.length > 0 ? (
            <div aria-live="polite" className="colors-palette-conflicts">
              <h5>Risco de perda de cores</h5>
              {paletteBudgetWarnings.map((warning) => (
                <p key={warning.assetName}>
                  <strong>{warning.assetName}</strong>{" "}
                  {warning.detectedBanks === null
                    ? `tem orçamento de ${warning.requestedBanks} bancos BG`
                    : `usa ${warning.detectedBanks} bancos BG (orçamento ${warning.requestedBanks})`}
                  , mas a política {warning.policy === "full-screen" ? "tela cheia" : "UI compartilhada"} das cenas
                  {" "}{warning.roomNames.join(", ")} libera {warning.effectiveBanks}. Ação recomendada: preparar o asset
                  {" "}para até {warning.effectiveBanks} banks ou revisar explicitamente a política em Cenas.
                </p>
              ))}
            </div>
          ) : null}
          <div className="colors-bank-section">
            <h5>Bancos BG</h5>
            <div className="colors-bank-grid">
              {bankUsage.bgBanks.map((slot) => (
                <div
                  className={`colors-bank-slot${slot.occupied ? " occupied" : ""}`}
                  key={slot.index}
                  title={slot.familyName ?? `Banco ${slot.index}`}
                >
                  <span>{slot.index}</span>
                  <span>{slot.occupied ? 1 : 0}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="colors-bank-section">
            <h5>Bancos OBJ</h5>
            <div className="colors-bank-grid">
              {bankUsage.objBanks.map((slot) => (
                <div
                  className={`colors-bank-slot${slot.occupied ? " occupied" : ""}`}
                  key={slot.index}
                  title={slot.familyName ?? `Banco ${slot.index}`}
                >
                  <span>{slot.index}</span>
                  <span>{slot.occupied ? 1 : 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ColorsWorkspace({
  presentation,
  onCreatePaletteFamily,
  onDuplicatePaletteFamily,
  onRenamePaletteFamily,
  onRemovePaletteFamily,
  onSetPaletteColor,
  onResetPaletteColor,
  onOptimizeDuplicateColors,
  onSelectPaletteFamily,
  onReorderPaletteFamilies,
  onReorderPaletteColor,
  onCopyPaletteSlot,
  onPastePaletteSlot,
  onGenerateAutomaticFamilies
}: ColorsWorkspaceProps): React.ReactElement | null {
  const [searchQuery, setSearchQuery] = useState("");
  const [clipboardPalette, setClipboardPalette] = useState<number[]>([]);

  if (!presentation) {
    return null;
  }

  const handleCopyPaletteSlot = useCallback((familyID: string, slot: PaletteSlot) => {
    const family = presentation.families.find((f) => f.id === familyID);
    if (!family) return;
    const palette = slot === "background" ? family.background : family.objects;
    setClipboardPalette([...palette]);
  }, [presentation.families]);

  const handlePastePaletteSlot = useCallback((familyID: string, slot: PaletteSlot) => {
    if (clipboardPalette.length === 0) return;
    onPastePaletteSlot(familyID, slot, clipboardPalette);
  }, [clipboardPalette, onPastePaletteSlot]);

  return (
    <section
      className="colors-workspace"
      aria-label="Cores"
    >
      <div className="colors-layout">
        <ColorsLibraryPanel
          families={presentation.families}
          selectedFamilyID={presentation.selectedFamilyID}
          onCreateFamily={onCreatePaletteFamily}
          onSelectFamily={onSelectPaletteFamily}
          onDuplicateFamily={onDuplicatePaletteFamily}
          onRenameFamily={onRenamePaletteFamily}
          onRemoveFamily={onRemovePaletteFamily}
          onOptimizeFamily={onOptimizeDuplicateColors}
          onCopyPaletteSlot={handleCopyPaletteSlot}
          onPastePaletteSlot={handlePastePaletteSlot}
          onSearch={setSearchQuery}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
        {presentation.selectedFamily ? (
          <ColorsFamilyEditor
            family={presentation.selectedFamily}
            onDuplicate={onDuplicatePaletteFamily}
            onRename={onRenamePaletteFamily}
            onRemove={onRemovePaletteFamily}
            onSetPaletteColor={onSetPaletteColor}
            onResetPaletteColor={onResetPaletteColor}
            onOptimizeDuplicates={onOptimizeDuplicateColors}
            onReorderColor={onReorderPaletteColor}
            onCopyPaletteSlot={handleCopyPaletteSlot}
          />
        ) : (
          <div className="colors-panel">
            <div className="colors-empty-state">
              <span>Selecione uma família para editar</span>
            </div>
          </div>
        )}
        <ColorsConsumersPanel
          bankUsage={presentation.bankUsage}
          paletteBudgetWarnings={presentation.paletteBudgetWarnings}
          paletteConflicts={presentation.paletteConflicts}
          roomName={null}
        />
      </div>
    </section>
  );
}
