import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveUniversalToolchainSources } from "./prepare-macos-universal-toolchain.mjs";

describe("Universal macOS toolchain sources", () => {
  it("prepares both pinned architectures when no external pair is selected", async () => {
    const prepare = vi.fn(async () => ({ arm64Root: "/stage/arm64", x86_64Root: "/stage/x64" }));
    expect(await resolveUniversalToolchainSources({}, prepare)).toEqual({
      arm64Root: "/stage/arm64", x86_64Root: "/stage/x64"
    });
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("preserves a complete external pair without downloading a different compiler", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-mac-toolchain-"));
    const prepare = vi.fn(() => { throw new Error("unexpected download"); });
    try {
      const arm64Root = path.join(root, "arm64"), x86_64Root = path.join(root, "x64");
      await mkdir(arm64Root); await mkdir(x86_64Root);
      expect(await resolveUniversalToolchainSources({
        GBA_STUDIO_DEVKITPRO_ARM64_SOURCE: arm64Root,
        GBA_STUDIO_DEVKITPRO_X86_64_SOURCE: x86_64Root
      }, prepare)).toEqual({ arm64Root, x86_64Root });
      expect(prepare).not.toHaveBeenCalled();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects an incomplete explicit pair instead of mixing compiler versions", async () => {
    const prepare = vi.fn();
    await expect(resolveUniversalToolchainSources({
      GBA_STUDIO_DEVKITPRO_ARM64_SOURCE: "/missing/arm64"
    }, prepare)).rejects.toThrow(/par.*arm64.*x86_64/i);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("requires an explicit Apple Silicon source when only an existing Intel source is selected", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-mac-intel-only-"));
    try {
      await expect(resolveUniversalToolchainSources({ GBA_STUDIO_DEVKITPRO_X86_64_SOURCE: root }, vi.fn()))
        .rejects.toThrow(/par.*arm64.*x86_64/i);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
