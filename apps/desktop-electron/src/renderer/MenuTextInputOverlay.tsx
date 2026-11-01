import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";
import type { MenuTextInputConfig } from "../shared/menuScene";
import { menuTextInputLayout, moveMenuTextInput, resizeMenuTextInputField, type MenuTextInputPart } from "../shared/menuTextInputLayout";
import { MenuTextInputPreview } from "./MenuTextInputPreview";
import { useStudioUiText } from "./studioUiText";

export function MenuTextInputOverlay({ input, editable = false, readOnly = false, onChange, fontAssetURL, showFieldGuide = false, selectedPart, onSelectPart }: {
  input: MenuTextInputConfig; editable?: boolean; readOnly?: boolean;
  selectedPart?: MenuTextInputPart | null; onSelectPart?(part: MenuTextInputPart | null): void;
  onChange?(input: MenuTextInputConfig): void; fontAssetURL?: string | null; showFieldGuide?: boolean;
}) {
  const ui = useStudioUiText();
  const root = useRef<HTMLDivElement>(null);
  const [localSelected, setLocalSelected] = useState<MenuTextInputPart | null>(null);
  const selected = selectedPart === undefined ? localSelected : selectedPart;
  const setSelected = (part: MenuTextInputPart | null) => { setLocalSelected(part); onSelectPart?.(part); };
  const [draft, setDraft] = useState<MenuTextInputConfig | null>(null);
  const gesture = useRef<{ input: MenuTextInputConfig; draft: MenuTextInputConfig; part: MenuTextInputPart | "field-width";
    x: number; y: number; scaleX: number; scaleY: number; pointerID: number; element: HTMLButtonElement } | null>(null);
  const canEdit = editable && !readOnly && Boolean(onChange);
  // Normalization creates a new input object on parent renders. Only an actual
  // config change may cancel a captured drag (e.g. undo or an inspector edit).
  const inputSignature = JSON.stringify(input);
  useEffect(() => { gesture.current = null; setDraft(null); }, [inputSignature, editable, readOnly]);
  const current = draft ?? input;
  const nativeLayout = menuTextInputLayout(current);
  const layout = nativeLayout ?? {keys:[],keyboardBounds:{x:0,y:0,width:0,height:0},nameField:{x:current.x*8,y:current.y*8,width:current.width*8,height:8}};
  const finishGesture = (pointerID: number, cancel = false) => {
    const active = gesture.current;
    if (!active || active.pointerID !== pointerID) return;
    gesture.current = null;
    if (active.element.hasPointerCapture(pointerID)) active.element.releasePointerCapture(pointerID);
    setDraft(null);
    if (!cancel && canEdit && active.draft !== active.input) onChange?.(active.draft);
  };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    event.stopPropagation();
    finishGesture(event.pointerId, cancel);
  };
  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => {
      if (gesture.current?.pointerID !== event.pointerId) return;
      event.stopPropagation();
      finishGesture(event.pointerId, event.type === "pointercancel");
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, [canEdit, onChange]);
  const start = (event: PointerEvent<HTMLButtonElement>, part: MenuTextInputPart | "field-width") => {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.preventDefault();
    setSelected(part === "field-width" ? "field" : part);
    event.currentTarget.focus();
    if (!canEdit) return;
    const bounds = root.current!.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { input, draft: input, part, x: event.clientX, y: event.clientY, element: event.currentTarget,
      scaleX: bounds.width > 0 ? bounds.width / 240 : 1, scaleY: bounds.height > 0 ? bounds.height / 160 : 1,
      pointerID: event.pointerId };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.pointerID !== event.pointerId) return;
    event.stopPropagation();
    active.draft = active.part === "field-width"
      ? resizeMenuTextInputField(active.input, (event.clientX - active.x) / active.scaleX)
      : moveMenuTextInput(active.input, active.part, (event.clientX - active.x) / active.scaleX, (event.clientY - active.y) / active.scaleY);
    setDraft(active.draft);
  };
  const keyboardMove = (event: KeyboardEvent<HTMLButtonElement>, part: MenuTextInputPart | "field-width") => {
    if (event.key === "Escape") {
      event.stopPropagation(); event.preventDefault();
      const active = gesture.current; gesture.current = null; setDraft(null); setSelected(null);
      if (active && event.currentTarget.hasPointerCapture(active.pointerID)) event.currentTarget.releasePointerCapture(active.pointerID);
      return;
    }
    const direction = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
    if (!direction) return;
    event.stopPropagation(); event.preventDefault();
    if (!canEdit || gesture.current) return;
    const next = part === "field-width" ? resizeMenuTextInputField(input, direction[0]) : moveMenuTextInput(input, part, direction[0], direction[1]);
    if (next !== input) onChange?.(next);
  };

  const parts: MenuTextInputPart[] = ["field", ...(nativeLayout ? ["keyboard" as const, ...(input.keyboard?.geometry?.keys ? layout.keys.map(key => `key:${key.index}` as const) : [])] : [])];
  return <div className="room-menu-text-input-editor" ref={root}>
    <MenuTextInputPreview input={current} fontAssetURL={fontAssetURL} showFieldGuide={!editable && showFieldGuide} />
    {editable ? parts.map(part => {
      const key = part.startsWith("key:") ? layout.keys[Number(part.slice(4))] : null;
      const bounds = key ?? (part === "field" ? layout.nameField : layout.keyboardBounds);
      const label = key ? ui("Mover tecla {0}", { 0: key.label }) : part === "field" ? ui("Mover campo do nome") : ui("Mover teclado");
      const style: CSSProperties = { left: `${bounds.x / 240 * 100}%`, top: `${bounds.y / 160 * 100}%`,
        width: `${bounds.width / 240 * 100}%`, height: `${bounds.height / 160 * 100}%` };
      return <button key={part} type="button" className={`room-menu-text-input-handle${key ? " is-key" : part === "keyboard" && input.keyboard?.geometry?.keys ? " is-keyboard-group" : ""}`} style={style}
        aria-label={label} aria-pressed={selected === part} aria-disabled={!canEdit}
        title={ui("Arraste ou use as setas para mover em passos de 8 px")}
        onFocus={() => setSelected(part)} onClick={event => { event.stopPropagation(); setSelected(part); }}
        onPointerDown={event => start(event, part)} onPointerMove={move}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
        onKeyDown={event => keyboardMove(event, part)}><span>{label}</span></button>;
    }) : null}
    {editable ? <button type="button" className="room-menu-text-input-resize" aria-label={ui("Redimensionar campo do nome")}
      aria-disabled={!canEdit} title={ui("Arraste para ajustar a largura do campo")}
      style={{left:`${(layout.nameField.x+layout.nameField.width)/240*100}%`,top:`${(layout.nameField.y+4)/160*100}%`}}
      onPointerDown={event=>start(event,"field-width")} onPointerMove={move} onPointerUp={event=>finish(event)}
      onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}
      onKeyDown={event=>keyboardMove(event,"field-width")} /> : null}
  </div>;
}
