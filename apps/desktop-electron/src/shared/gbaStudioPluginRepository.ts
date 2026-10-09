import { normalizePluginType, satisfiesGbaStudioVersion } from "./gbaStudioPlugins.js";

// A native public registry has not been published yet.
export const DEFAULT_PLUGIN_REPOSITORY_URL = "";

export interface PluginRepositoryEntry {
  id: string;
  type: string;
  name: string;
  author: string;
  description: string;
  version: string;
  gbaStudioVersion?: string;
  license?: string;
  url?: string;
  images?: string[];
  filename: string;
}

export interface PluginRepository {
  name: string;
  shortName?: string;
  author?: string;
  plugins: PluginRepositoryEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function pluginRepositoryEntryArchiveURL(baseURL: string, entry: PluginRepositoryEntry): string {
  const repositoryURL = new URL(baseURL);
  const directoryPath = repositoryURL.pathname.replace(/\/[^/]*$/, "/");
  repositoryURL.pathname = `${directoryPath}${entry.filename.replace(/^\/+/, "")}`;
  return repositoryURL.toString();
}

export function parsePluginRepositoryJson(text: string): { repository: PluginRepository } | { error: string } {
  try {
    return validatePluginRepository(JSON.parse(text));
  } catch {
    return { error: "repository.json invalido." };
  }
}

export function validatePluginRepository(raw: unknown): { repository: PluginRepository } | { error: string } {
  if (!isRecord(raw)) return { error: "repository.json deve ser um objeto JSON." };

  const name = nonEmptyString(raw.name);
  if (!name) return { error: "repository.json sem name." };
  if (!Array.isArray(raw.plugins)) return { error: "repository.json sem plugins." };

  const plugins: PluginRepositoryEntry[] = [];
  for (const plugin of raw.plugins) {
    const validated = validatePluginRepositoryEntry(plugin);
    if ("error" in validated) return validated;
    plugins.push(validated.entry);
  }

  return {
    repository: {
      name,
      shortName: nonEmptyString(raw.shortName) ?? undefined,
      author: nonEmptyString(raw.author) ?? undefined,
      plugins
    }
  };
}

export function validatePluginRepositoryEntry(raw: unknown): { entry: PluginRepositoryEntry } | { error: string } {
  if (!isRecord(raw)) return { error: "Entrada invalida em plugins." };
  const id = nonEmptyString(raw.id);
  const type = nonEmptyString(raw.type);
  const name = nonEmptyString(raw.name);
  const author = nonEmptyString(raw.author);
  const description = nonEmptyString(raw.description);
  const version = nonEmptyString(raw.version);
  const filename = nonEmptyString(raw.filename);
  if (!id || !type || !name || !author || !description || !version || !filename) {
    return { error: `Entrada de catalogo incompleta: ${id ?? "sem id"}.` };
  }
  if (!normalizePluginType(type)) return { error: `O catálogo aceita somente tipos nativos do GBA Studio: ${id} (${type}).` };
  const gbaStudioVersion = nonEmptyString(raw.gbaStudioVersion);
  if (!gbaStudioVersion) return { error: `Plugin ${id} sem gbaStudioVersion. O catálogo aceita somente plugins do GBA Studio.` };
  if (!satisfiesGbaStudioVersion(gbaStudioVersion)) return { error: `Plugin ${id} exige GBA Studio ${gbaStudioVersion}.` };
  return { entry: {
    id, type, name, author, description, version, filename, gbaStudioVersion,
    license: nonEmptyString(raw.license) ?? undefined,
    url: nonEmptyString(raw.url) ?? undefined,
    images: Array.isArray(raw.images) ? raw.images.filter((image): image is string => typeof image === "string" && image.trim().length > 0) : undefined
  } };
}
