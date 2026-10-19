import type { GBAProjectData } from "../shared/projectFile";
import type { UpdateRoomEntityFields } from "../shared/roomsWorkspace";
import { InspectorNumber, InspectorSection } from "./InspectorControls";
import { useStudioUiText } from "./studioUiText";

type RecordValue = Record<string, any>;
const record = (v: unknown): RecordValue => v && typeof v === "object" ? v as RecordValue : {};
const list = (v: unknown): RecordValue[] => Array.isArray(v) ? v : [];
type Option = { value: string; label: string };

function ResourceSelect({ label, value, options, onChange }: { label: string; value?: string; options: Option[]; onChange(value: string): void }) {
  const ui = useStudioUiText();
  return <label><span>{ui(label)}</span><select aria-label={ui(label)} value={value ?? ""} onChange={e => onChange(e.currentTarget.value)}>
    <option value="">{ui("Nenhum")}</option>
    {value && !options.some(o => o.value === value) ? <option value={value}>{value}</option> : null}
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select></label>;
}

export function SceneRuntimeResourcesInspector({ sceneType, roomName, background, config, data, onChange }: {
  sceneType: string; roomName: string; background: string; config: RecordValue; data: GBAProjectData;
  onChange(config: RecordValue): void;
}) {
  const ui = useStudioUiText();
  if (!["dungeonCrawler", "isometric", "luta", "racing", "battleRpg", "shmup"].includes(sceneType)) return null;
  if (sceneType === "isometric" && config.gameplayMode === "tactical") return null;
  const assets = list(data.assets), actors = list(data.actors).filter(a => a.roomName === roomName);
  const options = (items: RecordValue[], field = "name") => items.filter(a => typeof a[field] === "string").map(a => ({ value: a[field], label: a.name ?? a[field] }));
  const backgrounds = options(assets.filter(a => /background|tileset|ui/i.test(a.kind)));
  const sprites = options(assets.filter(a => /sprite/i.test(a.kind)));
  const audio = list(data.audioItems);
  const music = options(audio.filter(a => /music|m[uú]sica/i.test(a.kind)));
  const sfx = options(audio.filter(a => !/music|m[uú]sica/i.test(a.kind)));
  const change = (patch: RecordValue) => onChange({ ...config, ...patch });
  const presentation = record(config.presentation);
  const changePresentation = (patch: RecordValue) => change({ presentation: { ...presentation, ...patch } });
  const sounds = sceneType === "dungeonCrawler" || sceneType === "battleRpg" ? record(presentation.actionSounds) : record(config.actionSounds);
  const cues = sceneType === "dungeonCrawler" ? ["step", "turn", "blocked", "hit", "defeat"] : sceneType === "battleRpg" ? ["cursor", "confirm", "attack", "magic", "hurt", "defend", "defeat"]
    : sceneType === "luta" ? ["hit", "guard", "special", "miss"] : sceneType === "racing" ? ["accelerate", "brake", "collision", "checkpoint"] : [];
  const cueLabels: Record<string, string> = { step: "Passo", turn: "Giro", blocked: "Bloqueio", hit: "Impacto", defeat: "Derrota", cursor: "Cursor", confirm: "Confirmar", attack: "Ataque", magic: "Magia", hurt: "Dano", defend: "Defesa", guard: "Guarda", special: "Especial", miss: "Ataque sem acerto", accelerate: "Acelerar", brake: "Frear", collision: "Colisão", checkpoint: "Checkpoint" };
  const modules = list(config.modules);
  const module = (id: string) => modules.find(m => m.id === id) ?? { id, enabled: false, settings: {} };
  const changeModule = (id: string, patch: RecordValue) => change({ modules: [...modules.filter(m => m.id !== id), { ...module(id), ...patch }] });
  const moduleSetting = (id: string, key: string, value: unknown) => changeModule(id, { settings: { ...record(module(id).settings), [key]: value } });
  const moduleToggle = (id: string, label: string) => <label key={id}><input type="checkbox" checked={module(id).enabled === true} onChange={e => changeModule(id, { enabled: e.currentTarget.checked })} />{ui(label)}</label>;
  const materialNames = ["Parede", "Parede alternativa 1", "Parede alternativa 2", "Parede alternativa 3", "Piso", "Teto", "Porta", "Juntas do piso"];
  return <InspectorSection title={ui("Recursos da cena")} ariaLabel={ui("Recursos da cena")} className="room-detail-editor-span-2" defaultOpen={false}>
    {sceneType === "dungeonCrawler" ? <>
      <label><span>{ui("Visualização do labirinto")}</span><select aria-label={ui("Visualização do labirinto")} value={config.presentation ? "generated" : "fixed"} onChange={e => change({ presentation: e.currentTarget.value === "generated" ? { hudAssetName: "", actionSounds: {} } : undefined })}>
        <option value="generated">{ui("Gerar vistas da grade")}</option><option value="fixed">{ui("Fundo frontal fixo")}</option>
      </select></label>
      <InspectorNumber label={ui("Duração do passo")} value={config.stepDurationMs ?? 180} min={40} max={1000} step={10} unit="ms" onChange={stepDurationMs => change({ stepDurationMs })} />
      <InspectorNumber label={ui("Duração do giro")} value={config.turnDurationMs ?? 120} min={40} max={1000} step={10} unit="ms" onChange={turnDurationMs => change({ turnDurationMs })} />
      <InspectorNumber label={ui("Distância de visão")} value={config.viewDistance ?? 5} min={1} max={8} onChange={viewDistance => change({ viewDistance })} />
      {moduleToggle("map", "Mapa do labirinto")}{moduleToggle("compass", "Bússola")}
      {moduleToggle("inventory", "Inventário do labirinto")}
      {module("inventory").enabled ? <>
        <InspectorNumber label={ui("Item do inventário")} value={module("inventory").settings.item ?? 0} min={0} max={15} onChange={v => moduleSetting("inventory", "item", v)} />
        <InspectorNumber label={ui("Quantidade inicial")} value={module("inventory").settings.initialQuantity ?? 1} min={0} max={999} onChange={v => moduleSetting("inventory", "initialQuantity", v)} />
        <InspectorNumber label={ui("Cura por item")} value={module("inventory").settings.healAmount ?? 1} min={0} max={99} onChange={v => moduleSetting("inventory", "healAmount", v)} />
      </> : null}
      {moduleToggle("battle", "Combate do labirinto")}
      {module("battle").enabled ? <>
        <ResourceSelect label="Inimigo do labirinto" value={module("battle").settings.enemyActor} options={options(actors)} onChange={v => moduleSetting("battle", "enemyActor", v)} />
        {([ ["maxHp", "HP do inimigo", 3], ["playerDamage", "Dano do jogador", 1], ["enemyDamage", "Dano do inimigo", 1] ] as const).map(([key,label,initial]) => <InspectorNumber key={key} label={ui(label)} value={module("battle").settings[key] ?? initial} min={1} max={99} onChange={v => moduleSetting("battle",key,v)} />)}
      </> : null}
      {config.presentation ? <>
        <p>{ui("As vistas acompanham paredes, início e direção da grade. Até 64 × 64 células e 256 células livres por cena.")}</p>
        <label><span>{ui("Nome na HUD do labirinto")}</span><input aria-label={ui("Nome na HUD do labirinto")} defaultValue={presentation.playerLabel ?? ""} key={presentation.playerLabel ?? ""} maxLength={16} onBlur={e => changePresentation({ playerLabel: e.currentTarget.value })} /></label>
        <ResourceSelect label="Moldura da HUD do labirinto" value={presentation.hudAssetName} options={backgrounds} onChange={hudAssetName => changePresentation({ hudAssetName })} />
        <label><input type="checkbox" checked={presentation.playerView?.enabled===true} onChange={e=>changePresentation({playerView:{enabled:e.currentTarget.checked}})} />{ui("Mostrar ator do jogador em primeira pessoa")}</label>
        <p>{ui("Escolha o ator no campo Jogador. A imagem fica fixa à câmera; ajuste sua âncora em Recursos do ator ou arraste na Tela ampliada.")}</p>
        <InspectorSection title={ui("Materiais do labirinto")}>
          <p>{ui("Use os materiais procedurais ou selecione oito imagens opacas de 64 × 64 pixels. Os arquivos originais são preservados.")}</p>
          {materialNames.map((label,index) => <ResourceSelect key={label} label={label} value={presentation.materialAssets?.[index]} options={backgrounds} onChange={value => changePresentation({ materialAssets: Array.from({ length: 8 }, (_,i) => i === index ? value : presentation.materialAssets?.[i] ?? "") })} />)}
          <button type="button" onClick={() => changePresentation({ materialAssets: [] })}>{ui("Usar materiais procedurais")}</button>
          {(["x", "y"] as const).map(axis => <InspectorNumber key={axis} label={ui("Porta {0}",{0:axis.toUpperCase()})} value={presentation.door?.[axis] ?? -1} min={-1} max={63} onChange={v => changePresentation({ door: { x: -1, y: -1, ...presentation.door, [axis]: v } })} />)}
        </InspectorSection>
      </> : null}
    </> : null}
    {sceneType === "isometric" && config.gameplayMode !== "tactical" ? <>
      <label><span>{ui("Composição isométrica")}</span><select aria-label={ui("Composição isométrica")} value={config.pagedSurface ? "paged" : config.worldMode ?? "static_composition"} onChange={e => {
        if (e.currentTarget.value === "paged") {
          const asset=assets.find(a=>a.name===background) ?? assets.find(a=>a.name===backgrounds[0]?.value), meta=record(asset?.metadata);
          change({ worldMode: "scrollable_tiled_world", pagedSurface: { backgroundAsset: asset?.name ?? "", foregroundAsset: "", width: meta.width ?? 240, height: meta.height ?? 160 } });
        } else change({ worldMode: e.currentTarget.value, pagedSurface: undefined });
      }}><option value="static_composition">{ui("Composição estática")}</option><option value="scrollable_tiled_world">{ui("Mundo em tiles com rolagem")}</option><option value="paged">{ui("Fundo completo com rolagem")}</option></select></label>
      {config.pagedSurface ? <>
        {([ ["backgroundAsset", "Fundo completo isométrico"], ["foregroundAsset", "Frente completa isométrica"] ] as const).map(([field,label]) => <ResourceSelect key={field} label={label} value={config.pagedSurface[field]} options={backgrounds} onChange={value => {
          const metadata=record(assets.find(a=>a.name===value)?.metadata);
          change({ pagedSurface: { ...config.pagedSurface, [field]: value, ...(field === "backgroundAsset" ? { width: metadata.width ?? config.pagedSurface.width, height: metadata.height ?? config.pagedSurface.height } : {}) } });
        }} />)}
        <p>{config.pagedSurface.width} × {config.pagedSurface.height} {ui("px · colisões e alturas continuam na grade lógica.")}</p>
      </> : null}
    </> : null}
    {sceneType === "battleRpg" ? <>
      <ResourceSelect label="Moldura da HUD RPG" value={config.hudAssetName} options={backgrounds} onChange={hudAssetName => change({ hudAssetName })} />
      <ResourceSelect label="Cursor da batalha" value={presentation.cursorAssetName} options={sprites} onChange={cursorAssetName => changePresentation({ cursorAssetName })} />
      <ResourceSelect label="Ator de efeitos da batalha" value={presentation.effectsActorId} options={options(actors, "id")} onChange={effectsActorId => changePresentation({ effectsActorId })} />
      <ResourceSelect label="Ícone de fuga indisponível" value={presentation.disabledEscapeAssetName} options={sprites} onChange={disabledEscapeAssetName => changePresentation({ disabledEscapeAssetName })} />
      <ResourceSelect label="Música de vitória" value={presentation.victoryMusic} options={music} onChange={victoryMusic => changePresentation({ victoryMusic })} />
      <InspectorNumber label={ui("Duração do resultado")} value={presentation.outcomeHoldFrames ?? 120} min={1} max={600} unit="frames" onChange={outcomeHoldFrames => changePresentation({ outcomeHoldFrames })} />
      <p>{ui("Os efeitos usam os clips hit, energy, shield e electric do ator escolhido. Cada recurso é opcional.")}</p>
    </> : null}
    {sceneType === "shmup" ? <>
      {moduleToggle("waves", "Ondas de inimigos")}
      <p>{ui("Adicione inimigos com a ferramenta Ator e escolha a onda nas propriedades de cada ator. Configure disparos, dano e sons em Eventos.")}</p>
      {list(config.wavePlan).map((wave,index,all) => <fieldset key={index}><legend>{ui("Onda {0}",{0:index+1})}</legend>
        <label><span>{ui("Nome da onda")}</span><input aria-label={ui("Nome da onda {0}",{0:index+1})} defaultValue={wave.name} key={wave.name} onBlur={e => change({ wavePlan: all.map((w,i)=>i===index?{...w,name:e.currentTarget.value}:w) })} /></label>
        {([ ["startFrame", "Início da onda", 0, 65535], ["scrollSpeed", "Rolagem da onda", 1, 16], ["playerSpeed", "Velocidade da nave", 2, 16], ["fireCooldown", "Intervalo de disparo", 8, 255] ] as const).map(([key,label,initial,max]) => <InspectorNumber key={key} label={ui(label)} value={wave[key] ?? initial} min={key === "startFrame" ? 0 : 1} max={max} onChange={value => change({ wavePlan: all.map((w,i)=>i===index?{...w,[key]:value}:w) })} />)}
        <button type="button" onClick={() => change({ wavePlan: all.filter((_,i)=>i!==index) })}>{ui("Remover onda")}</button>
      </fieldset>)}
      <button type="button" disabled={list(config.wavePlan).length >= 64} onClick={() => change({ modules: [...modules.filter(m=>m.id!=="waves"), { ...module("waves"), enabled: true }], wavePlan: [...list(config.wavePlan), { name: `${roomName}_wave_${list(config.wavePlan).length+1}`, startFrame: list(config.wavePlan).length*300 }] })}>{ui("Adicionar onda")}</button>
    </> : null}
    {cues.length && (sceneType !== "dungeonCrawler" || config.presentation) ? <InspectorSection title={ui("Sons de ação")}>
      {cues.map(cue => <ResourceSelect key={cue} label={cueLabels[cue]} value={sounds[cue]} options={sfx} onChange={value => {
        const next = Object.fromEntries(Object.entries({ ...sounds, [cue]: value }).filter(([,v])=>v));
        if (sceneType === "dungeonCrawler" || sceneType === "battleRpg") changePresentation({ actionSounds: next });
        else change({ actionSounds: next });
      }} />)}
    </InspectorSection> : null}
  </InspectorSection>;
}

