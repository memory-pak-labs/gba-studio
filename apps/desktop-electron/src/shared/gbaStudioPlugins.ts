import type { EventCommandDefinition } from "./eventCommandLibrary.js";
import type {
  EventCommandRecipeDefinition,
  EventCommandRecipeStepDefinition
} from "./eventCommandRecipeLibrary.js";
import type { EventsWorkspaceCommandRuntimeStatus } from "./eventsWorkspace/core.js";
import type { PluginDataTableDefinition } from "./gbaStudioPluginDataTables.js";
import type { PluginImportedAssetRecord } from "./gbaStudioPluginAssets.js";
import { isSafePluginRelativePath } from "./pluginPathSafety.js";

export type { PluginImportedAssetRecord } from "./gbaStudioPluginAssets.js";

export const GBA_STUDIO_APP_VERSION = "0.1.0";
export const GBA_STUDIO_PLUGIN_SDK_VERSION = "1.0.0";

export type GBAStudioPluginNativeType =
  | "assetPack"
  | "recipePack"
  | "dataTablePack"
  | "templatePack"
  | "eventCommandPack"
  | "enginePatchPack"
  | "themePack"
  | "languagePack";

export interface PluginManifestRecipeStep {
  command?: string;
  commandTemplate?: string;
  category: string;
  detail: string;
}

export interface PluginManifestRecipe {
  id: string;
  title: string;
  category: string;
  summary?: string;
  systemImage?: string;
  steps: PluginManifestRecipeStep[];
}

export type PluginCommandExportTargetKind =
  | "None"
  | "Audio"
  | "Dialogue"
  | "Room"
  | "Event"
  | "Variable"
  | "Flag"
  | "Inventory"
  | "Actor";

export interface PluginCommandExportMapping {
  opcode?: string;
  op?: string;
  targetKind?: PluginCommandExportTargetKind;
  operandToken?: number;
  arg0Token?: number;
  arg1Token?: number;
}

export interface PluginManifestCommand {
  id: string;
  title: string;
  category: string;
  section?: string | null;
  isFavorite?: boolean;
  commandTemplate: string;
  runtimeStatus?: EventsWorkspaceCommandRuntimeStatus;
  export?: PluginCommandExportMapping;
}

export interface GBAStudioPluginManifest {
  id: string;
  type: string;
  version: string;
  sdkVersion?: string;
  gbaStudioVersion?: string;
  name: string;
  author: string;
  description: string;
  license?: string;
  order?: number;
  recipes?: PluginManifestRecipe[];
  commands?: PluginManifestCommand[];
  dataTables?: unknown[];
  assets?: PluginManifestAsset[];
}

export interface PluginManifestAsset {
  source: string;
  kind?: string;
  name?: string;
}

export interface PluginLoadError {
  manifestPath: string;
  message: string;
}

export interface LoadedGBAStudioPlugin {
  manifest: GBAStudioPluginManifest;
  normalizedType: GBAStudioPluginNativeType;
  pluginRoot: string;
  manifestPath: string;
  order: number;
}

export interface PluginEventCommandDefinition extends EventCommandDefinition {
  pluginId: string;
  verb: string;
  runtimeStatus: EventsWorkspaceCommandRuntimeStatus;
  exportMapping: PluginCommandExportMapping | null;
}

export interface PluginCatalogEntry {
  pluginId: string;
  name: string;
  type: GBAStudioPluginNativeType;
  author: string;
  description: string;
  version: string;
  sdkVersion: string | null;
  executable: boolean;
  notes: string | null;
}

export interface ProjectPluginRegistry {
  plugins: LoadedGBAStudioPlugin[];
  commands: PluginEventCommandDefinition[];
  recipes: EventCommandRecipeDefinition[];
  dataTables: PluginDataTableDefinition[];
  importedAssets: PluginImportedAssetRecord[];
  catalog: PluginCatalogEntry[];
  commandVerbs: Set<string>;
  commandRuntimeStatusByVerb: Map<string, EventsWorkspaceCommandRuntimeStatus>;
  exportMappingByVerb: Map<string, PluginCommandExportMapping>;
  errors: PluginLoadError[];
}

