import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import recipe from "./cfb-support-source.json" with { type: "json" };
import signForElectronBuilder from "./sign-cartridge-tools.mjs";
import { afterPack } from "./after-pack-macos.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
describe("cartridge helper signing", () => {
  it("records Windows copy-time signing and rejects changed license/source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "gba-cfb-win-sign-"));
    const tools = join(root, "resources/cartridge-tools/win32-x64");
    await mkdir(tools, { recursive: true });
    const files = {};
    for (const name of ["cfb.exe", "COPYING", "corresponding-source.tar.gz"]) {
      const bytes = Buffer.from(name); await writeFile(join(tools, name), bytes);
      files[name] = { bytes: bytes.length, sha256: hash(bytes) };
    }
    await writeFile(join(tools, "manifest.json"), JSON.stringify({ schemaVersion: 1, version: recipe.version, sourceCommit: recipe.commit, patchSha256: recipe.patchSha256, platform: "win32", arch: "x64", files }));
    const signed = Buffer.from("executable after normal signing");
    await writeFile(join(tools, "cfb.exe"), signed);
    await afterPack({ appOutDir: root, electronPlatformName: "win32" });
    const updated = JSON.parse(await readFile(join(tools, "manifest.json"), "utf8"));
    expect(updated.files['cfb.exe']).toEqual({ bytes: signed.length, sha256: hash(signed) });
    await writeFile(join(tools, "COPYING"), "changed license");
    await expect(afterPack({ appOutDir: root, electronPlatformName: "win32" })).rejects.toThrow(/fontes\/licença/);
  });
  it.skipIf(process.platform !== "darwin")("preserves real nested signatures and refreshes the signed executable checksum before sealing the app", async () => {
    const root = await mkdtemp(join(tmpdir(), "gba-cfb-sign-"));
    const app = join(root, "Fixture.app");
    const bin = join(app, "Contents/MacOS");
    const tools = join(app, "Contents/Resources/cartridge-tools", `darwin-${process.arch}`);
    await mkdir(bin, { recursive: true }); await mkdir(tools, { recursive: true });
    await writeFile(join(root, "fixture.c"), "int main(void) { return 0; }\n");
    execFileSync("clang", [join(root, "fixture.c"), "-o", join(bin, "fixture")]);
    await copyFile(join(bin, "fixture"), join(tools, "cfb"));
    await writeFile(join(app, "Contents/Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>br.com.gbastudio.cfb-sign-test</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleVersion</key><string>1</string></dict></plist>');
    await writeFile(join(tools, "COPYING"), "license fixture");
    await writeFile(join(tools, "corresponding-source.tar.gz"), "source fixture");
    const files = {};
    for (const name of ["cfb", "COPYING", "corresponding-source.tar.gz"]) { const b = await readFile(join(tools, name)); files[name] = { bytes: b.length, sha256: hash(b) }; }
    const manifest = { schemaVersion: 1, version: recipe.version, sourceCommit: recipe.commit, patchSha256: recipe.patchSha256, platform: "darwin", arch: process.arch, files };
    await writeFile(join(tools, "manifest.json"), JSON.stringify(manifest));
    // electron-builder passes its packager object as the second argument.
    await signForElectronBuilder({ app, identity: "-", identityValidation: false, platform: "darwin", preAutoEntitlements: false, preEmbedProvisioningProfile: false, strictVerify: true, optionsForFile: () => ({ entitlements: [], hardenedRuntime: true, timestamp: "none" }) }, { appInfo: { productName: "Fixture" } });
    const signed = await readFile(join(tools, "cfb"));
    const updated = JSON.parse(await readFile(join(tools, "manifest.json"), "utf8"));
    expect(updated.files.cfb).toEqual({ bytes: signed.length, sha256: hash(signed) });
    expect(updated.files.cfb.sha256).not.toBe(files.cfb.sha256);
    expect(updated.files.COPYING).toEqual(files.COPYING);
    execFileSync("codesign", ["--verify", "--deep", "--strict", app]);
    execFileSync(join(tools, "cfb"));
  });
});
