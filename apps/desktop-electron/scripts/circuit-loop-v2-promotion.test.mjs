import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CIRCUIT_LOOP_V2_BACKGROUND,
  circuitLoopV2CollisionTypes,
  promoteApprovedCircuitLoopV2,
  syncApprovedCircuitLoopV2Asset
} from "./circuit-loop-v2-promotion.mjs";

const templateURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);

describe("Circuito Final V2 aprovado", () => {
  it("conecta o circuito completo sem alterar as outras cenas", () => {
    const before = JSON.parse(readFileSync(templateURL, "utf8"));
    const after = promoteApprovedCircuitLoopV2(before);
    const scene = after.rooms.find((room) => room.name === "circuito_final");
    expect(after.scenas).toHaveLength(before.scenas.length);
    expect(after.scenas.filter((room) => room.name !== "circuito_final"))
      .toEqual(before.scenas.filter((room) => room.name !== "circuito_final"));
    expect(scene).toMatchObject({
      backgroundAssetName: CIRCUIT_LOOP_V2_BACKGROUND.name,
      width: 60,
      height: 40,
      runtime: { config: {
        rivalSpeed: 105,
        topdownTrack: { startHeading: 4, cameraDeadZoneX: 56, cameraDeadZoneY: 40 }
      } }
    });
    expect(scene.runtime.config.topdownTrack.pathPoints).toHaveLength(18);
    expect(scene.runtime.config.topdownTrack.checkpoints.map((checkpoint) => checkpoint.id))
      .toEqual(["ilha-curva-leste", "ilha-retorno-sul", "ilha-curva-oeste", "ilha-largada"]);
    expect(circuitLoopV2CollisionTypes().filter((type) => type === "free")).toHaveLength(555);
    expect(after.actors.find((actor) => actor.id === "racing-nara")).toMatchObject({ x: 22, y: 6 });
    expect(after.events.find((event) => event.name === "circuito_reiniciar")?.steps)
      .toEqual(expect.arrayContaining([expect.objectContaining({ command: "change_scene circuito_final 22 6 right" })]));
    expect(promoteApprovedCircuitLoopV2(after)).toEqual(after);
  });

  it("copia o background preparado com hash conferido", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "circuit-loop-v2-"));
    const projectPath = path.join(root, "project.gba-project");
    await writeFile(projectPath, "{}\n");
    const result = await syncApprovedCircuitLoopV2Asset(projectPath);
    expect(result.sha256).toBe(CIRCUIT_LOOP_V2_BACKGROUND.sha256);
    expect((await readFile(result.target)).length).toBeGreaterThan(0);
  });
});
