import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExternalAssetWatcher, type ExternalAssetWatchListener } from "./externalAssetWatcher.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeAssetsRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-studio-assets-watch-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "sprites"), { recursive: true });
  return root;
}

describe("externalAssetWatcher", () => {
  it("debounces changes and reports paths relative to Assets", async () => {
    vi.useFakeTimers();
    const assetsRoot = await makeAssetsRoot();
    const listeners = new Map<string, ExternalAssetWatchListener>();
    const changes: string[][] = [];
    const watcher = createExternalAssetWatcher({
      assetsRoot,
      debounceMs: 100,
      onChange: (paths) => changes.push(paths),
      watchFactory: (directory, _options, listener) => {
        listeners.set(directory, listener);
        return { close: vi.fn() };
      }
    });

    listeners.get(path.join(assetsRoot, "sprites"))?.("change", "hero.png");
    listeners.get(path.join(assetsRoot, "sprites"))?.("change", "hero.png");
    await vi.advanceTimersByTimeAsync(99);
    expect(changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(changes).toEqual([["sprites/hero.png"]]);

    watcher.dispose();
  });

  it("stops reporting after dispose", async () => {
    vi.useFakeTimers();
    const assetsRoot = await makeAssetsRoot();
    let listener: ExternalAssetWatchListener | undefined;
    const onChange = vi.fn();
    const watcher = createExternalAssetWatcher({
      assetsRoot,
      onChange,
      watchFactory: (_directory, _options, nextListener) => {
        listener = nextListener;
        return { close: vi.fn() };
      }
    });

    watcher.dispose();
    listener?.("rename", "removed.png");
    await vi.runAllTimersAsync();
    expect(onChange).not.toHaveBeenCalled();
  });
});
