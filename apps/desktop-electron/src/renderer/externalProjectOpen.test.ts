import { describe, expect, it, vi } from "vitest";
import type { OpenProjectResult } from "../shared/ipc.js";
import { resolveExternalProjectOpen } from "./externalProjectOpen.js";

const external = { canceled: false, path: "/games/new.gba-project", project: {} } as OpenProjectResult;

describe("external project navigation", () => {
  it("leaves the active project untouched when the user cancels", async () => {
    const open = vi.fn();
    expect(await resolveExternalProjectOpen(external, async () => false, open)).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the accepted project afresh and reports the result", async () => {
    const refreshed = { canceled: false, path: external.path, project: { fresh: true } } as unknown as OpenProjectResult;
    const open = vi.fn(async () => refreshed);
    expect(await resolveExternalProjectOpen(external, async () => true, open)).toBe(refreshed);
    expect(open).toHaveBeenCalledWith(external.path);
  });

  it("preserves a load error for the editor to report", async () => {
    const error: OpenProjectResult = { canceled: false, error: "Could not read project" };
    const open = vi.fn();
    expect(await resolveExternalProjectOpen(error, async () => true, open)).toBe(error);
    expect(open).not.toHaveBeenCalled();
  });
});
