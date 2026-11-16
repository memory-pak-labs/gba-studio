import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
const template = () => JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
it("authors B attack and L dash with existing events and the approved attack clip", () => {
  const project = template();
  const commands = (name: string) => project.events.find((event: any) => event.name === name)?.steps.map((step: any) => step.command);
  expect(commands("penedos_ao_entrar")).toContain("attach_button B penedos_player_attack true");
  expect(commands("penedos_ao_entrar")).toContain("attach_button L penedos_player_dash_input true");
  expect(commands("penedos_player_dash_input")).toEqual(["set_platformer_state dash"]);
  expect(commands("penedos_player_attack")).toContain("set_actor_animation player attack_right");
  expect(commands("penedos_player_attack").some((command: string) => command.startsWith("wait "))).toBe(false);
  const clip = project.animations.find((animation: any) => animation.id === "penedos-approved-nara-attack");
  expect(clip).toMatchObject({ frameCount: 3, loops: false });
  const exported = buildEngineExportProjectContract(project).platformer_project!;
  expect(exported.scripts.some(script => script.script.some(command => command.op === "set_platformer_state" && command.state === "dash"))).toBe(true);
});
