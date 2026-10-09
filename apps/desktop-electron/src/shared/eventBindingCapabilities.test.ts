import { describe, expect, it } from "vitest";

import { resolveEventBindingCapabilities } from "./eventBindingCapabilities.js";

describe("resolveEventBindingCapabilities", () => {
  it("expõe o ciclo de vida padrão para atores em todas as cenas", () => {
    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "topdown" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate"]);
    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "topdown", collisionGroup: 1 })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate", "onHit"]);

    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "racing" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate"]);

    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "shmup" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate"]);
    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "dungeonCrawler" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate"]);
    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "battleRpg" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate"]);
    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "luta" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate"]);
  });

  it("materializa os estados de ator mesmo quando ainda estão vazios", () => {
    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "battleRpg" })
      .every((slot) => slot.requiresFrequency === false || slot.bindingKey === "onUpdate")).toBe(true);
    expect(resolveEventBindingCapabilities({ targetKind: "actor", sceneType: "luta" })
      .map((slot) => slot.label)).toEqual(["Ao iniciar", "Ao interagir", "Ao atualizar"]);
  });

  it("mantém o ciclo de vida de ator também em cenas de menu", () => {
    expect(resolveEventBindingCapabilities({
      targetKind: "actor",
      runtimeType: "menu",
      menuActorRole: "option",
      menuItemID: "slot-1"
      }).map((slot) => slot.bindingKey)).toEqual(["onInit", "onInteract", "onUpdate"]);
  });

  it("expõe o ciclo de vida suportado do Player sem transformá-lo em ator interativo", () => {
    expect(resolveEventBindingCapabilities({
      targetKind: "actor",
      actorRole: "player",
      sceneType: "topdown"
    }).map((slot) => slot.bindingKey)).toEqual(["onInit", "onUpdate"]);
    expect(resolveEventBindingCapabilities({
      targetKind: "actor",
      actorRole: "player",
      collisionGroup: 2,
      sceneType: "shmup"
    }).map((slot) => slot.bindingKey)).toEqual(["onInit", "onUpdate"]);
  });

  it("resolve os estados de sala pelo contrato do runtime", () => {
    expect(resolveEventBindingCapabilities({ targetKind: "room", sceneType: "topdown" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onHitPlayer", "onExit", "onInteract"]);
    expect(resolveEventBindingCapabilities({ targetKind: "room", sceneType: "topdown" })
      .find((slot) => slot.bindingKey === "onHitPlayer")?.groupedBindingKeys?.map((group) => group.bindingKey))
      .toEqual(["onHitGroup1", "onHitGroup2", "onHitGroup3"]);

    expect(resolveEventBindingCapabilities({ targetKind: "room", sceneType: "isometric" })
      .map((slot) => slot.bindingKey)).toEqual(["onInit", "onHitPlayer", "onExit", "onUpdate"]);

    for (const sceneType of ["dungeonCrawler", "menu", "visualNovel", "cutscene", "worldMap"]) {
      expect(resolveEventBindingCapabilities({ targetKind: "room", sceneType })
        .map((slot) => slot.bindingKey), sceneType).toEqual(["onInit"]);
    }
    expect(resolveEventBindingCapabilities({ targetKind: "room", sceneType: "battleRpg" }).map((slot) => slot.bindingKey)).toEqual(["onInit", "onVictory", "onDefeat", "onEscape"]);
    expect(resolveEventBindingCapabilities({ targetKind: "room", sceneType: "racing" }).map((slot) => slot.bindingKey)).toEqual(["onInit", "onVictory", "onDefeat"]);
    expect(resolveEventBindingCapabilities({ targetKind: "room", sceneType: "shmup" }).map((slot) => slot.bindingKey)).toEqual(["onInit", "onClear"]);
  });

  it("mantém gatilhos com entrada e saída em qualquer perfil", () => {
    expect(resolveEventBindingCapabilities({ targetKind: "trigger", sceneType: "isometric" })
      .map((slot) => slot.bindingKey)).toEqual(["onEnter", "onLeave"]);
  });

  it("expõe interação explícita para hotspots point-and-click", () => {
    expect(resolveEventBindingCapabilities({ targetKind: "trigger", runtimeType: "pointAndClick" })
      .map((slot) => slot.bindingKey)).toEqual(["onInteract"]);
  });
});
