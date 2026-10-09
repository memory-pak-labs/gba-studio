import { InspectorNumber, InspectorSection } from "./InspectorControls";
import { createRacingCircuitTrack } from "../shared/racingAuthoring";
import type { RacingSceneConfig, RacingTopdownTrackConfig } from "../shared/sceneTypeProfiles";

export function RacingSceneInspector({config,width,height,background,assets,onChange,onPrepare}: {
  config:RacingSceneConfig; width:number; height:number; background:string;
  assets:Array<{label:string;value:string}>;
  onChange(patch:Partial<RacingSceneConfig>):void;
  onPrepare(track:RacingTopdownTrackConfig):void;
}) {
  const track=config.topdownTrack;
  const gateLabel=(index:number)=>track?.finishAtZero===true ? (index===0?'Chegada':`Checkpoint ${index}`) : `Checkpoint ${index+1}`;
  const camera=config.perspectiveCamera??{height:48,distance:64,focalLength:96};
  const visuals=config.pseudo3dVisuals??{horizonY:48,panoramaBackgroundId:"",floorTilemapId:background,minimapAssetId:""};
  const changeTrack=(patch:Partial<RacingTopdownTrackConfig>)=>track&&onChange({topdownTrack:{...track,...patch}});
  return <InspectorSection title="Corrida" defaultOpen className="room-detail-editor-span-2" ariaLabel="Configuração da corrida">
    <label><span>Visão da corrida</span><select aria-label="Visão da corrida" value={config.presentation} onChange={event=>onChange({presentation:event.currentTarget.value as RacingSceneConfig["presentation"],...(event.currentTarget.value==="pseudo3d"?{pseudo3dVisuals:visuals}:{})})}>
      <option value="topdown">Vista de cima</option><option value="pseudo3d">Perspectiva · câmera atrás do carro</option>
    </select></label>
    <InspectorNumber label="Velocidade máxima" value={config.maxSpeed} min={0.125} max={16} step={0.125} onChange={maxSpeed=>onChange({maxSpeed})}/>
    <InspectorNumber label="Aceleração" value={config.acceleration} min={0.125} max={32} step={0.125} onChange={acceleration=>onChange({acceleration})}/>
    <InspectorNumber label="Força do freio" value={config.brakePower} min={0.125} max={32} step={0.125} onChange={brakePower=>onChange({brakePower})}/>
    <InspectorNumber label="Velocidade de curva" value={config.steeringSpeed} min={0.125} max={16} step={0.125} onChange={steeringSpeed=>onChange({steeringSpeed})}/>
    <InspectorNumber label="Voltas para vencer" value={config.lapsToWin} min={1} max={9} onChange={lapsToWin=>onChange({lapsToWin})}/>
    <InspectorNumber label="Velocidade dos rivais" value={config.rivalSpeed} min={0.125} max={16} step={0.125} onChange={rivalSpeed=>onChange({rivalSpeed})}/>
    <p>A acelera, B freia e as setas viram. Os atores comuns percorrem a rota dos rivais. {config.presentation === "pseudo3d"
      ? "Animações: idle, drive, steer_left, steer_right, brake, brake_left, brake_right e hurt."
      : "Animações: idle, drive e hurt nas direções up, right, down e left."}</p>
    {config.presentation==="pseudo3d" ? <>
      <p>Edite a pista na vista Mapa. Use um circuito quadrado de 256, 512 ou 1024 pixels, com até 256 tiles únicos no piso.</p>
      {([['floorTilemapId','Piso do circuito'],['panoramaBackgroundId','Panorama (opcional)'],['minimapAssetId','Minimapa (opcional)']] as const).map(([field,label])=><label key={field}><span>{label}</span><select aria-label={label} value={visuals[field]} onChange={event=>onChange({pseudo3dVisuals:{...visuals,[field]:event.currentTarget.value}})}><option value="">Selecionar</option>{assets.map(asset=><option key={asset.value} value={asset.value}>{asset.label}</option>)}</select></label>)}
      <InspectorNumber label="Horizonte" value={visuals.horizonY} min={1} max={96} unit="px" onChange={horizonY=>onChange({pseudo3dVisuals:{...visuals,horizonY}})}/>
      {([['height','Altura da câmera',16,96],['distance','Distância da câmera',32,160],['focalLength','Perspectiva da câmera',48,160]] as const).map(([field,label,min,max])=><InspectorNumber key={field} label={label} value={camera[field]} min={min} max={max} unit="px" onChange={value=>onChange({perspectiveCamera:{...camera,[field]:value}})}/>)}
      <label><input type="checkbox" checked={config.showMinimap} onChange={event=>onChange({showMinimap:event.currentTarget.checked})}/> Mostrar minimapa</label>
    </>:null}
    {!track ? <button type="button" onClick={()=>onPrepare(createRacingCircuitTrack(config.presentation==="pseudo3d"?64:width,config.presentation==="pseudo3d"?64:height))}>{config.presentation==="pseudo3d"?"Preparar circuito 512 × 512":"Criar checkpoints e rota"}</button> : <>
      <label><span>Direção na largada</span><select aria-label="Direção na largada" value={track.startHeading??0} onChange={event=>changeTrack({startHeading:Number(event.currentTarget.value)})}>{Array.from({length:16},(_,index)=><option key={index} value={index}>{index*22.5}°{index===0?' · Norte':index===4?' · Leste':index===8?' · Sul':index===12?' · Oeste':''}</option>)}</select></label>
      <InspectorSection title="Checkpoints em ordem" defaultOpen>
        <p>{track.finishAtZero===true ? 'O primeiro é a chegada. Cruze os demais em ordem e volte à chegada para contar uma volta.' : 'Cruze os checkpoints em ordem. O último completa a volta.'} Posições em pixels no mapa.</p>
        {track.checkpoints.map((gate,index)=><fieldset key={gate.id}><legend>{gateLabel(index)}</legend>
          {(['x','y','width','height'] as const).map(field=><InspectorNumber key={field} label={`${gateLabel(index)} ${{x:'X',y:'Y',width:'Largura',height:'Altura'}[field]}`} value={gate[field]} min={field==='width'||field==='height'?1:0} max={field==='x'?width*8-1:field==='y'?height*8-1:256} unit="px" onChange={value=>changeTrack({checkpoints:track.checkpoints.map((item,i)=>i===index?{...item,[field]:value}:item)})}/>)}
          {index>0?<button type="button" onClick={()=>changeTrack({checkpoints:track.checkpoints.filter((_,i)=>i!==index)})}>Remover checkpoint {index}</button>:null}
        </fieldset>)}
        <button type="button" disabled={track.checkpoints.length>=16} onClick={()=>changeTrack({checkpoints:[...track.checkpoints,{id:`checkpoint-${Date.now()}`,x:Math.floor(width*4),y:Math.floor(height*4),width:32,height:32}]})}>Adicionar checkpoint</button>
      </InspectorSection>
      <InspectorSection title="Rota dos rivais">
        {(track.pathPoints??[]).map((point,index)=><fieldset key={index}><legend>Ponto {index+1}</legend>{(['x','y'] as const).map(field=><InspectorNumber key={field} label={`Rota ponto ${index+1} ${field}`} value={point[field]} min={0} max={(field==='x'?width:height)*8-1} unit="px" onChange={value=>changeTrack({pathPoints:track.pathPoints!.map((item,i)=>i===index?{...item,[field]:value}:item)})}/>)}<button type="button" disabled={(track.pathPoints?.length??0)<=2} onClick={()=>changeTrack({pathPoints:track.pathPoints!.filter((_,i)=>i!==index)})}>Remover ponto {index+1}</button></fieldset>)}
        <button type="button" disabled={(track.pathPoints?.length??0)>=32} onClick={()=>changeTrack({pathPoints:[...(track.pathPoints??[]),{x:Math.floor(width*4),y:Math.floor(height*4)}]})}>Adicionar ponto à rota</button>
      </InspectorSection>
    </>}
  </InspectorSection>;
}
