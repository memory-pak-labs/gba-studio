import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { name: "GBA Studio" }, BrowserWindow: {}, Menu: {} }));
import { createAppMenuTemplate } from "./appMenu.js";
import { isAppLocale, localizeNativeDialog } from "./nativeUiLocale.js";

describe("native UI locale", () => {
  it("starts the native menu in English before a renderer preference is supplied", () => {
    const menu = createAppMenuTemplate({ isMac: false, sendCommand: vi.fn() });
    expect(menu.some(item => item.label === "File")).toBe(true);
    expect(menu.some(item => item.label === "Arquivo")).toBe(false);
  });
  it.each([
    ["pt-BR", "Arquivo", "Salvar", "Executar ROM"],
    ["en-US", "File", "Save", "Run ROM"],
    ["es-ES", "Archivo", "Guardar", "Ejecutar ROM"]
  ])("localizes menus and preserves command routing in %s", (locale, fileLabel, saveLabel, playLabel) => {
    const sendCommand = vi.fn();
    const template = createAppMenuTemplate({ appName: "My project", isMac: true, locale, sendCommand });
    expect(template[0]!.label).toBe("My project");
    const file = template.find(item => item.label === fileLabel)!;
    const items = file.submenu as Array<{ label: string; accelerator?: string; click?: () => void }>;
    expect(items.find(item => item.label === saveLabel)?.accelerator).toBe("CmdOrCtrl+S");
    items.find(item => item.label === playLabel)!.click!();
    expect(sendCommand).toHaveBeenCalledWith("project:play");
  });
  it("localizes application copy without changing selected files or extensions", () => {
    const options = { title: "Abrir projeto GBA Studio", defaultPath: "/Cenas/Arquivo.gba-project",
      properties: ["openFile"] as ["openFile"], filters: [{ name: "GBA Studio Project", extensions: ["gba-project"] }] };
    const localized = localizeNativeDialog(options, "es-ES");
    expect(localized.title).toBe("Abrir proyecto de GBA Studio");
    expect(localized.defaultPath).toBe(options.defaultPath);
    expect(localized.filters![0]!.extensions).toEqual(["gba-project"]);
    expect(options.title).toBe("Abrir projeto GBA Studio");
  });
  it("accepts only supported app locales at the IPC boundary", () => {
    expect(isAppLocale("pt-BR")).toBe(true);
    expect(isAppLocale("en-US")).toBe(true);
    expect(isAppLocale("es-ES")).toBe(true);
    expect(isAppLocale({ locale: "en-US" })).toBe(false);
    expect(isAppLocale("../anything")).toBe(false);
    expect(isAppLocale("xx-XX")).toBe(false);
  });
});
