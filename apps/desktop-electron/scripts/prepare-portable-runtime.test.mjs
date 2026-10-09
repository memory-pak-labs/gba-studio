import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifiedDownload } from "./prepare-portable-runtime.mjs";

describe("pinned offline runtime downloads", () => {
  it("rejects changed upstream bytes before they can be extracted or packaged", async () => {
    const cache = await mkdtemp(path.join(tmpdir(), "gba-runtime-integrity-"));
    const fetch = vi.fn(async () => new Response("tampered"));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(verifiedDownload({ name: "python.tar.gz", url: "https://example.invalid/python", sha256: createHash("sha256").update("original").digest("hex") }, cache)).rejects.toThrow(/SHA256/);
      expect(fetch).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); await rm(cache, { recursive: true, force: true }); }
  });

  it("verifies cached bytes and needs no network for an already verified build input", async () => {
    const cache = await mkdtemp(path.join(tmpdir(), "gba-runtime-cache-"));
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network unavailable"); }));
    try {
      const archive = path.join(cache, "compiler.zip"); await writeFile(archive, "original");
      const source = { name: "compiler.zip", url: "https://example.invalid/compiler", sha256: createHash("sha256").update("original").digest("hex") };
      expect(await verifiedDownload(source, cache)).toBe(archive);
      expect(await readFile(archive, "utf8")).toBe("original");
      await writeFile(archive, "corrupt cache");
      await expect(verifiedDownload(source, cache)).rejects.toThrow(/SHA256/);
    } finally { vi.unstubAllGlobals(); await rm(cache, { recursive: true, force: true }); }
  });
});
