import type { GBAProjectData } from "./projectFile.js";

export const builtInProjectLocales = [
  "pt-BR",
  "en",
  "es",
  "fr",
  "hi",
  "zh-CN",
  "ar",
  "ru",
  "de",
  "ja",
  "ko",
  "it",
  "pl",
  "nl"
] as const;
export type ProjectLocale = (typeof builtInProjectLocales)[number];

export interface ProjectLocalization {
  sourceLocale: ProjectLocale;
  defaultLocale: ProjectLocale;
  enabledLocales: ProjectLocale[];
}

export interface LocalizedDialogueRecord {
  text?: unknown;
  translations?: unknown;
  choices?: unknown;
  choiceTranslations?: unknown;
}

export interface ProtectedGameText {
  text: string;
  tokens: string[];
}

const defaultProjectLocalization: ProjectLocalization = {
  sourceLocale: "en",
  defaultLocale: "pt-BR",
  enabledLocales: ["pt-BR", "en", "es"]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProjectLocale(value: unknown): value is ProjectLocale {
  return typeof value === "string" && builtInProjectLocales.includes(value as ProjectLocale);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function deriveProjectLocalization(data: GBAProjectData): ProjectLocalization {
  const raw = isRecord(data.localization) ? data.localization : {};
  const sourceLocale = isProjectLocale(raw.sourceLocale) ? raw.sourceLocale : defaultProjectLocalization.sourceLocale;
  const defaultLocale = isProjectLocale(raw.defaultLocale) ? raw.defaultLocale : defaultProjectLocalization.defaultLocale;
  const requestedLocales = Array.isArray(raw.enabledLocales) ? raw.enabledLocales.filter(isProjectLocale) : [];
  const enabledLocales = requestedLocales.length > 0
    ? builtInProjectLocales.filter((locale) => requestedLocales.includes(locale))
    : [...defaultProjectLocalization.enabledLocales];

  if (!enabledLocales.includes(sourceLocale)) enabledLocales.push(sourceLocale);
  if (!enabledLocales.includes(defaultLocale)) enabledLocales.unshift(defaultLocale);

  return { sourceLocale, defaultLocale, enabledLocales };
}

export function dialogueTranslations(dialogue: LocalizedDialogueRecord): Partial<Record<ProjectLocale, string>> {
  const translations = isRecord(dialogue.translations) ? dialogue.translations : null;
  if (!translations) return {};
  return Object.fromEntries(
    builtInProjectLocales
      .map((locale) => [locale, stringValue(translations[locale])])
      .filter(([, text]) => Boolean(text))
  ) as Partial<Record<ProjectLocale, string>>;
}

export function dialogueChoiceTranslations(dialogue: LocalizedDialogueRecord): Partial<Record<ProjectLocale, string[]>> {
  const choiceTranslations = isRecord(dialogue.choiceTranslations) ? dialogue.choiceTranslations : null;
  if (!choiceTranslations) return {};
  return Object.fromEntries(
    builtInProjectLocales.flatMap((locale) => {
      const choices = choiceTranslations[locale];
      return Array.isArray(choices)
        ? [[locale, choices.map(stringValue)]]
        : [];
    })
  ) as Partial<Record<ProjectLocale, string[]>>;
}

export function localizedDialogueText(
  dialogue: LocalizedDialogueRecord,
  localization: ProjectLocalization,
  locale: ProjectLocale
): string {
  if (locale === localization.sourceLocale) return stringValue(dialogue.text);
  return dialogueTranslations(dialogue)[locale] || stringValue(dialogue.text);
}

export function localizedDialogueChoices(
  dialogue: LocalizedDialogueRecord,
  localization: ProjectLocalization,
  locale: ProjectLocale
): string[] {
  const source = Array.isArray(dialogue.choices) ? dialogue.choices.map(stringValue) : [];
  if (locale === localization.sourceLocale) return source;
  const translated = dialogueChoiceTranslations(dialogue)[locale] ?? [];
  return source.map((choice, index) => translated[index] || choice);
}

const gameTextTokenPattern = /(\r?\n|\{[^{}\n]+\}|\$[^$\n]+\$|![A-Za-z][^!\n]*!)/g;

export function protectGameTextTokens(text: string): ProtectedGameText {
  const tokens: string[] = [];
  return {
    text: text.replace(gameTextTokenPattern, (token) => {
      const index = tokens.push(token) - 1;
      return `__GBA_TOKEN_${index}__`;
    }),
    tokens
  };
}

export function restoreGameTextTokens(text: string, tokens: string[]): string {
  return text.replace(/__GBA_TOKEN_(\d+)__/g, (placeholder, rawIndex: string) => tokens[Number(rawIndex)] ?? placeholder);
}
