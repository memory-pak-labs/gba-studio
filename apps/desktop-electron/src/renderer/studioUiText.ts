import { useMemo } from "react";
import { readStoredLocale, useStudioLocale } from "./i18n";
import { translateStudioMessage, type StudioUiMessageValues } from "../shared/studioUiMessages";

export function uiText<T>(message: T, values?: StudioUiMessageValues): T extends string ? string : T {
  return (typeof message === "string" ? translateStudioMessage(readStoredLocale(), message, values) : message) as T extends string ? string : T;
}

/** Subscribe each component, including memoized inspectors, to the locale context. */
export function useStudioUiText(): typeof uiText {
  const locale = useStudioLocale();
  return useMemo(() => (<T,>(message: T, values?: StudioUiMessageValues): T extends string ? string : T =>
    (typeof message === "string" ? translateStudioMessage(locale, message, values) : message) as T extends string ? string : T
  ), [locale]);
}
