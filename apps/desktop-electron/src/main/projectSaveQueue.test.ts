import { describe, expect, it, vi } from "vitest";
import { createProjectSaveQueue } from "./projectSaveQueue.js";

describe("save ordering before update restart", () => {
  it("finishes an older save before the snapshot saved for an update", async () => {
    const queue = createProjectSaveQueue();
    let finish!: () => void;
    let disk = "initial";
    const older = queue.run(async () => { await new Promise<void>((resolve) => { finish = resolve; }); disk = "old"; });
    const latest = vi.fn(async () => { disk = "latest"; });
    const current = queue.run(latest);
    await Promise.resolve();
    expect(queue.pending()).toBe(2); expect(latest).not.toHaveBeenCalled();
    finish(); await older; await current;
    expect(disk).toBe("latest"); expect(queue.pending()).toBe(0);
  });
  it("continues saving after a failed write without leaving a pending restart blocker", async () => {
    const queue = createProjectSaveQueue();
    await expect(queue.run(async () => { throw new Error("disk full"); })).rejects.toThrow("disk full");
    await expect(queue.run(async () => "saved")).resolves.toBe("saved");
    expect(queue.pending()).toBe(0);
  });
});
