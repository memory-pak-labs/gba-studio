import { describe, expect, it } from "vitest";
import { parseScaleEvent } from "./eventTransforms.js";
import { eventCommandIntegrationIssue } from "./eventCommandSupport.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";

describe("event-driven scale", () => {
  it("parses independent percentage axes and a nonblocking duration", () => {
    expect(parseScaleEvent(['animate_actor_scale', 'Guarda do Porto', '150', '75', '12'])).toEqual({ target: 'Guarda do Porto', x256: 384, y256: 192, frames: 12, background: false });
    expect(parseScaleEvent(['reset_actor_scale', 'Player'])).toMatchObject({ x256: 256, y256: 256, frames: 0 });
    expect(parseScaleEvent(['set_background_scale', 'BG2', '200', '100'])).toMatchObject({ background: true, target: 'BG2', x256: 512 });
  });
  it.each(['set_actor_scale Player 0 100', 'set_actor_scale Player 201 100', 'animate_actor_scale Player 100 100 -1', 'set_background_scale BG0 100 100', 'set_background_scale BG2 Infinity 100', 'animate_background_scale BG2 100 100 32768'])('rejects invalid %s', command => {
    expect(eventCommandIntegrationIssue(command, 'topdown')).toBeTruthy();
  });
  it("does not advertise background commands in renderers without integration",()=>{
    expect(eventCommandIntegrationIssue("set_background_scale BG2 100 100","isometric")).toContain("não possui consumidor");
  });
  it("offers six blocks with Player and independent percentage fields", () => {
    const p = deriveEventsWorkspacePresentation({ events: [{ name: 'scale', steps: [{ command: 'animate_actor_scale Player 150 75 12' }] }] });
    const step=p.groups.flatMap(g=>g.events)[0]!.steps[0]!;
    expect(step.commandParameters.map(p=>p.label)).toEqual(['Ator', 'Escala X (%)', 'Escala Y (%)', 'Duração (quadros)']);
    expect(step.commandParameters[0]!.options).toContain('Player');
    expect(p.commandPalette.filter(c=>/(actor|background)_scale/.test(c.command))).toHaveLength(6);
  });
});
