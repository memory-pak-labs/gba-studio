import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { cfbTarget, packageHelperArchitectures } from "./prepare-cartridge-tools.mjs";
import { prunePackagedCartridgeTools } from "./after-pack-macos.mjs";
import recipe from "./cfb-support-source.json" with { type: "json" };

describe("cartridge helper packaging recipe", () => {
  it("pins the reviewed patch and all supported native targets", () => {
    const patch = readFileSync(new URL("../../../tools/cartridge-writer/cfb-stm.patch", import.meta.url));
    expect(createHash("sha256").update(patch).digest("hex")).toBe(recipe.patchSha256);
    expect(cfbTarget("darwin", "arm64")).toBe("aarch64-apple-darwin");
    expect(cfbTarget("darwin", "x64")).toBe("x86_64-apple-darwin");
    expect(cfbTarget("win32", "x64")).toBe("x86_64-pc-windows-msvc");
    expect(cfbTarget("linux", "x64")).toBe("x86_64-unknown-linux-gnu");
    expect(() => cfbTarget("linux", "arm64")).toThrow();
  });
  it("prepares the selected helper for each Mac package and both for Universal", () => {
    expect(packageHelperArchitectures("darwin", "arm64")).toEqual(["arm64"]);
    expect(packageHelperArchitectures("darwin", "x64")).toEqual(["x64"]);
    expect(packageHelperArchitectures("darwin", "universal")).toEqual(["arm64", "x64"]);
    expect(packageHelperArchitectures("darwin", "arm64", "/release/mac-universal-arm64-temp")).toEqual(["arm64", "x64"]);
    expect(packageHelperArchitectures("darwin", "x64", "/release/mac-universal-x64-temp")).toEqual(["arm64", "x64"]);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    for (const name of ["predev", "prepreview", "predev:real-project"]) expect(pkg.scripts[name]).toBe("npm run prepare:cartridge-tools");
    expect(pkg.build.beforePack).toBe("./scripts/before-pack-cartridge-tools.mjs");
    for (const [platform, filter] of [["mac", "darwin-*/**"], ["win", "win32-x64/**"], ["linux", "linux-x64/**"]]) {
      expect(pkg.build[platform].extraResources).toContainEqual({ from: "build/cartridge-tools", to: "cartridge-tools", filter: [filter] });
    }
  });
  it("removes only the other architecture from a generated single-architecture bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "gba-packaged-helpers-"));
    const app = join(root, "GBA Studio.app");
    const tools = join(app, "Contents/Resources/cartridge-tools");
    for (const arch of ["arm64", "x64"]) {
      await mkdir(join(tools, `darwin-${arch}`), { recursive: true });
      await writeFile(join(tools, `darwin-${arch}`, "cfb"), arch);
    }
    await prunePackagedCartridgeTools(app, "universal");
    await access(join(tools, "darwin-x64", "cfb"));
    await prunePackagedCartridgeTools(app, "arm64", "/release/mac-universal-arm64-temp");
    await access(join(tools, "darwin-arm64", "cfb"));
    await access(join(tools, "darwin-x64", "cfb"));
    await prunePackagedCartridgeTools(app, "arm64");
    await access(join(tools, "darwin-arm64", "cfb"));
    await expect(access(join(tools, "darwin-x64", "cfb"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(prunePackagedCartridgeTools(app, "unexpected")).rejects.toThrow();
  });
});
