export interface PluginDataTableColumn {
  variable: string;
}

export interface PluginDataTableRow {
  label: string;
  values: number[];
}

export interface PluginDataTableDefinition {
  id: string;
  symbol: string;
  label: string;
  indexVariable: string | null;
  columns: PluginDataTableColumn[];
  rows: PluginDataTableRow[];
  rowSize: number;
  pluginId: string;
}

export interface PluginDataTableExportRow {
  symbol: string;
  label: string;
  row_size: number;
  values: number[][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeDataTableSymbol(tableId: string): string {
  return tableId.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parsePluginDataTableCsv(text: string, pluginId: string, sourceName: string): PluginDataTableDefinition | { error: string } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { error: `CSV ${sourceName} precisa de cabecalho e ao menos uma linha.` };

  const header = parseCsvLine(lines[0]!);
  const label = header[0];
  if (!label) return { error: `CSV ${sourceName} sem label de tabela.` };
  const columnNames = header.slice(1).filter(Boolean);
  if (columnNames.length === 0) return { error: `CSV ${sourceName} sem colunas.` };

  const rows: PluginDataTableRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const rowLabel = cells[0] ?? "";
    const values = cells.slice(1, columnNames.length + 1).map((cell) => {
      const parsed = Number.parseInt(cell, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
    if (values.length !== columnNames.length) {
      return { error: `CSV ${sourceName} linha "${rowLabel}" com numero invalido de colunas.` };
    }
    rows.push({ label: rowLabel, values });
  }

  const tableId = `${pluginId}/${sourceName.replace(/\.csv$/i, "")}`;
  return {
    id: tableId,
    symbol: normalizeDataTableSymbol(sourceName.replace(/\.csv$/i, "")),
    label,
    indexVariable: null,
    columns: columnNames.map((variable) => ({ variable })),
    rows,
    rowSize: columnNames.length,
    pluginId
  };
}

export function parseManifestDataTable(raw: unknown, pluginId: string): PluginDataTableDefinition | { error: string } {
  if (!isRecord(raw)) return { error: "Tabela invalida." };
  const id = nonEmptyString(raw.id);
  const label = nonEmptyString(raw.label);
  if (!id || !label) return { error: "Tabela sem id ou label." };

  const columnsRaw = Array.isArray(raw.columns) ? raw.columns : [];
  const columns: PluginDataTableColumn[] = [];
  for (const column of columnsRaw) {
    if (!isRecord(column)) return { error: `Coluna invalida em ${id}.` };
    const variable = nonEmptyString(column.variable);
    if (!variable) return { error: `Coluna sem variable em ${id}.` };
    columns.push({ variable });
  }
  if (columns.length === 0) return { error: `Tabela ${id} sem colunas.` };

  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : [];
  const rows: PluginDataTableRow[] = [];
  for (const row of rowsRaw) {
    if (!isRecord(row)) return { error: `Linha invalida em ${id}.` };
    const rowLabel = nonEmptyString(row.label) ?? "";
    const valuesRaw = Array.isArray(row.values) ? row.values : [];
    const values = valuesRaw.map((value) => {
      const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
    if (values.length !== columns.length) {
      return { error: `Linha "${rowLabel}" em ${id} com numero invalido de valores.` };
    }
    rows.push({ label: rowLabel, values });
  }

  return {
    id: `${pluginId}/${id}`,
    symbol: normalizeDataTableSymbol(id),
    label,
    indexVariable: nonEmptyString(raw.indexVariable),
    columns,
    rows,
    rowSize: columns.length,
    pluginId
  };
}

export function pluginDataTablesForExport(tables: PluginDataTableDefinition[]): PluginDataTableExportRow[] {
  return tables.map((table) => ({
    symbol: table.symbol,
    label: table.label,
    row_size: table.rowSize,
    values: table.rows.map((row) => row.values)
  }));
}

export function lookupPluginDataTableRow(
  tables: PluginDataTableDefinition[],
  tableIdOrSymbol: string,
  rowIndex: number
): PluginDataTableRow | null {
  const normalized = normalizeDataTableSymbol(tableIdOrSymbol);
  const table = tables.find((entry) => (
    entry.id === tableIdOrSymbol ||
    entry.symbol === normalized ||
    entry.id.endsWith(`/${tableIdOrSymbol}`) ||
    entry.id.endsWith(`/${normalized}`)
  ));
  if (!table) return null;
  if (rowIndex < 0 || rowIndex >= table.rows.length) return null;
  return table.rows[rowIndex] ?? null;
}
