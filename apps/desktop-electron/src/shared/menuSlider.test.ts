import { describe, expect, it } from "vitest";
import type { GBAProjectData } from "./projectFile.js";
import { findMenuSliderScreen, menuSliderSprite, updateMenuSliderItemInProject } from "./menuSlider.js";

// Application behavior uses a stable fixture; canonical integrity is audited separately.
const items = [
  { id: "new-game", targetScreenID: "escolha_genero", label: "Novo jogo" },
  { id: "load-game", targetScreenID: "carregar_jogo", label: "Carregar jogo" },
  { id: "language", targetScreenID: "configuracoes", label: "Idioma" },
  { id: "settings", targetScreenID: "configuracoes", label: "Configurações" },
  { id: "credits", targetScreenID: "creditos", label: "Créditos" }
];
const scene = { name: "titulo", runtime: { type: "menu", config: { screens: [{ id: "title_options", carousel: true, items }] } } };
const project = {
  scenas: [scene], rooms: [structuredClone(scene)],
  actors: items.map((item) => ({ name: item.label, roomName: "titulo", menuItemID: item.id, menuActorRole: "option", spriteSheet: `menu-inicial-${item.id}.png` })),
  assets: items.map((item) => ({ name: `menu-inicial-${item.id}.png`, kind: "Sprite" })),
  animations: []
} as unknown as GBAProjectData;

describe("bloco Slider do título", () => {
  it("materializa cinco opções com a imagem e a ação do menu real", () => {
    const slider = findMenuSliderScreen(project, "titulo", "title_options");
    expect(slider?.items.map((item) => [item.id, item.targetScreenID])).toEqual([
      ["new-game", "escolha_genero"], ["load-game", "carregar_jogo"],
      ["language", "configuracoes"], ["settings", "configuracoes"], ["credits", "creditos"]
    ]);
    expect(menuSliderSprite(project, "titulo", "new-game")).toBe("menu-inicial-new-game.png");
  });

  it("edita cenas, eventos e imagens sem desalinhar rooms e scenas", () => {
    const next = updateMenuSliderItemInProject(project, "titulo", "title_options", "new-game", {
      targetScreenID: "creditos",
      eventName: "titulo_ao_entrar",
      spriteSheet: "menu-inicial-credits.png"
    });
    const item = findMenuSliderScreen(next, "titulo", "title_options")?.items[0];
    expect(item?.targetScreenID).toBe("creditos");
    expect(item?.eventName).toBe("titulo_ao_entrar");
    expect(menuSliderSprite(next, "titulo", "new-game")).toBe("menu-inicial-credits.png");
    expect((next.rooms as Array<{ name: string; runtime: { config: { screens: Array<{ id: string; items: Array<{ targetScreenID: string }> }> } } }>).find((scene) => scene.name === "titulo")?.runtime.config.screens.find((screen) => screen.id === "title_options")?.items[0]?.targetScreenID).toBe("creditos");
    expect(menuSliderSprite(project, "titulo", "new-game")).toBe("menu-inicial-new-game.png");
  });
});
