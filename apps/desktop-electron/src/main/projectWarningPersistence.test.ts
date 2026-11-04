import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProjectFile, saveProjectFileAtomically } from "./projectPersistence.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { projectWarningKey, readProjectWarningDismissals, updateProjectWarningDismissals } from "../shared/projectWarningDismissals.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("saved warning preferences", () => {
  for (const format of ["compact", "monolithic", "split"]) {
    it(`preserves dismissals and placement intent through ${format} save, reopen and Save As`, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "gbs-warning-persistence-")); roots.push(root);
      const key = projectWarningKey({ id: "unused", code: "events.warning", workspace: "Editor", severity: "warning", targetID: "old", message: "Unused event" });
      const data = updateProjectWarningDismissals({ schemaVersion: 1, name: "Warnings", settings: { build: {
        splitProjectResources: format === "split", compactTilemaps: format !== "monolithic"
      } }, editorState: { zoom: 2 }, actors: [{ id: "prop", name: "Prop", x: 10, y: 10, collisionPlacement: "intentional" }] }, [key]);
      const original = path.join(root, "original.gba-project"), copy = path.join(root, "copy.gba-project");
      await saveProjectFileAtomically(original, { data, summary: summarizeGBAProject(data) });
      const bytes = await readFile(original);
      const opened = (await openProjectFile(original)).project!;
      expect(readProjectWarningDismissals(opened.data)).toEqual([key]);
      expect(opened.data.editorState).toMatchObject({ zoom: 2 });
      expect(opened.data.actors).toEqual(data.actors);
      await saveProjectFileAtomically(copy, opened);
      expect(readProjectWarningDismissals((await openProjectFile(copy)).project!.data)).toEqual([key]);
      expect(await readFile(original)).toEqual(bytes);
      const restored = updateProjectWarningDismissals(opened.data, []);
      await saveProjectFileAtomically(copy, { data: restored, summary: summarizeGBAProject(restored) });
      expect(readProjectWarningDismissals((await openProjectFile(copy)).project!.data)).toEqual([]);
    });
  }
});
