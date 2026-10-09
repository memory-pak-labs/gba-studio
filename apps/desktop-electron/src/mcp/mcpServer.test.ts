import path from "node:path";
import { describe, expect, it } from "vitest";

import { createGbaStudioMcpServer } from "./mcpServer.js";

describe("createGbaStudioMcpServer", () => {
  it("creates a local server for the configured project", async () => {
    const projectPath = path.resolve(process.cwd(), "default-assets/templates/exemplo-gba/exemplo-gba.gba-project");

    await expect(createGbaStudioMcpServer({ projectPath })).resolves.toBeDefined();
  });
});
