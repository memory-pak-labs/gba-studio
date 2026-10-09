import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { parseGBAProjectFile } from "../../../apps/desktop-electron/src/shared/projectFile.js";
import {
  buildPilotDefinition,
  materializePilotProjects
} from "../pilot.js";
import { resolvePilotRepositoryRoot } from "../pilot-cli-options.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

it("defines the three licensed real-asset pilot cases", () => {
  const pilot = buildPilotDefinition(repositoryRoot);

  expect(pilot.cases.map((entry) => entry.id)).toEqual([
    "topdown-npc",
    "platformer-actor",
    "free-enemy"
  ]);
  expect(pilot.cases.map((entry) => [entry.profile, entry.frameWidth, entry.frameHeight]))
    .toEqual([
      ["topdown", 16, 16],
      ["platformer", 16, 32],
      ["free", 96, 64]
    ]);
  expect(pilot.cases[1]).toMatchObject({ label: "Player platformer", actorId: "actor-player" });
  expect(pilot.cases.every((entry) => entry.source.license === "CC0-1.0")).toBe(true);
});

it("materializes scene-correct actors without changing the source fixture", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-sprite-pilot-test-"));
  temporaryRoots.push(root);
  const fixturePath = path.join(
    repositoryRoot,
    "apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
  );
  const fixtureBefore = await readFile(fixturePath, "utf8");

  const projects = await materializePilotProjects({ repositoryRoot, destination: root });

  expect(projects.map((entry) => entry.actorId)).toEqual([
    "actor-pilot-npc",
    "actor-player",
    "actor-pilot-enemy"
  ]);
  for (const project of projects) {
    const parsed = parseGBAProjectFile(await readFile(project.projectPath, "utf8"));
    const actor = parsed.data.actors?.find((candidate) => candidate.id === project.actorId);
    expect(actor).toMatchObject({ roomName: project.roomName });
  }
  expect(await readFile(fixturePath, "utf8")).toBe(fixtureBefore);
});

it("uses the launcher-provided repository root after bundling in a temporary directory", () => {
  expect(resolvePilotRepositoryRoot({ GBA_SPRITE_REPO_ROOT: repositoryRoot }, "/tmp/bundle"))
    .toBe(repositoryRoot);
});
