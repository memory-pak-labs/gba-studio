import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import * as player from "../static/WebPlayer/player/mgba-direct-player.mjs";

let wasm;
beforeAll(async () => {
  wasm = new WebAssembly.Module(await readFile(new URL("../static/WebPlayer/player/mgba-core.wasm", import.meta.url)));
});
async function core() {
  return createMGBA({ instantiateWasm(imports, done) {
    const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports;
  } });
}
function pixels(count, seed) {
  const bytes = new Uint8Array(count * 4);
  let state = seed;
  for (let i = 0; i < bytes.length; ++i) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
}

describe("compiled mGBA exact framebuffer inspection", () => {
  it.each([[1, 1], [17, 13], [240, 160]])("matches every JS oracle field for %sx%s arbitrary RGBA", async (width, height) => {
    const module = await core();
    expect(typeof module._gba_analyze_rgba).toBe("function");
    const bytes = pixels(width * height, 17);
    expect(player.analyzeModuleRgbaFrame(module, bytes, width, height))
      .toEqual(player.analyzeRgbaFrame(bytes, width, height));
  });

  it("preserves black threshold, ignored alpha and deterministic histogram ties", async () => {
    const module = await core();
    expect(typeof module._gba_analyze_rgba).toBe("function");
    const bytes = Uint8Array.from([0,0,0,255, 4,4,4,0, 5,4,4,255, 5,4,4,0, 255,255,255,255, 4,4,4,255]);
    expect(player.analyzeModuleRgbaFrame(module, bytes, 3, 2))
      .toEqual(player.analyzeRgbaFrame(bytes, 3, 2));
  });

  it("rejects pointers outside Wasm memory and invalid pixel counts", async () => {
    const module = await core();
    expect(typeof module._gba_analyze_rgba).toBe("function");
    expect(module._gba_analyze_rgba(0, 1)).toBe(0);
    expect(module._gba_analyze_rgba(module.HEAPU8.length - 4, 2)).toBe(0);
    expect(module._gba_analyze_rgba(4096, 0)).toBe(0);
    expect(module._gba_analyze_rgba(4096, 38401)).toBe(0);
  });

  it("retains the pure JS path when the native bridge is unavailable", () => {
    const bytes = pixels(16, 1);
    expect(player.analyzeModuleRgbaFrame({}, bytes, 4, 4)).toEqual(player.analyzeRgbaFrame(bytes, 4, 4));
  });

  it("frees scratch storage even when the native result is invalid", () => {
    const module = { HEAPU8: new Uint8Array(1024), _malloc: () => 64, _free: vi.fn(), _gba_analyze_rgba: () => 0 };
    expect(() => player.analyzeModuleRgbaFrame(module, pixels(16, 2), 4, 4)).toThrow(/analise|analysis/i);
    expect(module._free).toHaveBeenCalledExactlyOnceWith(64);
  });
});
