import { describe, expect, it, vi } from "vitest";
import { createAppMenuTemplate } from "./appMenu.js";

function menuItemLabels(section: { submenu?: unknown }): string[] {
  const submenu = Array.isArray(section.submenu) ? section.submenu : [];
  return submenu
    .filter((item): item is { label: string } => typeof item === "object" && item !== null && "label" in item)
    .map((item) => item.label);
}

describe("app menu template", () => {
  it("exposes project commands with desktop accelerators", () => {
    const sendCommand = vi.fn();
    const template = createAppMenuTemplate({ isMac: false, locale: "pt-BR", sendCommand });
    const fileMenu = template.find((item) => item.label === "Arquivo");

    expect(fileMenu).toBeDefined();
    expect(menuItemLabels(fileMenu!)).toEqual([
      "Abrir projeto...",
      "Abrir recentes",
      "Salvar",
      "Salvar como...",
      "Exportar Engine Pack",
      "Executar ROM",
      "Exportar ROM .gba",
      "Fechar",
      "Sair"
    ]);

    const submenu = fileMenu!.submenu as Array<{ label: string; accelerator?: string; click?: () => void }>;
    expect(submenu.find((item) => item.label === "Abrir projeto...")?.accelerator).toBe("CmdOrCtrl+O");
    expect(submenu.find((item) => item.label === "Salvar")?.accelerator).toBe("CmdOrCtrl+S");
    expect(submenu.find((item) => item.label === "Salvar como...")?.accelerator).toBe("Shift+CmdOrCtrl+S");
    expect(submenu.find((item) => item.label === "Executar ROM")?.accelerator).toBe("CmdOrCtrl+B");
    expect(submenu.find((item) => item.label === "Exportar ROM .gba")?.accelerator).toBe("Shift+CmdOrCtrl+B");
    expect(submenu.find((item) => item.label === "Preview rapido")).toBeUndefined();

    submenu.find((item) => item.label === "Exportar Engine Pack")?.click?.();
    submenu.find((item) => item.label === "Executar ROM")?.click?.();
    submenu.find((item) => item.label === "Exportar ROM .gba")?.click?.();

    expect(sendCommand).toHaveBeenCalledWith("engine:export");
    expect(sendCommand).toHaveBeenCalledWith("project:play");
    expect(sendCommand).toHaveBeenCalledWith("project:export-rom");
  });

  it.each([true, false])("closes the focused window through the native role (mac=%s)", (isMac) => {
    const template = createAppMenuTemplate({ appName: "GBA Studio", isMac, locale: "pt-BR", sendCommand: vi.fn() });
    const fileMenu = template.find(item => item.label === "Arquivo");
    const close = (fileMenu!.submenu as Array<{ role?: string; accelerator?: string; click?: unknown }>)
      .find(item => item.role === "close");
    expect(close).toMatchObject({ role: "close", accelerator: "CmdOrCtrl+W" });
    expect(close?.click).toBeUndefined();
  });

  it("keeps the macOS app menu before the File menu", () => {
    const template = createAppMenuTemplate({ appName: "GBA Studio", isMac: true, locale: "pt-BR", sendCommand: vi.fn() });
    const labels = template.map((item) => item.label);

    expect(template[0].label).toBe("GBA Studio");
    expect(labels.indexOf("GBA Studio")).toBeLessThan(labels.indexOf("Arquivo"));
    expect(labels).toContain("Projeto");
  });

  it("routes undo and redo through renderer app commands", () => {
    const sendCommand = vi.fn();
    const template = createAppMenuTemplate({ isMac: false, locale: "pt-BR", sendCommand });
    const editMenu = template.find((item) => item.label === "Editar");
    const submenu = editMenu!.submenu as Array<{ label: string; accelerator?: string; click?: () => void }>;

    expect(submenu.find((item) => item.label === "Desfazer")?.accelerator).toBe("CmdOrCtrl+Z");
    expect(submenu.find((item) => item.label === "Refazer")?.accelerator).toBe("Shift+CmdOrCtrl+Z");

    submenu.find((item) => item.label === "Desfazer")?.click?.();
    submenu.find((item) => item.label === "Refazer")?.click?.();

    expect(sendCommand).toHaveBeenCalledWith("edit:undo");
    expect(sendCommand).toHaveBeenCalledWith("edit:redo");
  });
});
