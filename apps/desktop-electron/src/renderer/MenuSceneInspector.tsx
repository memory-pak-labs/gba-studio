import { useEffect, useState } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import {
  addMenuSceneItem, moveMenuSceneItem, normalizeMenuSceneConfig, removeMenuSceneItem, updateMenuSceneItem,
  type MenuSceneConfig, type MenuSceneItem, type MenuTextInputConfig
} from "../shared/menuScene";
import { InspectorNumber, InspectorSection } from "./InspectorControls";
import { useStudioUiText } from "./studioUiText";

const ACTIONS = [
  ["select", "Confirmar opção"], ["open_screen", "Trocar tela"], ["push_screen", "Abrir tela"],
  ["pop_screen", "Voltar à tela anterior"], ["toggle_variable", "Alternar variável"], ["adjust_variable", "Ajustar variável"]
] as const;

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function MenuTextField({ label, value, required, onChange }: {
  label: string; value: string; required?: boolean; onChange(value: string): void;
}) {
  const ui = useStudioUiText();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label><span>{ui(label)}</span><input aria-label={ui(label)} value={draft}
    onChange={event => setDraft(event.currentTarget.value)} onBlur={() => {
      if (required && !draft.trim()) setDraft(value);
      else if (draft !== value) onChange(draft);
    }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

export function MenuSceneInspector({ value, data, onChange }: {
  value: unknown; data: GBAProjectData; onChange(config: MenuSceneConfig): void;
}) {
  const ui = useStudioUiText();
  const config = normalizeMenuSceneConfig(value);
  const events = records(data.events);
  const [screenID, setScreenID] = useState("");
  const [itemID, setItemID] = useState("");
  const currentScreen = config.screens?.find(screen => screen.id === screenID) ?? config.screens?.[0];
  const container = currentScreen ?? config;
  const selected = container.items.find(item => item.id === itemID) ?? container.items[0];
  const selectedIndex = selected ? container.items.indexOf(selected) : -1;
  const change = (patch: Partial<MenuSceneConfig>) => onChange(normalizeMenuSceneConfig({ ...config, ...patch }));
  const changeContainer = (patch: Partial<typeof container>) => {
    if (currentScreen) change({ screens: config.screens!.map(screen => screen.id === currentScreen.id ? { ...screen, ...patch } : screen) });
    else change(patch);
  };
  const changeItems = (operation: (scope: MenuSceneConfig) => MenuSceneConfig) => {
    const next = operation({ ...config, items: container.items });
    changeContainer({ items: next.items });
    return next.items;
  };
  const updateItem = (patch: Partial<MenuSceneItem>) => {
    if (selected) changeItems(scope => updateMenuSceneItem(scope, selected.id, patch));
  };
  const targets = new Set<string>();
  for (const scene of records(data.scenas)) {
    if (typeof scene.name !== "string") continue;
    const runtime = scene.runtime as { type?: string; config?: unknown } | undefined;
    if (runtime?.type === "menu") {
      const screens = normalizeMenuSceneConfig(runtime.config).screens;
      if (screens?.length) screens.forEach(screen => targets.add(screen.id));
      else targets.add(scene.name);
    } else if (selected?.action === "select") targets.add(scene.name);
  }
  if (selected?.targetScreenID) targets.add(selected.targetScreenID);
  const input = config.textInput;
  const updateInput = (patch: Partial<MenuTextInputConfig>) => {
    if (input) change({ textInput: { ...input, ...patch } });
  };
  const numeric = (label: string, key: "variableIndex" | "minValue" | "maxValue" | "step" | "checkedValue", min: number, max: number) =>
    selected ? <InspectorNumber label={ui(label)} value={selected[key]} min={min} max={max} onChange={value => updateItem({ [key]: value })} /> : null;
  return <>
    <InspectorSection title={ui("Opções do menu")} ariaLabel={ui("Opções do menu")} className="room-detail-editor-span-2">
      {currentScreen ? <label><span>{ui("Tela do menu")}</span><select aria-label={ui("Tela do menu")} value={currentScreen.id}
        onChange={event => { setScreenID(event.currentTarget.value); setItemID(""); }}>
        {config.screens!.map(screen => <option key={screen.id} value={screen.id}>{screen.title || screen.id}</option>)}
      </select></label> : null}
      <MenuTextField label="Título do menu" value={container.title} onChange={title => changeContainer({ title })} />
      {selected ? <label><span>{ui("Opção do menu")}</span><select aria-label={ui("Opção do menu")} value={selected.id}
        onChange={event => setItemID(event.currentTarget.value)}>
        {container.items.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.label}</option>)}
      </select></label> : null}
      <div className="room-entity-batch-actions">
        <button type="button" disabled={container.items.length >= 32} onClick={() => {
          const items = changeItems(scope => addMenuSceneItem(scope, { label: ui("Nova opção") }));
          setItemID(items[items.length - 1]!.id);
        }}>{ui("Adicionar opção")}</button>
        <button type="button" disabled={!selected} onClick={() => {
          changeItems(scope => removeMenuSceneItem(scope, selected!.id)); setItemID("");
        }}>{ui("Remover opção")}</button>
        <button type="button" disabled={selectedIndex <= 0} onClick={() => changeItems(scope => moveMenuSceneItem(scope, selected!.id, -1))}>{ui("Subir opção")}</button>
        <button type="button" disabled={!selected || selectedIndex === container.items.length - 1} onClick={() => changeItems(scope => moveMenuSceneItem(scope, selected!.id, 1))}>{ui("Descer opção")}</button>
      </div>
      {selected ? <div className="room-native-event-fields">
        <MenuTextField key={`label-${selected.id}`} label="Rótulo da opção" value={selected.label} required onChange={label => updateItem({ label })} />
        <label><span>{ui("Ação da opção")}</span><select aria-label={ui("Ação da opção")} value={selected.action} onChange={event => {
          const action = event.currentTarget.value as MenuSceneItem["action"];
          updateItem({ action, ...(["toggle_variable", "adjust_variable"].includes(action) && selected.variableIndex < 0 ? { variableIndex: 0 } : {}) });
        }}>
          {ACTIONS.map(([action, label]) => <option key={action} value={action}>{ui(label)}</option>)}
        </select></label>
        <label><input type="checkbox" checked={selected.enabled} onChange={event => updateItem({ enabled: event.currentTarget.checked })} />{ui("Habilitada")}</label>
        <label><input type="checkbox" checked={selected.requiresSave === true} onChange={event => updateItem({ requiresSave: event.currentTarget.checked })} />{ui("Exigir save")}</label>
        <label><span>{ui("Disponível em")}</span><select aria-label={ui("Disponível em")} value={selected.availableRuntime ?? ""}
          onChange={event => updateItem({ availableRuntime: event.currentTarget.value === "racing" ? "racing" : undefined })}>
          <option value="">{ui("Qualquer runtime")}</option><option value="racing">{ui("Corrida")}</option>
        </select></label>
        <label><span>{ui("Evento antes da ação")}</span><select aria-label={ui("Evento antes da ação")} value={selected.eventName} onChange={event => updateItem({ eventName: event.currentTarget.value })}>
          <option value="">{ui("Nenhum")}</option>
          {selected.eventName && !events.some(event => event.name === selected.eventName) ? <option value={selected.eventName}>{selected.eventName}</option> : null}
          {events.filter(event => typeof event.name === "string").map(event => <option key={String(event.id ?? event.name)} value={String(event.name)}>{String(event.name)}</option>)}
        </select></label>
        {["select", "open_screen", "push_screen"].includes(selected.action) ? <label><span>{ui("Destino")}</span><select aria-label={ui("Destino")} value={selected.targetScreenID} onChange={event => updateItem({ targetScreenID: event.currentTarget.value })}>
          <option value="">{ui("Nenhum")}</option>{[...targets].map(target => <option key={target} value={target}>{target}</option>)}
        </select></label> : null}
        {["open_screen", "push_screen"].includes(selected.action) ? <MenuTextField key={`target-${selected.id}`} label="Opção inicial" value={selected.targetItemID ?? ""} onChange={targetItemID => updateItem({ targetItemID })} /> : null}
        {["toggle_variable", "adjust_variable"].includes(selected.action) ? <>
          {numeric("Variável", "variableIndex", 0, 63)}{numeric("Mínimo", "minValue", -32768, selected.maxValue)}{numeric("Máximo", "maxValue", selected.minValue, 32767)}
          {selected.action === "adjust_variable" ? numeric("Incremento", "step", 1, 32767) : numeric("Valor ligado", "checkedValue", selected.minValue, selected.maxValue)}
        </> : null}
        <InspectorSection title={ui("Área da opção")} defaultOpen={false}>
          {(["x", "y", "width", "height"] as const).map(key => <InspectorNumber key={key} label={key.toUpperCase()} value={selected.clickBox[key]}
            min={key === "width" || key === "height" ? 1 : 0} max={key === "x" ? 239 : key === "y" ? 159 : key === "width" ? 240 - selected.clickBox.x : 160 - selected.clickBox.y}
            unit="px" onChange={value => updateItem({ clickBox: { ...selected.clickBox, [key]: value } })} />)}
        </InspectorSection>
      </div> : <p>{ui("Adicione uma opção para configurar este menu.")}</p>}
    </InspectorSection>
    {!currentScreen ? <InspectorSection title={ui("Entrada de texto")} className="room-detail-editor-span-2" defaultOpen={false}>
      <label><input type="checkbox" checked={Boolean(input)} onChange={event => change({ textInput: event.currentTarget.checked ? {
        variableName: "player.name", maxLength: 8, x: 10, y: 5, width: 8,
        keyboard: { layout: "grid", x: 4, y: 8, width: 22, height: 6, allowLowercase: true }
      } : undefined })} />{ui("Usar entrada de texto")}</label>
      {input ? <div className="room-native-event-fields">
        <p>{ui("Abra a entrada de texto em um evento usando a mesma variável.")}</p>
        <MenuTextField label="Variável de texto" value={input.variableName} required onChange={variableName => updateInput({ variableName })} />
        <InspectorNumber label={ui("Máximo de caracteres")} value={input.maxLength} min={1} max={16} onChange={maxLength => updateInput({ maxLength })} />
        {(["x", "y", "width"] as const).map(key => <InspectorNumber key={key} label={key === "width" ? ui("Largura do campo") : key.toUpperCase()} value={input[key]}
          min={key === "width" ? 1 : 0} max={key === "x" ? 30 - input.width : key === "y" ? 19 : 30 - input.x} unit="tiles" onChange={value => updateInput({ [key]: value })} />)}
        <label><input type="checkbox" checked={input.keyboard?.layout === "grid"} onChange={event => updateInput({ keyboard: { x: 4, y: 8, width: 22, height: 6,
          allowLowercase: true, ...input.keyboard, layout: event.currentTarget.checked ? "grid" : "hidden" } })} />{ui("Teclado na tela")}</label>
        {input.keyboard?.layout === "grid" ? <label><input type="checkbox" checked={input.keyboard.allowLowercase} onChange={event => updateInput({ keyboard: { ...input.keyboard!, allowLowercase: event.currentTarget.checked } })} />{ui("Aceitar minúsculas")}</label> : null}
      </div> : null}
    </InspectorSection> : null}
  </>;
}
