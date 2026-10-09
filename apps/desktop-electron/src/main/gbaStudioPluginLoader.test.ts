import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { installPluginFromRepositoryEntry, installPluginIntoProject, loadProjectPlugins, writePluginFixture } from "./gbaStudioPluginLoader.js";
import { createBlankProjectData } from "../shared/newProject.js";
import { serializeGBAProjectFile } from "../shared/projectFile.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeProjectRoot(): Promise<{ projectRoot: string; projectPath: string }> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gba-plugin-project-"));
  tempDirs.push(projectRoot);
  const projectPath = path.join(projectRoot, "demo.gba-project");
  await writeFile(projectPath, serializeGBAProjectFile({
    data: createBlankProjectData({ name: "Demo" }),
    summary: { schemaVersion: 1, name: "Demo", rooms: 1, assets: 0 }
  }), "utf8");
  return { projectRoot, projectPath };
}

describe("gbaStudioPluginLoader", () => {
  it("finishes installing a downloaded native ZIP before cleaning the temporary archive", async () => {
    const { projectPath } = await makeProjectRoot();
    // Stored ZIP containing only the temporary recipePack's plugin.json.
    const archive = Buffer.from("UEsDBBQAAAAAAPCoQl3J1QPYWAEAAFgBAAALAAAAcGx1Z2luLmpzb257ImlkIjogInRlc3QvbmF0aXZlIiwgInR5cGUiOiAicmVjaXBlUGFjayIsICJ2ZXJzaW9uIjogIjEuMC4wIiwgInNka1ZlcnNpb24iOiAiMS4wLjAiLCAiZ2JhU3R1ZGlvVmVyc2lvbiI6ICI+PTAuMS4wIiwgIm5hbWUiOiAiTmF0aXZlIHRlc3Qgb25seSIsICJhdXRob3IiOiAiUUEiLCAiZGVzY3JpcHRpb24iOiAiVGVtcG9yYXJ5IGZpeHR1cmUiLCAicmVjaXBlcyI6IFt7ImlkIjogIndhaXQiLCAidGl0bGUiOiAiV2FpdCIsICJjYXRlZ29yeSI6ICJDb250cm9sZSIsICJzdGVwcyI6IFt7ImNvbW1hbmQiOiAid2FpdCAxMiIsICJjYXRlZ29yeSI6ICJDb250cm9sZSIsICJkZXRhaWwiOiAiV2FpdCJ9XX1dfVBLAQIUAxQAAAAAAPCoQl3J1QPYWAEAAFgBAAALAAAAAAAAAAAAAACAAQAAAABwbHVnaW4uanNvblBLBQYAAAAAAQABADkAAACBAQAAAAA=", "base64");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(Uint8Array.from(archive)));
    const result = await installPluginFromRepositoryEntry(projectPath, "https://example.com/repository.json", { id: "test/native", type: "recipePack", version: "1.0.0", gbaStudioVersion: ">=0.1.0", name: "Native test only", author: "QA", description: "Temporary fixture", filename: "native.zip" });
    expect(result.ok).toBe(true);
    expect(result.registry?.recipes).toEqual([expect.objectContaining({ id: "test/native/wait" })]);
  });

  it("rejects a foreign catalog entry before downloading, even when called directly", async () => {
    const { projectPath } = await makeProjectRoot();
    const download = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network"));
    const result = await installPluginFromRepositoryEntry(projectPath, "https://example.com/repository.json", { id: "acme/demo", type: "eventsPlugin", name: "Demo", author: "Acme", description: "Demo", version: "1.0.0", filename: "demo.zip" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("GBA Studio") });
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a foreign local manifest without replacing an existing plugin", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "gba-foreign-plugin-")); tempDirs.push(sourceRoot);
    const destination = path.join(projectRoot, "plugins", "acme", "demo");
    await mkdir(destination, { recursive: true }); await writeFile(path.join(destination, "keep.txt"), "preserve");
    await writeFile(path.join(sourceRoot, "plugin.json"), JSON.stringify({ id: "acme/demo", type: "eventsPlugin", version: "1.0.0", gbaStudioVersion: ">=0.1.0", name: "Demo", author: "Acme", description: "Demo" }));
    const result = await installPluginIntoProject(projectPath, sourceRoot, { replacingExisting: true });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("GBA Studio") });
    expect(await readFile(path.join(destination, "keep.txt"), "utf8")).toBe("preserve");
  });

  it("carrega plugins da pasta plugins/ ao abrir projeto", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    await writePluginFixture(projectRoot, {
      id: "acme/custom-events",
      type: "eventCommandPack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Custom Events",
      author: "Acme",
      description: "Eventos customizados.",
      commands: [
        {
          id: "custom_wait",
          title: "Espera customizada",
          category: "Plugin",
          commandTemplate: "acme_wait {value}",
          export: {
            op: "wait",
            opcode: "Wait",
            arg0Token: 1
          }
        }
      ]
    });

    const registry = await loadProjectPlugins(projectPath);
    expect(registry.plugins).toHaveLength(1);
    expect(registry.commandVerbs.has("acme_wait")).toBe(true);
  });

  it("instala plugin por pasta em plugins/<id>", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "gba-plugin-source-"));
    tempDirs.push(sourceRoot);
    await writeFile(path.join(sourceRoot, "plugin.json"), JSON.stringify({
      id: "acme/dialogue-pack",
      type: "recipePack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Dialogue Pack",
      author: "Acme",
      description: "Receitas.",
      recipes: [
        {
          id: "quick_talk",
          title: "Quick Talk",
          category: "Dialogo",
          steps: [{ command: "wait 12", category: "Controle", detail: "Aguardar." }]
        }
      ]
    }, null, 2), "utf8");

    const installed = await installPluginIntoProject(projectPath, sourceRoot);
    expect(installed).toMatchObject({
      ok: true,
      pluginId: "acme/dialogue-pack"
    });
    expect(await readFile(path.join(projectRoot, "plugins", "acme", "dialogue-pack", "plugin.json"), "utf8")).toContain("quick_talk");
  });

  it("rejeita id de plugin com traversal sem remover caminho externo", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "gba-plugin-unsafe-id-"));
    tempDirs.push(sourceRoot);
    const outsidePath = path.join(projectRoot, "outside.txt");
    await writeFile(outsidePath, "preserve", "utf8");
    await writeFile(path.join(sourceRoot, "plugin.json"), JSON.stringify({
      id: "../outside",
      type: "recipePack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Unsafe Plugin",
      author: "Acme",
      description: "Plugin invalido."
    }, null, 2), "utf8");

    const installed = await installPluginIntoProject(projectPath, sourceRoot, { replacingExisting: true });

    expect(installed.ok).toBe(false);
    expect(installed.error).toContain("id");
    await expect(readFile(outsidePath, "utf8")).resolves.toBe("preserve");
  });

  it("compila verbo customizado no export engine quando plugin esta carregado", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    await writePluginFixture(projectRoot, {
      id: "acme/custom-events",
      type: "eventCommandPack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Custom Events",
      author: "Acme",
      description: "Eventos customizados.",
      commands: [
        {
          id: "custom_wait",
          title: "Espera customizada",
          category: "Plugin",
          commandTemplate: "acme_wait {value}",
          export: {
            op: "wait",
            opcode: "Wait",
            arg0Token: 1
          }
        }
      ]
    });

    const registry = await loadProjectPlugins(projectPath);
    const data = {
      ...createBlankProjectData({ name: "Demo" }),
      events: [
        {
          id: "event-1",
          name: "boot",
          category: "Cena",
          steps: [{ command: "acme_wait 18", isEnabled: true }]
        }
      ]
    };

    const contract = buildEngineExportProjectContract(data, { pluginRegistry: registry });
    expect(contract.topdown_project?.scripts?.[0]?.script).toEqual([{ op: "wait", frames: 18 }]);
  });

  it("carrega data tables de plugin dataTablePack", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    await writePluginFixture(projectRoot, {
      id: "acme/stats",
      type: "dataTablePack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Stats",
      author: "Acme",
      description: "Tabelas.",
      dataTables: [
        {
          id: "party",
          label: "Party",
          columns: [{ variable: "hp" }],
          rows: [{ label: "hero", values: [8] }]
        }
      ]
    });

    const registry = await loadProjectPlugins(projectPath);
    expect(registry.dataTables).toHaveLength(1);
    expect(registry.dataTables[0]?.symbol).toBe("party");
  });

  it("importa assets de assetPack na instalacao", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "gba-plugin-asset-source-"));
    tempDirs.push(sourceRoot);
    await writeFile(path.join(sourceRoot, "plugin.json"), JSON.stringify({
      id: "acme/sprites",
      type: "assetPack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Sprites",
      author: "Acme",
      description: "Sprites.",
    }, null, 2), "utf8");
    const assetsDir = path.join(sourceRoot, "assets", "sprites");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(path.join(assetsDir, "hero.png"), "png", "utf8");

    const installed = await installPluginIntoProject(projectPath, sourceRoot);
    expect(installed.ok).toBe(true);
    expect(installed.importedAssets?.length).toBe(1);
    expect(installed.importedAssets?.[0]?.relativePath).toContain("Assets/sprites/hero.png");
  });

  it("nao copia asset declarado para fora da raiz do plugin", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "gba-plugin-unsafe-asset-"));
    tempDirs.push(sourceRoot);
    const outsidePath = path.join(projectRoot, "secret.txt");
    await writeFile(outsidePath, "secret", "utf8");
    await writeFile(path.join(sourceRoot, "plugin.json"), JSON.stringify({
      id: "acme/malicious-assets",
      type: "assetPack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Malicious Assets",
      author: "Acme",
      description: "Asset source invalido.",
      assets: [{ source: "../../../secret.txt", kind: "Sprite" }]
    }, null, 2), "utf8");

    const installed = await installPluginIntoProject(projectPath, sourceRoot);

    expect(installed.ok).toBe(true);
    expect(installed.importedAssets).toEqual([]);
    expect(installed.registry?.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("caminho inseguro") })
    ]));
    await expect(readFile(outsidePath, "utf8")).resolves.toBe("secret");
    await expect(readFile(path.join(projectRoot, "Assets", "sprites", "secret.txt"), "utf8")).rejects.toThrow();
  });

  it("nao segue symlink de asset para fora da raiz do plugin", async () => {
    const { projectRoot, projectPath } = await makeProjectRoot();
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "gba-plugin-symlink-asset-"));
    tempDirs.push(sourceRoot);
    const outsidePath = path.join(projectRoot, "secret.txt");
    await writeFile(outsidePath, "secret", "utf8");
    const assetsDirectory = path.join(sourceRoot, "assets");
    await mkdir(assetsDirectory, { recursive: true });
    await symlink(outsidePath, path.join(assetsDirectory, "escape.txt"));
    await writeFile(path.join(sourceRoot, "plugin.json"), JSON.stringify({
      id: "acme/symlink-assets",
      type: "assetPack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Symlink Assets",
      author: "Acme",
      description: "Asset symlink invalido.",
      assets: [{ source: "assets/escape.txt", kind: "Sprite" }]
    }, null, 2), "utf8");

    const installed = await installPluginIntoProject(projectPath, sourceRoot);

    expect(installed.ok).toBe(true);
    expect(installed.importedAssets).toEqual([]);
    expect(installed.registry?.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("caminho inseguro") })
    ]));
    await expect(readFile(outsidePath, "utf8")).resolves.toBe("secret");
    await expect(readFile(path.join(projectRoot, "Assets", "sprites", "escape.txt"), "utf8")).rejects.toThrow();
  });
});
