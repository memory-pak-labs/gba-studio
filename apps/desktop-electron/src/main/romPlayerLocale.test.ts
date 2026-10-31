import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRomPlayerServer } from "./romPlayerWindow.js";

describe("ROM player app locale", () => {
  it("passes the interface language without changing the ROM path or title", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gba-player-locale-"));
    await mkdir(path.join(root, "player"));
    const romPath = path.join(root, "Farol.gba");
    await writeFile(romPath, "test-rom");
    const server = await createRomPlayerServer({ romPath, title: "Cenas {0}", webPlayerRoot: root, locale: "es-ES" });
    try {
      const url = new URL(server.url);
      expect(url.searchParams.get("locale")).toBe("es-ES");
      expect(url.searchParams.get("rom")).toBe("../roms/Farol.gba");
      expect(url.searchParams.get("title")).toBe("Cenas {0}");
    } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
  });
});
