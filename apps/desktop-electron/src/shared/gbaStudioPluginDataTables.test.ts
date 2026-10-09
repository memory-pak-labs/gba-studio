import { describe, expect, it } from "vitest";
import {
  lookupPluginDataTableRow,
  normalizeDataTableSymbol,
  parsePluginDataTableCsv,
  pluginDataTablesForExport
} from "./gbaStudioPluginDataTables.js";

describe("gbaStudioPluginDataTables", () => {
  it("parseia CSV de tabela de plugin", () => {
    const parsed = parsePluginDataTableCsv(
      "Stats,hp,max_hp\nhero,8,16\nmage,4,12",
      "acme/stats",
      "stats.csv"
    );

    expect(parsed).toMatchObject({
      symbol: "stats",
      rowSize: 2,
      rows: [
        { label: "hero", values: [8, 16] },
        { label: "mage", values: [4, 12] }
      ]
    });
  });

  it("faz lookup por simbolo e exporta contrato", () => {
    const table = parsePluginDataTableCsv("Stats,hp\nhero,8", "acme/stats", "stats.csv");
    if ("error" in table) throw new Error(table.error);

    const row = lookupPluginDataTableRow([table], normalizeDataTableSymbol("stats"), 0);
    expect(row?.values).toEqual([8]);
    expect(pluginDataTablesForExport([table])).toEqual([
      {
        symbol: "stats",
        label: "Stats",
        row_size: 1,
        values: [[8]]
      }
    ]);
  });
});
