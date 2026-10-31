/** @vitest-environment happy-dom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppUpdateNotice } from "./AppUpdateNotice";
import { StudioI18nProvider } from "./i18n";
import type { AppUpdateState } from "../shared/appUpdates";
import type { AppCommand } from "../shared/ipc";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
function setup(initial: AppUpdateState["status"] = "available") {
  let listener!: (state: AppUpdateState) => void;
  let command!: (command: AppCommand) => void;
  const state: AppUpdateState = { status: initial, currentVersion: "0.1.0-beta.3", version: "0.1.0-beta.4" };
  const api = {
    getAppUpdateState: vi.fn().mockResolvedValue(state),
    onAppUpdateState: vi.fn((callback) => { listener = callback; return vi.fn(); }),
    onAppCommand: vi.fn((callback) => { command = callback; return vi.fn(); }),
    checkAppUpdates: vi.fn().mockResolvedValue({ ...state, status: "not-available" }),
    downloadAppUpdate: vi.fn().mockResolvedValue({ ...state, status: "downloading", progress: 12 })
  };
  Object.defineProperty(window, "gbaStudio", { configurable: true, value: api });
  const restart = vi.fn().mockResolvedValue({ ok: true });
  render(<StudioI18nProvider><AppUpdateNotice onRestart={restart} /></StudioI18nProvider>);
  return { api, restart, emit: (status: AppUpdateState["status"]) => act(() => listener({ ...state, status })), command: () => act(() => command("app:check-updates")) };
}
describe("update notice", () => {
  it("downloads only on request, can be postponed, and reappears when ready", async () => {
    const { api, emit } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Baixar atualização" }));
    expect(api.downloadAppUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByRole("progressbar")).toHaveAttribute("value", "12");
    fireEvent.click(screen.getByRole("button", { name: "Mais tarde" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    emit("downloaded");
    expect(await screen.findByRole("button", { name: "Reiniciar e atualizar" })).toBeInTheDocument();
  });
  it("blocks duplicate restarts and reports save failures", async () => {
    const { restart } = setup("downloaded");
    let resolve!: (result: unknown) => void;
    restart.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const button = await screen.findByRole("button", { name: "Reiniciar e atualizar" });
    fireEvent.click(button); fireEvent.click(button);
    expect(restart).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
    await act(async () => resolve({ ok: false, error: "Disco cheio. Projeto não salvo." }));
    expect(screen.getByRole("alert")).toHaveTextContent("Disco cheio");
    expect(button).toBeEnabled();
  });
  it("supports a manual check when no update notice is visible", async () => {
    const { api, command } = setup("idle");
    await waitFor(() => expect(api.getAppUpdateState).toHaveBeenCalledOnce());
    command();
    expect(await screen.findByText("Você está usando a versão mais recente deste canal.")).toBeInTheDocument();
    expect(api.checkAppUpdates).toHaveBeenCalledOnce();
  });
  it("offers a manual download when installation or verification fails", async () => {
    const { emit } = setup("idle");
    emit("error");
    expect(await screen.findByText(/baixe a versão mais recente no site do GBA Studio/)).toBeInTheDocument();
  });
});
