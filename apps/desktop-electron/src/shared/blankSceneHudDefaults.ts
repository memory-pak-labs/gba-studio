import catalog from "../../default-assets/templates/blank/scene-hud-defaults.json" with {type:"json"};
import type { HudComponent, HudPreset, HudValueBinding } from "./hudPresets.js";
import { blankAdditionalHudContent, BLANK_ADDITIONAL_HUD_IDS } from "./blankAdditionalHudDefaults.js";

export const BLANK_SCENE_HUD_IDS: Record<string,string> = {luta:"hud-neutral-fight",shmup:"hud-neutral-shmup",...BLANK_ADDITIONAL_HUD_IDS};
const textColor = (208 >> 3) | ((184 >> 3) << 5) | ((224 >> 3) << 10);

export function blankSceneHudContent(): {assets:Record<string,unknown>[]; presets:HudPreset[]} {
  const additional = blankAdditionalHudContent();
  const element = (id:string,kind:HudComponent["kind"],asset:string,x:number,y:number,width:number,height:number,text="",valueBinding?:HudValueBinding):HudComponent =>
    ({id,kind,label:id,text,asset,x,y,width,height,zIndex:kind === "text" ? 2 : 0,visible:true,...(valueBinding?{valueBinding}:{})});
  const life1=element("Vida P1","bar","neutral-hud-fight-life-full.png",8,8,96,32,"","p1-health");
  life1.gauge={emptyAsset:"neutral-hud-fight-life-empty.png",x:5,y:5,width:86,height:6};
  const life2=element("Vida P2","bar","neutral-hud-fight-life-p2-full.png",136,8,96,32,"","p2-health");
  life2.gauge={emptyAsset:"neutral-hud-fight-life-p2-empty.png",x:5,y:5,width:86,height:6,reverse:true};
  const rounds = (id:string,x:number,binding:HudValueBinding):HudComponent => ({
    ...element(id,"icon","neutral-hud-fight-rounds-0.png",x,32,32,8,"",binding),
    stateAssets:["neutral-hud-fight-rounds-1.png","neutral-hud-fight-rounds-2.png"]
  });
  const reserve=element("Reserva de vidas","bar","neutral-hud-shmup-life-full.png",8,8,96,32,"","lives");
  reserve.gauge={emptyAsset:"neutral-hud-shmup-life-empty.png",x:15,y:18,width:66,height:4};
  const preset=(id:string,name:string,description:string,components:HudComponent[]):HudPreset => ({
    id,name,description,backgroundImage:"neutral-hud-skin.png",selectorImage:"neutral-hud-arrow-right.png",font:"",textColor,
    position:"Superior",width:240,height:40,mode:"advanced",components
  });
  return {
    assets:[...additional.assets,...catalog.assets.map(a=>({id:`asset-${a.name.replace(/\.png$/,"")}`,name:a.name,kind:"UI",systemImage:"rectangle.topthird.inset.filled",
      metadata:{source:`Assets/ui/${a.name}`,bundledDefaultAsset:`template:blank/Assets/ui/${a.name}`,runtimeConsumer:"hud-obj",
        visualProfile:"neutral-purple",colorMode:"4bpp",frameWidth:a.width,frameHeight:a.height,
        objectPaletteValues:[0,...["100018","201030","402058","583878","704888","9068b0","b890c8","d0b8e0"].map(h=>{const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)>>3);return rgb[0]|(rgb[1]<<5)|(rgb[2]<<10);})],
        provenance:"Approved original Luta / horizontal Shoot-up concepts, native modular derivatives.",license:"Project-owned",sourceSha256:a.sha256}}))],
    presets:[...additional.presets,
      preset(BLANK_SCENE_HUD_IDS.luta,"HUD padrão · Luta","Vida dos lutadores, tempo e rounds ligados à partida.",[
        life1,life2,element("Moldura do timer","frame","neutral-hud-fight-timer.png",104,0,32,32),
        rounds("Rounds P1",8,"p1-rounds"),rounds("Rounds P2",200,"p2-rounds"),
        element("Player 1","text","",8,0,16,8,"P1"),element("Player 2","text","",216,0,16,8,"P2"),
        element("Tempo","text","",112,8,16,8,"99","round-time")
      ]),
      preset(BLANK_SCENE_HUD_IDS.shmup,"HUD padrão · Shoot-up","Vidas, reserva de vidas e pontuação; rolagem horizontal.",[
        reserve,element("Moldura da pontuação","frame","neutral-hud-shmup-score.png",152,8,80,32),
        element("Nave","icon","neutral-hud-shmup-ship.png",16,16,16,16),
        element("Rótulo de vidas","text","",40,16,40,8,"VIDAS"),element("Vidas","text","",80,16,16,8,"03","lives"),
        element("Rótulo de pontos","text","",168,16,48,8,"SCORE"),element("Pontuação","text","",168,24,48,8,"000000","score")
      ])
    ]
  };
}
