import { describe, expect, it, vi } from "vitest";
import { restartForUpdate } from "./updateRestartFlow.js";
import type { ProjectSession } from "./projectSession.js";

function fixture(dirty = true, path: string | undefined = "/game/game.gba-project") {
  let session = { dirty, path, project: { data: {} }, undoStack: [], redoStack: [] } as unknown as ProjectSession | null;
  const saved = vi.fn((snapshot: ProjectSession, savedPath: string) => { session = { ...snapshot, path: savedPath, dirty: false }; });
  const options = {
    currentSession: () => session, confirm: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue({ canceled: false, path: "/game/game.gba-project" }), saved,
    install: vi.fn().mockResolvedValue({ ok: true })
  };
  return { options, setSession: (value: ProjectSession | null) => { session = value; } };
}

describe("save before updating", () => {
  it("saves dirty projects before allowing installation", async () => {
    const { options } = fixture();
    expect((await restartForUpdate(options)).ok).toBe(true);
    expect(options.save).toHaveBeenCalledOnce();
    expect(options.saved).toHaveBeenCalled();
    expect(options.save.mock.invocationCallOrder[0]).toBeLessThan(options.install.mock.invocationCallOrder[0]);
  });
  it.each([{ canceled: true }, { canceled: false, path: "/game", error: "disk full" }, { canceled: false }])(
    "never restarts on canceled, failed or incomplete saves: %j", async (result) => {
      const { options } = fixture(); options.save.mockResolvedValue(result);
      expect((await restartForUpdate(options)).ok).toBe(false);
      expect(options.saved).not.toHaveBeenCalled(); expect(options.install).not.toHaveBeenCalled();
    }
  );
  it("does nothing when the user chooses Later", async () => {
    const { options } = fixture(); options.confirm.mockResolvedValue(false);
    await restartForUpdate(options);
    expect(options.save).not.toHaveBeenCalled(); expect(options.install).not.toHaveBeenCalled();
  });
  it("rejects edits made while a save or confirmation was pending", async () => {
    const { options, setSession } = fixture();
    options.save.mockImplementation(async () => {
      setSession({ ...options.currentSession()!, project: { ...options.currentSession()!.project, data: { name: "new edit" } } });
      return { canceled: false, path: "/game" };
    });
    expect((await restartForUpdate(options)).ok).toBe(false);
    expect(options.saved).not.toHaveBeenCalled(); expect(options.install).not.toHaveBeenCalled();
  });
  it("blocks restart if a clean project becomes dirty while confirmation is open", async () => {
    const { options, setSession } = fixture(false);
    options.confirm.mockImplementation(async () => {
      setSession({ ...options.currentSession()!, dirty: true });
      return true;
    });
    expect((await restartForUpdate(options)).ok).toBe(false);
    expect(options.save).not.toHaveBeenCalled();
    expect(options.install).not.toHaveBeenCalled();
  });
  it("saves projects without a destination even when marked clean", async () => {
    const { options } = fixture(false); delete options.currentSession()!.path;
    await restartForUpdate(options); expect(options.save).toHaveBeenCalledOnce();
  });
  it("does not save clean projects or the welcome screen", async () => {
    const { options, setSession } = fixture(false);
    await restartForUpdate(options); expect(options.save).not.toHaveBeenCalled();
    setSession(null); await restartForUpdate(options);
    expect(options.install).toHaveBeenCalledTimes(2);
  });
});
