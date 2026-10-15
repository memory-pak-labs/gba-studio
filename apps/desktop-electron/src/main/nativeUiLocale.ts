import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { translateStudioMessage } from "../shared/studioUiMessages.js";

const appLocales = new Set(["pt-BR", "en-US", "es-ES", "fr-FR", "hi-IN", "zh-CN",
  "ar-SA", "ru-RU", "de-DE", "ja-JP", "ko-KR", "it-IT", "pl-PL", "nl-NL"]);
export function isAppLocale(value: unknown): value is string {
  return typeof value === "string" && appLocales.has(value);
}
export function localizeNativeDialog<T extends OpenDialogOptions | SaveDialogOptions>(options: T, locale: string): T {
  const translate = (message: string | undefined) => message === undefined ? undefined : translateStudioMessage(locale, message);
  return {
    ...options,
    title: translate(options.title),
    message: translate(options.message),
    buttonLabel: translate(options.buttonLabel),
    filters: options.filters?.map(filter => ({ ...filter, name: translateStudioMessage(locale, filter.name) }))
  };
}
