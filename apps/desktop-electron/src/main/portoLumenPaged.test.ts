import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";

describe("Porto Lumen paged background", () => {
  it("exports the approved pixels and connected ground without loading the ROM atlas as resident tiles", async () => {
    const root = path.join(process.cwd(), "default-assets/templates/exemplo-gba");
    const source = await readFile(path.join(root, "exemplo-gba.gba-project"), "utf8");
    const data = parseGBAProjectFile(source).data;
    const prepared = prepareEngineProjectExport(data);
    expect(prepared.error).toBeUndefined();
    const contract = prepared.generated!.contract;
    const room = contract.topdown_project!.rooms.find(r => r.name === "porto_lumen")!;
    expect(room).toMatchObject({ width_tiles: 126, height_tiles: 86,
      paged_source_tiles: "porto_lumen_continuous_paged", background_bits_per_pixel: 8 });
    expect(contract.topdown_project!.assets!.tile_assets).not.toContain(room.paged_source_tiles);
    expect(room).not.toHaveProperty("foreground_tiles");
    expect(room.triggers?.map(trigger => trigger.area)).toEqual(expect.arrayContaining([
      { x: 128, y: 88, width: 32, height: 24 },
      { x: 480, y: 0, width: 72, height: 24 }
    ]));
    expect(room.portals).toEqual([]); // The links must not duplicate their authored enter events.
    const png = await readFile(path.join(root, "Assets/backgrounds/porto-lumen-continuous-paged.png"));
    expect(createHash("sha256").update(png).digest("hex")).toBe("73e35aa43ea1a4b6171d6087525d1c262f446a6dc53e2183d822224ddeec99b0");

    const free = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= 63 || y >= 43) return false;
      return [0, 1].every(dy => [0, 1].every(dx => (room.collision_flags[(y * 2 + dy) * 126 + x * 2 + dx]! & 1) === 0));
    };
    const seen = new Set(["44,24"]), queue = [[44, 24]];
    for (let index = 0; index < queue.length; index++) {
      const [x, y] = queue[index]!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x! + dx!, ny = y! + dy!, key = `${nx},${ny}`;
        if (!seen.has(key) && free(nx, ny)) { seen.add(key); queue.push([nx, ny]); }
      }
    }
    // Workshop, north exit, dock, stairs, lighthouse entrance and return.
    for (const key of ["44,24", "32,1", "15,32", "13,9", "9,6", "11,9"]) expect(seen.has(key), key).toBe(true);
    expect(free(15,35)).toBe(false); // Water below the pier.
    expect(free(44,19)).toBe(false); // Workshop building.
    for (const npc of room.npcs ?? []) {
      for (let y = npc.position.y - 8; y < npc.position.y + 8; y += 8) {
        for (let x = npc.position.x; x < npc.position.x + 16; x += 8) {
          expect(room.collision_flags[Math.floor(y / 8) * 126 + Math.floor(x / 8)]! & 1, npc.name).toBe(0);
        }
      }
    }
  });
});
