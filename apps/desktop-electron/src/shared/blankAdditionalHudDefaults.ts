import catalog from "../../default-assets/templates/blank/scene-ui-defaults.json" with { type: "json" };
import baseHudCatalog from "../../default-assets/templates/blank/hud-defaults.json" with { type: "json" };
import type { HudComponent, HudPreset } from "./hudPresets.js";

export const BLANK_ADDITIONAL_HUD_IDS: Record<string, string> = {
  platformer:"hud-neutral-plataforma", racing:"hud-neutral-corrida", dungeonCrawler:"hud-neutral-dungeon-crawler",
  isometricTactical:"hud-neutral-tatica-isometrica", battleRpg:"hud-neutral-batalha-rpg",
  pointAndClick:"hud-neutral-apontar-clicar", menu:"hud-neutral-menu", worldMap:"hud-neutral-mapa-mundial"
};
const color = (208 >> 3) | ((184 >> 3) << 5) | ((224 >> 3) << 10);
const text = (id:string,x:number,y:number,width:number,value:string,runtimeText=false):HudComponent => ({
  id,kind:"text",label:id,text:value,x,y,width,height:8,zIndex:2,visible:true,
  ...(runtimeText ? {runtimeText:true} : {}),...((x%8 || y%8) ? {pixelPosition:true} : {})
  ,asset:""
});

