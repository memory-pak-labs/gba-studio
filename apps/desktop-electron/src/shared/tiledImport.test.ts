import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { createRoomInProject } from "./roomsWorkspace.js";
import {
  importTiledMapIntoProject,
  parseTiledMapJson,
  parseTiledMapText,
  parseTiledMapXml,
  TILED_MAP_MAX_WIDTH
} from "./tiledImport.js";

const sampleTiledMap = {
  width: 4,
  height: 3,
  tilewidth: 8,
  tileheight: 8,
  tilesets: [{ firstgid: 1, name: "overworld", image: "Assets/tiles/overworld.png" }],
  layers: [{
    type: "tilelayer",
    name: "Ground",
    width: 4,
    height: 3,
    data: [1, 2, 0, 3, 4, 5, 0, 6, 7, 0, 8, 9]
  }]
};

describe("tiledImport", () => {
  it("parses a Tiled JSON tile layer into a flat editor tilemap", () => {
    const parsed = parseTiledMapJson(sampleTiledMap);

    expect(parsed).toMatchObject({
      width: 4,
      height: 3,
      tileWidth: 8,
      tileHeight: 8,
      layerName: "Ground",
      tilesetImage: "Assets/tiles/overworld.png",
      tilesetName: "overworld"
    });
    expect(parsed.tilemap).toEqual([1, 2, 0, 3, 4, 5, 0, 6, 7, 0, 8, 9]);
  });

  it("imports a Tiled map as a new room with tilemap and background asset", () => {
    const blank = createBlankProjectData({ name: "Tiled Import", exportFolder: "build/tiled" });
    const imported = importTiledMapIntoProject(blank, sampleTiledMap, {
      roomId: "room-tiled",
      roomName: "forest"
    });

    const rooms = imported.scenas as Array<Record<string, unknown>>;
    const forest = rooms.find((room) => room.name === "forest");
    expect(forest).toMatchObject({
      id: "room-tiled",
      width: 30,
      height: 20,
      backgroundAssetName: "overworld.png",
      backgroundRenderMode: "tilemap"
    });
    expect(forest?.tilemap).toHaveLength(600);
    expect((forest?.tilemap as number[]).slice(0, 4)).toEqual([1, 2, 0, 3]);
    expect((forest?.tilemap as number[]).slice(30, 34)).toEqual([4, 5, 0, 6]);
    expect((forest?.tilemap as number[]).slice(60, 64)).toEqual([7, 0, 8, 9]);
  });

  it("reimports into an existing room without dropping actors or triggers", () => {
    let project = createBlankProjectData({ name: "Tiled Reimport", exportFolder: "build/tiled" });
    project = createRoomInProject(project, {
      id: "room-keep",
      name: "keep",
      width: 2,
      height: 2,
      sceneType: "topdown"
    });
    project = {
      ...project,
      actors: [{ id: "actor-npc", name: "Guide", roomName: "keep", x: 1, y: 1 }],
      triggers: [{ id: "trigger-1", name: "Door", roomName: "keep", x: 0, y: 0, width: 1, height: 1 }]
    };

    const reimported = importTiledMapIntoProject(project, sampleTiledMap, {
      roomId: "room-new",
      roomName: "unused",
      targetRoomId: "room-keep"
    });

    const rooms = reimported.scenas as Array<Record<string, unknown>>;
    const keep = rooms.find((room) => room.id === "room-keep");
    expect(keep).toMatchObject({
      width: 30,
      height: 20,
      backgroundAssetName: "overworld.png"
    });
    expect(keep?.tilemap).toHaveLength(600);
    expect((keep?.tilemap as number[]).slice(30, 34)).toEqual([4, 5, 0, 6]);
    expect(reimported.actors).toEqual([
      expect.objectContaining({ id: "actor-npc", roomName: "keep" })
    ]);
    expect(reimported.triggers).toEqual([
      expect.objectContaining({ id: "trigger-1", roomName: "keep" })
    ]);
  });

  it("parses a CSV TMX tile layer into a flat editor tilemap", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map width="4" height="3" tilewidth="8" tileheight="8">
  <tileset firstgid="1" name="overworld">
    <image source="Assets/tiles/overworld.png" width="64" height="64"/>
  </tileset>
  <layer id="1" name="Ground" width="4" height="3">
    <data encoding="csv">
1,2,0,3,
4,5,0,6,
7,0,8,9
    </data>
  </layer>
</map>`;
    const parsed = parseTiledMapXml(xml);
    expect(parsed).toMatchObject({
      width: 4,
      height: 3,
      layerName: "Ground",
      tilesetImage: "Assets/tiles/overworld.png",
      tilesetName: "overworld"
    });
    expect(parsed.tilemap).toEqual([1, 2, 0, 3, 4, 5, 0, 6, 7, 0, 8, 9]);
  });

  it("parses uncompressed base64 TMX data and rejects gzip in the shared parser", () => {
    const gids = [1, 2, 0, 3, 4, 5, 0, 6, 7, 0, 8, 9];
    const bytes = new Uint8Array(gids.length * 4);
    gids.forEach((gid, index) => {
      const offset = index * 4;
      bytes[offset] = gid & 0xff;
      bytes[offset + 1] = (gid >> 8) & 0xff;
      bytes[offset + 2] = (gid >> 16) & 0xff;
      bytes[offset + 3] = (gid >> 24) & 0xff;
    });
    const encoded = Buffer.from(bytes).toString("base64");
    const xml = `<map width="4" height="3" tilewidth="8" tileheight="8">
  <layer name="Ground" width="4" height="3">
    <data encoding="base64">${encoded}</data>
  </layer>
</map>`;
    expect(parseTiledMapXml(xml).tilemap).toEqual(gids);
    expect(() => parseTiledMapXml(`<map width="1" height="1"><layer name="G" width="1" height="1"><data encoding="base64" compression="gzip">eA==</data></layer></map>`))
      .toThrow(/compression="gzip"/);
  });

  it("auto-detects JSON or TMX text via parseTiledMapText", () => {
    expect(parseTiledMapText(JSON.stringify(sampleTiledMap)).tilemap).toEqual([1, 2, 0, 3, 4, 5, 0, 6, 7, 0, 8, 9]);
    expect(parseTiledMapText(`<map width="2" height="1" tilewidth="8" tileheight="8"><layer name="Ground" width="2" height="1"><data encoding="csv">1,2</data></layer></map>`).tilemap)
      .toEqual([1, 2]);
  });

  it("rejects Tiled dimensions above the bounded import limit", () => {
    expect(() => parseTiledMapJson({
      width: TILED_MAP_MAX_WIDTH + 1,
      height: 1,
      layers: [{ type: "tilelayer", width: TILED_MAP_MAX_WIDTH + 1, height: 1, data: [1] }]
    })).toThrow(/dimens|limite|grande/i);
  });
});
