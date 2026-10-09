import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  auditCanonicalP0Assets,
  blockingCanonicalP0Assets
} from "./p0-source-catalog.mjs";

describe("canonical P0 asset scope", () => {
  it("distinguishes assets still in the project library from files left on disk", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "gba-p0-asset-scope-"));
    const projectDirectory = path.join(root, "apps", "desktop-electron", "default-assets", "templates", "exemplo-gba");
    try {
      mkdirSync(path.join(projectDirectory, "Assets", "sprites"), { recursive: true });
      writeFileSync(path.join(projectDirectory, "exemplo-gba.gba-project"), JSON.stringify({
        assets: [{ metadata: { source: "Assets/sprites/active.png" } }]
      }));
      writeFileSync(path.join(projectDirectory, "Assets", "sprites", "active.png"), "active");
      writeFileSync(path.join(projectDirectory, "Assets", "sprites", "leftover.png"), "leftover");

      const assets = auditCanonicalP0Assets(path.join(root, "apps", "desktop-electron"));
      const active = assets.find((asset) => asset.path === "Assets/sprites/active.png");
      const leftover = assets.find((asset) => asset.path === "Assets/sprites/leftover.png");

      expect(active).toMatchObject({ declaredInProject: true, status: "unknown" });
      expect(leftover).toMatchObject({ declaredInProject: false, status: "unknown" });
      expect(blockingCanonicalP0Assets(assets)).toContain(active);
      expect(blockingCanonicalP0Assets(assets)).not.toContain(leftover);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still blocks a missing or mismatched active asset", () => {
    const assets = [
      { path: "Assets/sprites/active.png", declaredInProject: true, approved: false, mirrorMatches: null },
      { path: "Assets/sprites/mirror.png", declaredInProject: true, approved: true, mirrorMatches: false },
      { path: "Assets/sprites/leftover.png", declaredInProject: false, approved: false, mirrorMatches: false }
    ];

    expect(blockingCanonicalP0Assets(assets).map((asset) => asset.path)).toEqual([
      "Assets/sprites/active.png",
      "Assets/sprites/mirror.png"
    ]);
  });

  it("reports a missing asset declared by the project even without a catalog entry", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "gba-p0-asset-scope-"));
    const projectDirectory = path.join(root, "apps", "desktop-electron", "default-assets", "templates", "exemplo-gba");
    try {
      mkdirSync(projectDirectory, { recursive: true });
      writeFileSync(path.join(projectDirectory, "exemplo-gba.gba-project"), JSON.stringify({
        assets: [{ metadata: { source: "Assets/sprites/missing.png" } }]
      }));

      const assets = auditCanonicalP0Assets(path.join(root, "apps", "desktop-electron"));
      expect(assets).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: "Assets/sprites/missing.png",
          status: "missing",
          declaredInProject: true,
          approved: false
        })
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
