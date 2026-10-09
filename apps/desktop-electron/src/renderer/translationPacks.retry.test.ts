import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const packs = [{ id: "core", label: "Básico", description: "Incluído", languages: ["pt-BR"],
  bundled: true, available: true, installed: true, sizeBytes: 12 }];
const catalog = { formatVersion: 1, generatedAt: "qa", registryURL: "qa", modelBaseURL: "qa",
  corePackID: "core", packs: packs.map(pack => ({ ...pack, pairs: [], files: {} })) };

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("translation pack query recovery", () => {
  it("retries a failed catalog and status query instead of caching the rejection", async () => {
    vi.stubGlobal("window", { location: { href: "http://qa.local/" } });
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(new Response(JSON.stringify(catalog)));
    vi.stubGlobal("fetch", fetch);
    const service = await import("./translationPacks.js");
    const first = service.getTranslationPackStatuses();
    const shared = service.getTranslationPackStatuses();
    await expect(first).rejects.toThrow("offline");
    await expect(shared).rejects.toThrow("offline");
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(service.getTranslationPackStatuses()).resolves.toEqual(packs);
    await expect(service.getTranslationPackStatuses()).resolves.toEqual(packs);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries a desktop status error while retaining successful results", async () => {
    const getTranslationPackStatus = vi.fn().mockResolvedValueOnce({ ok: false, error: "temporário" })
      .mockResolvedValue({ ok: true, packs });
    vi.stubGlobal("window", { gbaStudio: { getTranslationPackStatus } });
    const service = await import("./translationPacks.js");
    await expect(service.getTranslationPackStatuses()).rejects.toThrow("temporário");
    await expect(service.getTranslationPackStatuses()).resolves.toEqual(packs);
    await expect(service.getTranslationPackStatuses()).resolves.toEqual(packs);
    expect(getTranslationPackStatus).toHaveBeenCalledTimes(2);
  });

  it("does not clear a fresh status result when an invalidated request fails later", async () => {
    let rejectOld!: (error: Error) => void;
    const old = new Promise((_, reject) => { rejectOld = reject; });
    const getTranslationPackStatus = vi.fn().mockReturnValueOnce(old)
      .mockResolvedValue({ ok: true, packs });
    vi.stubGlobal("window", { gbaStudio: { getTranslationPackStatus } });
    const service = await import("./translationPacks.js");
    const first = service.getTranslationPackStatuses();
    service.invalidateTranslationPackStatuses();
    await expect(service.getTranslationPackStatuses()).resolves.toEqual(packs);
    const rejection = expect(first).rejects.toThrow("obsoleto");
    rejectOld(new Error("obsoleto"));
    await rejection;
    await expect(service.getTranslationPackStatuses()).resolves.toEqual(packs);
    expect(getTranslationPackStatus).toHaveBeenCalledTimes(2);
  });
});
