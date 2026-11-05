import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyFilesIntoProjectAssets, copyReferenceImageIntoProjectAssets, reimportFileIntoProjectAsset } from "./importAssets.js";

const temporaryRoots: string[] = [];

async function makeTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("asset import filesystem integration", () => {
  it("copies selected files into their project asset category folder", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-electron-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-electron-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(sourceRoot, "hero.png");
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(sourcePath, "image", "utf8");

    const result = await copyFilesIntoProjectAssets(projectPath, [sourcePath], () => "asset-1");

    expect(result).toEqual([
      {
        id: "asset-1",
        name: "hero.png",
        relativePath: "Assets/sprites/hero.png",
        kind: "Sprite",
        systemImage: "photo"
      }
    ]);
    await expect(readFile(path.join(projectRoot, "Assets", "sprites", "hero.png"), "utf8")).resolves.toBe("image");
  });

  it("routes imported assets by kind into physical project folders", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-electron-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-electron-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePaths = [
      path.join(sourceRoot, "sprites", "hero.png"),
      path.join(sourceRoot, "tilesets", "village.png"),
      path.join(sourceRoot, "ui", "dialogue_box.png"),
      path.join(sourceRoot, "emotes", "Smile.png"),
      path.join(sourceRoot, "music", "theme.mod"),
      path.join(sourceRoot, "sfx", "confirm.wav")
    ];
    await writeFile(projectPath, "{}", "utf8");
    for (const sourcePath of sourcePaths) {
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, path.basename(sourcePath), "utf8");
    }

    let nextID = 1;
    const result = await copyFilesIntoProjectAssets(projectPath, sourcePaths, () => `asset-${nextID++}`);

    expect(result).toEqual([
      { id: "asset-1", name: "hero.png", relativePath: "Assets/sprites/hero.png", kind: "Sprite", systemImage: "photo" },
      { id: "asset-2", name: "village.png", relativePath: "Assets/tilesets/village.png", kind: "Tileset", systemImage: "photo" },
      { id: "asset-3", name: "dialogue_box.png", relativePath: "Assets/ui/dialogue_box.png", kind: "UI", systemImage: "photo" },
      { id: "asset-4", name: "Smile.png", relativePath: "Assets/emotes/Smile.png", kind: "Emote", systemImage: "photo" },
      { id: "asset-5", name: "theme.mod", relativePath: "Assets/music/theme.mod", kind: "Musica", systemImage: "music.note" },
      { id: "asset-6", name: "confirm.wav", relativePath: "Assets/sfx/confirm.wav", kind: "SFX", systemImage: "music.note" }
    ]);
    for (const asset of result) {
      await expect(readFile(path.join(projectRoot, asset.relativePath), "utf8")).resolves.toBe(asset.name);
    }
  });

  it("forces tileset kind when requested", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-electron-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-electron-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(sourceRoot, "hero.png");
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(sourcePath, "image", "utf8");

    const result = await copyFilesIntoProjectAssets(projectPath, [sourcePath], () => "asset-1", { forcedKind: "Tileset" });

    expect(result).toEqual([
      {
        id: "asset-1",
        name: "hero.png",
        relativePath: "Assets/tilesets/hero.png",
        kind: "Tileset",
        systemImage: "photo"
      }
    ]);
    await expect(readFile(path.join(projectRoot, "Assets", "tilesets", "hero.png"), "utf8")).resolves.toBe("image");
  });

  it("uses a numbered filename when the destination already exists", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-electron-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-electron-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(sourceRoot, "hero.png");
    await mkdir(path.join(projectRoot, "Assets", "sprites"), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(path.join(projectRoot, "Assets", "sprites", "hero.png"), "existing", "utf8");
    await writeFile(sourcePath, "new", "utf8");

    const result = await copyFilesIntoProjectAssets(projectPath, [sourcePath], () => "asset-2");

    expect(result[0]).toMatchObject({
      id: "asset-2",
      name: "hero 2.png",
      relativePath: "Assets/sprites/hero 2.png"
    });
    await expect(readFile(path.join(projectRoot, "Assets", "sprites", "hero.png"), "utf8")).resolves.toBe("existing");
    await expect(readFile(path.join(projectRoot, "Assets", "sprites", "hero 2.png"), "utf8")).resolves.toBe("new");
  });

  it("reimports over the existing physical asset without creating a duplicate", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-electron-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-electron-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(sourceRoot, "hero-updated.png");
    const relativePath = "Assets/sprites/hero.png";
    await mkdir(path.join(projectRoot, "Assets", "sprites"), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(path.join(projectRoot, relativePath), "old", "utf8");
    await writeFile(sourcePath, "updated", "utf8");

    const result = await reimportFileIntoProjectAsset(projectPath, sourcePath, relativePath, () => "replacement");

    expect(result).toMatchObject({ name: "hero.png", relativePath, kind: "Sprite" });
    await expect(readFile(path.join(projectRoot, relativePath), "utf8")).resolves.toBe("updated");
  });

  it("keeps backgrounds in their category when importing and replacing a PNG", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-background-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-background-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(sourceRoot, "backgrounds", "menu.png");
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "new-background", "utf8");
    const imported = await copyFilesIntoProjectAssets(projectPath, [sourcePath], () => "background");
    expect(imported[0]).toMatchObject({ kind: "Background", relativePath: "Assets/backgrounds/menu.png" });
    const replaced = await reimportFileIntoProjectAsset(projectPath, sourcePath, "Assets/backgrounds/menu.png", () => "replacement");
    expect(replaced.kind).toBe("Background");
    await expect(readFile(path.join(projectRoot, replaced.relativePath), "utf8")).resolves.toBe("new-background");
  });

  it("copies a project reference image into Assets using the requested sprite file name", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-electron-project-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const referencePath = path.join(projectRoot, "References", "hero_reference.png");
    await mkdir(path.dirname(referencePath), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(referencePath, "reference-image", "utf8");

    const result = await copyReferenceImageIntoProjectAssets({
      projectPath,
      referenceAssetName: "References/hero_reference.png",
      spriteSheetName: "hero.png"
    });

    expect(result).toEqual({
      name: "hero.png",
      relativePath: "Assets/sprites/hero.png"
    });
    await expect(readFile(path.join(projectRoot, "Assets", "sprites", "hero.png"), "utf8")).resolves.toBe("reference-image");
  });
});


