import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMcpProjectService } from "./mcpProjectService.js";

const temporaryRoots: string[] = [];

async function createProjectFixture({ mcpEnabled = true }: { mcpEnabled?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "gba-mcp-project-"));
  temporaryRoots.push(root);
  const projectPath = path.join(root, "mcp-demo.gba-project");
  const assetsDirectory = path.join(root, "Assets");
  const heroPath = path.join(assetsDirectory, "hero.png");
  const outsidePath = path.join(tmpdir(), `gba-mcp-outside-${Date.now()}.png`);
  const pngHeader = Buffer.alloc(32);
  pngHeader.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0);
  pngHeader.writeUInt32BE(13, 8);
  pngHeader.write("IHDR", 12, "ascii");
  pngHeader.writeUInt32BE(16, 16);
  pngHeader.writeUInt32BE(16, 20);

  await mkdir(assetsDirectory, { recursive: true });
  await writeFile(heroPath, pngHeader);
  await writeFile(outsidePath, pngHeader);
  await symlink(outsidePath, path.join(assetsDirectory, "outside-link.png"));
  await writeFile(projectPath, JSON.stringify({
    schemaVersion: 1,
    name: "Projeto MCP",
    settings: { mcp: { enabled: mcpEnabled } },
    scenas: [{ name: "inicio", width: 30, height: 20 }],
    assets: [
      { id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } },
      { id: "outside", name: "outside.png", kind: "Sprite", metadata: { source: "Assets/outside-link.png" } }
    ]
  }), "utf8");

  return { projectPath };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("McpProjectService", () => {
  it("does not expose project data while MCP is disabled", async () => {
    const { projectPath } = await createProjectFixture({ mcpEnabled: false });
    const service = await createMcpProjectService({ projectPath });

    await expect(service.projectSummary()).resolves.toEqual({
      ok: false,
      code: "MCP_DISABLED",
      message: "Ative o MCP local em Ajustes antes de conectar um cliente."
    });
  });

  it("returns the configured project summary and relative asset origins", async () => {
    const { projectPath } = await createProjectFixture();
    const service = await createMcpProjectService({ projectPath });

    await expect(service.projectSummary()).resolves.toEqual({
      ok: true,
      data: {
        projectPath,
        summary: { schemaVersion: 1, name: "Projeto MCP", rooms: 1, assets: 2 }
      }
    });
    await expect(service.listAssets()).resolves.toEqual({
      ok: true,
      data: [
        { id: "hero", name: "hero.png", kind: "Sprite", source: "Assets/hero.png" },
        { id: "outside", name: "outside.png", kind: "Sprite", source: "Assets/outside-link.png" }
      ]
    });
  });

  it("inspects only assets contained by the configured project", async () => {
    const { projectPath } = await createProjectFixture();
    const service = await createMcpProjectService({ projectPath });

    await expect(service.inspectAsset("hero")).resolves.toMatchObject({
      ok: true,
      data: {
        asset: { id: "hero", source: "Assets/hero.png" },
        inspection: { exists: true, format: "PNG", width: 16, height: 16 }
      }
    });
    await expect(service.inspectAsset("outside")).resolves.toMatchObject({
      ok: false,
      code: "ASSET_OUTSIDE_PROJECT"
    });
  });

  it("does not accept an asset ID that is absent from the project", async () => {
    const { projectPath } = await createProjectFixture();
    const service = await createMcpProjectService({ projectPath });

    await expect(service.inspectAsset("missing")).resolves.toMatchObject({
      ok: false,
      code: "ASSET_NOT_FOUND"
    });
  });
});
