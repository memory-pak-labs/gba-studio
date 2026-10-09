import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const packageJsonURL = new URL("../../package.json", import.meta.url);
const buildDirURL = new URL("../../build/", import.meta.url);
const projectRootURL = new URL("../../../../", import.meta.url);

async function sha256(url: URL): Promise<string> {
  return createHash("sha256").update(await readFile(url)).digest("hex");
}

describe("Electron package assets", () => {
  it("configures explicit app icons for macOS, Windows and Linux packaging", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonURL, "utf8")) as {
      scripts: Record<string, string>;
      build: {
        directories: { buildResources: string };
        icon: string;
        extraResources: Array<{ from: string; to: string; filter?: string[] }>;
        fileAssociations: Array<{ ext: string; name: string; description: string; icon: string }>;
        mac: { icon: string; extraResources: Array<{ from: string; to: string; filter?: string[] }> };
        win: { icon: string };
        linux: { icon: string };
      };
    };

    expect(packageJson.build.directories.buildResources).toBe("build");
    expect(packageJson.build.icon).toBe("build/icon");
    expect(packageJson.build.mac.icon).toBe("build/icon.icns");
    expect(packageJson.build.win.icon).toBe("build/icon.ico");
    expect(packageJson.build.linux.icon).toBe("build/icon.png");
    expect(packageJson.build.extraResources).toContainEqual(
      expect.objectContaining({ from: "static/WebPlayer", to: "WebPlayer" })
    );
    expect(packageJson.scripts["prepare:embedded-runtime"]).toBe("node scripts/prepare-embedded-runtime.mjs");
    expect(packageJson.scripts["prepare:embedded-runtime:compact"]).toContain("GBA_STUDIO_RUNTIME_PROFILE=compact");
    expect(packageJson.scripts["package:mac:compact"]).toContain("prepare:embedded-runtime:compact");
    expect(packageJson.scripts["package:mac:offline"]).toContain("prepare:embedded-runtime");
    for (const scriptName of ["package", "dist:mac"]) {
      expect(packageJson.scripts[scriptName]).toContain("npm run prepare:embedded-runtime");
    }
    expect(packageJson.build.mac.extraResources).toContainEqual(
      expect.objectContaining({ from: "build/embedded-runtime", to: "." })
    );
    expect(packageJson.build.extraResources.some((resource) => resource.from.includes("Sources/"))).toBe(false);
    expect(packageJson.build.fileAssociations).toContainEqual(
      expect.objectContaining({ ext: "gbastudio", icon: "build/file-gbastudio" })
    );
    expect(packageJson.build.fileAssociations).toContainEqual(
      expect.objectContaining({ ext: "gba-project", icon: "build/file-gbastudio" })
    );
    expect(packageJson.build.fileAssociations).toContainEqual(
      expect.objectContaining({
        ext: "gbsproj",
        name: "GB Studio Source Project",
        description: "GB Studio project imported into GBA Studio",
        icon: "build/file-gbastudio"
      })
    );
    expect(packageJson.build.fileAssociations).toContainEqual(
      expect.objectContaining({
        ext: "gba-project",
        name: "GBA Studio Project",
        description: "GBA Studio project file"
      })
    );
    expect(packageJson.build.fileAssociations).toContainEqual(
      expect.objectContaining({
        ext: "gbastudio",
        name: "GBA Studio Legacy Project",
        description: "GBA Studio legacy project file"
      })
    );

    expect(existsSync(new URL("icon.icns", buildDirURL))).toBe(true);
    expect(existsSync(new URL("icon.ico", buildDirURL))).toBe(true);
    expect(existsSync(new URL("icon.png", buildDirURL))).toBe(true);
    expect(existsSync(new URL("file-gbastudio.icns", buildDirURL))).toBe(true);
    expect(existsSync(new URL("file-gbastudio.ico", buildDirURL))).toBe(true);
    expect(existsSync(new URL("file-gbastudio.png", buildDirURL))).toBe(true);
  });

  it("keeps app and project document icons in sync with the canonical source images", async () => {
    const appIconSource = new URL("icon_gbastudio.png", projectRootURL);
    const documentIconSource = new URL("icon_arquivo_gbastudio.png", projectRootURL);

    expect(await sha256(new URL("icon.png", buildDirURL))).toBe(await sha256(appIconSource));
    expect(await sha256(new URL("file-gbastudio.png", buildDirURL))).toBe(await sha256(documentIconSource));
  });
});
