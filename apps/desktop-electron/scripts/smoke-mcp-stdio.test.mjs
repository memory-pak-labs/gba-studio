import { describe, expect, it } from "vitest";

import {
  EXPECTED_MCP_V1_TOOLS,
  assertMcpToolNames,
  assertMcpAuthorizedToolPayloads,
  createJsonRpcRequest,
  parseJsonLines
} from "./smoke-mcp-stdio.mjs";

describe("smoke MCP stdio helpers", () => {
  it("frames JSON-RPC requests and parses messages split across chunks", () => {
    const request = createJsonRpcRequest(7, "tools/list");
    expect(request.endsWith("\n")).toBe(true);

    const firstChunk = request.slice(0, 12);
    const secondChunk = request.slice(12);
    const first = parseJsonLines(firstChunk);
    const second = parseJsonLines(first.remainder + secondChunk);

    expect(first.messages).toEqual([]);
    expect(second.messages).toEqual([
      { jsonrpc: "2.0", id: 7, method: "tools/list" }
    ]);
    expect(second.remainder).toBe("");
  });

  it("accepts the deterministic five-tool v1 contract", () => {
    expect(EXPECTED_MCP_V1_TOOLS).toEqual([
      "gbs_project_summary",
      "gbs_project_diagnostics",
      "gbs_list_assets",
      "gbs_inspect_asset",
      "gbs_project_budget"
    ]);
    expect(() => assertMcpToolNames(EXPECTED_MCP_V1_TOOLS)).not.toThrow();
  });

  it("rejects a missing or unexpected MCP v1 tool", () => {
    expect(() => assertMcpToolNames(EXPECTED_MCP_V1_TOOLS.slice(0, -1))).toThrow(/MCP v1/);
    expect(() => assertMcpToolNames([...EXPECTED_MCP_V1_TOOLS, "gbs_write_project"])).toThrow(/MCP v1/);
  });

  it("requires every authorized read-only tool to return a successful payload", () => {
    const assets = { ok: true, data: [{ id: "asset-1" }] };
    expect(() => assertMcpAuthorizedToolPayloads({
      summary: { ok: true, data: { projectPath: "/tmp/project" } },
      diagnostics: { ok: true, data: { issueCount: 0 } },
      assets,
      inspect: { ok: true, data: { asset: { id: "asset-1" } } },
      budget: { ok: true, data: { ok: true, report: { schema: 1 } } }
    })).not.toThrow();

    expect(() => assertMcpAuthorizedToolPayloads({
      summary: { ok: true, data: { projectPath: "/tmp/project" } },
      diagnostics: { ok: true, data: { issueCount: 0 } },
      assets,
      inspect: { ok: true, data: { asset: { id: "asset-1" } } },
      budget: { ok: true, data: { ok: false, error: "missing asset" } }
    })).toThrow(/orçamento/i);
  });
});
