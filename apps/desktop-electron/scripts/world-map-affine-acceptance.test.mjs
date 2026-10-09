import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

describe("aceite da tecnologia Affine na aeronave do mapa de rotas", () => {
  it("exporta a aeronave Affine e conserva o mapa como background paginado", () => {
    const project = JSON.parse(readFileSync(templateURL, "utf8"));
    const route = project.scenas.find((scene) => scene.name === "mapa_rota");
    const cursor = project.actors.find((actor) => actor.id === "map-cursor");
    const aircraft = project.assets.find((asset) => asset.name === "route-airship-v2.png");

    expect(route).toMatchObject({
      backgroundAssetName: "route-map-paged-v2.png",
      runtime: { type: "worldMap", config: { cursorAffine: true } }
    });
    expect(cursor).toMatchObject({
      roomName: "mapa_rota",
      worldMapRole: "cursor",
      spriteSheet: "route-airship-v2.png"
    });
    expect(aircraft?.metadata).toMatchObject({
      role: "route-airship",
      width: 32,
      height: 32,
      reviewStatus: "approved"
    });

    const exported = buildEngineExportProjectContract(project);
    expect(exported.world_map_project).toMatchObject({
      scene_name: "mapa_rota",
      cursor_affine: true,
      cursor: { metasprite: { asset: "route_airship_v2", index: 0 } }
    });
  });
});
