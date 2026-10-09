export interface TranslationPackFile {
  name: string;
  size: number;
  expectedSha256Hash: string;
  remoteURL: string;
}

export interface TranslationPackPair {
  [part: string]: TranslationPackFile;
}

export interface TranslationPackManifest {
  id: string;
  label: string;
  description: string;
  languages: string[];
  pairs: string[];
  bundled: boolean;
  available: boolean;
  sizeBytes: number;
  files: Record<string, TranslationPackPair>;
  unavailableReason?: string;
}

export interface TranslationPackCatalog {
  formatVersion: 1;
  generatedAt: string;
  registryURL: string;
  modelBaseURL: string;
  corePackID: string;
  packs: TranslationPackManifest[];
}

export interface TranslationPackStatus {
  id: string;
  label: string;
  description: string;
  languages: string[];
  bundled: boolean;
  available: boolean;
  installed: boolean;
  sizeBytes: number;
  unavailableReason?: string;
}

export const translationPackCatalogURL = "translation-packs.json";

export function translationPackForLocale(catalog: TranslationPackCatalog, locale: string): TranslationPackManifest | null {
  return catalog.packs.find((pack) => pack.languages.includes(locale)) ?? null;
}

export function translationPackIDsForRegistry(
  catalog: TranslationPackCatalog,
  installedPackIDs: readonly string[]
): string[] {
  const installed = new Set(installedPackIDs);
  return catalog.packs
    .filter((pack) => pack.available && installed.has(pack.id))
    .flatMap((pack) => pack.pairs);
}

export function translationPackSizeLabel(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
