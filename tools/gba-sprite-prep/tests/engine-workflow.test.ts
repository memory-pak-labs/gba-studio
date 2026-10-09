import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import p0SourceCatalog from "../../../apps/desktop-electron/scripts/p0-source-catalog.json" with { type: "json" };
import { runEngineWorkflow, verifySpriteContract } from "../engine-workflow.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const electronRoot = path.join(repositoryRoot, "apps/desktop-electron");
const enginePackPath = path.join(
  repositoryRoot,
  "packages/GBAStudioEngine/dist/GBAStudioEnginePack"
);
const fixtureProject = path.join(electronRoot, p0SourceCatalog.technicalFixture.projectPath);
const temporaryRoots: string[] = [];

it("does not borrow a named player animation when verifying an NPC sheet", () => {
  const verified = verifySpriteContract({
    actors: [{
      id: "actor-npc",
      name: "Exploradora",
      spriteSheet: "npc.png",
      animationName: "idle_down"
    }],
    animations: [{
      id: "animation-npc-idle",
      name: "idle_down",
      spriteSheet: "npc.png",
      frameCount: 1
    }]
  }, {
    copied_assets: [{ name: "npc.png" }],
    asset_pack: { assets: [{ kind: "obj", name: "npc" }] },
    topdown_project: {
      player: {
        metasprite: { asset: "player" },
        animations: [{ name: "idle_down", asset: "player" }]
      },
      rooms: [{
        npcs: [{
          name: "Exploradora",
          metasprite: { asset: "npc" },
          animation: { asset: "npc" }
        }]
      }]
    }
  }, "actor-npc");

  expect(verified.runtimeAnimationMode).toBe("sheet-default");
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

it.runIf(existsSync(path.join(enginePackPath, "tools/assetc")))(
  "exports a project with the application contract and builds a real ROM",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-sprite-engine-workflow-test-"));
    temporaryRoots.push(root);
    const destination = path.join(root, "engine-export");

    const evidence = await runEngineWorkflow({
      projectPath: fixtureProject,
      destination,
      enginePackPath,
      actorSelector: "actor-player"
    });

    expect(evidence.export.target).toBe("electron_p0_functional");
    expect(evidence.export.generatedFiles).toBeGreaterThan(3);
    expect(evidence.backgroundValidation.reportPath).toBe(
      path.join(destination, "background-validation.json")
    );
    expect(evidence.backgroundValidation.assets).toBeGreaterThanOrEqual(0);
    expect(evidence.sprite).toMatchObject({
      actorId: "actor-player",
      spriteSheet: "player_topdown_4dir.png",
      animationName: "idle_down",
      frameCount: 1,
      exportedAsset: "player_topdown_4dir"
    });
    expect(evidence.build.exitCode).toBe(0);
    expect(evidence.build.romBytes).toBeGreaterThan(0);
    expect(existsSync(evidence.build.romPath)).toBe(true);
    expect(JSON.parse(await readFile(path.join(destination, "export_project.json"), "utf8")))
      .toMatchObject({ schema: 1 });
  },
  120_000
);
