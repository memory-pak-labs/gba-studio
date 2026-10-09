import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_ROUTE_MAP_BACKGROUND_LAYOUT,
  VERTICE_ROUTE_MAP_ACTOR_LAYOUT,
  syncVerticeRouteMapBackground
} from "./vertice-showcase-assets.mjs";

describe("promoção do mapa de rota de Vértice", () => {
  it("copia a fonte preparada v6 igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "route-map-background-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const asset = VERTICE_ROUTE_MAP_BACKGROUND_LAYOUT[0];
    const actorAsset = VERTICE_ROUTE_MAP_ACTOR_LAYOUT[0];
    const source = path.join(sourceDirectory, asset.source);

    await Promise.all([
      mkdir(path.dirname(source), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);
    await writeFile(source, "approved-route-map-v6-pixels");
    await mkdir(path.dirname(path.join(sourceDirectory, actorAsset.source)), { recursive: true });
    await writeFile(path.join(sourceDirectory, actorAsset.source), "approved-route-beacon-4bpp-pixels");

    const synced = await syncVerticeRouteMapBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    const target = path.join("Assets", asset.destination, asset.name);
    expect(asset).toEqual({
      source: "mapa-rota/primary-background-candidate-v6/prepared/vertice-route-map-4bpp-v6.png",
      name: "route-map-gba.png",
      destination: "backgrounds"
    });
    expect(synced.templateAssets).toEqual([
      path.join(path.dirname(templateProjectPath), target),
      path.join(path.dirname(templateProjectPath), "Assets", actorAsset.destination, actorAsset.name)
    ]);
    expect(synced.fixtureAssets).toEqual([
      path.join(path.dirname(fixtureProjectPath), target),
      path.join(path.dirname(fixtureProjectPath), "Assets", actorAsset.destination, actorAsset.name)
    ]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
      .resolves.toBe("approved-route-map-v6-pixels");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
      .resolves.toBe("approved-route-map-v6-pixels");
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", actorAsset.destination, actorAsset.name), "utf8"))
      .resolves.toBe("approved-route-beacon-4bpp-pixels");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", actorAsset.destination, actorAsset.name), "utf8"))
      .resolves.toBe("approved-route-beacon-4bpp-pixels");
  });
});
