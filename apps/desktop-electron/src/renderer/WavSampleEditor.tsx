import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { decodeWav, renderWavEdit, validateWavEdit, wavPeaks, WAV_EDITOR_MAX_BYTES, type WavData, type WavEdit, type WavEditorSource, type WavOperation, type WavRange } from "../shared/wavEditing.js";
import { resolveAudioPreviewSourceURL } from "./audioPreviewPlayback.js";
import { useStudioUiText } from "./studioUiText.js";

interface Props {
  source: WavEditorSource;
  projectPath?: string;
  onChange(assetID: string, edit: WavEdit | null): void;
  onEditing(): void;
}
interface Loaded { key: string; data: WavData; sha256: string }
function FrameInput({ label, value, min, max, rate, onChange }: { label: string; value: number; min: number; max: number; rate: number; onChange(value: number): void }): React.ReactElement {
  const [text, setText] = useState(String(Number((value * 1000 / rate).toFixed(3))));
  useEffect(() => setText(String(Number((value * 1000 / rate).toFixed(3)))), [value, rate]);
  function commit(input: string): void {
    const parsed = input.trim() ? Number(input) : NaN;
    if (Number.isFinite(parsed)) {
      const frame = Math.max(min, Math.min(max, Math.round(parsed * rate / 1000)));
      setText(String(Number((frame * 1000 / rate).toFixed(3))));
      if (frame !== value) onChange(frame);
    }
    else setText(String(Number((value * 1000 / rate).toFixed(3))));
  }
  return <label><span>{label} <small>ms</small></span><input aria-label={label} type="number" step={1000 / rate} min={min * 1000 / rate} max={max * 1000 / rate} value={text}
    onChange={e => setText(e.currentTarget.value)} onBlur={e => commit(e.currentTarget.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>;
}
async function readWav(response: Response): Promise<Uint8Array> {
  if (!response.ok) throw new Error("Não foi possível abrir o WAV.");
  if (Number(response.headers.get("content-length")) > WAV_EDITOR_MAX_BYTES) throw new Error("O editor WAV aceita arquivos de até 16 MiB.");
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > WAV_EDITOR_MAX_BYTES) throw new Error("O editor WAV aceita arquivos de até 16 MiB.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}
export function WavSampleEditor({ source, projectPath, onChange, onEditing }: Props): React.ReactElement {
  const ui = useStudioUiText();
  const key = `${projectPath}:${source.id}:${source.source}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null), [loadError, setLoadError] = useState("");
  const [selection, setSelection] = useState<WavRange>({ start: 0, end: 1 });
  const [zoom, setZoom] = useState(1), [viewStart, setViewStart] = useState(0), [reload, setReload] = useState(0);
  const [dragLoop, setDragLoop] = useState<WavRange | null>(null);
  const gesture = useRef<{ anchor: number; mode: "select" | "start" | "end"; loop: WavRange | null } | null>(null);
  useEffect(() => {
    const abort = new AbortController(); setLoadError(""); setLoaded(null);
    const url = resolveAudioPreviewSourceURL(projectPath, source.source ?? null);
    if (!url) { setLoadError("Salve o projeto para editar o WAV."); return; }
    void (async () => {
      try {
        const bytes = await readWav(await fetch(url, { signal: abort.signal }));
        const data = decodeWav(bytes);
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)), b => b.toString(16).padStart(2, "0")).join("");
        if (!abort.signal.aborted) setLoaded({ key, data, sha256 });
      } catch (error) { if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : String(error)); }
    })();
    return () => abort.abort();
  }, [key, projectPath, source.source, reload]);
  const state = useMemo(() => {
    if (!loaded || loaded.key !== key) return null;
    try {
      const edit: WavEdit = source.edit ?? { version: 1, sourceSha256: loaded.sha256, sourceFrames: loaded.data.channels[0].length, sampleRate: loaded.data.sampleRate, trimStart: 0, trimEnd: loaded.data.channels[0].length, loop: loaded.data.loop, operations: [] };
      validateWavEdit(edit);
      if (edit.sourceSha256 !== loaded.sha256) throw new Error("A fonte WAV foi alterada fora do editor. Remova as edições para usar a nova fonte.");
      return { edit, wav: renderWavEdit(loaded.data, edit), error: "" };
    } catch (error) { return { edit: null, wav: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [loaded, key, source.edit]);
  const count = state?.wav?.channels[0].length ?? 1;
  const trimStart = state?.edit?.trimStart;
  useLayoutEffect(() => { setSelection({ start: 0, end: count }); setZoom(1); setViewStart(0); setDragLoop(null); gesture.current = null; }, [key, count, trimStart]);
  const viewCount = Math.max(1, Math.ceil(count / zoom)), start = Math.min(viewStart, count - viewCount), end = start + viewCount;
  const paths = useMemo(() => state?.wav?.channels.map(samples => {
    const peaks = wavPeaks(samples.subarray(start, end), 800);
    // A bucket containing one sample has a zero-length vertical stroke.
    // Connect the centers too, so short clips and high zoom remain visible.
    const centers = peaks.length === 1 ? `M0,${50 - peaks[0].min * 44}H1000` : peaks.map((p, i) => `${i ? "L" : "M"}${i * 1000 / peaks.length},${50 - (p.min + p.max) * 22}`).join("");
    return centers + peaks.map((p, i) => `M${i * 1000 / peaks.length},${50 - p.min * 44}V${50 - p.max * 44}`).join("");
  }) ?? [], [state, start, end]);
  const selected = { start: Math.max(0, Math.min(count - 1, selection.start)), end: Math.max(selection.start + 1, Math.min(count, selection.end)) };
  function commit(edit: WavEdit | null): void { onEditing(); onChange(source.id, edit); }
  function apply(type: WavOperation["type"]): void {
    if (!state?.edit) return;
    commit({ ...state.edit, operations: [...state.edit.operations, { type, start: selected.start + state.edit.trimStart, end: selected.end + state.edit.trimStart }] });
  }
  function setLoop(loop: WavRange | null): void {
    if (state?.edit) commit({ ...state.edit, loop: loop && { start: loop.start + state.edit.trimStart, end: loop.end + state.edit.trimStart } });
  }
  function frameAt(e: React.PointerEvent<SVGSVGElement>): number {
    const bounds = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(count, Math.round(start + (e.clientX - bounds.left) / Math.max(1, bounds.width) * viewCount)));
  }
  function drag(e: React.PointerEvent<SVGSVGElement>): void {
    const g = gesture.current; if (!g) return;
    const frame = frameAt(e);
    if (g.mode === "select") setSelection({ start: Math.min(g.anchor, frame, count - 1), end: Math.max(g.anchor + 1, frame) });
    else if (g.loop) { g.loop = g.mode === "start" ? { start: Math.min(frame, g.loop.end - 1), end: g.loop.end } : { start: g.loop.start, end: Math.max(frame, g.loop.start + 1) }; setDragLoop(g.loop); }
  }
  const x = (frame: number) => (frame - start) / viewCount * 1000;
  const loop = dragLoop ?? state?.wav?.loop;
  const error = loadError || state?.error;
  return <section className="wav-sample-editor" aria-label={ui("Editor de samples")}>
    <header><div><h4>{ui("Editor de samples")}</h4><p>{source.name}</p></div><div className="wav-editor-zoom">
      <button type="button" onClick={() => { onEditing(); setReload(r => r + 1); }}>{ui("Recarregar WAV")}</button>
      <button type="button" aria-label={ui("Reduzir zoom da forma de onda")} disabled={zoom === 1} onClick={() => setZoom(z => Math.max(1, z / 2))}>−</button><output>{zoom}×</output>
      <button type="button" aria-label={ui("Ampliar forma de onda")} disabled={zoom >= 64} onClick={() => setZoom(z => Math.min(64, z * 2))}>+</button>
    </div></header>
    {error ? <p role="alert">{ui(error)}</p> : !state?.wav || !state.edit ? <p role="status">{ui("Lendo amostras WAV…")}</p> : <>
      <p className="wav-editor-help">{ui("Arraste para selecionar um trecho. As edições afetam todos os usos deste sample no projeto; o arquivo original é preservado.")}</p>
      <div className="wav-editor-waveframes">
        <svg viewBox={`0 0 1000 ${paths.length * 100}`} preserveAspectRatio="none" role="group" aria-label={ui("Forma de onda WAV e seleção")} className="wav-editor-wave" onPointerDown={e => {
          if (e.button !== 0) return; onEditing(); e.currentTarget.setPointerCapture(e.pointerId);
          const mode = (e.target as Element).closest("[data-loop-handle]")?.getAttribute("data-loop-handle") as "start" | "end" | undefined;
          gesture.current = { anchor: Math.min(count - 1, frameAt(e)), mode: mode ?? "select", loop: state.wav!.loop && { ...state.wav!.loop } }; drag(e);
        }} onPointerMove={drag} onPointerUp={e => { const g = gesture.current; if (!g) return; drag(e); gesture.current = null; if (g.mode !== "select" && g.loop) setLoop(g.loop); setDragLoop(null); }} onPointerCancel={() => { gesture.current = null; setDragLoop(null); }}>
          {paths.map((path, i) => <g key={i} transform={`translate(0 ${i * 100})`}><path className="wav-editor-axis" d="M0 50H1000" /><path className="wav-editor-samples" d={path} /></g>)}
          <rect className="wav-editor-selection" x={x(selected.start)} y="0" width={Math.max(1, x(selected.end) - x(selected.start))} height={paths.length * 100} />
          {loop ? <><rect className="wav-editor-loop-region" x={x(loop.start)} y="0" width={x(loop.end) - x(loop.start)} height={paths.length * 100} />{(["start", "end"] as const).map(edge => <g key={edge} data-loop-handle={edge} className="wav-editor-loop-handle" role="slider" tabIndex={0} aria-label={ui(edge === "start" ? "Início do loop" : "Fim do loop")} aria-valuemin={edge === "start" ? 0 : loop.start + 1} aria-valuemax={edge === "start" ? loop.end - 1 : count} aria-valuenow={loop[edge]} aria-valuetext={`${(loop[edge] * 1000 / state.wav!.sampleRate).toFixed(3)} ms`} onKeyDown={e => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return; e.preventDefault();
            const min = edge === "start" ? 0 : loop.start + 1, max = edge === "start" ? loop.end - 1 : count;
            const value = e.key === "Home" ? min : e.key === "End" ? max : loop[edge] + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 100 : 1);
            setLoop({ ...loop, [edge]: Math.max(min, Math.min(max, value)) });
          }}><rect x={x(loop[edge]) - 7} y="0" width="14" height={paths.length * 100} /><path d={`M${x(loop[edge])} 0V${paths.length * 100}`} /></g>)}</> : null}
        </svg>
        <div className="wav-editor-channel-labels" aria-hidden="true">{paths.map((_, i) => <span key={i}>{paths.length === 1 ? "MONO" : i ? "R" : "L"}</span>)}</div>
        <div className="wav-editor-ruler"><span>{(start * 1000 / state.wav.sampleRate).toFixed(1)} ms</span><span>{(end * 1000 / state.wav.sampleRate).toFixed(1)} ms</span></div>
      </div>
      {zoom > 1 ? <label className="wav-editor-pan">{ui("Posição da visualização")}<input aria-label={ui("Posição da visualização")} type="range" min={0} max={count - viewCount} step={1} value={start} onChange={e => setViewStart(e.currentTarget.valueAsNumber)} /></label> : null}
      <div className="wav-editor-ranges">
        <FrameInput label={ui("Início da seleção")} value={selected.start} min={0} max={selected.end - 1} rate={state.wav.sampleRate} onChange={value => setSelection(s => ({ ...s, start: value }))} />
        <FrameInput label={ui("Fim da seleção")} value={selected.end} min={selected.start + 1} max={count} rate={state.wav.sampleRate} onChange={value => setSelection(s => ({ ...s, end: value }))} />
        <output>{ui("Seleção")}: {((selected.end - selected.start) * 1000 / state.wav.sampleRate).toFixed(3)} ms · {selected.end - selected.start} {ui("amostras")}</output>
      </div>
      <div className="wav-editor-actions">
        <button type="button" onClick={() => setSelection({ start: 0, end: count })}>{ui("Selecionar tudo")}</button>
        <button type="button" disabled={selected.start === 0 && selected.end === count} onClick={() => { const e = state.edit!; const trimStart = e.trimStart + selected.start, trimEnd = e.trimStart + selected.end; commit({ ...e, trimStart, trimEnd, loop: e.loop && e.loop.start >= trimStart && e.loop.end <= trimEnd ? e.loop : null }); }}>{ui("Recortar à seleção")}</button>
        <button type="button" disabled={state.edit.operations.length >= 128} onClick={() => apply("fadeIn")}>{ui("Fade-in")}</button>
        <button type="button" disabled={state.edit.operations.length >= 128} onClick={() => apply("fadeOut")}>{ui("Fade-out")}</button>
        <button type="button" disabled={state.edit.operations.length >= 128} onClick={() => apply("normalize")}>{ui("Normalizar seleção")}</button>
        <button type="button" onClick={() => setLoop(selected)}>{ui("Definir loop pela seleção")}</button>
      </div>
      {loop ? <div className="wav-editor-ranges">
        <FrameInput label={ui("Início do loop")} value={loop.start} min={0} max={loop.end - 1} rate={state.wav.sampleRate} onChange={value => setLoop({ ...loop, start: value })} />
        <FrameInput label={ui("Fim do loop")} value={loop.end} min={loop.start + 1} max={count} rate={state.wav.sampleRate} onChange={value => setLoop({ ...loop, end: value })} />
        <button type="button" onClick={() => setLoop(null)}>{ui("Remover região de loop")}</button>
      </div> : null}
      <p className="wav-editor-help">{ui("O loop é usado quando Repetir está ativado no áudio ou na faixa. Use Tocar para ouvir o resultado pela engine.")}</p>
      <footer><span>{state.wav.sampleRate.toLocaleString()} Hz · {paths.length === 1 ? "Mono" : ui("Estéreo")} · {(count * 1000 / state.wav.sampleRate).toFixed(1)} ms · {state.edit.operations.length} {ui("operações")}</span><span>{ui("Desfazer e refazer: controles do projeto.")}</span></footer>
    </>}
    {source.edit ? <button className="wav-editor-reset" type="button" onClick={() => commit(null)}>{ui("Remover edições do WAV")}</button> : null}
  </section>;
}
