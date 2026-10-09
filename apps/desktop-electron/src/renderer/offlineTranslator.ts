import { protectGameTextTokens, restoreGameTextTokens, type ProjectLocale } from "../shared/projectLocalization.js";
import { buildInstalledTranslationRegistry, getInstalledTranslationPackIDs, getTranslationPackCatalog, requireInstalledTranslationPackForLocale } from "./translationPacks.js";

interface TranslationAdapter {
  translate(request: { from: string; to: string; text: string; html?: boolean; qualityScores?: boolean }): Promise<{
    target: { text: string };
  }>;
  delete?(): Promise<void> | void;
}

export interface TranslateGameTextRequest {
  text: string;
  from: ProjectLocale;
  to: ProjectLocale;
  translate?: TranslationAdapter["translate"];
}

let offlineTranslator: { instance: TranslationAdapter; signature: string } | null = null;

function bergamotLocale(locale: ProjectLocale): string {
  if (locale === "pt-BR") return "pt";
  if (locale === "zh-CN") return "zh";
  return locale;
}

async function loadOfflineTranslator(from: ProjectLocale, to: ProjectLocale): Promise<TranslationAdapter> {
  const requiredPackIDs = [...new Set([
    await requireInstalledTranslationPackForLocale(from),
    await requireInstalledTranslationPackForLocale(to)
  ])].sort();
  const signature = requiredPackIDs.join(",");
  if (offlineTranslator?.signature === signature) return offlineTranslator.instance;

  if (offlineTranslator) {
    await offlineTranslator.instance.delete?.();
    offlineTranslator = null;
  }

  const catalog = await getTranslationPackCatalog();
  const installedPackIDs = await getInstalledTranslationPackIDs();
  const registry = buildInstalledTranslationRegistry(catalog, installedPackIDs);
  const { LatencyOptimisedTranslator } = await import("@browsermt/bergamot-translator/translator.js");
  const instance = new LatencyOptimisedTranslator({
    pivotLanguage: "en",
    registryUrl: `data:application/json,${encodeURIComponent(JSON.stringify(registry))}`,
    downloadTimeout: 0,
    cacheSize: 4096
  });
  offlineTranslator = { instance, signature };
  return instance;
}

export async function translateGameText(request: TranslateGameTextRequest): Promise<string> {
  if (!request.text.trim() || request.from === request.to) return request.text;
  const protectedText = protectGameTextTokens(request.text);
  const translator = request.translate ? null : await loadOfflineTranslator(request.from, request.to);
  const translate = request.translate ?? translator!.translate.bind(translator);
  const response = await translate({
    from: bergamotLocale(request.from),
    to: bergamotLocale(request.to),
    text: protectedText.text,
    html: false,
    qualityScores: false
  });
  return restoreGameTextTokens(response.target.text, protectedText.tokens);
}
