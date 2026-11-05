import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyFilesIntoProjectAssets, copyReferenceImageIntoProjectAssets, reimportFileIntoProjectAsset } from "./importAssets.js";

import { encodeRgbaPng } from "./gifAnimationImport.js";
import { openProjectFile, saveProjectFileAtomically } from "./projectPersistence.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { commitProjectAssetReplacement, markProjectSessionSaved, restoreProjectSessionHistory } from "../renderer/projectSession.js";

const testPng = (red: number) => encodeRgbaPng(1, 1, Uint8Array.of(red, 0, 0, 255));

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

  it("keeps both physical versions and follows undo, redo, save, reopen and Save As", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-electron-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-electron-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(sourceRoot, "hero-updated.png");
    const relativePath = "Assets/sprites/hero.png";
    await mkdir(path.dirname(path.join(projectRoot, relativePath)), { recursive: true });
    const oldPixels = testPng(0);
    const newPixels = testPng(255);
    await writeFile(path.join(projectRoot, relativePath), oldPixels);
    await writeFile(sourcePath, newPixels);
    const data = {
      name: "Demo", assets: [{ id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: relativePath } }],
      animations: [{ name: "idle", spriteSheet: "hero.png" }]
    };
    const project = { data, summary: summarizeGBAProject(data) };
    await saveProjectFileAtomically(projectPath, project);

    const replacement = await reimportFileIntoProjectAsset(projectPath, sourcePath, relativePath, () => "replacement");
    expect(replacement.relativePath).not.toBe(relativePath);
    await expect(readFile(path.join(projectRoot, relativePath))).resolves.toEqual(oldPixels);
    await expect(readFile(path.join(projectRoot, replacement.relativePath))).resolves.toEqual(newPixels);
    const stillSaved = await openProjectFile(projectPath);
    expect(stillSaved.project?.data).toMatchObject({ assets: [{ metadata: { source: relativePath } }] });

    const initial = markProjectSessionSaved({ identity: {}, project, path: projectPath, dirty: false, undoStack: [], redoStack: [] }, projectPath, data);
    const applied = commitProjectAssetReplacement(initial, initial, projectPath, "hero", relativePath, replacement)!;
    expect(applied.project.data).toMatchObject({ assets: [{ id: "hero", name: "hero.png", metadata: { source: replacement.relativePath } }] });
    expect(applied.project.data.animations).toEqual(data.animations);
    const undone = restoreProjectSessionHistory(applied, "undo");
    expect(undone.dirty).toBe(false);
    expect(undone.project.data).toMatchObject({ assets: [{ metadata: { source: relativePath } }] });
    const redone = restoreProjectSessionHistory(undone, "redo");
    expect(redone.dirty).toBe(true);
    await saveProjectFileAtomically(projectPath, redone.project);
    const reopened = await openProjectFile(projectPath);
    expect(reopened.project?.data).toMatchObject({ assets: [{ metadata: { source: replacement.relativePath } }] });

    const secondCopy = path.join(await makeTemporaryRoot("gbastudio-save-as-"), "Copy.gba-project");
    await saveProjectFileAtomically(secondCopy, redone.project, { sourceProjectPath: projectPath });
    await expect(readFile(path.join(path.dirname(secondCopy), replacement.relativePath))).resolves.toEqual(newPixels);
  });

  it("rejects an incompatible or invalid replacement before writing into the project", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-replacement-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-source-");
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(sourceRoot, "different.mp3");
    const invalidPngPath = path.join(sourceRoot, "invalid.png");
    const relativePath = "Assets/backgrounds/menu.png";
    const oldPixels = testPng(0);
    await mkdir(path.dirname(path.join(projectRoot, relativePath)), { recursive: true });
    await writeFile(path.join(projectRoot, relativePath), oldPixels);
    await writeFile(sourcePath, "ID3");
    await writeFile(invalidPngPath, testPng(255).subarray(0, 30));

    await expect(reimportFileIntoProjectAsset(projectPath, sourcePath, relativePath, () => "replacement")).rejects.toThrow(/formato/);
    await expect(reimportFileIntoProjectAsset(projectPath, invalidPngPath, relativePath, () => "replacement")).rejects.toThrow(/conteúdo/);
    await expect(readFile(path.join(projectRoot, relativePath))).resolves.toEqual(oldPixels);
    await expect(readdir(path.join(projectRoot, "Assets"))).resolves.toEqual(["backgrounds"]);
  });

  it("keeps the previous audio and rejects a different file masquerading as WAV", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-wav-project-");
    const sourceRoot = await makeTemporaryRoot("gbastudio-wav-source-");
    const relativePath = "Assets/audio/menu-navegar-v1.wav";
    const projectPath = path.join(projectRoot, "Demo.gba-project");
    const sourcePath = path.join(process.cwd(), "default-assets/templates/exemplo-gba/Assets/audio/menu-confirmar-v1.wav");
    const original = await readFile(path.join(process.cwd(), "default-assets/templates/exemplo-gba", relativePath));
    const target = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, original);
    const fakeWav = path.join(sourceRoot, "broken.wav");
    await writeFile(fakeWav, "Not a WAV");

    await expect(reimportFileIntoProjectAsset(projectPath, fakeWav, relativePath, () => "invalid")).rejects.toThrow(/conteúdo/);
    const replacement = await reimportFileIntoProjectAsset(projectPath, sourcePath, relativePath, () => "wav");
    expect(replacement).toMatchObject({ name: "menu-navegar-v1.wav", kind: "SFX" });
    await expect(readFile(target)).resolves.toEqual(original);
    await expect(readFile(path.join(projectRoot, replacement.relativePath))).resolves.toEqual(await readFile(sourcePath));
  });

  it("rejects writing replacements outside the project through a linked Assets folder", async () => {
    const projectRoot = await makeTemporaryRoot("gbastudio-replacement-");
    const otherRoot = await makeTemporaryRoot("gbastudio-outside-");
    const sourcePath = path.join(otherRoot, "updated.png");
    await writeFile(sourcePath, testPng(255));
    await symlink(otherRoot, path.join(projectRoot, "Assets"), "junction");

    await expect(reimportFileIntoProjectAsset(path.join(projectRoot, "Demo.gba-project"), sourcePath, "Assets/menu.png", () => "replacement")).rejects.toThrow(/pasta do projeto/);
    await expect(readdir(otherRoot)).resolves.toEqual(["updated.png"]);
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
