/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartridgeWriterPanel } from "./CartridgeWriterPanel";
import type { CartridgeWriterAPI } from "../shared/cartridgeWriter";
import { writeStoredLocale } from "./i18n";

afterEach(() => { cleanup(); writeStoredLocale("pt-BR"); });
function fixture() {
  const review = { token: "review-1", profile: "ChisFlash v1.2 · FRAM 128 KiB", port: "usb-one", romBytes: 1024, romSha256: "a".repeat(64), capacityBytes: 33554432, chipID: "01 22", backupPath: "/backup/save.sav", saveSha256: "b".repeat(64), expiresAt: Date.now() + 600000 };
  const api: CartridgeWriterAPI = {
    status: vi.fn(async () => ({ installed: true, supported: true, version: "0.5.2" })),
    install: vi.fn(async () => ({ installed: true, supported: true, version: "0.5.2" })),
    detect: vi.fn(async () => ({ ports: [{ port: "usb-one", name: "ChisFlash", available: true }] })),
    prepare: vi.fn(async () => ({ ok: true, review })),
    write: vi.fn(async () => ({ ok: true, backupPath: review.backupPath })),
    discard: vi.fn(async () => {}), onProgress: vi.fn(() => () => {})
  };
  Object.defineProperty(window, "gbaStudio", { configurable: true, value: { cartridgeWriter: api, revealPath: vi.fn() } });
  const project = { data: { settings: { save: { saveType: "sram" } } } } as never;
  return { api, project, review };
}

describe("cartridge writer review flow", () => {
  it("defaults to STM and invalidates the review when the writer model changes", async () => {
    const f = fixture(); render(<CartridgeWriterPanel project={f.project} projectPath="/game.gba-project" />);
    fireEvent.click(screen.getByText("Gravar cartucho"));
    const model = await screen.findByRole("combobox", { name: "Modelo do gravador" });
    expect(model).toHaveValue("stm");
    fireEvent.click(screen.getByRole("button", { name: "Buscar gravadores" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Gravador USB" })).toHaveValue("usb-one"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Preparar ROM e backup" }));
    await screen.findByRole("button", { name: "Substituir ROM e gravar cartucho" });
    expect(f.api.prepare).toHaveBeenCalledWith(expect.objectContaining({ firmware: "stm" }));
    fireEvent.change(model, { target: { value: "stc8" } });
    expect(screen.queryByRole("button", { name: "Substituir ROM e gravar cartucho" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preparar ROM e backup" }));
    await waitFor(() => expect(f.api.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ firmware: "stc8" })));
    expect(f.api.write).not.toHaveBeenCalled();
  });
  it.each([['en-US', 'Write cartridge', 'Find writers'], ['es-ES', 'Grabar cartucho', 'Buscar grabadores']] as const)("uses the current %s application locale", async (locale, heading, find) => {
    const f = fixture(); writeStoredLocale(locale);
    render(<CartridgeWriterPanel project={f.project} projectPath="/game.gba-project" />);
    fireEvent.click(screen.getByText(heading));
    expect(await screen.findByRole("button", { name: find })).toBeEnabled();
  });
  it("requires device and profile, then a separate reviewed click before writing", async () => {
    const f = fixture(); render(<CartridgeWriterPanel project={f.project} projectPath="/game.gba-project" />);
    fireEvent.click(screen.getByText("Gravar cartucho"));
    const prepare = await screen.findByRole("button", { name: "Preparar ROM e backup" });
    expect(prepare).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Buscar gravadores" }));
    await waitFor(() => expect(f.api.detect).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(prepare).toBeEnabled());
    fireEvent.click(prepare);
    const write = await screen.findByRole("button", { name: "Substituir ROM e gravar cartucho" });
    expect(f.api.write).not.toHaveBeenCalled();
    expect(screen.getByText(f.review.romSha256)).toBeInTheDocument();
    fireEvent.click(write);
    await screen.findByText(/Os 128 KiB do save foram preservados/);
    expect(f.api.write).toHaveBeenCalledWith("review-1");
  });
  it("invalidates a review when project data changes", async () => {
    const f = fixture(); const view = render(<CartridgeWriterPanel project={f.project} projectPath="/game.gba-project" />);
    fireEvent.click(screen.getByText("Gravar cartucho"));
    fireEvent.click(await screen.findByRole("button", { name: "Buscar gravadores" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Gravador USB" })).toHaveValue("usb-one"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Preparar ROM e backup" }));
    await screen.findByRole("button", { name: "Substituir ROM e gravar cartucho" });
    view.rerender(<CartridgeWriterPanel project={{ data: { changed: true } } as never} projectPath="/game.gba-project" />);
    expect(screen.queryByRole("button", { name: "Substituir ROM e gravar cartucho" })).toBeNull();
    expect(f.api.write).not.toHaveBeenCalled();
  });
  it("recovers a running operation and its final result after returning to Exportar", async () => {
    const f = fixture();
    vi.mocked(f.api.status).mockResolvedValue({ installed: true, supported: true, version: "0.5.2", busy: true, progress: { phase: "write", done: 5, total: 10 } });
    render(<CartridgeWriterPanel project={f.project} projectPath="/game.gba-project" />);
    fireEvent.click(screen.getByText("Gravar cartucho"));
    await screen.findByText("Gravando a ROM…");
    expect(screen.getByRole("button", { name: "Buscar gravadores" })).toBeDisabled();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "50");
  });
  it("shows installation and device errors without starting a write", async () => {
    const f = fixture(); vi.mocked(f.api.detect).mockResolvedValue({ ports: [], error: "Porta ocupada" });
    render(<CartridgeWriterPanel project={f.project} projectPath="/game.gba-project" />);
    fireEvent.click(screen.getByText("Gravar cartucho"));
    fireEvent.click(await screen.findByRole("button", { name: "Buscar gravadores" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Porta ocupada");
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.write).not.toHaveBeenCalled();
  });
  it("restores a failed write and its backup when returning to Exportar", async () => {
    const f = fixture();
    vi.mocked(f.api.status).mockResolvedValue({ installed: true, supported: true, version: "0.5.2", busy: false, outcome: { ok: false, error: "A ROM foi gravada, mas o save mudou.", backupPath: "/backup/save.sav" } });
    render(<CartridgeWriterPanel project={f.project} projectPath="/game.gba-project" />);
    fireEvent.click(screen.getByText("Gravar cartucho"));
    expect(await screen.findByRole("alert")).toHaveTextContent("o save mudou");
    expect(screen.getByRole("button", { name: "Mostrar backup do save" })).toBeEnabled();
  });
});