/** Static examples remain editable; runtimeText uses the scene's existing text slots. */
export function blankAdditionalHudContent(): {assets:Record<string,unknown>[];presets:HudPreset[]} {
  const panels = (scene:string):HudComponent[] => catalog.assets.filter(a=>a.scene===scene).map(a=>({
    id:a.part,kind:"frame",label:a.part,text:"",asset:a.name,x:a.x,y:a.y,width:a.width,height:a.height,zIndex:0,visible:true
  }));
  const preset = (key:string,name:string,description:string,labels:HudComponent[]):HudPreset => ({
    id:`hud-neutral-${key}`,name:`HUD padrão · ${name}`,description,
    backgroundImage:"neutral-hud-skin.png",selectorImage:"neutral-hud-arrow-right.png",font:"",textColor:color,
    position:"Superior",width:240,height:160,mode:"advanced",components:[...panels(key),...labels]
  });
  const battleFrame = (id:string,x:number,y:number):HudComponent => ({
    id,kind:"frame",label:id,text:"",asset:"",x,y,
    width:104,height:32,zIndex:0,visible:true
  });
  const battleHealth = (id:string,x:number,y:number,valueBinding:"p1-health"|"p2-health"):HudComponent => ({
    id,kind:"bar",label:id,text:"",asset:`neutral-hud-battle-${valueBinding === "p1-health" ? "party" : "enemy"}-health-full.png`,x,y,
    width:72,height:8,zIndex:1,visible:true,valueBinding,
    gauge:{emptyAsset:"neutral-hud-bar-empty.png",x:2,y:2,width:68,height:4}
  });
  const battlePreset:HudPreset = {
    ...preset("batalha-rpg","Batalha RPG","Nome, HP atual e barra de vida dos combatentes selecionados. Área inferior reservada às mensagens e escolhas.",[]),
    components:[
      battleFrame("battle-party-frame",8,72),battleFrame("battle-enemy-frame",128,8),
      battleHealth("battle-party-health",16,88,"p1-health"),battleHealth("battle-enemy-health",136,24,"p2-health"),
      // Runtime slots are names first, then current HP; bars carry the maximum.
      text("battle-party-name",16,80,56,"PARTY 1",true),text("battle-enemy-name",136,16,56,"ENEMY 1",true),
      text("battle-party-hp",80,80,24,"24",true),text("battle-enemy-hp",200,16,24,"12",true)
    ]
  };
  // Same approved pixels, distinct logical assets: each live gauge owns its OBJ tiles.
  const fullBar = baseHudCatalog.assets.find(a => a.name === "neutral-hud-bar-full.png")!;
  const battleBars = ["party","enemy"].map(side => {
    const name = `neutral-hud-battle-${side}-health-full.png`;
    return {id:`asset-${name.replace(/\.png$/,"")}`,name,kind:"UI",systemImage:"rectangle.topthird.inset.filled",
      metadata:{source:`Assets/ui/${name}`,bundledDefaultAsset:"template:blank/Assets/ui/neutral-hud-bar-full.png",
        runtimeConsumer:"hud-obj",frameWidth:fullBar.width,frameHeight:fullBar.height,visualProfile:"neutral-purple",colorMode:"4bpp",
        provenance:"Approved purple full bar, independent OBJ allocation; source pixels unchanged.",license:"Project-owned",sourceSha256:fullBar.sha256}};
  });
  return {
    assets:[...catalog.assets.map(a=>({id:`asset-${a.name.replace(/\.png$/,"")}`,name:a.name,kind:"UI",systemImage:"rectangle.topthird.inset.filled",
      metadata:{source:`Assets/ui/${a.name}`,bundledDefaultAsset:`template:blank/Assets/ui/${a.name}`,runtimeConsumer:"hud-obj",
        frameWidth:a.width,frameHeight:a.height,visualProfile:"neutral-purple",colorMode:"4bpp",
        objectPaletteValues:[0,...catalog.palette.map(h=>{const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)>>3);return rgb[0]|(rgb[1]<<5)|(rgb[2]<<10);})],
        provenance:"Approved original purple scene HUD; native tile-aligned source crop.",license:"Project-owned",sourceSha256:a.sha256}})),...battleBars],
    presets:[
      preset("plataforma","Plataforma","Vidas, pontos e tempo de exemplo editáveis; não adiciona mecânicas ao modo Plataforma.",[
        text("Vidas de exemplo",36,27,24,"03"),text("Pontos de exemplo",113,27,40,"00120"),text("Tempo de exemplo",194,27,24,"099")]),
      preset("corrida","Corrida","Volta, posição e velocidade fornecidas pela corrida.",[
        text("Volta",35,14,40,"1/3",true),text("Posição",111,14,40,"1/4",true),text("Velocidade",193,14,32,"082",true)]),
      preset("dungeon-crawler","Dungeon Crawler","Painéis de vida, energia e item; status e controles existentes do modo.",[
        text("Status",24,120,96,"HP 03",true),text("Controles",8,104,144,"A: INTERACT",true),
        text("Energia de exemplo",130,141,24,"08"),text("Item de exemplo",197,141,24,"01")]),
      preset("tatica-isometrica","Tática isométrica","Exemplo editável de unidade, turno e ações; não cria regras de combate.",[
        text("Unidade de exemplo",31,16,80,"UNIDADE 1"),text("Turno de exemplo",204,17,24,"01"),
        text("Mover",25,119,48,"MOVER"),text("Agir",25,130,40,"AGIR"),text("Fim",25,141,32,"FIM"),text("Confirmar",202,141,24,"OK")]),
      battlePreset,
      preset("apontar-clicar","Apontar e clicar","Dock ilustrativo de inventário, nome da cena e item selecionado pelo modo.",[
        text("Cena",152,128,72,"CENA",true),text("Item selecionado",152,141,72,"IT -",true)]),
      preset("menu","Menu / UI","Título e três opções por página; seleção e comandos do menu existente.",[
        text("Título",96,44,64,"MENU",true),text("Opção 1",80,64,88,"> INICIAR",true),
        text("Opção 2",80,80,88,"",true),text("Opção 3",80,96,88,"",true),text("Controles",96,122,56,"A    B")]),
      preset("mapa-mundial","Mapa mundial","Nome do destino e estado da rota fornecidos pelo mapa; comandos de navegação.",[
        text("Local",30,19,88,"ÁREA 01",true),text("Estado da rota",88,128,112,"A VIAJAR",true),
        text("Entrar",30,144,56,"ENTRAR"),text("Voltar",178,144,56,"VOLTAR")])
    ]
  };
}
