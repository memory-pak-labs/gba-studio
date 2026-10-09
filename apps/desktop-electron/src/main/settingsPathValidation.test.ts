import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateSettingsPathTargets } from "./settingsPathValidation.js";

it("validates a project-relative output destination without creating it", async () => {
  const root = await makeTemporaryRoot("gbastudio-settings-output-");
  const destination = path.join(root, "new", "build");
  const result = await validateSettingsPathTargets([{ id: "general.exportFolder", label: "Export", path: "new/build", validationPath: destination, mode: "directory", allowCreate: true }]);
  expect(result.items[0]).toMatchObject({ ok: true, exists: false, creatable: true, resolvedPath: destination });
  await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  const missing = await validateSettingsPathTargets([{ id: "build.enginePackPath", label: "Pack", path: destination, mode: "directory" }]);
  expect(missing.items[0]).toMatchObject({ ok: false, exists: false });
});

const temporaryRoots: string[] = [];

async function makeTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("settings path validation", () => {
  it("validates directory and file targets", async () => {
    const root = await makeTemporaryRoot("gbastudio-settings-paths-");
    const exportPath = path.join(root, "build");
    const emulatorPath = path.join(root, "mgba");
    await mkdir(exportPath);
    await writeFile(emulatorPath, "emulator", "utf8");

    const result = await validateSettingsPathTargets([
      { id: "general.exportFolder", label: "Export", path: exportPath, mode: "directory" },
      { id: "preview.emulatorPath", label: "Emulador path", path: emulatorPath, mode: "file" }
    ]);

    expect(result).toEqual({
      ok: true,
      items: [
        {
          id: "general.exportFolder",
          label: "Export",
          path: exportPath,
          mode: "directory",
          kind: "directory",
          exists: true,
          ok: true,
          missingTools: [],
          missingFiles: []
        },
        {
          id: "preview.emulatorPath",
          label: "Emulador path",
          path: emulatorPath,
          mode: "file",
          kind: "file",
          exists: true,
          ok: true,
          missingTools: [],
          missingFiles: []
        }
      ]
    });
  });

  it("reports missing paths, wrong target kinds and incomplete Engine Pack structure", async () => {
    const root = await makeTemporaryRoot("gbastudio-settings-paths-");
    const enginePackPath = path.join(root, "GBAStudioEnginePack");
    const toolsPath = path.join(enginePackPath, "tools");
    const wrongDirectory = path.join(root, "emulator-as-folder");
    const wrongFile = path.join(root, "export-as-file");
    await mkdir(toolsPath, { recursive: true });
    await writeFile(path.join(toolsPath, process.platform === "win32" ? "gbsdoctor.exe" : "gbsdoctor"), "doctor", "utf8");
    await mkdir(wrongDirectory);
    await writeFile(wrongFile, "not a directory", "utf8");

    const result = await validateSettingsPathTargets([
      {
        id: "build.enginePackPath",
        label: "Engine Pack",
        path: enginePackPath,
        mode: "directory",
        expectedTools: ["assetc", "gbsdoctor", "gbsbuild"],
        expectedFiles: ["enginepack.json", "schemas/gbastudio_project.schema.json", "templates/Makefile.gba", "lib/libgbastudio_engine.a"]
      },
      { id: "build.compilerPath", label: "Compiler", path: path.join(root, "missing"), mode: "directory" },
      { id: "general.exportFolder", label: "Export", path: wrongFile, mode: "directory" },
      { id: "preview.emulatorPath", label: "Emulador path", path: wrongDirectory, mode: "file" }
    ]);

    expect(result.ok).toBe(false);
    expect(result.items).toMatchObject([
      {
        id: "build.enginePackPath",
        kind: "directory",
        exists: true,
        ok: false,
        missingTools: ["assetc", "gbsbuild"],
        missingFiles: ["enginepack.json", "schemas/gbastudio_project.schema.json", "templates/Makefile.gba", "lib/libgbastudio_engine.a"]
      },
      {
        id: "build.compilerPath",
        kind: "missing",
        exists: false,
        ok: false,
        missingTools: [],
        missingFiles: []
      },
      {
        id: "general.exportFolder",
        kind: "file",
        exists: true,
        ok: false,
        missingTools: [],
        missingFiles: []
      },
      {
        id: "preview.emulatorPath",
        kind: "directory",
        exists: true,
        ok: false,
        missingTools: [],
        missingFiles: []
      }
    ]);
  });

  it("validates an explicitly detected fallback while preserving the configured path", async () => {
    const root = await makeTemporaryRoot("gbastudio-settings-fallback-");
    const configuredPath = path.join(root, "GBAStudioEnginePack");
    const detectedPath = path.join(root, "detected", "GBAStudioEnginePack");
    await mkdir(path.join(detectedPath, "tools"), { recursive: true });
    await mkdir(path.join(detectedPath, "schemas"), { recursive: true });
    await mkdir(path.join(detectedPath, "templates"), { recursive: true });
    await mkdir(path.join(detectedPath, "lib"), { recursive: true });
    for (const tool of ["assetc", "gbsdoctor", "gbsbuild"]) {
      await writeFile(path.join(detectedPath, "tools", tool), tool, "utf8");
    }
    for (const relativePath of [
      "enginepack.json",
      "schemas/gbastudio_project.schema.json",
      "templates/Makefile.gba",
      "lib/libgbastudio_engine.a"
    ]) {
      await writeFile(path.join(detectedPath, relativePath), relativePath, "utf8");
    }

    const result = await validateSettingsPathTargets([{
      id: "build.enginePackPath",
      label: "Engine Pack",
      path: configuredPath,
      validationPath: detectedPath,
      mode: "directory",
      expectedTools: ["assetc", "gbsdoctor", "gbsbuild"],
      expectedFiles: ["enginepack.json", "schemas/gbastudio_project.schema.json", "templates/Makefile.gba", "lib/libgbastudio_engine.a"]
    }]);

    expect(result).toEqual({
      ok: true,
      items: [{
        id: "build.enginePackPath",
        label: "Engine Pack",
        path: configuredPath,
        resolvedPath: detectedPath,
        mode: "directory",
        kind: "directory",
        exists: true,
        ok: true,
        missingTools: [],
        missingFiles: []
      }]
    });
  });
});
