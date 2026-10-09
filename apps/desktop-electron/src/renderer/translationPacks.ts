import {
  translationPackCatalogURL,
  translationPackForLocale,
  type TranslationPackCatalog,
  type TranslationPackStatus
} from "../shared/translationPacks.js";
import type { DownloadTranslationPackResult } from "../shared/ipc.js";

let catalogPromise: Promise<TranslationPackCatalog> | null = null;
let statusPromise: Promise<TranslationPackStatus[]> | null = null;

function desktopAPI(): typeof window.gbaStudio | null {
  return typeof window !== "undefined" && window.gbaStudio ? window.gbaStudio : null;
}

export async function getTranslationPackCatalog(): Promise<TranslationPackCatalog> {
  if (!catalogPromise) {
    const pending = fetch(new URL(translationPackCatalogURL, window.location.href), { credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catálogo de tradução indisponível (HTTP ${response.status}).`);
        return response.json() as Promise<TranslationPackCatalog>;
      })
      .catch((error) => {
        if (catalogPromise === pending) catalogPromise = null;
        throw error;
      });
    catalogPromise = pending;
  }
  return catalogPromise;
}

export async function getTranslationPackStatuses(): Promise<TranslationPackStatus[]> {
  if (!statusPromise) {
    const api = desktopAPI();
    const pending = (api
      ? api.getTranslationPackStatus().then((result) => {
        if (!result.ok) throw new Error(result.error ?? "Não foi possível consultar os pacotes de tradução.");
        return result.packs;
      })
      : getTranslationPackCatalog().then((catalog) => catalog.packs.map((pack) => ({
        id: pack.id,
        label: pack.label,
        description: pack.description,
        languages: pack.languages,
        bundled: pack.bundled,
        available: pack.available,
        installed: pack.bundled,
        sizeBytes: pack.sizeBytes,
        unavailableReason: pack.unavailableReason
      }))))
      .catch((error) => {
        if (statusPromise === pending) statusPromise = null;
        throw error;
      });
    statusPromise = pending;
  }
  return statusPromise;
}

export function invalidateTranslationPackStatuses(): void {
  statusPromise = null;
}

export async function downloadTranslationPack(packID: string): Promise<DownloadTranslationPackResult> {
  const api = desktopAPI();
  if (!api) return { ok: false, error: "O download de pacotes só está disponível no aplicativo desktop." };
  const result = await api.downloadTranslationPack(packID);
  invalidateTranslationPackStatuses();
  return result;
}

export async function removeTranslationPack(packID: string): Promise<DownloadTranslationPackResult> {
  const api = desktopAPI();
  if (!api) return { ok: false, error: "A remoção de pacotes só está disponível no aplicativo desktop." };
  const result = await api.removeTranslationPack(packID);
  invalidateTranslationPackStatuses();
  return result;
}

export async function getInstalledTranslationPackIDs(): Promise<string[]> {
  const statuses = await getTranslationPackStatuses();
  return statuses.filter((pack) => pack.installed).map((pack) => pack.id);
}

export async function requireInstalledTranslationPackForLocale(locale: string): Promise<string> {
  const catalog = await getTranslationPackCatalog();
  const pack = translationPackForLocale(catalog, locale);
  if (!pack || !pack.available) {
    throw new Error(`O Bergamot não possui um pacote offline disponível para ${locale}.`);
  }

  const statuses = await getTranslationPackStatuses();
  const status = statuses.find((entry) => entry.id === pack.id);
  if (!status?.installed) {
    throw new Error(`Baixe o pacote de tradução de ${pack.label} em Ajustes para usar a tradução offline.`);
  }
  return pack.id;
}

export function buildInstalledTranslationRegistry(
  catalog: TranslationPackCatalog,
  installedPackIDs: readonly string[]
): Record<string, Record<string, { name: string; size: number; expectedSha256Hash: string }>> {
  const installed = new Set(installedPackIDs);
  return Object.fromEntries(catalog.packs
    .filter((pack) => pack.available && installed.has(pack.id))
    .flatMap((pack) => Object.entries(pack.files))
    .map(([pair, files]) => [pair, Object.fromEntries(Object.entries(files).map(([part, file]) => [part, {
      name: `gba-translation://model?pair=${encodeURIComponent(pair)}&file=${encodeURIComponent(file.name)}`,
      size: file.size,
      expectedSha256Hash: file.expectedSha256Hash
    }]))]));
}
