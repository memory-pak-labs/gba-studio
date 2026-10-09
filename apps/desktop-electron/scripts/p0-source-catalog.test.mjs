import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_P0_SOURCE_KEY,
  P0_SOURCE_CATALOG,
  auditCanonicalP0Assets,
  assertP0SourceExists,
  blockingCanonicalP0Assets,
  classifyP0ProjectPath,
  getCanonicalP0Source,
  getP0Source,
  p0SourceKeys,
  resolveCanonicalP0Source,
  resolveP0Source
} from "./p0-source-catalog.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
let canonicalP0AssetAudit;

function auditedCanonicalP0Assets() {
  canonicalP0AssetAudit ??= auditCanonicalP0Assets(appRoot);
  return canonicalP0AssetAudit;
}

describe("P0 source catalog", () => {
  it("uses only the open Exemplo GBA project as the active P0 source", () => {
    expect(p0SourceKeys()).toEqual(["canonicalP0"]);
    expect(CANONICAL_P0_SOURCE_KEY).toBe("canonicalP0");
    expect(getCanonicalP0Source()).toMatchObject({
      id: "exemplo-gba-p0",
      role: "canonical-p0",
      globalAcceptance: true,
      acceptanceSurfaces: ["editor", "preview", "play-window", "rom"]
    });
    expect(getCanonicalP0Source()).not.toHaveProperty("visualMirrorPath");
    expect(getCanonicalP0Source()).not.toHaveProperty("visualMirrorAssetsRoot");
    expect(getCanonicalP0Source().assetPolicy).not.toHaveProperty("candidateRoots");
    expect(getCanonicalP0Source().assetPolicy).not.toHaveProperty("legacyFixtureRoots");
  });

  it("keeps the technical fixture historical and retires the visual mirror", () => {
    expect(getP0Source("technicalFixture")).toMatchObject({
      status: "retired",
      role: "technical-contract-fixture",
      excludedFromCanonicalAcceptance: true
    });
    expect(P0_SOURCE_CATALOG).not.toHaveProperty("visualFixture");
    expect(() => getP0Source("visualFixture")).toThrow("Fonte P0 desconhecida: visualFixture");
    expect(P0_SOURCE_CATALOG.canonicalP0.projectPath)
      .not.toBe(P0_SOURCE_CATALOG.technicalFixture.projectPath);
    expect(classifyP0ProjectPath(
      appRoot,
      path.join(appRoot, "fixtures", "electron-p0-playtest.gba-project")
    )).toMatchObject({ sourceKey: null, role: "external" });
  });

  it("defaults every unqualified P0 lookup to the Exemplo GBA project", () => {
    expect(getP0Source()).toEqual(P0_SOURCE_CATALOG.canonicalP0);
    expect(resolveCanonicalP0Source(appRoot)).toMatchObject({
      id: "exemplo-gba-p0",
      role: "canonical-p0",
      projectPath: path.join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project")
    });
    expect(resolveP0Source(appRoot)).toMatchObject({
      id: "exemplo-gba-p0",
      role: "canonical-p0",
      projectPath: path.join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project")
    });
  });

  it("resolves and validates the active source without requiring removed fixtures", () => {
    const source = assertP0SourceExists(appRoot, "canonicalP0");
    expect(existsSync(source.projectPath)).toBe(true);
    expect(source.assetsRoot).toBeUndefined();
  });

  it("classifies an unregistered temporary copy as external", () => {
    expect(classifyP0ProjectPath(appRoot, "/tmp/gba-studio-p0-copy/project.gba-project"))
      .toMatchObject({ sourceKey: null, role: "external" });
  });

  it("classifies the current canonical top-down sprite as the approved hash", () => {
    const assets = auditedCanonicalP0Assets();
    const asset = assets.find((candidate) => candidate.path === "Assets/sprites/nara-topdown.png");
    expect(asset).toMatchObject({
      path: "Assets/sprites/nara-topdown.png",
      sha256: "d60684b930e4b210e1c6a07962e4ca2993b0c7ea8bd2f3fd1a83f6faf4c7875c",
      status: "approved",
      approved: true,
      mirrorExists: null,
      mirrorMatches: null
    });
    const project = JSON.parse(readFileSync(
      path.join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project"),
      "utf8"
    ));
    const declaredPaths = project.assets
      .map((candidate) => candidate?.metadata?.source)
      .filter((source) => typeof source === "string" && source.startsWith("Assets/"))
      .sort();
    expect(assets.map((candidate) => candidate.path).sort()).toEqual(declaredPaths);
    expect(assets.some((candidate) => candidate.status === "baseline")).toBe(true);
  });

  it("keeps approved canonical packages independent from a visual mirror", () => {
    const assets = auditedCanonicalP0Assets();
    expect(assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "Assets/backgrounds/arena-gba.png",
        status: "approved",
        approved: true,
        mirrorMatches: null
      }),
      expect.objectContaining({
        path: "Assets/sprites/nara-fighter.png",
        status: "approved",
        approved: true,
        mirrorMatches: null
      }),
      expect.objectContaining({
        path: "Assets/sprites/rival-fighter.png",
        status: "approved",
        approved: true,
        mirrorMatches: null
      }),
    ]));
    expect(assets.find((asset) => asset.path === "Assets/backgrounds/mercado-suspenso-modules-v5.png"))
      .toBeUndefined();
  });

  it("separates replaced visual history from the approved opening actors", () => {
    const assets = auditedCanonicalP0Assets();
    expect(assets.find((asset) => asset.path === "Assets/backgrounds/opening-v3-background-240x160.png"))
      .toBeUndefined();
    expect(assets.find((asset) => asset.path === "Assets/sprites/tactical-nara-v3.png"))
      .toBeUndefined();
    expect(assets.find((asset) => asset.path === "Assets/sprites/opening-v3-guardia-idle-48x64.png"))
      .toMatchObject({ status: "approved", approved: true });
  });

  it("accepts the exact active P0 assets approved by the user", () => {
    const assets = auditedCanonicalP0Assets();
    const approvals = getCanonicalP0Source().assetPolicy.approved.filter((entry) =>
      entry.contract === "active-p0-assets-user-approved-2026-09-29"
    );
    expect(approvals).toHaveLength(19);
    expect(blockingCanonicalP0Assets(assets)).toEqual([]);
    for (const entry of approvals) {
      expect(assets.find((asset) => asset.path === entry.path)).toMatchObject({
        approved: true,
        declaredInProject: true,
        sha256: entry.sha256,
        status: "approved"
      });
    }
  });

  it("recognizes explicitly approved active visual packages by their exact hashes", () => {
    const assets = auditedCanonicalP0Assets();
    const approvedPackages = [
      ["Assets/backgrounds/opening-v4-per-tile-14-banks.png", "071905536628830df779a17d758eb4c9373baf14076612927680cb5f03d5ee74"],
      ["Assets/backgrounds/title-day-centered-240x160-4bpp.png", "34de4e4b73def5a18a7e55d6fac176ca2b6fd99e2d39231935a2bcd075f6daf9"],
      ["Assets/fonts/gba-dialogue-font-v3.png", "c11501185dfdd6bd20b63b9670796c32445663bdd572789d9934c29b4eec3798"],
      ["Assets/backgrounds/tactical-v5-surface.png", "df1a3c5538911918664da5cc510c78329ab64752b01c81e6b5ae9b70d236589b"],
      ["Assets/sprites/tactical-cursor-diamond-32x16-v1.png", "823a618bb9aff43fea787d681f4bba03f65bfee8dd13c33e916e5b89268af809"],
      ["Assets/backgrounds/route-map-paged-v2.png", "6887d224a8490c8858fc5e66c779932ad8264f3a87535168e88c64755d88de0c"],
      ["Assets/sprites/route-airship-v2.png", "6ecb8e65271ff381671cb69e79455f20d77b8532a8d8977b960f6cc84b918868"],
      ["Assets/backgrounds/council-v5-background.png", "98a6ccb4597f25f2156e30fed19ce7f9e9f88a5403ea5b46f1cefb1281c1cdff"],
      ["Assets/sprites/nara-racer.png", "d933dc6a743c06312ea3c343079080430272e43ff0fe1bed0a5d5cc016446185"],
      ["Assets/ui/frame-lumen-v2.png", "e07c5627d5f760e0e12bf6a9fe4d8b402ad1e2f3797c56b8c23bf214740c7907"]
    ];
    for (const [assetPath, sha256] of approvedPackages) {
      expect(assets.find((asset) => asset.path === assetPath)).toMatchObject({
        approved: true,
        path: assetPath,
        sha256,
        status: "approved"
      });
    }
  });

  it("does not reintroduce retired assets outside the active project library", () => {
    const assets = auditedCanonicalP0Assets();
    expect(assets.find((candidate) => candidate.path === "Assets/backgrounds/mercado-suspenso-tileset-v4-gba.png")).toBeUndefined();
  });
});
