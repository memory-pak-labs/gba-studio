import { mkdtemp, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CfbEventDecoder, cfbAsset, ManagedCfbTool, runCfb, validateCfbResult } from "./cfbTool.js";

describe("pinned cfb protocol", () => {
  it("decodes fragmented NDJSON and rejects invalid, truncated and oversized events", () => {
    const decoder = new CfbEventDecoder();
    expect(decoder.push('{"type":"pro')).toEqual([]);
    expect(decoder.push('gress","done":2,"total":3}\n')).toEqual([{ type: "progress", done: 2, total: 3 }]);
    expect(decoder.finish()).toEqual([]);
    expect(() => new CfbEventDecoder().push("not json\n")).toThrow();
    const partial = new CfbEventDecoder(); partial.push('{"type":');
    expect(() => partial.finish()).toThrow();
    expect(() => new CfbEventDecoder().push("x".repeat(262145))).toThrow();
  });
  it("does not accept process success without the matching successful operation result", () => {
    expect(() => validateCfbResult([], "burn", 1024)).toThrow();
    expect(() => validateCfbResult([{ type: "result", command: "dump", ok: true, bytes: 1024, mismatch_bytes: 0 }], "burn", 1024)).toThrow();
    expect(() => validateCfbResult([{ type: "result", command: "burn", ok: true, bytes: 1024, mismatch_bytes: 1 }], "burn", 1024)).toThrow();
    expect(() => validateCfbResult([{ type: "result", command: "burn", ok: true, bytes: 512, mismatch_bytes: 0 }], "burn", 1024)).toThrow();
  });
  it("pins exact platform artifacts and refuses unsupported hosts", () => {
    expect(cfbAsset("darwin", "arm64")?.sha256).toBe("8ecaf84a53b49a6c8f7c762fc8033e8df8b11df8d3809876fb08d8b7316240da");
    expect(cfbAsset("win32", "x64")?.name).toMatch(/\.exe$/);
    expect(cfbAsset("linux", "arm64")).toBeNull();
  });
  it("rejects tampered downloads and leaves no executable or temporary file", async () => {
    const root = await mkdtemp(join(tmpdir(), "gba-cfb-download-"));
    const download = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(new Uint8Array([1,2,3])));
    const tool = new ManagedCfbTool(root, "darwin", "arm64", download as typeof fetch);
    const result = await tool.install();
    expect(result.installed).toBe(false); expect(result.error).toMatch(/Checksum/);
    expect(await readdir(join(root, "tools", "cfb-0.5.2"))).toEqual([]);
    expect(download.mock.calls[0][0]).toContain("/v0.5.2/cfb-aarch64-apple-darwin");
  });
  it.skipIf(process.platform === "win32")("runs without a shell or access to the user's cfb preferences", async () => {
    const root = await mkdtemp(join(tmpdir(), "gba-cfb-process-"));
    const script = join(root, "cfb fixture with spaces");
    await writeFile(script, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({type:'version',version:'0.5.2',hasHome:!!process.env.HOME,hasProfile:!!process.env.USERPROFILE})+'\\n');`, { mode: 0o700 });
    const events = await runCfb(script, ["version"]);
    expect(events[0]).toMatchObject({ type: "version", hasHome: false, hasProfile: false });
    await writeFile(script, `#!${process.execPath}\nprocess.stdout.write('{"type":"error","message":"USB disconnected"}\\n');`, { mode: 0o700 });
    await expect(runCfb(script, ["burn"])).rejects.toThrow("USB disconnected");
  });
});
