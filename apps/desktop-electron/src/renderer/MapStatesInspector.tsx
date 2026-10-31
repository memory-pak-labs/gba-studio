import { useEffect, useState } from "react";
import { readMapStates, type MapStateDefinition } from "../shared/mapStates";
import { TILE_REPLACEMENT_COLLISIONS } from "../shared/tileReplacement";
import { useStudioUiText } from "./studioUiText";

interface MapStatesInspectorProps {
  value: MapStateDefinition[];
  width: number;
  height: number;
  sceneName: string;
  onChange(value: MapStateDefinition[]): void;
}

export function MapStatesInspector({ value, width, height, sceneName, onChange }: MapStatesInspectorProps): React.ReactElement {
  const ui = useStudioUiText();
  const [draft, setDraft] = useState(() => structuredClone(value));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(structuredClone(value)); setError(null); }, [value]);
  const edit = (change: (next: MapStateDefinition[]) => void) => {
    setDraft(current => { const next = structuredClone(current); change(next); return next; });
    setSaved(false); setError(null);
  };
  const nextCell = () => {
    const occupied = new Set(draft.flatMap(state => state.variants[0]!.tiles.flatMap(tile => Array.from({ length: tile.count }, (_, dx) => `${tile.x + dx},${tile.y}`))));
    for (let y = 0; y < Math.min(512, height); ++y) for (let x = 0; x < Math.min(512, width); ++x) if (!occupied.has(`${x},${y}`)) return { x, y };
    return { x: 0, y: 0 };
  };
  const add = () => {
    const stem = `map_${sceneName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    let index = draft.length + 1;
    while (draft.some(state => state.id === `${stem}_${index}`)) ++index;
    const id = `${stem}_${index}`, position = nextCell();
    edit(next => next.push({ id, name: ui("Porta"), variable: id, variants: [
      { id: "closed", name: ui("Fechada"), value: 0, tiles: [{ ...position, tile: 0, count: 1, layer: "bg2", collision: "solid" }] },
      { id: "open", name: ui("Aberta"), value: 1, tiles: [{ ...position, tile: 1, count: 1, layer: "bg2", collision: "free" }] }
    ] }));
  };
  return <section className="room-detail-section room-detail-editor-span-2" aria-label={ui("Estados de mapa")}>
    <details className="room-background-advanced-details room-map-states">
    <summary>{ui("Estados de mapa")} · {draft.length}</summary>
    <div className="room-background-advanced-content">
    <p className="room-detail-section-help">{ui("Agrupe piso BG2, colisão e uma variável salva. As variantes cobrem as mesmas células. A quantidade usa tiles consecutivos. Limite da cena: 8 operações e 256 células.")}</p>
    {draft.map((state, si) => <fieldset key={si} className="room-map-state scene-resource-card">
      <legend>{state.name || state.id}</legend>
      <div className="room-detail-bounds-grid">
        <label><span>{ui("Nome do estado")}</span><input value={state.name} onChange={event => edit(next => { next[si]!.name = event.target.value; })} /></label>
        <label><span>{ui("ID do estado")}</span><input value={state.id} onChange={event => edit(next => { next[si]!.id = event.target.value; })} /></label>
        <label><span>{ui("Variável persistente")}</span><input value={state.variable} onChange={event => edit(next => { next[si]!.variable = event.target.value; })} /></label>
      </div>
      {state.variants[0]!.tiles.map((tile, ti) => <div className="room-detail-bounds-grid" key={ti}>
        {(["x", "y", "count"] as const).map(key => <label key={key}><span>{key === "count" ? ui("Quantidade") : key.toUpperCase()}</span><input type="number" min={key === "count" ? 1 : 0} max={key === "count" ? 64 : key === "x" ? width - 1 : height - 1} value={tile[key]} onChange={event => { const number = event.target.valueAsNumber; edit(next => next[si]!.variants.forEach(variant => { variant.tiles[ti]![key] = number; })); }} /></label>)}
        <button type="button" disabled={state.variants[0]!.tiles.length === 1} onClick={() => edit(next => next[si]!.variants.forEach(variant => variant.tiles.splice(ti, 1)))}>{ui("Remover operação")}</button>
      </div>)}
      <button type="button" disabled={state.variants[0]!.tiles.length >= 8} onClick={() => { const position = nextCell(); edit(next => next[si]!.variants.forEach(variant => variant.tiles.push({ ...position, count: 1, tile: 0, collision: "free", layer: "bg2" }))); }}>{ui("Adicionar operação")}</button>
      {state.variants.map((variant, vi) => <fieldset className="scene-resource-subsection" key={vi}>
        <legend>{variant.name || variant.id}</legend>
        <div className="room-detail-bounds-grid">
          <label><span>{ui("Nome da variante")}</span><input value={variant.name} onChange={event => edit(next => { next[si]!.variants[vi]!.name = event.target.value; })} /></label>
          <label><span>{ui("ID da variante")}</span><input value={variant.id} onChange={event => edit(next => { next[si]!.variants[vi]!.id = event.target.value; })} /></label>
          <label><span>{ui("Valor salvo")}</span><input type="number" min={0} max={32767} value={variant.value} onChange={event => { const number = event.target.valueAsNumber; edit(next => { next[si]!.variants[vi]!.value = number; }); }} /></label>
        </div>
        {variant.tiles.map((tile, ti) => <div className="room-detail-bounds-grid" key={ti}>
          <label><span>{ui("Tile inicial")}{` (${tile.x}, ${tile.y})`}</span><input type="number" min={0} max={1023} value={tile.tile} onChange={event => { const number = event.target.valueAsNumber; edit(next => { next[si]!.variants[vi]!.tiles[ti]!.tile = number; }); }} /></label>
          <label><span>{ui("Colisão")}</span><select value={tile.collision} onChange={event => edit(next => { next[si]!.variants[vi]!.tiles[ti]!.collision = event.target.value; })}>{TILE_REPLACEMENT_COLLISIONS.filter(value => value !== "keep").map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>)}
        <code>{`set_map_state ${state.id} ${variant.id}`}</code>
        <button type="button" disabled={state.variants.length <= 2} onClick={() => edit(next => { next[si]!.variants.splice(vi, 1); })}>{ui("Remover variante")}</button>
      </fieldset>)}
      <button type="button" disabled={state.variants.length >= 8} onClick={() => edit(next => {
        const variants = next[si]!.variants;
        let index = variants.length + 1;
        while (variants.some(variant => variant.id === `variant_${index}` || variant.value === index)) ++index;
        variants.push({ id: `variant_${index}`, name: ui("Variante {0}", { 0: index }), value: index, tiles: structuredClone(variants[0]!.tiles) });
      })}>{ui("Adicionar variante")}</button>
      <button type="button" onClick={() => edit(next => { next.splice(si, 1); })}>{ui("Remover estado")}</button>
    </fieldset>)}
    <div className="room-detail-bounds-grid">
      <button type="button" disabled={draft.length >= 8} onClick={add}>{ui("Adicionar estado de mapa")}</button>
      <button type="button" onClick={() => { try { const validated = readMapStates(draft, width, height); onChange(validated); setError(null); setSaved(true); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>{ui("Aplicar estados")}</button>
    </div>
    {error ? <p role="alert">{ui(error)}</p> : null}
    {saved ? <p role="status">{ui("Estados aplicados à cena. Salve o projeto para preservar as definições.")}</p> : null}
    </div>
    </details>
  </section>;
}
