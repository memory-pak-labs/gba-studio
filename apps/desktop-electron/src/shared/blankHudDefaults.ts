import catalog from "../../default-assets/templates/blank/hud-defaults.json" with { type: "json" };
import type { HudComponent, HudPreset } from "./hudPresets.js";
import { HUD_DEFAULT_PRESET_ID } from "./hudPresets.js";

/** Independent records: customization in one project never changes another. */
export function blankHudContent(): { assets: Record<string, unknown>[]; preset: HudPreset } {
  const component = (id: string, kind: HudComponent["kind"], label: string, asset: string,
    x: number, y: number, width: number, height: number, zIndex: number, text = ""): HudComponent =>
    ({id,kind,label,asset,x,y,width,height,zIndex,text,visible:true});
  const status = component("neutral-hud-status", "text", "Status", "", 40, 16, 56, 8, 2, "HP 03");
  status.runtimeText = true;
  return {
    assets: catalog.assets.map(asset => ({
      id: `asset-${asset.name.replace(/\.png$/, "")}`, name: asset.name, kind: asset.kind, systemImage: "rectangle.topthird.inset.filled",
      metadata: {source:`Assets/ui/${asset.name}`,bundledDefaultAsset:`template:blank/Assets/ui/${asset.name}`,
        ...(asset.name !== "neutral-hud-skin.png" ? {runtimeConsumer:"hud-obj"} : {}),
        visualProfile:"neutral-purple",colorMode:"4bpp",frameWidth:asset.width,frameHeight:asset.height,
        provenance:"Original approved purple HUD concept, prepared at native resolution.",
        license:"Project-owned",sourceSha256:asset.sha256}
    })),
    preset: {
      id:HUD_DEFAULT_PRESET_ID,name:"HUD padrão",description:"Kit modular roxo: molduras, ícones e textos personalizáveis.",
      backgroundImage:"neutral-hud-skin.png",selectorImage:"neutral-hud-arrow-right.png",font:"",
      textColor: (184 >> 3) | ((144 >> 3) << 5) | ((200 >> 3) << 10),
      position:"Superior",width:240,height:40,mode:"advanced",
      components:[
        component("neutral-hud-life-frame","frame","Moldura de status","neutral-hud-frame-wide.png",8,8,96,32,0),
        component("neutral-hud-counter-frame","frame","Moldura do contador","neutral-hud-frame-counter.png",168,8,64,32,0),
        component("neutral-hud-heart","icon","Vida","neutral-hud-heart.png",16,16,8,8,1),
        component("neutral-hud-coin","icon","Moeda","neutral-hud-coin.png",176,16,16,16,1),
        component("neutral-hud-bar","bar","Barra de exemplo","neutral-hud-bar-half.png",16,24,72,8,1),
        status,
        component("neutral-hud-counter","text","Contador","",200,16,24,8,2,"000")
      ]
    }
  };
}
