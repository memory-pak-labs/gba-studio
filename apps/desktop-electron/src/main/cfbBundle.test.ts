import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import source from "../../scripts/cfb-support-source.json" with { type: "json" };
import { loadCfbBundle, cartridgeToolsRoot } from "./cfbBundle.js";
import { ManagedCfbTool, sha256 } from "./cfbTool.js";

export async function bundleFixture() {
  const root = await mkdtemp(join(tmpdir(), "gba-cfb-bundle-"));
  const directory = join(root, `${process.platform}-${process.arch}`);
  await mkdir(directory);
  const name = process.platform === "win32" ? "cfb.exe" : "cfb";
  const bytes = Buffer.from(`#!${process.execPath}\nprocess.stdout.write(JSON.stringify({type:'fixture',args:process.argv.slice(2)})+'\\n');`);
  const files = { [name]: bytes, "COPYING": Buffer.from("GPL-3.0-only fixture"), "corresponding-source.tar.gz": Buffer.from("source fixture") };
  const manifest = { schemaVersion: 1, version: source.version, sourceCommit: source.commit, patchSha256: source.patchSha256, platform: process.platform, arch: process.arch, files: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, { bytes: value.length, sha256: sha256(value) }])) };
  for (const [key, value] of Object.entries(files)) await writeFile(join(directory, key), value, { mode: 0o700 });
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  return { root, directory, name, manifest, bytes };
}

describe("bundled cartridge helper", () => {
  it.skipIf(process.platform === "win32")("runs offline with the matching firmware and blocks tampered resources without falling back", async () => {
    const f = await bundleFixture(); const download = vi.fn();
    const tool = new ManagedCfbTool(join(f.root, "user-data"), process.platform, process.arch, download, f.root);
    expect(await tool.status()).toMatchObject({ installed: true, version: source.version });
    expect(await tool.run(["info"])).toEqual([{ type: "fixture", args: ["--json", "--lang", "en", "--no-power-control", "info"] }]);
    expect(await tool.run(["info"], undefined, "stc8")).toEqual([{ type: "fixture", args: ["--json", "--lang", "en", "info"] }]);
    await writeFile(join(f.directory, f.name), "tampered");
    await expect(tool.run(["burn", "--rom", "game.gba"])).rejects.toThrow(/Checksum/);
    expect(await tool.install()).toMatchObject({ installed: false });
    expect(download).not.toHaveBeenCalled();
  });
  it("resolves development and installed resources without environment overrides", () => {
    expect(cartridgeToolsRoot(false, "/app", "/resources")).toBe(join("/app", "build", "cartridge-tools"));
    expect(cartridgeToolsRoot(true, "/app.asar", "/resources")).toBe(join("/resources", "cartridge-tools"));
  });
  it("accepts only the matching recipe, platform, executable, license and corresponding source", async () => {
    const f = await bundleFixture();
    expect(await loadCfbBundle(f.root, process.platform, process.arch)).toMatchObject({ executable: join(f.directory, f.name), version: source.version });
    await writeFile(join(f.directory, "manifest.json"), JSON.stringify({ ...f.manifest, sourceCommit: "other" }));
    await expect(loadCfbBundle(f.root, process.platform, process.arch)).rejects.toThrow(/manifesto/i);
  });
  it.each(["cfb", "COPYING", "corresponding-source.tar.gz"])("fails closed on a changed %s", async file => {
    const f = await bundleFixture();
    await writeFile(join(f.directory, file === "cfb" ? f.name : file), "changed");
    await expect(loadCfbBundle(f.root, process.platform, process.arch)).rejects.toThrow(/Checksum/);
  });
});
