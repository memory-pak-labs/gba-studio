import type { GBAProjectData } from "../shared/projectFile";
import type { HudElementBehavior, HudElementState, HudEventTrigger, HudElementEvent } from "../shared/hudBehavior";
import { normalizeHudBehavior } from "../shared/hudBehavior";
import { InspectorNumber } from "./InspectorControls";
export const hudStateLabels: Record<HudElementState,string> = { normal:"Normal", selected:"Selecionado", disabled:"Desativado", hidden:"Oculto" };
const triggers: Record<HudEventTrigger,string> = { appear:"Ao aparecer", valueChanged:"Ao mudar o valor", focus:"Ao receber foco", confirm:"Ao confirmar com A" };
interface Props { data?: GBAProjectData | null; value?: HudElementBehavior; canEdit: boolean; section: "states" | "events"; onChange(value: HudElementBehavior): void; }
export function HudElementBehaviorInspector({data,value,canEdit,section,onChange}:Props): React.ReactElement {
  const behavior=normalizeHudBehavior(value);
  const variables=(Array.isArray(data?.variables)?data.variables:[]).map(item=>item as Record<string,unknown>).filter(item=>typeof item.name==="string");
  const first=String(variables[0]?.name??"");
  const variableSelect=(label:string,current:string,onChangeVariable:(v:string)=>void) => <label>{label}<select aria-label={label} disabled={!canEdit || !variables.length} value={current} onChange={event=>onChangeVariable(event.currentTarget.value)}><option value="" disabled={Boolean(current)}>Escolher variável</option>{variables.map(item=><option key={String(item.name)} value={String(item.name)}>{String(item.displayName??item.name)}</option>)}</select></label>;
  const editEvent=(index:number,fields:Partial<HudElementEvent>)=>onChange({...behavior,events:behavior.events.map((event,i)=>i===index?{...event,...fields}:event)});
  return <div className="hud-element-behavior">
    {!variables.length?<p>Crie uma variável do projeto para configurar condições e ações.</p>:null}
    {section==="states"?<>
      <p>Normal usa as propriedades do elemento. Oculto tem prioridade sobre Desativado e Selecionado.</p>
      {(["selected","disabled","hidden"] as const).map(state=>{
        const condition=behavior.states[state];
        const update=(fields:Partial<NonNullable<typeof condition>>)=>onChange({...behavior,states:{...behavior.states,[state]:{...condition,...fields}}});
        return <fieldset key={state}><legend>{hudStateLabels[state]}</legend>
          <label><input type="checkbox" disabled={!canEdit || !first} checked={Boolean(condition)} onChange={event=>{const states={...behavior.states};if(event.currentTarget.checked)states[state]={variable:first,value:0};else delete states[state];onChange({...behavior,states});}}/> Ativar condição de {hudStateLabels[state].toLowerCase()}</label>
          {condition?<>{variableSelect(`Variável · ${hudStateLabels[state]}`,condition.variable,variable=>update({variable}))}<InspectorNumber disabled={!canEdit} label={`Igual a · ${hudStateLabels[state]}`} value={condition.value} min={-2147483648} max={2147483647} onChange={value=>update({value})}/>{state!=="hidden"?<label>Texto neste estado<input aria-label={`Texto · ${hudStateLabels[state]}`} disabled={!canEdit} value={condition.text??""} placeholder="Usar texto normal" onChange={event=>update({text:event.currentTarget.value||undefined})}/></label>:null}</>:null}
        </fieldset>;
      })}
    </>:<>
      <p>Os gatilhos executam uma vez por ocorrência. A confirmação com A exige o estado Selecionado.</p>
      {behavior.events.map((event,index)=><fieldset key={index}><legend>Evento {index+1}</legend>
        <label>Gatilho<select aria-label={`Gatilho do evento ${index+1}`} disabled={!canEdit} value={event.trigger} onChange={change=>editEvent(index,{trigger:change.currentTarget.value as HudEventTrigger,watchVariable:change.currentTarget.value === "valueChanged" ? event.watchVariable||first : undefined})}>{Object.entries(triggers).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {event.trigger==="valueChanged"?variableSelect(`Observar variável · evento ${index+1}`,event.watchVariable??"",watchVariable=>editEvent(index,{watchVariable})):null}
        {event.actions.map((action,actionIndex)=>{
          const editAction=(fields:Partial<typeof action>)=>editEvent(index,{actions:event.actions.map((item,i)=>i===actionIndex?{...item,...fields}:item)});
          return <div key={actionIndex} className="hud-event-action">
            <label>Ação<select aria-label={`Ação ${actionIndex+1} do evento ${index+1}`} disabled={!canEdit} value={action.op} onChange={change=>editAction({op:change.currentTarget.value as typeof action.op})}><option value="set_variable">Definir variável</option><option value="add_variable">Somar à variável</option></select></label>
            {variableSelect(`Variável da ação ${actionIndex+1} · evento ${index+1}`,action.variable,variable=>editAction({variable}))}
            <InspectorNumber disabled={!canEdit} label={`Valor da ação ${actionIndex+1} · evento ${index+1}`} value={action.value} min={-2147483648} max={2147483647} onChange={value=>editAction({value})}/>
            <button type="button" disabled={!canEdit || event.actions.length <= 1} title="Mantenha ao menos uma ação ou remova o evento inteiro" onClick={()=>editEvent(index,{actions:event.actions.filter((_,i)=>i!==actionIndex)})}>Remover ação</button>
          </div>;
        })}
        <div className="hud-authoring-actions"><button type="button" disabled={!canEdit || !first || event.actions.length>=16} onClick={()=>editEvent(index,{actions:[...event.actions,{op:"set_variable",variable:first,value:0}]})}>Adicionar ação</button><button type="button" disabled={!canEdit} onClick={()=>onChange({...behavior,events:behavior.events.filter((_,i)=>i!==index)})}>Remover evento</button></div>
      </fieldset>)}
      <button type="button" disabled={!canEdit || !first || behavior.events.length>=8} onClick={()=>onChange({...behavior,events:[...behavior.events,{trigger:"appear",actions:[{op:"set_variable",variable:first,value:0}]}]})}>Adicionar evento</button>
    </>}
  </div>;
}
