import { describe, it } from "vitest";
import { join } from "node:path";
import { verifyElectronInstanceIsolation } from "./smoke-electron-instance-isolation.mjs";

// Native processes run only when an external QA directory is explicitly provided.
describe.skipIf(!process.env.GBA_STUDIO_INSTANCE_QA_OUTPUT)("Electron editor and MCP coexistence", () => {
  it.each(["mcp-first", "editor-first"])("keeps the editor usable with %s", async order => {
    await verifyElectronInstanceIsolation({ order,
      output: join(process.env.GBA_STUDIO_INSTANCE_QA_OUTPUT, order) });
  }, 60_000);
});