export function ActorRuntimeResourcesInspector({ sceneType, actorID, data, onChange }: {
  sceneType: string; actorID: string; data: GBAProjectData; onChange(fields: UpdateRoomEntityFields): void;
}) {
  const ui = useStudioUiText(), actor = list(data.actors).find(a=>a.id===actorID);
  if (!actor || !["dungeonCrawler", "luta", "battleRpg", "shmup"].includes(sceneType)) return null;
  const clips = list(data.animations).filter(a=>a.spriteSheet===actor.spriteSheet).map(a=>({ value:a.name,label:a.name }));
  const states = sceneType === "luta" ? ["idle","walk","jump","attack","special","guard","hurt"] : sceneType === "battleRpg" ? ["idle","attack","magic","heal","defend","hurt","defeat","victory","reactivate"] : [];
  const field = sceneType === "luta" ? "lutaAnimations" : "battleAnimations";
  const labels: Record<string,string> = { idle:"Parado",walk:"Caminhada",jump:"Salto",attack:"Ataque",special:"Especial",guard:"Guarda",hurt:"Dano",magic:"Magia",heal:"Cura",defend:"Defesa",defeat:"Derrota",victory:"Vitória",reactivate:"Reativar" };
  const playerView=sceneType==="dungeonCrawler"&&list(data.rooms).some(room=>room.name===actor.roomName&&room.playerActorName===actor.name);
  const sheets=list(data.assets).filter(a=>/sprite/i.test(a.kind)).map(a=>({value:a.name,label:a.name}));
  return <InspectorSection title={ui("Recursos do ator")} ariaLabel={ui("Recursos do ator")} defaultOpen={false}>
    {states.map(state=><ResourceSelect key={state} label={labels[state]} value={record(actor[field])[state]} options={clips} onChange={value=>onChange({[field]:{...record(actor[field]),[state]:value}})} />)}
    {sceneType === "dungeonCrawler" ? <>
      {playerView ? <>
        <p>{ui("Jogador em primeira pessoa: a âncora usa pixels do viewport, sem alterar a célula da câmera.")}</p>
        {(["x","y"] as const).map(axis=><InspectorNumber key={axis} label={ui("Âncora {0} no viewport",{0:axis.toUpperCase()})} value={record(actor.dungeonViewAnchor)[axis]??(axis==="x"?200:120)} min={-128} max={axis==="x"?368:288} unit="px" onChange={value=>onChange({dungeonViewAnchor:{x:record(actor.dungeonViewAnchor).x??200,y:record(actor.dungeonViewAnchor).y??120,[axis]:value}})} />)}
      </> : <>
      {([ ["near","Sprite próximo"],["mid","Sprite médio"],["far","Sprite distante"] ] as const).map(([key,label])=><ResourceSelect key={key} label={label} value={record(actor.dungeonDepthSheets)[key]} options={sheets} onChange={value=>onChange({dungeonDepthSheets:{...record(actor.dungeonDepthSheets),[key]:value}})} />)}
      <label><span>{ui("Animação das poses")}</span><input aria-label={ui("Animação das poses")} defaultValue={actor.dungeonDepthAnimationName ?? "poses"} key={actor.dungeonDepthAnimationName ?? "poses"} onBlur={e=>onChange({dungeonDepthAnimationName:e.currentTarget.value})}/></label>
      <p>{ui("A faixa de poses usa a ordem: parado, alerta, ataque, dano, derrota, defesa e interação. Profundidades não selecionadas usam o sprite principal.")}</p>
      <label><input type="checkbox" checked={actor.dungeonCell === true} onChange={e=>onChange({dungeonCell:e.currentTarget.checked})}/>{ui("Objeto pequeno de coleta")}</label>
      </>}
    </> : null}
    {sceneType === "shmup" ? <>
      <ResourceSelect label="Animação do inimigo" value={actor.animationName} options={clips} onChange={animationName=>onChange({animationName})}/>
      <InspectorNumber label={ui("Onda do inimigo")} value={(actor.waveIndex ?? 0)+1} min={1} max={64} onChange={waveIndex=>onChange({waveIndex:waveIndex-1})}/>
      {([ ["health","HP do inimigo",1,255],["width","Largura da hitbox",16,64],["height","Altura da hitbox",16,64],["velocityX","Velocidade X",-1,16],["velocityY","Velocidade Y",0,16] ] as const).map(([key,label,initial,max])=><InspectorNumber key={key} label={ui(label)} value={record(actor.shmup)[key]??initial} min={key.startsWith("velocity")?-16:1} max={max} onChange={value=>onChange({shmup:{[key]:value}})}/>)}
    </> : null}
  </InspectorSection>;
}
