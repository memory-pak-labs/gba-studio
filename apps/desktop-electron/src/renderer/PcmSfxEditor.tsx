import { useEffect, useMemo, useRef, useState } from "react";
import { PCM_WAVEFORMS, renderPcmSfx, type PcmSfxConfig } from "../shared/audioPcm.js";
import { useStudioUiText } from "./studioUiText";

interface Props {
  sampleEditor?: React.ReactNode;
  config: PcmSfxConfig;
  samples: Array<{ id: string; name: string }>;
  onChange(config: PcmSfxConfig): void;
  onEditing(): void;
}
const waveformNames = { sine: "Senoidal", triangle: "Triangular", square: "Quadrada", saw: "Dente de serra", noise: "Ruído" };
export function PcmSfxEditor({ config, samples, onChange, onEditing, sampleEditor }: Props): React.ReactElement {
  const ui = useStudioUiText();
  const [draft, setDraft] = useState(config);
  const current = useRef(config);
  const dirty = useRef(false);
  useEffect(() => { current.current = config; setDraft(config); dirty.current = false; }, [config]);
  function change(fields: Partial<PcmSfxConfig>, immediate = false): void {
    const next = { ...current.current, ...fields };
    next.attackMs = Math.min(next.attackMs, next.durationMs);
    next.releaseMs = Math.min(next.releaseMs, next.durationMs - next.attackMs);
    current.current = next; dirty.current = true; setDraft(next);
    if (immediate) commit();
  }
  function commit(): void {
    if (!dirty.current) return;
    dirty.current = false; onChange(current.current);
  }
  const waveform = useMemo(() => {
    if (draft.source !== "synth") return "";
    const values = renderPcmSfx(draft);
    return Array.from({ length: 320 }, (_, i) => {
      // Display the extrema of each bucket so noise and short transients remain visible.
      const start = Math.floor(i * values.length / 320), end = Math.max(start + 1, Math.floor((i + 1) * values.length / 320));
      let value = 0;
      for (let j = start; j < end; j++) if (Math.abs(values[j]) > Math.abs(value)) value = values[j];
      return `${i},${60 - value / 96 * 52}`;
    }).join(" ");
  }, [draft]);
  function control(key: keyof PcmSfxConfig, label: string, min: number, max: number, unit: string, step = 1): React.ReactElement {
    const value = draft[key] as number;
    return <label className="pcm-sfx-control" key={key}><span>{ui(label)} <output>{value} {unit}</output></span>
      <input aria-label={ui(label)} type="range" min={min} max={max} step={step} value={value}
        onPointerDown={onEditing} onFocus={onEditing} onChange={event => change({ [key]: event.currentTarget.valueAsNumber })}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <input aria-label={ui("{0}: valor", { 0: ui(label) })} type="number" min={min} max={max} step={step} value={value}
        onFocus={onEditing} onChange={event => { const number = event.currentTarget.valueAsNumber; if (Number.isFinite(number)) change({ [key]: Math.max(min, Math.min(max, number)) }); }}
        onBlur={commit} onKeyDown={event => { if (event.key === "Enter") commit(); }} />
    </label>;
  }
  return <section className="pcm-sfx-editor" aria-label={ui("Designer de SFX PCM")}>
    <header><div><h4>{ui("Designer de SFX PCM")}</h4><p>{ui("A prévia e a exportação usam o mesmo som PCM da engine.")}</p></div>
      <label>{ui("Fonte do efeito")}<select aria-label={ui("Fonte do efeito")} value={draft.source} onChange={event => { onEditing(); const source = event.currentTarget.value as "sample" | "synth"; change({ source, sampleAssetID: source === "sample" ? draft.sampleAssetID ?? samples[0]?.id ?? null : null }, true); }}>
        <option value="synth">{ui("Sintetizador PCM")}</option><option value="sample" disabled={!samples.length}>{ui("Sample WAV")}</option>
      </select></label>
    </header>
    {draft.source === "synth" || !sampleEditor ? <figure className="pcm-sfx-waveform"><svg viewBox="0 0 320 120" preserveAspectRatio="none" role="img" aria-label={ui(draft.source === "synth" ? "Forma de onda do efeito" : "Envelope do sample")}>
      <path d="M0 60H320" className="pcm-wave-axis" />
      {draft.source === "synth" ? <polyline points={waveform} /> : <path d={`M0 112 L${320 * draft.attackMs / draft.durationMs} 8 H${320 * (1 - draft.releaseMs / draft.durationMs)} L320 112`} />}
    </svg><figcaption>{ui(draft.source === "synth" ? "Forma de onda PCM" : "Envelope do sample")} · {draft.durationMs} ms</figcaption></figure> : null}
    <div className="pcm-sfx-controls">
      {draft.source === "synth" ? <label>{ui("Forma de onda")}<select aria-label={ui("Forma de onda")} value={draft.waveform} onChange={event => { onEditing(); change({ waveform: event.currentTarget.value as PcmSfxConfig["waveform"] }, true); }}>{PCM_WAVEFORMS.map(wave => <option value={wave} key={wave}>{ui(waveformNames[wave])}</option>)}</select></label>
        : <label>{ui("Sample WAV")}<select aria-label={ui("Sample WAV")} value={draft.sampleAssetID ?? ""} onChange={event => { onEditing(); change({ sampleAssetID: event.currentTarget.value }, true); }}>{samples.map(sample => <option key={sample.id} value={sample.id}>{sample.name}</option>)}</select></label>}
      {control("durationMs", "Duração do efeito", 10, 2000, "ms")}
      {draft.source === "synth" ? <>{control("frequencyStart", "Frequência inicial", 40, 4000, "Hz")}{control("frequencyEnd", "Frequência final", 40, 4000, "Hz")}{control("noiseMix", "Mistura de ruído", 0, 100, "%")}</>
        : <>{control("trimStartMs", "Início no sample", 0, 60000, "ms")}{control("pitchSemitones", "Transposição do sample", -24, 24, "st")}</>}
      {control("attackMs", "Ataque do efeito", 0, Math.min(1000, draft.durationMs - draft.releaseMs), "ms")}
      {control("releaseMs", "Finalização do efeito", 0, Math.min(1000, draft.durationMs - draft.attackMs), "ms")}
    </div>
    {draft.source === "sample" ? sampleEditor : null}
    {!samples.length ? <p>{ui("Importe um WAV para usar seus próprios samples.")}</p> : null}
  </section>;
}
