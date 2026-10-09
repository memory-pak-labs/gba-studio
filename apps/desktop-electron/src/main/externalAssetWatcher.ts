import { readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";

export type ExternalAssetWatchListener = (eventType: "rename" | "change", filename: string | Buffer | null) => void;

export interface ExternalAssetWatchFactory {
  (directory: string, options: { persistent: boolean }, listener: ExternalAssetWatchListener): Pick<FSWatcher, "close">;
}

export interface ExternalAssetWatcherOptions {
  assetsRoot: string;
  debounceMs?: number;
  onChange(paths: string[]): void;
  watchFactory?: ExternalAssetWatchFactory;
}

export interface ExternalAssetWatcher {
  dispose(): void;
}

function directoryTree(root: string): string[] {
  const directories = [root];
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) directories.push(...directoryTree(path.join(root, entry.name)));
    }
  } catch {
    return directories.length === 1 ? [] : directories;
  }
  return directories;
}

function ignoredPath(relativePath: string): boolean {
  return relativePath.split(path.sep).some((segment) =>
    segment.startsWith(".") || segment.endsWith(".tmp") || segment.endsWith("~")
  );
}

export function createExternalAssetWatcher({
  assetsRoot,
  debounceMs = 150,
  onChange,
  watchFactory = (directory, options, listener) => watch(directory, options, listener)
}: ExternalAssetWatcherOptions): ExternalAssetWatcher {
  const root = path.resolve(assetsRoot);
  const pendingPaths = new Set<string>();
  const watchers = new Map<string, Pick<FSWatcher, "close">>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const flush = (): void => {
    timer = undefined;
    if (disposed || pendingPaths.size === 0) return;
    const paths = [...pendingPaths].sort();
    pendingPaths.clear();
    onChange(paths);
  };

  const schedule = (directory: string, filename: string | Buffer | null): void => {
    if (disposed || filename == null) return;
    const relativePath = path.relative(root, path.resolve(directory, filename.toString()));
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath) || ignoredPath(relativePath)) return;
    pendingPaths.add(relativePath.split(path.sep).join("/"));
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, Math.max(0, debounceMs));
  };

  const addDirectory = (directory: string): void => {
    if (disposed || watchers.has(directory)) return;
    const listener: ExternalAssetWatchListener = (eventType, filename) => {
      schedule(directory, filename);
      if (filename == null || eventType !== "rename") return;
      const changedPath = path.resolve(directory, filename.toString());
      try {
        if (statSync(changedPath).isDirectory()) {
          directoryTree(changedPath).forEach(addDirectory);
        }
      } catch {
        // A removed path is still reported; a later event can add it again.
      }
    };
    watchers.set(directory, watchFactory(directory, { persistent: false }, listener));
  };

  directoryTree(root).forEach(addDirectory);

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pendingPaths.clear();
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    }
  };
}
