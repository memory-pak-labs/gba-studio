import { uiText as ui, useStudioUiText } from "./studioUiText";
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Variable, Braces, FileCode2 } from "lucide-react";
import type { GBAProjectData } from "../shared/projectFile";
import { listProjectVariables, type ProjectVariableKind } from "../shared/variablesWorkspace";
import { listLogicValueUsages, logicValueRecord, type LogicValuePatch } from "../shared/logicWorkspace";
import type { EventsWorkspacePresentation } from "../shared/eventsWorkspace";
export type LogicSelection = {kind:ProjectVariableKind; name:string} | {kind:"script"; name:string};
export interface LogicNavigatorProps {
  projectData:GBAProjectData;
  events:EventsWorkspacePresentation | null;
  selection:LogicSelection | null;
  onSelect(selection:LogicSelection):void;
  onCreateVariable?(kind:ProjectVariableKind, valueType?:"number" | "text"):Promise<string | void> | string | void;
  onCreateScript?():Promise<string | void> | string | void;
}
export function LogicNavigator({projectData,events,selection,onSelect,onCreateVariable,onCreateScript}:LogicNavigatorProps):React.ReactElement {
  const ui = useStudioUiText();
  const [query,setQuery] = useState("");
  const values=listProjectVariables(projectData);
  const groups=[{kind:"variable" as const,label:"Variáveis",icon:Variable,items:values.filter(item=>item.kind==="variable")},{kind:"script" as const,label:"Scripts",icon:FileCode2,items:events?.groups.flatMap(group=>group.events) ?? []},{kind:"constant" as const,label:"Constantes",icon:Braces,items:values.filter(item=>item.kind==="constant")}];
  return <section className="logic-navigator" aria-label={ui("Lógica do projeto")}>
    <label className="editor-project-search-field"><span className="sr-only">{ui("Buscar na lógica")}</span><input type="search" aria-label={ui("Buscar na lógica")} placeholder={ui("Buscar na lógica")} value={query} onChange={event=>setQuery(event.currentTarget.value)}/></label>
    {groups.map(group=>{
      const Icon=group.icon;
      const items=group.items.filter(item=>item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      return <details key={group.kind} open className="logic-section">
        <summary><ChevronRight className="logic-closed" size={14}/><ChevronDown className="logic-open" size={14}/><strong>{ui(group.label)}</strong><small>{items.length}</small></summary>
        <button type="button" className="logic-add" aria-label={ui("Adicionar {0}", { 0: group.kind==="script"?"script":group.kind==="variable"?ui("variavel"):ui("constante") })} onClick={async()=>{const name=await (group.kind==="script"?onCreateScript?.():onCreateVariable?.(group.kind));if(name){setQuery("");onSelect({kind:group.kind,name});}}}><Plus size={14}/></button>
        <div className="logic-items">{items.length ? items.map(item=><button type="button" key={item.name} aria-pressed={selection?.kind===group.kind && selection.name===item.name} className={`editor-tree-row leaf ${selection?.kind===group.kind && selection.name===item.name ? "is-selected":""}`} onClick={()=>onSelect({kind:group.kind,name:item.name})}><Icon size={16} aria-hidden="true"/><span><strong>{item.name}</strong>{group.kind==="script" && "category" in item ? <small>{ui(String(item.category))}</small>:null}</span></button>):<p className="muted logic-empty">{query?ui("Nenhum resultado."):ui("Nenhum item cadastrado.")}</p>}</div>
      </details>;
    })}
  </section>;
}
export interface LogicValueInspectorProps {
  projectData:GBAProjectData;
  selection:Exclude<LogicSelection,{kind:"script"}>;
  onUpdate?(name:string,kind:ProjectVariableKind,patch:LogicValuePatch):void;
  onRemove?(name:string,kind:ProjectVariableKind):void;
}
export function LogicValueInspector({projectData,selection,onUpdate,onRemove}:LogicValueInspectorProps):React.ReactElement {
  const ui = useStudioUiText();
  const entry=logicValueRecord(projectData,selection.name,selection.kind);
  const usages=listLogicValueUsages(projectData,selection.name);
  if(!entry) return <p className="muted">{ui("Este item foi removido. Selecione outro item na aba Lógica.")}</p>;
  const text=selection.kind!=="constant" && entry.valueType==="text";
  const valueKey=selection.kind==="constant"?"value":"initialValue";
  const label=selection.kind==="constant"?"Constante":"Variável";
  return <section className="logic-value-inspector" aria-label={`${label} ${selection.name}`}>
    <div className="rooms-inspector-context"><h4>{selection.name}</h4><p>{ui(label)} {ui(" · Projeto")}</p></div>
    <label><span>{ui("Nome")}</span><input aria-label={ui("Nome do item de lógica")} defaultValue={selection.name} readOnly={usages.length>0} onBlur={event=>{const name=event.currentTarget.value.trim();if(name!==selection.name)onUpdate?.(selection.name,selection.kind,{name});}}/></label>
    {usages.length>0?<p className="muted">{ui("O nome está vinculado aos usos abaixo. Remova os vínculos para renomear.")}</p>:null}
    {selection.kind!=="constant" ? <label><span>{ui("Tipo")}</span><select aria-label={ui("Tipo do item de lógica")} value={text?"text":"number"} onChange={event=>onUpdate?.(selection.name,selection.kind,{valueType:event.currentTarget.value==="text"?"text":"number",[valueKey]:event.currentTarget.value==="text"?"":0})}><option value="number">{ui("Número")}</option><option value="text">{ui("Texto")}</option></select></label> : <p className="muted">{ui("Valor fixo numérico do projeto. Use const(")}{selection.name}{ui(") nos valores de eventos de variável, comparação e espera. Configurações da engine ficam em Ajustes.")}</p>}
    {text?<label><span>{ui("Máximo de caracteres")}</span><input aria-label={ui("Máximo de caracteres")} type="number" min={1} max={16} value={Number(entry.maxLength)||16} onChange={event=>onUpdate?.(selection.name,selection.kind,{maxLength:event.currentTarget.valueAsNumber})}/></label>:null}
    <label><span>{selection.kind==="constant"?ui("Valor fixo"):ui("Valor inicial")}</span><input aria-label={selection.kind==="constant"?ui("Valor fixo"):ui("Valor inicial")} type={text?"text":"number"} step={1} maxLength={text?Number(entry.maxLength)||16:undefined} value={String(text ? (typeof entry[valueKey] === "string" ? entry[valueKey] : "") : (entry[valueKey] ?? 0))} onChange={event=>{const value=text?event.currentTarget.value:event.currentTarget.valueAsNumber;if(typeof value==="number" && !Number.isFinite(value))return;onUpdate?.(selection.name,selection.kind,{[valueKey]:value});}}/></label>
    <section aria-label={ui("Onde é utilizado")}><h4>{ui("Onde é utilizado")}</h4>{usages.length?<ul>{usages.map(usage=><li key={usage.path}><strong>{ui(usage.label)}</strong><small>{usage.path.startsWith("events") ? ui("Evento{0}", { 0: usage.path.includes("steps[") ? ` · Passo ${Number(usage.path.match(/steps\[(\d+)\]/)?.[1] ?? 0)+1}` : "" }) : usage.path.startsWith("rooms") ? ui("Cena") : ui("Configuração do projeto")}</small></li>)}</ul>:<p className="muted">{ui("Nenhuma referência encontrada.")}</p>}</section>
    <button type="button" className="danger" disabled={usages.length>0 || !onRemove} onClick={()=>onRemove?.(selection.name,selection.kind)}>{ui("Excluir ")}{label.toLocaleLowerCase()}</button>
  </section>;
}
