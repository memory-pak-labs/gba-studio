import { describe, expect, it, vi } from "vitest";
import { createWindowCloseGuard } from "./windowCloseGuard.js";

describe("window close guard", () => {
  it("prevents the first close and requests renderer confirmation", () => {
    const requestClose = vi.fn();
    const preventDefault = vi.fn();
    const guard = createWindowCloseGuard(requestClose);

    expect(guard.handleClose({ preventDefault })).toBe(false);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(requestClose).toHaveBeenCalledOnce();
  });

  it("allows close after renderer confirmation", () => {
    const requestClose = vi.fn();
    const preventDefault = vi.fn();
    const guard = createWindowCloseGuard(requestClose);

    guard.confirmClose();

    expect(guard.handleClose({ preventDefault })).toBe(true);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(requestClose).not.toHaveBeenCalled();
  });

  it("requests confirmation only once while the renderer is deciding", () => {
    const requestClose = vi.fn();
    const guard = createWindowCloseGuard(requestClose);
    guard.handleClose({ preventDefault: vi.fn() });
    guard.handleClose({ preventDefault: vi.fn() });
    expect(requestClose).toHaveBeenCalledOnce();
  });

  it("resumes an app quit only after the user confirms", () => {
    const guard = createWindowCloseGuard(vi.fn());
    guard.requestAppQuit();
    guard.handleClose({ preventDefault: vi.fn() });
    expect(guard.confirmClose()).toBe(true);
    expect(guard.handleClose({ preventDefault: vi.fn() })).toBe(true);
  });

  it("clears a canceled quit so a later window close does not quit the app", () => {
    const requestClose = vi.fn();
    const guard = createWindowCloseGuard(requestClose);
    guard.requestAppQuit();
    guard.handleClose({ preventDefault: vi.fn() });
    guard.cancelClose();
    guard.handleClose({ preventDefault: vi.fn() });
    expect(requestClose).toHaveBeenCalledTimes(2);
    expect(guard.confirmClose()).toBe(false);
  });
});