describe("SoundFont project import", () => {
  it("converts SF2 into portable samples and a persistent instrument bank", async () => {
    const { soundFontFixture } = await import("../testFixtures/soundFont.js");
    const { appendImportedAssetsToProject } = await import("../shared/filesWorkspace.js");
    const { createBlankProjectData } = await import("../shared/newProject.js");
    const { splitProjectResources, joinSplitProjectResources } = await import("../shared/projectResourceFormat.js");
    const root = await makeTemporaryRoot("sf2-import-");
    const source = path.join(root, "bank.sf2"); await writeFile(source, soundFontFixture({ loop: true }));
    const imported = await copyFilesIntoProjectAssets(path.join(root, "Game.gba-project"), [source], () => "sample-a");
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ kind: "Audio", metadata: { soundFontInstrument: { sampleRootNote: "C4", sampleLoop: true } } });
    const wav = await readFile(path.join(root, imported[0].relativePath)); expect(wav.includes(Buffer.from("smpl"))).toBe(true);
    const data = appendImportedAssetsToProject(createBlankProjectData({ name: "SF2" }), imported);
    expect(data.audioInstruments).toEqual([expect.objectContaining({ id: "sf2-sample-a", sampleAssetID: "sample-a", sampleRootNote: "C4", sampleLoop: true })]);
    expect(data.audioItems).toEqual([]);
    const split = splitProjectResources(data);
    expect(joinSplitProjectResources(split.manifest, split.resources).audioInstruments).toEqual(data.audioInstruments);
  });
});
