import { describe, expect, it, vi } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { createAudioItemInProject } from "../shared/audioWorkspace.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";
import { selectAudioPreviewData, AudioPreviewSession } from "./engineAudioPreview.js";

function fixture() {
  const data = createAudioItemInProject(createBlankProjectData({ name: "Prévia", includeStarterContent: false }), { id: "song", name: "Tema", kind: "Musica", synthesis: "PCM" });
  const song = (data.audioItems as any[])[0];
  song.patterns[0].channels[0].notes = ["C4", "---", "G4"];
  song.patterns.push({ ...structuredClone(song.patterns[0]), id: "second", name: "Second" });
  song.patternOrder = ["second", song.patterns[0].id];
  return data;
}

describe("engine audio preview", () => {
  it("uses the full export recipe for sequence previews and preserves unsaved project data", () => {
    const data = fixture(); const before = JSON.stringify(data);
    const selected = selectAudioPreviewData({ requestID: "a", data, audioID: "song", scope: "sequence" });
    expect(buildAssetcAudioPackGeneration(selected)?.document).toEqual(buildAssetcAudioPackGeneration(data)?.document);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("restricts pattern audition and solo to the preview copy", () => {
    const data = fixture(); const song = (data.audioItems as any[])[0];
    song.patterns[0].channels[0].solo = true;
    const selected = selectAudioPreviewData({ requestID: "a", data, audioID: "song", scope: "pattern", patternID: song.patterns[0].id });
    const audio = (selected.audioItems as any[])[0];
    expect(audio.patterns).toHaveLength(1); expect(audio.patternOrder).toEqual([song.patterns[0].id]);
    expect(audio.patterns[0].channels.slice(1).every((c: any) => c.muted)).toBe(true);
    expect(song.patterns[0].channels[1].muted).toBeUndefined();
  });
  it("rejects missing selections instead of playing another song", () => {
    expect(() => selectAudioPreviewData({ requestID: "a", data: fixture(), audioID: "missing", scope: "sequence" })).toThrow(/áudio/i);
    expect(() => selectAudioPreviewData({ requestID: "a", data: fixture(), audioID: "song", scope: "pattern", patternID: "missing" })).toThrow(/padrão/i);
  });
  it("discards a canceled build and never opens its player server", async () => {
    let finish!: (value: any) => void;
    const serve = vi.fn(); const remove = vi.fn();
    const session = new AudioPreviewSession({ build: () => new Promise(resolve => { finish = resolve; }), serve, remove });
    const pending = session.prepare({ requestID: "a", data: fixture(), audioID: "song", scope: "sequence" }, {} as any);
    await session.stop("a");
    finish({ directory: "/owned-preview-a", romPath: "/owned-preview-a/audio.gba", romBytes: 1024 });
    expect(await pending).toMatchObject({ canceled: true });
    expect(serve).not.toHaveBeenCalled(); expect(remove).toHaveBeenCalledWith("/owned-preview-a");
  });
  it("closes playback on stop and ignores late stop requests for the previous selection", async () => {
    const closeA = vi.fn(); const closeB = vi.fn();
    const serve = vi.fn().mockResolvedValueOnce({ url: "http://127.0.0.1:9001/player/runtime.html", close: closeA }).mockResolvedValueOnce({ url: "http://127.0.0.1:9002/player/runtime.html", close: closeB });
    const remove = vi.fn();
    const build = vi.fn().mockResolvedValueOnce({ directory: "/owned-a", romPath: "/owned-a/audio.gba", romBytes: 1024 }).mockResolvedValueOnce({ directory: "/owned-b", romPath: "/owned-b/audio.gba", romBytes: 1024 });
    const session = new AudioPreviewSession({ build, serve, remove });
    await session.prepare({ requestID: "a", data: fixture(), audioID: "song", scope: "sequence" }, {} as any);
    const result = await session.prepare({ requestID: "b", data: fixture(), audioID: "song", scope: "sequence" }, {} as any);
    expect(session.active).toBe(true); expect(result.url).toContain("audio-preview.html"); expect(closeA).toHaveBeenCalledOnce();
    expect(await session.stop("a")).toBe(false); expect(closeB).not.toHaveBeenCalled();
    expect(await session.stop("b")).toBe(true); expect(closeB).toHaveBeenCalledOnce(); expect(session.active).toBe(false);
    await session.dispose(); expect(remove).toHaveBeenCalledWith("/owned-b");
  });
  it("publishes the current cache before cleaning up an older build", async () => {
    let finish!: () => void;
    const removedA = new Promise<void>(resolve => { finish = resolve; });
    const remove = vi.fn((directory: string) => directory === "/a" ? removedA : Promise.resolve());
    const serve = vi.fn(async () => ({ url: "http://127.0.0.1:9001/player/runtime.html", close: vi.fn() }));
    const build = vi.fn().mockResolvedValueOnce({ directory: "/a", romPath: "/a/audio.gba", romBytes: 1 })
      .mockResolvedValueOnce({ directory: "/b", romPath: "/b/audio.gba", romBytes: 1 })
      .mockResolvedValueOnce({ directory: "/c", romPath: "/c/audio.gba", romBytes: 1 });
    const session = new AudioPreviewSession({ build, serve, remove });
    await session.prepare({ requestID: "a", data: fixture(), audioID: "song", scope: "sequence" }, {} as any);
    const b = session.prepare({ requestID: "b", data: fixture(), audioID: "song", scope: "sequence" }, {} as any);
    await new Promise(resolve => setTimeout(resolve, 10));
    const c = session.prepare({ requestID: "c", data: fixture(), audioID: "song", scope: "sequence" }, {} as any);
    await new Promise(resolve => setTimeout(resolve, 10));
    const previous = build.mock.calls[2]?.[2]; finish();
    const [old, current] = await Promise.all([b, c]);
    expect(previous?.directory).toBe("/b"); expect(old.canceled).toBe(true); expect(current.ok).toBe(true);
    expect(serve).toHaveBeenCalledTimes(2);
    await session.dispose();
  });
});