export function resolveProjectRootFromProjectPath(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : normalized;
}

const NATIVE_PLUGIN_TYPES = new Set<GBAStudioPluginNativeType>([
  "assetPack",
  "recipePack",
  "dataTablePack",
  "templatePack",
  "eventCommandPack",
  "enginePatchPack",
  "themePack",
  "languagePack"
]);

export function normalizePluginType(rawType: string): GBAStudioPluginNativeType | null {
  const trimmed = rawType.trim() as GBAStudioPluginNativeType;
  return NATIVE_PLUGIN_TYPES.has(trimmed) ? trimmed : null;
}

export function satisfiesGbaStudioVersion(
  constraint: string | undefined,
  appVersion: string = GBA_STUDIO_APP_VERSION
): boolean {
  const trimmed = constraint?.trim();
  if (!trimmed) return true;
  return satisfiesPluginSdkVersion(trimmed, appVersion);
}

function parsedSemver(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

/** Resolves the deliberately small semver range supported by the plugin SDK contract. */
export function satisfiesPluginSdkVersion(
  constraint: string | undefined,
  sdkVersion: string = GBA_STUDIO_PLUGIN_SDK_VERSION
): boolean {
  const trimmed = constraint?.trim();
  if (!trimmed) return true;
  const match = /^(>=|<=|>|<|\^|~)?\s*(\d+\.\d+\.\d+(?:[-+].*)?)$/.exec(trimmed);
  const required = match ? parsedSemver(match[2]) : null;
  const actual = parsedSemver(sdkVersion);
  if (!required || !actual) return false;
  const comparison = compareSemver(actual, required);
  switch (match?.[1] ?? "=") {
    case ">=": return comparison >= 0;
    case "<=": return comparison <= 0;
    case ">": return comparison > 0;
    case "<": return comparison < 0;
    case "^":
      return actual[0] === required[0] && comparison >= 0;
    case "~":
      return actual[0] === required[0] && actual[1] === required[1] && comparison >= 0;
    default:
      return comparison === 0;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function recipeStepCommandTemplate(step: PluginManifestRecipeStep): string | null {
  return nonEmptyString(step.commandTemplate) ?? nonEmptyString(step.command);
}

export function validatePluginManifest(raw: unknown): { manifest: GBAStudioPluginManifest } | { error: string } {
  if (!isRecord(raw)) return { error: "plugin.json deve ser um objeto JSON." };

  const id = nonEmptyString(raw.id);
  const type = nonEmptyString(raw.type);
  const version = nonEmptyString(raw.version);
  const sdkVersion = nonEmptyString(raw.sdkVersion);
  const name = nonEmptyString(raw.name);
  const author = nonEmptyString(raw.author);
  const description = nonEmptyString(raw.description);
  const gbaStudioVersion = nonEmptyString(raw.gbaStudioVersion);

  if (!id) return { error: "Campo obrigatorio ausente: id." };
  if (!isSafePluginRelativePath(id)) return { error: "Campo id precisa ser um caminho relativo seguro." };
  if (!type) return { error: "Campo obrigatorio ausente: type." };
  if (!version) return { error: "Campo obrigatorio ausente: version." };
  if (sdkVersion && !satisfiesPluginSdkVersion(sdkVersion, sdkVersion)) {
    return { error: "Campo sdkVersion precisa ser uma versão semver válida." };
  }
  if (sdkVersion && !satisfiesPluginSdkVersion(sdkVersion)) {
    return { error: `Plugin exige SDK do GBA Studio ${sdkVersion}.` };
  }
  if (!name) return { error: "Campo obrigatorio ausente: name." };
  if (!author) return { error: "Campo obrigatorio ausente: author." };
  if (!description) return { error: "Campo obrigatorio ausente: description." };
  if (!gbaStudioVersion) return { error: "Campo obrigatorio ausente: gbaStudioVersion." };
  if (!normalizePluginType(type)) return { error: `Tipo de plugin não suportado pelo GBA Studio: ${type}.` };
  if (!satisfiesGbaStudioVersion(gbaStudioVersion)) {
    return { error: `Plugin exige GBA Studio ${gbaStudioVersion}.` };
  }

  const recipes = Array.isArray(raw.recipes) ? raw.recipes : [];
  for (const recipe of recipes) {
    if (!isRecord(recipe)) return { error: "Receita invalida em recipes." };
    if (!nonEmptyString(recipe.id)) return { error: "Receita sem id." };
    if (!nonEmptyString(recipe.title)) return { error: "Receita sem title." };
    if (!nonEmptyString(recipe.category)) return { error: "Receita sem category." };
    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) return { error: `Receita ${recipe.id} sem steps.` };
    for (const step of recipe.steps) {
      if (!isRecord(step)) return { error: `Step invalido na receita ${recipe.id}.` };
      if (!recipeStepCommandTemplate(step as unknown as PluginManifestRecipeStep)) {
        return { error: `Step sem command na receita ${recipe.id}.` };
      }
      if (!nonEmptyString(step.category)) return { error: `Step sem category na receita ${recipe.id}.` };
      if (typeof step.detail !== "string") return { error: `Step sem detail na receita ${recipe.id}.` };
    }
  }

  const commands = Array.isArray(raw.commands) ? raw.commands : [];
  for (const command of commands) {
    if (!isRecord(command)) return { error: "Comando invalido em commands." };
    if (!nonEmptyString(command.id)) return { error: "Comando de plugin sem id." };
    if (!nonEmptyString(command.title)) return { error: `Comando ${command.id} sem title.` };
    if (!nonEmptyString(command.category)) return { error: `Comando ${command.id} sem category.` };
    const commandTemplate = nonEmptyString(command.commandTemplate);
    if (!commandTemplate) return { error: `Comando ${command.id} sem commandTemplate.` };
    const verb = commandVerbFromTemplate(commandTemplate);
    if (!verb) return { error: `Comando ${command.id} sem verbo valido.` };
  }

  return {
    manifest: {
      id,
      type,
      version,
      sdkVersion: sdkVersion ?? undefined,
      gbaStudioVersion,
      name,
      author,
      description,
      license: nonEmptyString(raw.license) ?? undefined,
      order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : undefined,
      recipes: recipes as PluginManifestRecipe[],
      commands: commands as PluginManifestCommand[],
      dataTables: Array.isArray(raw.dataTables) ? raw.dataTables : undefined,
      assets: Array.isArray(raw.assets) ? raw.assets as PluginManifestAsset[] : undefined
    }
  };
}

export function commandVerbFromTemplate(commandTemplate: string): string {
  return commandTemplate.trim().split(/\s+/).filter(Boolean)[0] ?? "";
}

function pluginRecipeToDefinition(
  plugin: LoadedGBAStudioPlugin,
  recipe: PluginManifestRecipe
): EventCommandRecipeDefinition {
  const steps: EventCommandRecipeStepDefinition[] = recipe.steps.map((step) => ({
    commandTemplate: recipeStepCommandTemplate(step) ?? "noop",
    category: step.category,
    detail: step.detail
  }));

  return {
    id: `${plugin.manifest.id}/${recipe.id}`,
    title: recipe.title,
    category: recipe.category,
    steps
  };
}

function pluginCommandToDefinition(plugin: LoadedGBAStudioPlugin, command: PluginManifestCommand): PluginEventCommandDefinition {
  const verb = commandVerbFromTemplate(command.commandTemplate);
  return {
    id: `${plugin.manifest.id}/${command.id}`,
    title: command.title,
    category: command.category,
    section: command.section ?? null,
    isFavorite: command.isFavorite ?? false,
    commandTemplate: command.commandTemplate,
    pluginId: plugin.manifest.id,
    verb,
    runtimeStatus: command.runtimeStatus ?? "preview-runtime",
    exportMapping: command.export ?? null
  };
}

function pluginCatalogEntry(plugin: LoadedGBAStudioPlugin): PluginCatalogEntry {
  const executableTypes = new Set<GBAStudioPluginNativeType>([
    "recipePack",
    "eventCommandPack",
    "dataTablePack",
    "assetPack"
  ]);
  const executable = executableTypes.has(plugin.normalizedType);
  const notesByType: Partial<Record<GBAStudioPluginNativeType, string>> = {
    enginePatchPack: "Engine patch ainda nao e aplicado automaticamente no export.",
    themePack: "Theme pack registrado apenas como catalogo.",
    languagePack: "Language pack registrado apenas como catalogo.",
    templatePack: "Template pack registrado apenas como catalogo."
  };

  return {
    pluginId: plugin.manifest.id,
    name: plugin.manifest.name,
    type: plugin.normalizedType,
    author: plugin.manifest.author,
    description: plugin.manifest.description,
    version: plugin.manifest.version,
    sdkVersion: plugin.manifest.sdkVersion ?? null,
    executable,
    notes: executable ? null : notesByType[plugin.normalizedType] ?? null
  };
}

export function buildProjectPluginRegistry(
  plugins: LoadedGBAStudioPlugin[],
  errors: PluginLoadError[] = [],
  options: {
    dataTables?: PluginDataTableDefinition[];
    importedAssets?: PluginImportedAssetRecord[];
  } = {}
): ProjectPluginRegistry {
  const sorted = [...plugins].sort((left, right) => left.order - right.order || left.manifest.name.localeCompare(right.manifest.name));
  const commands: PluginEventCommandDefinition[] = [];
  const recipes: EventCommandRecipeDefinition[] = [];
  const commandVerbs = new Set<string>();
  const commandRuntimeStatusByVerb = new Map<string, EventsWorkspaceCommandRuntimeStatus>();
  const exportMappingByVerb = new Map<string, PluginCommandExportMapping>();
  const seenPluginIds = new Set<string>();
  const seenRecipeIds = new Set<string>();
  const seenCommandIds = new Set<string>();
  const seenVerbs = new Set<string>();

  for (const plugin of sorted) {
    if (seenPluginIds.has(plugin.manifest.id)) {
      errors.push({
        manifestPath: plugin.manifestPath,
        message: `Plugin duplicado: ${plugin.manifest.id}.`
      });
      continue;
    }
    seenPluginIds.add(plugin.manifest.id);

    if (plugin.normalizedType === "recipePack" || plugin.normalizedType === "eventCommandPack") {
      for (const recipe of plugin.manifest.recipes ?? []) {
        const recipeId = `${plugin.manifest.id}/${recipe.id}`;
        if (seenRecipeIds.has(recipeId)) continue;
        seenRecipeIds.add(recipeId);
        recipes.push(pluginRecipeToDefinition(plugin, recipe));
      }
    }

    if (plugin.normalizedType === "eventCommandPack") {
      for (const command of plugin.manifest.commands ?? []) {
        const commandId = `${plugin.manifest.id}/${command.id}`;
        if (seenCommandIds.has(commandId)) continue;
        seenCommandIds.add(commandId);

        const definition = pluginCommandToDefinition(plugin, command);
        if (seenVerbs.has(definition.verb)) {
          errors.push({
            manifestPath: plugin.manifestPath,
            message: `Verbo de plugin duplicado: ${definition.verb}.`
          });
          continue;
        }

        seenVerbs.add(definition.verb);
        commands.push(definition);
        commandVerbs.add(definition.verb);
        commandRuntimeStatusByVerb.set(definition.verb, definition.runtimeStatus);
        if (definition.exportMapping) {
          exportMappingByVerb.set(definition.verb, definition.exportMapping);
        }
      }
    }
  }

  return {
    plugins: sorted,
    commands,
    recipes,
    dataTables: options.dataTables ?? [],
    importedAssets: options.importedAssets ?? [],
    catalog: sorted.map(pluginCatalogEntry),
    commandVerbs,
    commandRuntimeStatusByVerb,
    exportMappingByVerb,
    errors
  };
}

export function emptyProjectPluginRegistry(): ProjectPluginRegistry {
  return buildProjectPluginRegistry([]);
}

export interface SerializableProjectPluginRegistry {
  plugins: Array<{
    id: string;
    name: string;
    type: string;
    author: string;
    description: string;
    version: string;
    sdkVersion?: string;
    pluginRoot: string;
  }>;
  commands: PluginEventCommandDefinition[];
  recipes: EventCommandRecipeDefinition[];
  dataTables: PluginDataTableDefinition[];
  importedAssets: PluginImportedAssetRecord[];
  catalog: PluginCatalogEntry[];
  commandVerbs: string[];
  commandRuntimeStatusByVerb: Array<[string, EventsWorkspaceCommandRuntimeStatus]>;
  exportMappingByVerb: Array<[string, PluginCommandExportMapping]>;
  errors: PluginLoadError[];
}

export function serializeProjectPluginRegistry(registry: ProjectPluginRegistry): SerializableProjectPluginRegistry {
  return {
    plugins: registry.plugins.map((plugin) => ({
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      type: plugin.normalizedType,
      author: plugin.manifest.author,
      description: plugin.manifest.description,
      version: plugin.manifest.version,
      ...(plugin.manifest.sdkVersion ? { sdkVersion: plugin.manifest.sdkVersion } : {}),
      pluginRoot: plugin.pluginRoot
    })),
    commands: registry.commands,
    recipes: registry.recipes,
    dataTables: registry.dataTables,
    importedAssets: registry.importedAssets,
    catalog: registry.catalog,
    commandVerbs: [...registry.commandVerbs],
    commandRuntimeStatusByVerb: [...registry.commandRuntimeStatusByVerb.entries()],
    exportMappingByVerb: [...registry.exportMappingByVerb.entries()],
    errors: registry.errors
  };
}

export function deserializeProjectPluginRegistry(serialized: SerializableProjectPluginRegistry): ProjectPluginRegistry {
  return {
    plugins: serialized.plugins.map((plugin) => ({
      manifest: {
        id: plugin.id,
        type: plugin.type,
        version: plugin.version,
        ...(plugin.sdkVersion ? { sdkVersion: plugin.sdkVersion } : {}),
        gbaStudioVersion: ">=0.1.0",
        name: plugin.name,
        author: plugin.author,
        description: plugin.description
      },
      normalizedType: normalizePluginType(plugin.type) ?? "recipePack",
      pluginRoot: plugin.pluginRoot,
      manifestPath: pathJoin(plugin.pluginRoot, "plugin.json"),
      order: 100
    })),
    commands: serialized.commands,
    recipes: serialized.recipes,
    dataTables: serialized.dataTables ?? [],
    importedAssets: serialized.importedAssets ?? [],
    catalog: serialized.catalog ?? [],
    commandVerbs: new Set(serialized.commandVerbs),
    commandRuntimeStatusByVerb: new Map(serialized.commandRuntimeStatusByVerb),
    exportMappingByVerb: new Map(serialized.exportMappingByVerb),
    errors: serialized.errors
  };
}

function pathJoin(left: string, right: string): string {
  return `${left.replace(/[\\/]+$/, "")}/${right}`;
}

export function parsePluginManifestJson(text: string): { manifest: GBAStudioPluginManifest } | { error: string } {
  try {
    return validatePluginManifest(JSON.parse(text));
  } catch {
    return { error: "plugin.json invalido." };
  }
}

export function loadedPluginFromManifest(
  manifest: GBAStudioPluginManifest,
  pluginRoot: string,
  manifestPath: string
): LoadedGBAStudioPlugin | null {
  const normalizedType = normalizePluginType(manifest.type);
  if (!normalizedType) return null;
  return {
    manifest,
    normalizedType,
    pluginRoot,
    manifestPath,
    order: manifest.order ?? 100
  };
}
