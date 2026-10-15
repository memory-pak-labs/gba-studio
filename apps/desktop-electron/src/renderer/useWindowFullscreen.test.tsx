/** @vitest-environment happy-dom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWindowFullscreen } from "./useWindowFullscreen";

afterEach(cleanup);

describe("native window fullscreen", () => {
  it("restores the native state after a reload, follows transitions and unsubscribes", async () => {
    let notify!: (fullscreen: boolean) => void;
    const unsubscribe = vi.fn();
    const api = {
      getWindowFullscreen: vi.fn().mockResolvedValue(true),
      onWindowFullscreenChange: vi.fn((listener: typeof notify) => {
        notify = listener;
        return unsubscribe;
      })
    };
    const { result, unmount } = renderHook(() => useWindowFullscreen(api));
    await waitFor(() => expect(result.current).toBe(true));
    act(() => notify(false));
    expect(result.current).toBe(false);
    act(() => notify(true));
    expect(result.current).toBe(true);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps a newer native transition when the initial request resolves late", async () => {
    let resolve!: (fullscreen: boolean) => void;
    let notify!: (fullscreen: boolean) => void;
    const api = {
      getWindowFullscreen: () => new Promise<boolean>(done => { resolve = done; }),
      onWindowFullscreenChange: (listener: typeof notify) => {
        notify = listener;
        return vi.fn();
      }
    };
    const { result } = renderHook(() => useWindowFullscreen(api));
    act(() => notify(true));
    await act(async () => resolve(false));
    expect(result.current).toBe(true);
  });
});
