import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sceneMapCardSize } from "../src/shared/sceneMapLayout.js";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const projectURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

function titleContract(project) {
  const title = project.scenas.find((scene) => scene.name === "titulo");
  const [splash, options] = title?.runtime?.config?.screens ?? [];
  return { title, splash, options };
}

describe("carrossel canônico do título", () => {
  it("mantém 30 cenas e o menu inicial dentro da cena título", () => {
    const project = JSON.parse(readFileSync(projectURL, "utf8"));
    const sceneNames = project.scenas.map((scene) => scene.name);
    const { title, splash, options } = titleContract(project);

    expect(sceneNames).toHaveLength(30);
    expect(sceneNames).not.toContain("menu_inicial");
    expect(title?.runtime?.type).toBe("menu");
    expect(splash?.id).toBe("title");
    expect(splash?.items).toEqual([
      expect.objectContaining({
        id: "start",
        action: "push_screen",
        targetScreenID: "title_options"
      })
    ]);
    expect(options?.id).toBe("title_options");
    expect(options?.carousel).toBe(true);
    expect(project.events.find((event) => event.name === "titulo_abrir_menu")?.steps.map((step) => step.command))
      .toEqual(["play_sfx farol_sfx_cursor", "slider title_options"]);
    expect(options?.items.map((item) => [item.id, item.targetScreenID])).toEqual([
      ["new-game", "escolha_genero"],
      ["load-game", "carregar_jogo"],
      ["language", "configuracoes"],
      ["settings", "configuracoes"],
      ["credits", "creditos"]
    ]);
    expect(options?.items.find((item) => item.id === "language")?.targetItemID).toBe("language");
    expect(options?.items.find((item) => item.id === "load-game")?.requiresSave).toBe(true);
    expect(options?.items.every((item) => sceneNames.includes(item.targetScreenID))).toBe(true);
    expect(project.actors.filter((actor) => actor.roomName === "titulo" && actor.menuActorRole === "decorative")).toEqual([]);
  });

  it("não recria o menu antigo ao reaplicar a promoção da campanha", () => {
    const project = JSON.parse(readFileSync(projectURL, "utf8"));
    const promoted = promoteExemploGBAVerticeCampaign(structuredClone(project));
    const { options } = titleContract(promoted);

    expect(promoted.scenas).toHaveLength(30);
    expect(promoted.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(options?.carousel).toBe(true);
    expect(options?.items.map((item) => item.id)).toEqual([
      "new-game", "load-game", "language", "settings", "credits"
    ]);
  });

  it("abre o canvas sem sobrepor cards nem reorganizar o projeto recém-criado", () => {
    const project = JSON.parse(readFileSync(projectURL, "utf8"));
    const positions = project.editorState.sceneMapPositions;
    const cards = project.scenas.map((scene) => ({
      name: scene.name,
      position: positions[scene.name],
      size: sceneMapCardSize(scene)
    }));

    for (const [index, card] of cards.entries()) {
      expect(card.position, `posição ausente de ${card.name}`).toBeDefined();
      for (const other of cards.slice(index + 1)) {
        const overlaps = card.position.x < other.position.x + other.size.width
          && card.position.x + card.size.width > other.position.x
          && card.position.y < other.position.y + other.size.height
          && card.position.y + card.size.height > other.position.y;
        expect(overlaps, `${card.name} sobrepõe ${other.name}`).toBe(false);
      }
    }
  });
});
