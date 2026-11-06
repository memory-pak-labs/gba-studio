import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Grip, Maximize2, Trash2 } from "lucide-react";
import { SCENE_NOTE_COLORS, type SceneNote, type SceneNotePatch } from "../shared/sceneNotes";
import { useStudioUiText } from "./studioUiText";
import "./styles/scene-notes.css";

interface Props {
  notes: SceneNote[];
  zoom: number;
  focusID?: string | null;
  onSelect(): void;
  onUpdate(id: string, patch: SceneNotePatch, historyGroupID?: string): void;
  onRemove(id: string): void;
}

export function SceneNotesLayer(props: Props): React.ReactElement {
  return <div className="scene-notes-layer">
    {props.notes.map(note => <SceneNoteCard key={note.id} {...props} note={note} />)}
  </div>;
}

function SceneNoteCard({ note, zoom, focusID, onSelect, onUpdate, onRemove }: Props & { note: SceneNote }): React.ReactElement {
  const ui = useStudioUiText();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<SceneNotePatch | null>(null);
  const [draftTitle, setDraftTitle] = useState(note.title);
  const [draftText, setDraftText] = useState(note.text);
  const editing = useRef<"title" | "text" | null>(null);
  const gesture = useRef<{ mode: "move" | "resize"; x: number; y: number; note: SceneNote; patch: SceneNotePatch | null } | null>(null);
  const editGroup = useRef<string | undefined>(undefined);
  const finishRef = useRef(() => {});
  finishRef.current = finish;
  const shown = { ...note, ...preview };
  useEffect(() => {
    // Electron can release a native drag outside the original handle.
    const end = () => finishRef.current();
    window.addEventListener("pointerup", end, true);
    window.addEventListener("mouseup", end, true);
    return () => {
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("mouseup", end, true);
    };
  }, []);
  useEffect(() => { if (focusID === note.id) textRef.current?.focus(); }, [focusID, note.id]);
  useEffect(() => {
    if (editing.current !== "title") setDraftTitle(note.title);
    if (editing.current !== "text") setDraftText(note.text);
  }, [note.title, note.text]);

  function start(event: ReactPointerEvent<HTMLButtonElement>, mode: "move" | "resize"): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { mode, x: event.clientX, y: event.clientY, note, patch: null };
    onSelect();
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>): void {
    const active = gesture.current;
    if (!active) return;
    const dx = (event.clientX - active.x) / zoom, dy = (event.clientY - active.y) / zoom;
    active.patch = active.mode === "move"
      ? { x: Math.max(0, Math.round(active.note.x + dx)), y: Math.max(0, Math.round(active.note.y + dy)) }
      : { width: Math.min(1200, Math.max(180, Math.round(active.note.width + dx))), height: Math.min(1200, Math.max(120, Math.round(active.note.height + dy))) };
    setPreview(active.patch);
  }
  function finish(): void {
    const patch = gesture.current?.patch;
    gesture.current = null;
    setPreview(null);
    if (patch) onUpdate(note.id, patch);
  }
  function cancel(): void { gesture.current = null; setPreview(null); }
  function handle(mode: "move" | "resize") {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => start(event, mode),
      onPointerMove: move, onPointerUp: finish, onPointerCancel: cancel, onLostPointerCapture: finish,
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        const step = event.shiftKey ? 32 : 8;
        const offset = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!offset) return;
        event.preventDefault();
        onUpdate(note.id, mode === "move" ? { x: note.x + offset[0], y: note.y + offset[1] }
          : { width: note.width + offset[0], height: note.height + offset[1] });
      }
    };
  }
  const colors = { yellow: ui("Amarelo"), blue: ui("Azul"), green: ui("Verde"), pink: ui("Rosa") };
  return <section className="scene-note" data-note-color={note.color} data-scene-note-id={note.id}
    aria-label={ui("Post-it: {0}", { 0: note.title || ui("Sem título") })}
    style={{ left: shown.x * zoom, top: shown.y * zoom, width: shown.width, height: shown.height, transform: `scale(${zoom})` }}
    onPointerDown={event => event.stopPropagation()} onFocusCapture={onSelect}
    onKeyDown={event => {
      if (event.key === "Escape") { cancel(); (event.target as HTMLElement).blur(); }
      // Text editing and note keyboard controls must never edit/delete a scene.
      if (event.key !== "s" || !(event.ctrlKey || event.metaKey)) event.stopPropagation();
    }}>
    <header>
      <button type="button" className="scene-note-move" aria-label={ui("Mover post-it")}
        title={ui("Arraste ou use as setas para mover o post-it")} {...handle("move")}><Grip size={16} /></button>
      <input aria-label={ui("Título do post-it")} placeholder={ui("Post-it")} value={draftTitle} maxLength={120}
        onFocus={() => { editing.current = "title"; editGroup.current = `note-title-${note.id}-${crypto.randomUUID()}`; }}
        onBlur={() => { editing.current = null; }}
        onChange={event => { setDraftTitle(event.currentTarget.value); onUpdate(note.id, { title: event.currentTarget.value }, editGroup.current); }} />
      <button type="button" aria-label={ui("Excluir post-it")} title={ui("Excluir post-it (pode desfazer)")}
        onClick={() => onRemove(note.id)}><Trash2 size={15} /></button>
    </header>
    <textarea ref={textRef} aria-label={ui("Texto do post-it")} placeholder={ui("Escreva um lembrete…")}
      value={draftText} maxLength={10000}
      onFocus={() => { editing.current = "text"; editGroup.current = `note-text-${note.id}-${crypto.randomUUID()}`; }}
      onBlur={() => { editing.current = null; }}
      onChange={event => { setDraftText(event.currentTarget.value); onUpdate(note.id, { text: event.currentTarget.value }, editGroup.current); }} />
    <footer>
      <select aria-label={ui("Cor do post-it")} value={note.color}
        onChange={event => onUpdate(note.id, { color: event.currentTarget.value as SceneNote["color"] })}>
        {SCENE_NOTE_COLORS.map(color => <option key={color} value={color}>{colors[color]}</option>)}
      </select>
      <button className="scene-note-resize" type="button" aria-label={ui("Redimensionar post-it")}
        title={ui("Arraste ou use as setas para redimensionar o post-it")} {...handle("resize")}><Maximize2 size={14} /></button>
    </footer>
  </section>;
}
