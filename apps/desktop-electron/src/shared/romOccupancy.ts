export type RomOccupancyCategoryID = "code" | "scenes" | "assets" | "audio" | "data" | "other";

export interface LinkerMapEntry {
  section: string;
  address: number;
  bytes: number;
  source: string;
  discarded: boolean;
}

export interface RomOccupancyCategory {
  id: RomOccupancyCategoryID;
  label: string;
  bytes: number;
  entries: LinkerMapEntry[];
}

export interface RomOccupancyReport {
  schema: 1;
  romBytes: number;
  ramBytes: number;
  discardedBytes: number;
  categories: RomOccupancyCategory[];
  largestEntries: LinkerMapEntry[];
}

export function parseGnuLinkerMap(contents: string): LinkerMapEntry[] {
  const entries: LinkerMapEntry[] = [];
  let discarded = false;
  let outputSection: string | null = null;
  let pendingInputSection: string | null = null;
  const appendEntry = (section: string, addressText: string, bytesText: string, source: string): void => {
    const bytes = Number.parseInt(bytesText, 16);
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    entries.push({
      section,
      address: Number.parseInt(addressText, 16),
      bytes,
      source: source.trim(),
      discarded
    });
  };
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === "Discarded input sections") {
      discarded = true;
      outputSection = null;
      pendingInputSection = null;
      continue;
    }
    if (line.trim() === "Linker script and memory map") {
      discarded = false;
      outputSection = null;
      pendingInputSection = null;
      continue;
    }
    const outputMatch = line.match(/^(\.[A-Za-z0-9_.$-]+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s.*)?$/);
    if (outputMatch) {
      outputSection = outputMatch[1];
      pendingInputSection = null;
      continue;
    }
    const directMatch = line.match(/^\s+(\.[A-Za-z0-9_.$-]+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)\s+(.+?)\s*$/);
    if (directMatch) {
      appendEntry(directMatch[1], directMatch[2], directMatch[3], directMatch[4]);
      pendingInputSection = null;
      continue;
    }
    const sectionOnlyMatch = line.match(/^\s+(\.[A-Za-z0-9_.$-]+)\s*$/);
    if (sectionOnlyMatch) {
      pendingInputSection = sectionOnlyMatch[1];
      continue;
    }
    const continuationMatch = line.match(/^\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)\s+(.+?)\s*$/);
    if (continuationMatch && (pendingInputSection || outputSection)) {
      appendEntry(
        pendingInputSection ?? outputSection ?? ".unknown",
        continuationMatch[1],
        continuationMatch[2],
        continuationMatch[3]
      );
      pendingInputSection = null;
    }
  }
  return entries;
}

function categoryForEntry(entry: LinkerMapEntry): RomOccupancyCategoryID {
  const haystack = `${entry.section} ${entry.source}`.toLowerCase();
  if (haystack.includes("assets/") || haystack.includes(".assets") || haystack.includes("tile") || haystack.includes("sprite")) {
    return "assets";
  }
  if (haystack.includes("audio") || haystack.includes("music") || haystack.includes("sound")) return "audio";
  if (haystack.includes("_runtime") || haystack.includes("project_data") || haystack.includes("scene")) return "scenes";
  if (entry.section.startsWith(".text") || entry.section.startsWith(".init")) return "code";
  if (entry.section.startsWith(".data") || entry.section.startsWith(".bss") || entry.section.startsWith(".rodata")) return "data";
  return "other";
}

const categoryLabels: Record<RomOccupancyCategoryID, string> = {
  code: "Código da engine",
  scenes: "Cenas e runtimes",
  assets: "Gráficos e assets",
  audio: "Áudio",
  data: "Dados do projeto",
  other: "Outros"
};

export function deriveRomOccupancyReport(entries: readonly LinkerMapEntry[]): RomOccupancyReport {
  const linked = entries.filter((entry) => !entry.discarded);
  const isRom = (entry: LinkerMapEntry) => entry.address >= 0x08000000 && entry.address < 0x0A000000;
  const isRam = (entry: LinkerMapEntry) => (
    (entry.address >= 0x02000000 && entry.address < 0x02040000)
    || (entry.address >= 0x03000000 && entry.address < 0x03008000)
  );
  const categories = new Map<RomOccupancyCategoryID, LinkerMapEntry[]>();
  for (const entry of linked.filter(isRom)) {
    const id = categoryForEntry(entry);
    categories.set(id, [...(categories.get(id) ?? []), entry]);
  }
  return {
    schema: 1,
    romBytes: linked.filter(isRom).reduce((total, entry) => total + entry.bytes, 0),
    ramBytes: linked.filter(isRam).reduce((total, entry) => total + entry.bytes, 0),
    discardedBytes: entries.filter((entry) => entry.discarded).reduce((total, entry) => total + entry.bytes, 0),
    categories: [...categories.entries()].map(([id, categoryEntries]) => ({
      id,
      label: categoryLabels[id],
      bytes: categoryEntries.reduce((total, entry) => total + entry.bytes, 0),
      entries: [...categoryEntries].sort((left, right) => right.bytes - left.bytes)
    })),
    largestEntries: [...linked].sort((left, right) => right.bytes - left.bytes).slice(0, 50)
  };
}
