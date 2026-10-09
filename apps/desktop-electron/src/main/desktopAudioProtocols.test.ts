import { expect, it, vi } from "vitest";
const { register } = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("electron", () => ({ protocol: { registerSchemesAsPrivileged: register }, app: {}, ipcMain: {} }));
import { registerTranslationModelProtocolScheme } from "./translationPacks.js";
it("registra os dois protocolos numa chamada, sem perder fetch/CORS do áudio", () => {
  registerTranslationModelProtocolScheme();
  expect(register).toHaveBeenCalledTimes(1);
  expect(register.mock.calls[0][0]).toEqual(expect.arrayContaining([
    expect.objectContaining({ scheme: "gba-asset", privileges: expect.objectContaining({ supportFetchAPI: true, corsEnabled: true, secure: true }) }),
    expect.objectContaining({ scheme: "gba-translation", privileges: expect.objectContaining({ supportFetchAPI: true }) })
  ]));
});
