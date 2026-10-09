import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const excludedExportDirectories = new Set(["build", ".gba-cache"]);

/** Only the owning process releases the lock; abandoned locks are recoverable. */
export async function acquireBuildLock(lock: string): Promise<() => Promise<void>> {
  await mkdir(path.dirname(lock), { recursive: true });
  try { await mkdir(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let abandoned = false;
    try {
      const pid = Number(await readFile(path.join(lock, "pid"), "utf8"));
      if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); } catch (probe) {
          abandoned = (probe as NodeJS.ErrnoException).code === "ESRCH";
        }
      }
    } catch { /* An owner may still be creating the lock. */ }
    if (!abandoned) throw new Error("Este projeto já está sendo exportado ou compilado. Tente novamente ao terminar.");
    await rm(lock, { recursive: true, force: true });
    await mkdir(lock); // A concurrent recovery fails here instead of sharing outputs.
  }
  await writeFile(path.join(lock, "pid"), String(process.pid));
  return async () => { await rm(lock, { recursive: true, force: true }); };
}

export async function writeFileIfChanged(destination: string, contents: string | Buffer): Promise<boolean> {
  const bytes = typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
  try { if ((await readFile(destination)).equals(bytes)) return false; } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return true;
}

/** Pruning is only for the application's own staging tree, never the source. */
export async function copyTreeIfChanged(source: string, destination: string, prune = false, exportRoot = true): Promise<void> {
  const info = await stat(source);
  if (!info.isDirectory()) {
    if (await writeFileIfChanged(destination, await readFile(source))) await chmod(destination, info.mode);
    return;
  }
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (!exportRoot || !excludedExportDirectories.has(entry.name)) {
      await copyTreeIfChanged(path.join(source, entry.name), path.join(destination, entry.name), prune, false);
    }
  }
  if (prune) {
    const names = new Set(entries.map(entry => entry.name));
    for (const entry of await readdir(destination, { withFileTypes: true })) {
      if (!names.has(entry.name) && (!exportRoot || !excludedExportDirectories.has(entry.name))) {
        await rm(path.join(destination, entry.name), { recursive: true, force: true });
      }
    }
  }
}

export async function exportedFileHashes(root: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (directory === root && excludedExportDirectories.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else hashes[path.relative(root, full)] = createHash("sha256").update(await readFile(full)).digest("hex");
    }
  }
  await visit(root);
  return hashes;
}
