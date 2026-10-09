import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { acquireBuildLock, copyTreeIfChanged, writeFileIfChanged } from "./stableBuildFiles.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true}))); });
async function temporaryRoot() { const root=await mkdtemp(path.join(os.tmpdir(),"gba-stable-files-")); roots.push(root); return root; }

it("excludes ROMs and caches, preserves equal files and prunes only its staging", async () => {
  const root=await temporaryRoot(), source=path.join(root,"source"), destination=path.join(root,"destination");
  await mkdir(path.join(source,"build"),{recursive:true}); await mkdir(destination);
  await writeFile(path.join(source,"main.cpp"),"same"); await writeFile(path.join(source,"build/game.gba"),"old-rom");
  await writeFile(path.join(destination,"main.cpp"),"same"); await utimes(path.join(destination,"main.cpp"),1000,1000);
  await writeFile(path.join(destination,"removed.hpp"),"stale");
  await copyTreeIfChanged(source,destination,true);
  expect((await stat(path.join(destination,"main.cpp"))).mtimeMs).toBe(1_000_000);
  await expect(stat(path.join(destination,"build"))).rejects.toMatchObject({code:"ENOENT"});
  await expect(stat(path.join(destination,"removed.hpp"))).rejects.toMatchObject({code:"ENOENT"});
  expect(await readFile(path.join(source,"build/game.gba"),"utf8")).toBe("old-rom");
  expect(await writeFileIfChanged(path.join(destination,"main.cpp"),"changed")).toBe(true);
});

it("rejects concurrent owners and releases the lock for the next build", async () => {
  const lock=path.join(await temporaryRoot(),"lock");
  const release=await acquireBuildLock(lock);
  await expect(acquireBuildLock(lock)).rejects.toThrow(/já está/);
  await release(); const releaseAgain=await acquireBuildLock(lock); await releaseAgain();
});
