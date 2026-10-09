import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { LoadedGBAStudioPlugin } from "../shared/gbaStudioPlugins.js";
import {
  parseManifestDataTable,
  parsePluginDataTableCsv,
  type PluginDataTableDefinition
} from "../shared/gbaStudioPluginDataTables.js";

export async function loadPluginDataTables(plugin: LoadedGBAStudioPlugin): Promise<{
  tables: PluginDataTableDefinition[];
  errors: Array<{ source: string; message: string }>;
}> {
  const tables: PluginDataTableDefinition[] = [];
  const errors: Array<{ source: string; message: string }> = [];
  const seenSymbols = new Set<string>();

  for (const rawTable of plugin.manifest.dataTables ?? []) {
    const parsed = parseManifestDataTable(rawTable, plugin.manifest.id);
    if ("error" in parsed) {
      errors.push({ source: plugin.manifestPath, message: parsed.error });
      continue;
    }
    if (seenSymbols.has(parsed.symbol)) {
      errors.push({ source: plugin.manifestPath, message: `Simbolo de tabela duplicado: ${parsed.symbol}.` });
      continue;
    }
    seenSymbols.add(parsed.symbol);
    tables.push(parsed);
  }

  const dataDirectory = path.join(plugin.pluginRoot, "data");
  try {
    const entries = await readdir(dataDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".csv")) continue;
      const csvPath = path.join(dataDirectory, entry.name);
      const parsed = parsePluginDataTableCsv(await readFile(csvPath, "utf8"), plugin.manifest.id, entry.name);
      if ("error" in parsed) {
        errors.push({ source: csvPath, message: parsed.error });
        continue;
      }
      if (seenSymbols.has(parsed.symbol)) {
        errors.push({ source: csvPath, message: `Simbolo de tabela duplicado: ${parsed.symbol}.` });
        continue;
      }
      seenSymbols.add(parsed.symbol);
      tables.push(parsed);
    }
  } catch {
    // pasta data/ opcional
  }

  return { tables, errors };
}
