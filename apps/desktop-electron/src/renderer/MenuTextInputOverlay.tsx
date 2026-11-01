import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { MenuTextInputConfig } from "../shared/menuScene";
import { menuTextInputLayout, moveMenuTextInput, type MenuTextInputPart } from "../shared/menuTextInputLayout";
import { MenuTextInputPreview } from "./MenuTextInputPreview";
import { useStudioUiText } from "./studioUiText";

export function MenuTextInputOverlay({ input, editable = false, readOnly = false, onChange, fontAssetURL, showFieldGuide = false }: {
  input: MenuTextInputConfig; editable?: boolean; readOnly?: boolean;
  onChange?(input: MenuTextInputConfig): void; fontAssetURL?: string | null; showFieldGuide?: boolean;
}) {
  const ui = useStudioUiText();
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<MenuTextInputPart | null>(null);
  const [draft, setDraft] = useState<MenuTextInputConfig | null>(null);
  const gesture = useRef<{ input: MenuTextInputConfig; draft: MenuTextInputConfig; part: MenuTextInputPart;
    x: number; y: number; scaleX: number; scaleY: number; pointerID: number; element: HTMLButtonElement } | null>(null);
  const canEdit = editable && !readOnly && Boolean(onChange);
  // Normalization creates a new input object on parent renders. Only an actual
  // config change may cancel a captured drag (e.g. undo or an inspector edit).
  const inputSignature = JSON.stringify(input);
  useEffect(() => { gesture.current = null; setDraft(null); }, [inputSignature, editable, readOnly]);
  const current = draft ?? input;
  const layout = menuTextInputLayout(current);
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
  const start = (event: PointerEvent<HTMLButtonElement>, part: MenuTextInputPart) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.preventDefault();
    setSelected(part);
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
    active.draft = moveMenuTextInput(active.input, active.part,
      (event.clientX - active.x) / active.scaleX, (event.clientY - active.y) / active.scaleY);
    setDraft(active.draft);
  };
  if (!layout) return null;
  return <div className="room-menu-text-input-editor" ref={root}>
    <MenuTextInputPreview input={current} fontAssetURL={fontAssetURL} showFieldGuide={!editable && showFieldGuide} />
    {editable ? (["field", "keyboard"] as const).map(part => {
      const bounds = part === "field" ? layout.nameField : layout.keyboardBounds;
      const label = part === "field" ? ui("Mover campo do nome") : ui("Mover teclado");
      const style: CSSProperties = { left: `${bounds.x / 240 * 100}%`, top: `${bounds.y / 160 * 100}%`,
        width: `${bounds.width / 240 * 100}%`, height: `${bounds.height / 160 * 100}%` };
      return <button key={part} type="button" className="room-menu-text-input-handle" style={style}
        aria-label={label} aria-pressed={selected === part} aria-disabled={!canEdit}
        title={ui("Arraste ou use as setas para mover em passos de 8 px")}
        onFocus={() => setSelected(part)} onClick={event => { event.stopPropagation(); setSelected(part); }}
        onPointerDown={event => start(event, part)} onPointerMove={move}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
        onKeyDown={event => {
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
          const next = moveMenuTextInput(input, part, direction[0], direction[1]);
          if (next !== input) onChange?.(next);
        }}><span>{label}</span></button>;
    }) : null}
  </div>;
}
