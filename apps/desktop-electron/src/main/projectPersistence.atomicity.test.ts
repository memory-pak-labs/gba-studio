import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { openProjectFile, saveProjectFileAtomically } from "./projectPersistence.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";

const failures = vi.hoisted(() => ({ renameDestination: "", copyDestination: "" }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    rename: async (...args: Parameters<typeof original.rename>) => {
      if (String(args[1]) === failures.renameDestination) throw new Error("simulated disk failure");
      return original.rename(...args);
    },
    copyFile: async (...args: Parameters<typeof original.copyFile>) => {
      if (String(args[1]) === failures.copyDestination) throw new Error("simulated asset copy failure");
      return original.copyFile(...args);
    }
  };
});

const roots: string[] = [];
afterEach(async () => {
  failures.renameDestination = "";
  failures.copyDestination = "";
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function destination() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-save-atomicity-"));
  roots.push(root);
  return path.join(root, "game.gba-project");
}
function project(tile: number, split = true) {
  return parseGBAProjectFile(JSON.stringify({
    schemaVersion: 2, name: "Atomicity",
    settings: { build: { splitProjectResources: split } },
    rooms: [{ id: "room", name: "Room", width: 2, height: 2, tilemap: [tile, tile, tile, tile] }],
    events: [{ id: "boot", name: "Boot", steps: [] }]
  }));
}

it("retains the last complete split save when committing the new manifest fails", async () => {
  const file = await destination(), before = project(1);
  await saveProjectFileAtomically(file, before);
  const manifestBytes = await readFile(file);
  const references = JSON.parse(manifestBytes.toString()).resources as { path: string }[];
  const resourceBytes = await Promise.all(references.map(r => readFile(path.join(path.dirname(file), r.path))));
  failures.renameDestination = file;
  await expect(saveProjectFileAtomically(file, project(9))).rejects.toThrow("disk failure");
  expect(await readFile(file)).toEqual(manifestBytes);
  expect((await openProjectFile(file)).project?.data).toEqual(before.data);
  for (const [i, r] of references.entries()) expect(await readFile(path.join(path.dirname(file), r.path))).toEqual(resourceBytes[i]);
  failures.renameDestination = "";
  await saveProjectFileAtomically(file, project(9));
  expect((await openProjectFile(file)).project?.data).toEqual(project(9).data);
  const saved = await readFile(file);
  await saveProjectFileAtomically(file, project(9));
  expect(await readFile(file)).toEqual(saved);
});

it("keeps the previous project if a bundled asset cannot be copied", async () => {
  const file = await destination(), before = project(1, false);
  await saveProjectFileAtomically(file, before);
  const next = project(9, false);
  next.data.assets = [{ id: "car", name: "car.png", kind: "Sprite", metadata: {
    source: "Assets/sprites/car.png",
    bundledDefaultAsset: "template:blank/Assets/sprites/neutral-player-racing-rear.png"
  } }];
  failures.copyDestination = path.join(await realpath(path.dirname(file)), "Assets/sprites/car.png");
  await expect(saveProjectFileAtomically(file, next, { appPath: process.cwd() })).rejects.toThrow("asset copy failure");
  expect((await openProjectFile(file)).project?.data).toEqual(before.data);
});

it("does not write split resources through a symlink outside the project", async () => {
  const file = await destination(), before = project(1, false);
  await saveProjectFileAtomically(file, before);
  const external = await mkdtemp(path.join(os.tmpdir(), "gba-save-external-"));
  roots.push(external);
  await mkdir(path.join(external, "rooms"));
  const originalResource = path.join(external, "rooms/000-room.gbares");
  await writeFile(originalResource, "external file must survive");
  await symlink(external, path.join(path.dirname(file), "Resources"));
  await expect(saveProjectFileAtomically(file, project(9))).rejects.toThrow(/fora do projeto|outside/i);
  expect(await readFile(originalResource, "utf8")).toBe("external file must survive");
  expect(await readdir(external)).toEqual(["rooms"]);
  expect((await openProjectFile(file)).project?.data).toEqual(before.data);
});

it("serializes concurrent saves at the same millisecond and commits the latest request", async () => {
  const file = await destination();
  vi.spyOn(Date, "now").mockReturnValue(123);
  const results = await Promise.allSettled([1, 2, 3].map(tile => saveProjectFileAtomically(file, project(tile))));
  expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
  expect((await openProjectFile(file)).project?.data).toEqual(project(3).data);
  expect((await readdir(path.dirname(file))).filter(name => name.endsWith(".tmp"))).toEqual([]);
});
