import { useEffect, useState } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import { normalizePointClickTarget, pointClickItemNames, type PointClickTargetConfig } from "../shared/pointClickTargets";
import { InspectorNumber, InspectorSection } from "./InspectorControls";
import { useStudioUiText } from "./studioUiText";

function ItemNameField({ value, onChange }: { value: string; onChange(value: string): void }) {
  const ui = useStudioUiText();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label><span>{ui("Item concedido")}</span><input aria-label={ui("Item concedido")} value={draft}
    onChange={event => setDraft(event.currentTarget.value)} onBlur={() => { if (draft !== value) onChange(draft); }}
    onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

export function PointClickTargetInspector({ value, data, onChange }: {
  value: unknown; data: GBAProjectData; onChange(value: PointClickTargetConfig): void;
}) {
  const ui = useStudioUiText();
  const config = normalizePointClickTarget(value);
  const change = (patch: Partial<PointClickTargetConfig>) => onChange(normalizePointClickTarget({ ...config, ...patch }));
  const itemNames = new Set(pointClickItemNames(data));
  if (config.requiredItem) itemNames.add(config.requiredItem);
  const dialogues = Array.isArray(data.dialogues) ? data.dialogues : [];
  const events = Array.isArray(data.events) ? data.events : [];
  return <InspectorSection title={ui("Alvo de Point and Click")}>
    <div className="room-native-event-fields">
      <ItemNameField value={config.giveItem} onChange={giveItem => change({ giveItem })} />
      {config.giveItem ? <>
        <InspectorNumber label={ui("Variável de posse")} value={config.ownershipVariable} min={0} max={63}
          onChange={ownershipVariable => change({ ownershipVariable })} />
        <p>{ui("O item pertence ao jogador enquanto esta variável for diferente de zero.")}</p>
      </> : null}
      <label><span>{ui("Item selecionado exigido")}</span><select aria-label={ui("Item selecionado exigido")}
        value={config.requiredItem} onChange={event => change({ requiredItem: event.currentTarget.value })}>
        <option value="">{ui("Nenhum")}</option>
        {[...itemNames].map(name => <option key={name} value={name}>{name}</option>)}
      </select></label>
      <label><input type="checkbox" checked={config.consumeRequiredItem} disabled={!config.requiredItem}
        onChange={event => change({ consumeRequiredItem: event.currentTarget.checked })} />{ui("Consumir item exigido")}</label>
      <label><span>{ui("Diálogo quando indisponível")}</span><select aria-label={ui("Diálogo quando indisponível")}
        disabled={!config.requiredItem} value={config.unavailableDialogue}
        onChange={event => change({ unavailableDialogue: event.currentTarget.value })}>
        <option value="">{ui("Nenhum")}</option>
        {dialogues.map((line: Record<string, unknown>, index: number) => typeof line.key === "string"
          ? <option key={`${line.key}-${index}`} value={line.key}>{line.key}</option> : null)}
      </select></label>
      <label><span>{ui("Evento ao usar item")}</span><select aria-label={ui("Evento ao usar item")}
        disabled={!config.requiredItem} value={config.useItemEvent} onChange={event => change({ useItemEvent: event.currentTarget.value })}>
        <option value="">{ui("Usar interação normal")}</option>
        {events.map((event: Record<string, unknown>, index: number) => typeof event.name === "string"
          ? <option key={`${event.name}-${index}`} value={event.name}>{event.name}</option> : null)}
      </select></label>
      <p>{ui("No Player, B troca o item selecionado; A usa o item no alvo.")}</p>
    </div>
  </InspectorSection>;
}
