import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_PORT_LUMEN_ASSET_LAYOUT,
  syncVerticePortLumenAssets
} from "./vertice-showcase-assets.mjs";

describe("promoção parcial de Porto de Lúmen", () => {
  it("copia somente o lote aprovado e conserva os mesmos bytes no template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "port-lumen-"));
    const sourceDirectory = path.join(root, "approved-port-assets");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(sourceDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_PORT_LUMEN_ASSET_LAYOUT.map((asset, index) => {
        const source = path.join(sourceDirectory, asset.source);
        return mkdir(path.dirname(source), { recursive: true })
          .then(() => writeFile(source, `approved-port-asset-${index}`));
      })
    ]);

    const synced = await syncVerticePortLumenAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(VERTICE_PORT_LUMEN_ASSET_LAYOUT.length);
    expect(synced.fixtureAssets).toHaveLength(VERTICE_PORT_LUMEN_ASSET_LAYOUT.length);
    await Promise.all(VERTICE_PORT_LUMEN_ASSET_LAYOUT.map(async (asset, index) => {
      const relative = path.join("Assets", asset.destination, asset.name);
      const expected = `approved-port-asset-${index}`;
      await expect(readFile(path.join(path.dirname(templateProjectPath), relative), "utf8")).resolves.toBe(expected);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), relative), "utf8")).resolves.toBe(expected);
    }));
  });
});
