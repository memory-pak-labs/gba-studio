import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const list = value => Array.isArray(value) ? value : [];
const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Same instance boundary as projectPrefabs.ts; synchronization acceptance tests enforce it.
const instanceFields = new Set(['id','name','roomID','roomId','roomName','x','y','z','prefabID','prefabEventCopies','authoring']);
const npcDialogues = [
 ['captain','Capitão','A oficina fica no caminho central. Fale com a mecânica antes de seguir viagem.', 'The workshop is on the central path. Talk to the mechanic before you set off.', 'El taller está en el camino central. Habla con la mecánica antes de partir.'],
 ['traveler','Viajante','A rota dos faróis abre quando a estrutura estiver pronta. Consulte o mapa para escolher o destino.', 'The lighthouse route opens once the structure is ready. Check the map to choose your destination.', 'La ruta de los faros se abre cuando la estructura está lista. Consulta el mapa para elegir tu destino.'],
 ['cartographer','Cartógrafo','A carta da costa mostra os destinos da rota dos faróis. Cada trecho tem uma passagem diferente.', 'The coastal chart shows the destinations along the lighthouse route. Each stretch has a different passage.', 'La carta costera muestra los destinos de la ruta de los faros. Cada tramo tiene un paso diferente.'],
 ['fisherchild','Pescador mirim','Do cais eu vejo os faróis da costa. Quero ver todos acesos outra vez!', 'I can see the coastal lighthouses from the pier. I want to see them all shining again!', 'Desde el muelle veo los faros de la costa. ¡Quiero verlos todos encendidos otra vez!'],
 ['lighthousekeeper','Guardião do farol','O interior do farol fica ao norte. Lá você pode examinar a lente e o mecanismo.', 'The lighthouse interior is to the north. You can examine the lens and the mechanism there.', 'El interior del faro está al norte. Allí puedes examinar la lente y el mecanismo.']
];
const nativeHelp = {
 cutscene:'Em Eventos > Ao iniciar, abra os quadros da sequência: fundo, poses, movimento, duração e avanço. O evento inicial pode ficar vazio; os quadros já executam a encenação nativa.',
 menu:'Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.',
 worldMap:'Destinos e disponibilidade ficam na configuração do mapa e nas ações Viajar da timeline. Os eventos ligados aos destinos executam as transições da campanha.',
 topdown:'O runtime move o player e segue a câmera. Selecione um NPC ou gatilho e abra Eventos para estudar a conversa, coleta ou troca de cena.',
 platformer:'O runtime aplica movimento, salto e colisões. Os scripts dos atores montam patrulhas, conversa e checkpoint. As patrulhas usam limites e variáveis específicos deste mapa; copie-as pela timeline e ajuste esses parâmetros.',
 pointAndClick:'O player é o cursor. Cada gatilho é um hotspot: selecione-o e abra Ao interagir para editar exame, coleta ou saída. A imagem frontal não é uma grade de colisões top-down.',
 isometric:'Movimento, projeção e alturas são nativos. A configuração distingue aventura e arena tática; as interações e saídas ficam nos eventos da cena, atores e gatilhos.',
 dungeonCrawler:'Mapa edita células; Tela ampliada mostra a câmera frontal. Movimento, projeção e combate são nativos. Atores usam escalas por distância; eventos executam interação, coleta e passagem entre salas.',
 battleRpg:'O runtime executa turnos, habilidades e animações. Edite atributos nos atores; Ao vencer e Ao perder ligam recompensa, save, avanço ou reinício à campanha.',
 luta:'O runtime executa caminhada, salto, golpes, gauges e rodadas. Os atores definem lutadores e animações; Ao vencer e Ao perder conduzem a campanha.',
 racing:'A configuração seleciona visão top-down ou pseudo-3D, pista, voltas e rivais. O runtime pilota e calcula a prova; os eventos de vitória e derrota concluem ou reiniciam a cena.',
 shmup:'Ondas, inimigos, tiros e rolagem são configurados nos recursos da cena e dos atores. Ao concluir e Ao perder ligam o resultado à campanha.',
 visualNovel:'O diálogo e suas escolhas conduzem esta cena. Edite a fala no workspace Diálogos e os eventos ligados à entrada e à continuação.'
};
function nativeDescription(room) { return nativeHelp[room.sceneType] ?? 'Selecione a cena, seus atores e gatilhos para editar os fluxos no painel Eventos.'; }
function allReferences(project) {
 const output=[];
 function walk(value,path){
  if(Array.isArray(value)){value.forEach((v,i)=>walk(v,[...path,i]));return}
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)){
   if(key==='eventBindings'&&item&&typeof item==='object'){
    for(const [slot,target]of Object.entries(item))if(target)output.push({target,owner:path.join('.'),slot});
   }
   else if(typeof item==='string'&&/^(on.*EventName|eventName|scriptName)$/.test(key)&&item)output.push({target:item,owner:path.join('.'),slot:key});
   else if(key==='command'&&typeof item==='string'){
    const [verb,target]=item.split(/\s+/);if(['call_event','attach_button'].includes(verb)){const name=verb==='attach_button'?item.split(/\s+/)[2]:target;if(name)output.push({target:name,owner:path.join('.'),slot:verb})}
   }
   if(key!=='actorPrefabs'&&key!=='triggerPrefabs'&&key!=='authoring')walk(item,[...path,key]);
  }
 }
 for(const key of ['rooms','actors','triggers','events','sceneRouteTables'])walk(project[key],[key]);
 return output;
}
export function exampleAuthoringInventory(project) {
 const names=new Set(list(project.events).map(e=>e.name)),references=allReferences(project);
 return {
  scenes:list(project.rooms).map(room=>({name:room.name,type:room.sceneType,notes:room.authoringNotes,
   events:list(project.events).filter(e=>e.roomName===room.name).map(e=>({name:e.name,steps:list(e.steps).length,detail:e.detail})),
   actors:list(project.actors).filter(a=>a.roomName===room.name).map(a=>({id:a.id,name:a.name,prefabID:a.prefabID??null,events:a.eventBindings??{}})),
   triggers:list(project.triggers).filter(t=>t.roomName===room.name).map(t=>({id:t.id,name:t.name,prefabID:t.prefabID??null,events:t.eventBindings??{}})),
   nativeSteps:list(room.runtime?.config?.steps).length})),
  actorPrefabs:list(project.actorPrefabs).length,triggerPrefabs:list(project.triggerPrefabs).length,
  missingEvents:references.filter(ref=>!names.has(ref.target))
 };
}
export function materializeExampleAuthoring(source) {
 const project=structuredClone(source),rooms=list(project.rooms),actors=list(project.actors);
 project.events=list(project.events);project.dialogues=list(project.dialogues);
 for(const [id,character,text,en,es]of npcDialogues){
  const actor=actors.find(a=>a.id===`porto-lume-${id}-pilot`);if(!actor)continue;
  const key=`porto-${id}-conversa`,name=`porto_conversar_${id}`;
  if(!project.dialogues.some(d=>d.key===key))project.dialogues.push({key,character,text:en,portrait:'',choices:[],textSound:'farol_sfx_texto',confirmSound:'farol_sfx_dialogo',translations:{'pt-BR':text,en,es}});
  const dialogue=project.dialogues.find(d=>d.key===key);
  dialogue.translations={en,es,'pt-BR':text,...dialogue.translations};
  if(dialogue.text===text)dialogue.text=en;
  if(!project.events.some(e=>e.name===name))project.events.push({id:`event-${name}`,name,roomName:'porto_lumen',category:'Ator',detail:`Conversa de orientação de ${character}; não altera a progressão.`,command:'noop',steps:[{id:`${name}-fala`,command:`show_dialogue ${key}`,isEnabled:true}]});
  actor.eventBindings={...actor.eventBindings,onInteract:actor.eventBindings?.onInteract||name};
 }
 const references=allReferences(project);
 for(const event of project.events){
  const owners=[...new Set(references.filter(r=>r.target===event.name).map(r=>`${r.owner.split('.').slice(0,2).join('.')} (${r.slot})`))];
  const room=rooms.find(r=>r.name===event.roomName);
  const body=list(event.steps).length ? `Sequência editável com ${event.steps.length} passos. Os eventos chamados permanecem acessíveis na timeline.`
   : `Entrada sem comandos customizados. ${room?nativeDescription(room):'A ação é fornecida pelo runtime nativo.'}`;
  if(!event.detail||event.detail.startsWith('Campanha canônica')||event.detail.startsWith('Autoria:'))event.detail=`Autoria: ${event.name}. ${body}${owners.length?' Vínculos: '+owners.join(', ')+'.':''}`;
 }
 const existingActors=list(project.actorPrefabs),existingTriggers=list(project.triggerPrefabs);
 project.actorPrefabs=existingActors;project.triggerPrefabs=existingTriggers;
 const seenMenuRoles=new Set();
 for(const [kind,key,prefabKey]of [['actor','actors','actorPrefabs'],['trigger','triggers','triggerPrefabs']]){
  for(const entity of list(project[key])){
   const room=rooms.find(r=>r.name===entity.roomName);if(!room)continue;
   // These four patrols have bespoke hit/progress wiring and world-space bounds.
   // Their complete scripts remain on the scene, rather than pretending to be generic enemies.
   if(kind==='actor'&&room.sceneType==='platformer'&&entity.eventBindings?.onUpdate)continue;
   if(kind==='actor'&&entity.menuActorRole){const role=`${room.name}/${entity.menuActorRole}`;if(seenMenuRoles.has(role))continue;seenMenuRoles.add(role)}
   if(entity.prefabID&&!String(entity.prefabID).startsWith('example-'))continue;
   const id=`example-${kind}-${slug(entity.id)}`;
   const fields=Object.fromEntries(Object.entries(entity).filter(([key])=>!instanceFields.has(key)));
   const description=kind==='trigger'?'Área reutilizável com eventos de interação, entrada ou saída. As condições de campanha e o destino continuam explícitos nos scripts.':entity.menuActorRole?'Elemento visual do menu; associe a opção da tela no inspetor ao reutilizar.':'Ator com sprite, animações e comportamento configurados. Os scripts que apontam para este ator são copiados e retargetados ao instanciar; variáveis de campanha continuam compartilhadas.';
   const prefab={...structuredClone(fields),id,name:`${room.displayName||room.name} · ${entity.name}`,authoring:{sourceEntityID:entity.id,sourceEntityName:entity.name,sourceScene:room.name,sourcePosition:{x:Number(entity.x??0),y:Number(entity.y??0)},sceneType:room.sceneType,description}};
   const index=project[prefabKey].findIndex(p=>p.id===id);if(index<0)project[prefabKey].push(prefab);else project[prefabKey][index]=prefab;
   entity.prefabID=id;
  }
 }
 for(const room of rooms){
  const objective=room.campaign?.objective?`Objetivo: ${room.campaign.objective} `:'';
  const controls=room.campaign?.controls?` Controles: ${room.campaign.controls}`:'';
  room.authoringNotes=`${objective}${nativeDescription(room)}${controls}`;
 }
 project.rooms=rooms;project.scenas=structuredClone(rooms);
 if(project.scena?.name){const room=rooms.find(r=>r.name===project.scena.name);if(room)project.scena=structuredClone(room)}
 return project;
}
export function exampleAuthoringMarkdown(project) {
 const inventory=exampleAuthoringInventory(project);
 const lines=['# O Último Farol: guia de autoria','',`Biblioteca: ${inventory.actorPrefabs} prefabs de atores e ${inventory.triggerPrefabs} de gatilhos. Abra **Editor > Pré-fabricados** para consultar a cena de origem e instanciar um modelo.`,
 '','As imagens, animações, músicas e configurações nativas aprovadas são preservadas. Os cinco NPCs de Porto Lumen que estavam sem conversa agora têm eventos de orientação. Variáveis de campanha e destinos de portas são compartilhados de propósito; revise-os ao reutilizar o modelo em outro contexto.',
 '','## Como estudar e reutilizar','',
 '1. Selecione a cena e abra Eventos. A nota de autoria explica a configuração nativa e os fluxos customizados.',
 '2. Selecione um ator ou gatilho para ver Ao iniciar, Ao atualizar, Ao interagir ou os estados disponíveis para esse runtime.',
 '3. Na biblioteca de pré-fabricados, escolha o modelo pela cena de origem e instancie na cena ativa. A posição e a cena de destino pertencem à instância.',
 '4. Scripts que endereçam o ator original são copiados para a nova instância e seus alvos são retargetados. Os scripts e variáveis de campanha compartilhados continuam compartilhados.',
 '5. As quatro patrulhas de Penedos têm limites, variáveis e colisões específicos do mapa. Suas cadeias estão montadas na cena; não são anunciadas como inimigos genéricos. Adapte essas ligações ao copiar a lógica.',
 '','Um Ao iniciar vazio pode ser intencional: menus e cutscenes já executam as ações nativas da timeline. Não adicione um noop ou uma espera apenas para preencher o painel.'];
 for(const scene of inventory.scenes){
  lines.push('',`## ${scene.name} · ${scene.type}`,'',scene.notes,'',`Sequência nativa: ${scene.nativeSteps} quadros.`, '', '| Evento | Passos |','| --- | --- |',...scene.events.map(e=>`| ${e.name} | ${e.steps} |`));
  if(scene.actors.length||scene.triggers.length)lines.push('', '| Entidade | Pré-fabricado | Eventos ligados |','| --- | --- | --- |',...[...scene.actors,...scene.triggers].map(e=>`| ${e.name} | ${e.prefabID??'Lógica específica da cena'} | ${Object.entries(e.events).map(([slot,event])=>`${slot}: ${event}`).join('; ')||'Apresentação ou controle nativo'} |`));
 }
 return lines.join('\n')+'\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const projectPath=process.argv[2]??fileURLToPath(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url));
 const input=await readFile(projectPath,'utf8'),project=materializeExampleAuthoring(JSON.parse(input));
 if(await readFile(projectPath,'utf8')!==input)throw Error('Project changed during authoring promotion; retry on the current file.');
 await writeFile(projectPath,JSON.stringify(project,null,2)+'\n');
 if(process.argv[3])await writeFile(process.argv[3],exampleAuthoringMarkdown(project));
 console.log(JSON.stringify({scenes:project.rooms.length,events:project.events.length,...Object.fromEntries(['actorPrefabs','triggerPrefabs'].map(key=>[key,project[key].length]))}));
}
