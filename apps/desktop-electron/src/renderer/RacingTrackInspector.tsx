import type {RacingTopdownTrackConfig} from '../shared/sceneTypeProfiles';
import {insertRacingRoutePoint,removeRacingTrackElement,racingGateLabel,type RacingTrackSelection} from '../shared/racingTrackEditing';
import {InspectorNumber,InspectorSection} from './InspectorControls';
import {useStudioUiText} from './studioUiText';
import {ProjectReferencePicker,type ProjectReferenceOption} from './studioUi';

export function RacingTrackInspector({track,width,height,selection,mode,readOnly=false,eventOptions,onSelect,onChange,onOpenEvents,onOpenEvent,onCreateEvent}:{
 track:RacingTopdownTrackConfig;width:number;height:number;selection:RacingTrackSelection|null;mode:'gates'|'route';readOnly?:boolean;
 eventOptions:ProjectReferenceOption[];onSelect(selection:RacingTrackSelection|null):void;onChange(track:RacingTopdownTrackConfig):void;
 onOpenEvents():void;onOpenEvent?(name:string):void;onCreateEvent?(bindingKey:string):void;
}){
 const ui=useStudioUiText();
 const gateIndex=selection?.kind==='gate'?track.checkpoints.findIndex(g=>g.id===selection.id):-1;
 const gate=track.checkpoints[gateIndex];const pointIndex=selection?.kind==='point'?selection.index:-1,point=track.pathPoints?.[pointIndex];
 const update=(next:RacingTopdownTrackConfig)=>{if(!readOnly&&next!==track)onChange(next);};
 return <InspectorSection title={ui(mode==='gates'?'Checkpoints da corrida':'Rota dos rivais')} defaultOpen className="racing-track-inspector" ariaLabel={ui('Autoria do circuito')}>
  <p>{ui('Áreas: {0} · Pontos de rota: {1}',{0:track.checkpoints.length,1:track.pathPoints?.length??0})}</p>
  <p className="muted">{ui('Arraste no mapa. Setas ajustam 1 px; Shift ajusta 8 px. Alt permite arraste livre.')}</p>
  {mode==='gates'?<>
   <div className="racing-track-list" role="group" aria-label={ui('Áreas da corrida')}>{track.checkpoints.map((g,i)=><button type="button" key={g.id} aria-pressed={gate?.id===g.id} onClick={()=>onSelect({kind:'gate',id:g.id})}>{ui(racingGateLabel(track,i))}</button>)}</div>
   <button type="button" disabled={readOnly||track.checkpoints.length>=16} onClick={()=>{const id=`checkpoint-${Date.now()}`;update({...track,checkpoints:[...track.checkpoints,{id,x:Math.floor(width/2),y:Math.floor(height/2),width:32,height:32}]});onSelect({kind:'gate',id});}}>{ui('Adicionar checkpoint')}</button>
   {gate?<>
    <InspectorSection title={ui(racingGateLabel(track,gateIndex))} defaultOpen>
     <div className="inspector-field-grid">{(['x','y','width','height'] as const).map(field=><InspectorNumber key={field} label={ui({x:'Centro X',y:'Centro Y',width:'Largura',height:'Altura'}[field])} value={gate[field]} min={field==='width'||field==='height'?1:0} max={field==='x'?width-1:field==='y'?height-1:256} unit="px" disabled={readOnly} onChange={value=>update({...track,checkpoints:track.checkpoints.map(g=>g.id===gate.id?{...g,[field]:value}:g)})}/>)}</div>
     <div className="inspector-field"><span>{ui('Ao validar passagem')}</span><ProjectReferencePicker ariaLabel={ui('Evento ao validar passagem')} disabled={readOnly} options={eventOptions} value={gate.eventName??''} onChange={eventName=>update({...track,checkpoints:track.checkpoints.map(g=>g.id===gate.id?{...g,eventName}:g)})}/></div>
     <div className="racing-track-actions"><button type="button" disabled={readOnly||!onCreateEvent} onClick={()=>onCreateEvent?.(`runtime:/topdownTrack/checkpoints/${gateIndex}/eventName`)}>{ui('Criar evento')}</button><button type="button" disabled={!gate.eventName} onClick={()=>gate.eventName&&onOpenEvent?.(gate.eventName)}>{ui('Editar evento')}</button></div>
     <button type="button" disabled={readOnly||track.checkpoints.length<=1||(gateIndex===0&&track.finishAtZero)} onClick={()=>{update(removeRacingTrackElement(track,{kind:'gate',id:gate.id}));onSelect(null);}}>{ui('Remover área da corrida')}</button>
    </InspectorSection>
   </>:<p>{ui('Selecione uma área no mapa ou na lista.')}</p>}
  </>:<>
   <label><span>{ui('Ponto da rota')}</span><select aria-label={ui('Ponto da rota')} value={pointIndex>=0?pointIndex:0} onChange={e=>onSelect({kind:'point',index:Number(e.currentTarget.value)})}>{track.pathPoints?.map((_,i)=><option key={i} value={i}>{ui('Ponto {0}',{0:i+1})}</option>)}</select></label>
   {point?<div className="inspector-field-grid">{(['x','y'] as const).map(field=><InspectorNumber key={field} label={field.toUpperCase()} value={point[field]} min={0} max={(field==='x'?width:height)-1} unit="px" disabled={readOnly} onChange={value=>update({...track,pathPoints:track.pathPoints!.map((p,i)=>i===pointIndex?{...p,[field]:value}:p)})}/>)}</div>:null}
   <button type="button" disabled={readOnly||(track.pathPoints?.length??0)<2||(track.pathPoints?.length??0)>=32} onClick={()=>{const i=Math.max(0,pointIndex);update(insertRacingRoutePoint(track,i));onSelect({kind:'point',index:i+1});}}>{ui('Inserir ponto depois')}</button>
   <button type="button" disabled={readOnly||(track.pathPoints?.length??0)<=2||pointIndex<0} onClick={()=>{update(removeRacingTrackElement(track,{kind:'point',index:pointIndex}));onSelect({kind:'point',index:Math.max(0,pointIndex-1)});}}>{ui('Remover ponto selecionado')}</button>
  </>}
  <button type="button" onClick={onOpenEvents}>{ui('Eventos da corrida')}</button>
 </InspectorSection>;
}
