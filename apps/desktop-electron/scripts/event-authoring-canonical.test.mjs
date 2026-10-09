import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveContextBindingSlotStates } from "../src/shared/eventsWorkspace.js";
import { runtimeEventStates } from "../src/shared/sceneEventStates.js";

// Integrity uses the current project: no historical scene counts or asset hashes.
const project = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
const eventNames = new Set(project.events.map((event) => event.name));
describe("integridade da autoria de eventos no projeto atual", () => {
  for (const scene of project.scenas) {
    it(`${scene.name}: todos os callbacks configurados possuem estado acessível`, () => {
      const slots = deriveContextBindingSlotStates(scene, "room", eventNames);
      const accessible = new Set(slots.flatMap((slot) => slot.groupedBindingKeys?.map((group) => group.bindingKey) ?? [slot.bindingKey]));
      for (const [binding, name] of Object.entries(scene.eventBindings ?? {})) {
        if (!name) continue;
        expect(accessible.has(binding), `${scene.name}.${binding}`).toBe(true);
        expect(eventNames.has(name), `${scene.name}: ${name}`).toBe(true);
      }
      for (const state of runtimeEventStates(scene)) {
        expect(accessible.has(state.bindingKey), `${scene.name}: ${state.label}`).toBe(true);
        if (state.eventName) expect(eventNames.has(state.eventName), `${scene.name}: ${state.eventName}`).toBe(true);
      }
    });
  }
});
