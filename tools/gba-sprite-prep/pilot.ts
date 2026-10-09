import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseGBAProjectFile,
  serializeGBAProjectFile,
  summarizeGBAProject,
  type GBAProjectData
} from "../../apps/desktop-electron/src/shared/projectFile.js";
import { buildFunctionalPlatformerProject } from "../../apps/desktop-electron/src/shared/functionalPlatformerProject.js";

export interface PilotSource {
  author: string;
  collection: string;
  page: string;
  license: "CC0-1.0";
}

export interface PilotCase {
  id: "topdown-npc" | "platformer-actor" | "free-enemy";
  label: string;
  inputPath: string;
  actorId: string;
  roomName: string;
  spriteName: string;
  profile: "topdown" | "platformer" | "free";
  frameWidth: number;
  frameHeight: number;
  animationName: string;
  state: string;
  direction: string;
  source: PilotSource;
}

export interface PilotDefinition {
  schema: 1;
  cases: PilotCase[];
}

export interface MaterializedPilotProject {
  caseId: PilotCase["id"];
  projectPath: string;
  actorId: string;
  roomName: string;
}

interface MaterializePilotProjectsOptions {
  repositoryRoot: string;
  destination: string;
}

const kenney: Pick<PilotSource, "author" | "license"> = {
  author: "Kenney",
  license: "CC0-1.0"
};

export function buildPilotDefinition(repositoryRoot: string): PilotDefinition {
  const assetRoot = path.join(repositoryRoot, "tools/gba-sprite-prep/pilot/assets");
  return {
    schema: 1,
    cases: [
      {
        id: "topdown-npc",
        label: "NPC top-down",
        inputPath: path.join(assetRoot, "tiny-dungeon-npc.png"),
        actorId: "actor-pilot-npc",
        roomName: "porto_lumen",
        spriteName: "npc_exploradora.png",
        profile: "topdown",
        frameWidth: 16,
        frameHeight: 16,
        animationName: "idle_down",
        state: "idle",
        direction: "down",
        source: {
          ...kenney,
          collection: "Tiny Dungeon 1.0 — tile_0085.png",
          page: "https://kenney.nl/assets/tiny-dungeon"
        }
      },
      {
        id: "platformer-actor",
        label: "Player platformer",
        inputPath: path.join(assetRoot, "platformer-art-pixel-actor.png"),
        actorId: "actor-player",
        roomName: "stage_1",
        spriteName: "platformer_guardiao.png",
        profile: "platformer",
        frameWidth: 16,
        frameHeight: 32,
        animationName: "idle_right",
        state: "idle",
        direction: "right",
        source: {
          ...kenney,
          collection: "Platformer Art Pixel 1.0 — tile_0019.png",
          page: "https://kenney.nl/assets/platformer-art-pixel"
        }
      },
      {
        id: "free-enemy",
        label: "Guardiao metasprite em modo livre",
        inputPath: path.join(assetRoot, "platformer-art-pixel-actor.png"),
        actorId: "actor-pilot-enemy",
        roomName: "porto_lumen",
        spriteName: "inimigo_guardiao.png",
        profile: "free",
        frameWidth: 96,
        frameHeight: 64,
        animationName: "idle",
        state: "idle",
        direction: "none",
        source: {
          ...kenney,
          collection: "Platformer Art Pixel 1.0 — tile_0019.png",
          page: "https://kenney.nl/assets/platformer-art-pixel"
        }
      }
    ]
  };
}

function withPilotActor(
  data: GBAProjectData,
  actor: Record<string, unknown>
): GBAProjectData {
  const actors = Array.isArray(data.actors) ? data.actors : [];
  return { ...data, actors: [...actors, actor] };
}

async function writeProject(
  projectRoot: string,
  fileName: string,
  data: GBAProjectData,
  fixtureAssets: string
): Promise<string> {
  await mkdir(projectRoot, { recursive: true });
  await cp(fixtureAssets, path.join(projectRoot, "Assets"), { recursive: true, force: true });
  const projectPath = path.join(projectRoot, fileName);
  await writeFile(projectPath, serializeGBAProjectFile({
    data,
    summary: summarizeGBAProject(data)
  }), "utf8");
  return projectPath;
}

export async function materializePilotProjects(
  options: MaterializePilotProjectsOptions
): Promise<MaterializedPilotProject[]> {
  const fixtureProject = path.join(
    options.repositoryRoot,
    "apps/desktop-electron/default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
  );
  const fixtureAssets = path.join(options.repositoryRoot, "apps/desktop-electron/fixtures/Assets");
  const topdown = parseGBAProjectFile(await readFile(fixtureProject, "utf8")).data;
  const definition = buildPilotDefinition(options.repositoryRoot);
  const byId = new Map(definition.cases.map((entry) => [entry.id, entry]));
  const topdownNpc = byId.get("topdown-npc")!;
  const freeEnemy = byId.get("free-enemy")!;
  const platformer = byId.get("platformer-actor")!;

  const npcProject = withPilotActor(topdown, {
    id: topdownNpc.actorId,
    name: "Exploradora",
    roomName: topdownNpc.roomName,
    x: 12,
    y: 9,
    spriteSheet: "nara-topdown.png",
    animationName: "idle_down"
  });
  const enemyProject = withPilotActor(topdown, {
    id: freeEnemy.actorId,
    name: "Guardiao",
    roomName: freeEnemy.roomName,
    x: 18,
    y: 11,
    spriteSheet: "nara-topdown.png",
    animationName: "idle_down"
  });
  const platformerProject = buildFunctionalPlatformerProject();

  const projects: MaterializedPilotProject[] = [
    {
      caseId: topdownNpc.id,
      projectPath: await writeProject(
        path.join(options.destination, topdownNpc.id),
        "topdown-npc.gba-project",
        npcProject,
        fixtureAssets
      ),
      actorId: topdownNpc.actorId,
      roomName: topdownNpc.roomName
    },
    {
      caseId: platformer.id,
      projectPath: await writeProject(
        path.join(options.destination, platformer.id),
        "platformer-actor.gba-project",
        platformerProject,
        fixtureAssets
      ),
      actorId: platformer.actorId,
      roomName: platformer.roomName
    },
    {
      caseId: freeEnemy.id,
      projectPath: await writeProject(
        path.join(options.destination, freeEnemy.id),
        "free-enemy.gba-project",
        enemyProject,
        fixtureAssets
      ),
      actorId: freeEnemy.actorId,
      roomName: freeEnemy.roomName
    }
  ];

  return projects;
}
