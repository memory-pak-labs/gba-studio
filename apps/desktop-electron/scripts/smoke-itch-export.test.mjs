import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateItchExportPackage } from "./smoke-itch-export.mjs";

const temporaryRoots = [];

async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-itch-export-test-"));
  temporaryRoots.push(root);
  return root;
}

async function writePackageFile(root, relativePath, contents = "") {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function writeValidPackage(root) {
  await writePackageFile(root, "index.html", '<div id="game"></div><script src="player/gbastudio-player.js"></script>');
  await writePackageFile(root, ".itch.toml", 'kind = "html"\nindex_files = ["index.html"]\n');
  await writePackageFile(root, "manifest.json", JSON.stringify({
    distribution: { adapter: "mgba-wasm-direct" },
    licenses: { mgba: "licenses/mGBA-MPL-2.0.txt" }
  }));
  await writePackageFile(root, "README.md", "itch package");
  await writePackageFile(root, "roms/electron_p0_functional.gba", "rom");
  await writePackageFile(root, "player/gbastudio-player.js", "window.GBAStudioPlayer = {};");
  await writePackageFile(root, "player/gbastudio-player.css", "body{}");
  await writePackageFile(root, "player/runtime.html", '<script type="module" src="./mgba-direct-player.mjs"></script>');
  await writePackageFile(root, "player/mgba-direct-player.mjs", "export function startMGBAPlayer() {}");
  await writePackageFile(root, "player/mgba-core.mjs", "export default function createMGBA() {}");
  await writePackageFile(root, "player/mgba-core.wasm", Buffer.alloc(2048, 1));
  await writePackageFile(root, "player/mgba-core.manifest.json", "{}");
  await writePackageFile(root, "licenses/mGBA-MPL-2.0.txt", "MPL-2.0");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("smoke itch export validator", () => {
  it("accepts a direct mGBA-WASM static itch.io package", async () => {
    const root = await temporaryRoot();
    await writeValidPackage(root);

    const result = await validateItchExportPackage(root);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.romBytes).toBeGreaterThan(0);
    expect(result.wasmBytes).toBeGreaterThan(1024);
  });

  it("rejects legacy EmulatorJS artifacts and CDN text", async () => {
    const root = await temporaryRoot();
    await writeValidPackage(root);
    await writePackageFile(root, "player/loader.js", "EmulatorJS loader");
    await writePackageFile(root, "player/gbastudio-player.js", "https://cdn.example.invalid/emulator.min.js");

    const result = await validateItchExportPackage(root);

    expect(result.ok).toBe(false);
    expect(result.forbiddenPresent).toContain("player/loader.js");
    expect(result.forbiddenTextPresent).toContain("emulator.min.js");
    expect(result.forbiddenTextPresent).toContain("https://cdn");
  });
});
