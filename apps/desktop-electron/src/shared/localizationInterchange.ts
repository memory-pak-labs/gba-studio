export interface LocalizationEntry {
  id: string;
  values: Record<string, string>;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted && character === '"' && csv[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function exportLocalizationCsv(entries: readonly LocalizationEntry[], locales: readonly string[]): string {
  const rows = [
    ["id", ...locales],
    ...entries.map((entry) => [entry.id, ...locales.map((locale) => entry.values[locale] ?? "")])
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function importLocalizationCsv(csv: string): LocalizationEntry[] {
  const [header = [], ...rows] = parseCsvRows(csv);
  const locales = header.slice(1);
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      id: row[0],
      values: Object.fromEntries(locales.map((locale, index) => [locale, row[index + 1] ?? ""]))
    }));
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function text(value: string): string {
  return value.replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
}

export function exportLocalizationXliff(
  entries: readonly LocalizationEntry[],
  sourceLocale: string,
  targetLocale: string
): string {
  const units = entries.map((entry) => [
    `    <unit id="${xml(entry.id)}">`,
    "      <segment>",
    `        <source>${xml(entry.values[sourceLocale] ?? "")}</source>`,
    `        <target>${xml(entry.values[targetLocale] ?? "")}</target>`,
    "      </segment>",
    "    </unit>"
  ].join("\n")).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" srcLang="${xml(sourceLocale)}" trgLang="${xml(targetLocale)}">
  <file id="gba-studio">
${units}
  </file>
</xliff>
`;
}

export function importLocalizationXliff(xliff: string): {
  sourceLocale: string;
  targetLocale: string;
  entries: LocalizationEntry[];
} {
  const root = xliff.match(/<xliff\b([^>]*)>/i)?.[1] ?? "";
  const sourceLocale = text(root.match(/\bsrcLang="([^"]*)"/i)?.[1] ?? "");
  const targetLocale = text(root.match(/\btrgLang="([^"]*)"/i)?.[1] ?? "");
  const entries = [...xliff.matchAll(/<unit\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/unit>/gi)].map((match) => ({
    id: text(match[1]),
    values: {
      [sourceLocale]: text(match[2].match(/<source>([\s\S]*?)<\/source>/i)?.[1] ?? ""),
      [targetLocale]: text(match[2].match(/<target>([\s\S]*?)<\/target>/i)?.[1] ?? "")
    }
  }));
  return { sourceLocale, targetLocale, entries };
}

export function auditGlyphCoverage(texts: readonly string[], availableGlyphs: ReadonlySet<string>): string[] {
  return [...new Set(texts.join("").replaceAll(/\r?\n/g, "").split(""))]
    .filter((character) => !availableGlyphs.has(character))
    .sort((a, b) => a.localeCompare(b));
}
