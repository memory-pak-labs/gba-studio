import { describe, expect, it } from "vitest";
import { runtimeEventStates, updateRuntimeEventState, runtimeEventValue, menuActorRuntimeState } from "./sceneEventStates.js";
import { bindEventToTargetInProject, deriveContextBindingSlotStates, renameEventInProject, removeEventFromProject, boundEventNameForTarget, removeEventTargetBindingInProject, deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

function menuScene() {
  return { id: "menu", name: "menu", runtime: { type: "menu", config: { screens: [
    { id: "title", title: "Título", items: [{ id: "start", label: "Iniciar", action: "push_screen", targetScreenID: "options", eventName: "open" }] },
    { id: "options", carousel: true, items: [{ id: "settings", label: "Ajustes", action: "push_screen", targetScreenID: "settings" }, { id: "back", label: "Voltar", action: "pop_screen" }] }
  ] } } };
}
function allScenes(project: GBAProjectData): Record<string, unknown>[] {
  return [...(project.rooms as Record<string, unknown>[]), ...(project.scenas as Record<string, unknown>[])];
}

describe("autoria de eventos por estado do runtime", () => {
  it("expõe ações de menu mesmo sem script adicional, usando a configuração executada", () => {
    const states = runtimeEventStates(menuScene());
    const option = states.find((state) => state.label.includes("Ajustes"))!;
    expect(option.eventName).toBeNull();
    expect(option.actions[0]).toMatchObject({ title: "Abrir tela", fields: expect.arrayContaining([expect.objectContaining({ key: "targetScreenID", value: "settings" })]) });
    const next = updateRuntimeEventState(menuScene(), option.bindingKey, "targetScreenID", "credits");
    expect(runtimeEventStates(next).find((state) => state.bindingKey === option.bindingKey)?.actions[0].fields).toContainEqual(expect.objectContaining({ key: "targetScreenID", value: "credits" }));
    expect(runtimeEventStates(menuScene()).find((state) => state.bindingKey === option.bindingKey)?.actions[0].fields).toContainEqual(expect.objectContaining({ value: "settings" }));
  });

  it("materializa entrada e salto de cada quadro da cutscene", () => {
    const scene = { runtime: { type: "cutscene", config: { steps: [{ id: "frame", backgroundAssetName: "bg.png", dialogueKey: "intro", durationFrames: 60, autoAdvance: true, skippable: true, eventName: "signal", onSkipEventName: "finish" }] } } };
    const states = runtimeEventStates(scene);
    expect(states.map((state) => state.eventName)).toEqual(["signal", "finish"]);
    expect(states[0].actions.map((action) => action.title)).toEqual(["Exibir fundo", "Exibir diálogo", "Duração e avanço"]);
  });

  it("expõe destinos do mapa e estados de vitória, derrota e fim da onda", () => {
    const world = { runtime: { type: "worldMap", config: { nodes: [{ id: "port", name: "Porto", eventName: "travel" }] } } };
    expect(runtimeEventStates(world)).toContainEqual(expect.objectContaining({ label: "Viajar · Porto", eventName: "travel" }));
    for (const type of ["racing", "luta", "battleRpg"]) {
      expect(deriveContextBindingSlotStates({ runtime: { type }, eventBindings: { onVictory: "won", onDefeat: "lost" } }, "room", new Set(["won", "lost"]))).toEqual(expect.arrayContaining([expect.objectContaining({ bindingKey: "onVictory", eventName: "won" }), expect.objectContaining({ bindingKey: "onDefeat", eventName: "lost" })]));
    }
    expect(deriveContextBindingSlotStates({ runtime: { type: "shmup" }, eventBindings: { onClear: "finish" } }, "room", new Set(["finish"]))).toContainEqual(expect.objectContaining({ bindingKey: "onClear", eventName: "finish" }));
  });

  it("vincula, renomeia e remove o script no campo real, sincronizando rooms e scenas", () => {
    const scene = menuScene();
    const key = runtimeEventStates(scene).find((state) => state.label.includes("Ajustes"))!.bindingKey;
    const data = { scenas: [scene], rooms: [structuredClone(scene)], events: [{ id: "event", name: "select", steps: [{ command: "noop" }] }] } as unknown as GBAProjectData;
    const bound = bindEventToTargetInProject(data, "event", { targetKind: "room", targetName: "menu", bindingKey: key });
    for (const s of allScenes(bound)) expect(runtimeEventValue(s, key)).toBe("select");
    const renamed = renameEventInProject(bound, "event", "changed");
    for (const s of allScenes(renamed)) expect(runtimeEventValue(s, key)).toBe("changed");
    const removed = removeEventFromProject(renamed, "event");
    for (const s of allScenes(removed)) expect(runtimeEventValue(s, key)).toBeNull();
  });

  it("usa o vínculo real do menu para PRESS START, grafo e remoção do ator", () => {
    const scene = menuScene();
    const actor = { name: "Prompt", roomName: "menu", inputBinding: "Start", eventBindings: { onInteract: "stale" } };
    const data = { rooms: [structuredClone(scene)], scenas: [scene], actors: [actor], events: [{ id: "open", name: "open", command: "noop" }] } as unknown as GBAProjectData;
    const target = { targetKind: "actor" as const, targetName: "Prompt", bindingKey: "onInteract" };
    expect(menuActorRuntimeState(scene, actor)?.eventName).toBe("open");
    expect(boundEventNameForTarget(data, target)).toBe("open");
    expect(deriveEventsWorkspacePresentation(data).graphBindingEdges).toContainEqual(expect.objectContaining({ targetKind: "actor", targetName: "Prompt", targetEventName: "open" }));
    const removed = removeEventTargetBindingInProject(data, target);
    expect(boundEventNameForTarget(removed, target)).toBeNull();
    for (const s of allScenes(removed)) expect(menuActorRuntimeState(s, actor)?.eventName).toBeNull();
  });

  it("mantém Ao iniciar sincronizado nas duas coleções durante a autoria", () => {
    const scene = { name: "intro", runtime: { type: "cutscene", config: { steps: [] } }, eventBindings: {} };
    const data = { rooms: [structuredClone(scene)], scenas: [scene], events: [{ id: "init", name: "begin", steps: [] }] } as unknown as GBAProjectData;
    const target = { targetKind: "room" as const, targetName: "intro", bindingKey: "onInit" };
    const bound = bindEventToTargetInProject(data, "init", target);
    for (const s of allScenes(bound)) expect(s.eventBindings).toMatchObject({ onInit: "begin" });
    const renamed = renameEventInProject(bound, "init", "start");
    for (const s of allScenes(renamed)) expect(s.eventBindings).toMatchObject({ onInit: "start" });
    for (const next of [removeEventTargetBindingInProject(renamed, target), removeEventFromProject(renamed, "init")]) {
      for (const s of allScenes(next)) expect(s.eventBindings).not.toHaveProperty("onInit");
    }
  });

  it("rejeita um caminho desconhecido sem alterar a cena", () => {
    const scene = menuScene();
    expect(updateRuntimeEventState(scene, "runtime:/items/999/eventName", "eventName", "bad")).toBe(scene);
  });
});
