import { describe, expect, it, vi } from "vitest";
import { memoizeEngineExport, withEngineExportContext } from "./engineExportContext.js";

describe("export calculation scope", () => {
  it("shares a calculation only within one export and recomputes after in-place edits", () => {
    const data = { value: 1 }; const compute = vi.fn(() => ({ value: data.value }));
    const read = () => memoizeEngineExport(data, "value", compute);
    withEngineExportContext(() => { expect(read()).toBe(read()); }); expect(compute).toHaveBeenCalledTimes(1);
    data.value = 2; expect(withEngineExportContext(read)).toEqual({ value: 2 }); expect(compute).toHaveBeenCalledTimes(2);
    expect(read()).not.toBe(read());
  });
  it("separates projects and calculations, retains null and cleans up after failure", () => {
    const a = {}, b = {}; const nullValue = vi.fn(() => null);
    expect(() => withEngineExportContext(() => {
      expect(memoizeEngineExport(a, "same", () => "a")).toBe("a");
      expect(memoizeEngineExport(b, "same", () => "b")).toBe("b");
      expect(memoizeEngineExport(a, "other", () => "other")).toBe("other");
      memoizeEngineExport(a, "null", nullValue); memoizeEngineExport(a, "null", nullValue);
      throw new Error("export failed");
    })).toThrow("export failed"); expect(nullValue).toHaveBeenCalledTimes(1);
    expect(withEngineExportContext(() => memoizeEngineExport(a, "same", () => "fresh"))).toBe("fresh");
  });
});
