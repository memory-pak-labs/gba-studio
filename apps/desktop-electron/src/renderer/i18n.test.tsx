/** @vitest-environment happy-dom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  defaultLocale,
  getStudioTranslation,
  isSupportedLocale,
  localeOptions,
  readStoredLocale,
  resolveLocale,
  StudioI18nProvider,
  type StudioTranslationKey,
  studioTranslationKeys,
  writeStoredLocale
} from "./i18n";
import {
  additionalLocaleDialoguesTranslations,
  additionalLocaleFilesTranslations,
  additionalLocaleHudTranslations,
  additionalLocaleShellCreditsTranslations,
  additionalLocaleWorkspaceUiTranslations
} from "./i18nAdditionalNamespaces";
import type { AdditionalLocale } from "./i18nAdditionalFiles";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[^}]+\}/g)].map(([match]) => match).sort();
}

afterEach(() => {
  cleanup();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "pt-BR";
  delete document.documentElement.dataset.studioLocale;
});

describe("renderer i18n", () => {
  it("matches the complete site language catalog", () => {
    expect(localeOptions.map((option) => option.locale)).toEqual([
      "pt-BR",
      "en-US",
      "es-ES",
      "fr-FR",
      "hi-IN",
      "zh-CN",
      "ar-SA",
      "ru-RU",
      "de-DE",
      "ja-JP",
      "ko-KR",
      "it-IT",
      "pl-PL",
      "nl-NL"
    ]);
    expect(localeOptions.map((option) => option.shortLabel)).toEqual([
      "PT",
      "EN",
      "ES",
      "FR",
      "HI",
      "ZH",
      "AR",
      "RU",
      "DE",
      "JA",
      "KO",
      "IT",
      "PL",
      "NL"
    ]);
  });

  it("falls back to Portuguese BR for unsupported locales", () => {
    expect(defaultLocale).toBe("pt-BR");
    expect(isSupportedLocale("fr-FR")).toBe(true);
    expect(resolveLocale("fr-FR")).toBe("fr-FR");
    expect(resolveLocale("es-ES")).toBe("es-ES");
    expect(resolveLocale("es-419")).toBe("es-ES");
    expect(resolveLocale("xx-XX")).toBe("pt-BR");
    expect(resolveLocale("en-US")).toBe("en-US");
  });

  it("persists only supported locales", () => {
    window.localStorage.clear();

    writeStoredLocale("es-ES");
    expect(readStoredLocale()).toBe("es-ES");
    window.localStorage.setItem("gbaStudio.locale", "es-419");
    expect(readStoredLocale()).toBe("es-ES");

    window.localStorage.setItem("gbaStudio.locale", "nl-NL");
    expect(readStoredLocale()).toBe("nl-NL");
  });

  it("resolves every catalog key for every supported locale", () => {
    expect(studioTranslationKeys.length).toBeGreaterThan(300);

    for (const locale of localeOptions.map((option) => option.locale)) {
      for (const key of studioTranslationKeys) {
        const message = getStudioTranslation(locale, key, {
          completion: "100%",
          count: 2,
          dialogues: 3,
          characters: 4,
          choices: 5,
          workspace: "Files"
        });

        expect(message, `${locale}:${key}`).not.toBe("");
        expect(message, `${locale}:${key}`).not.toBe(key);
      }
    }

    expect(getStudioTranslation("fr-FR", "shell.workspaceAria", { workspace: "Files" })).toContain("Files");
  });

  it("covers files and dialogues in every additional locale without losing placeholders", () => {
    const additionalLocales = localeOptions.slice(3).map((option) => option.locale) as AdditionalLocale[];

    for (const locale of additionalLocales) {
      const files = additionalLocaleFilesTranslations[locale];
      const dialogues = additionalLocaleDialoguesTranslations[locale];
      const hud = additionalLocaleHudTranslations[locale];
      const shellCredits = additionalLocaleShellCreditsTranslations[locale];
      const workspaceUi = additionalLocaleWorkspaceUiTranslations[locale];

      expect(Object.keys(files), `${locale}:files`).toHaveLength(106);
      expect(Object.keys(dialogues), `${locale}:dialogues`).toHaveLength(130);
      expect(Object.keys(hud), `${locale}:hud`).toHaveLength(93);
      expect(Object.keys(shellCredits), `${locale}:shell-credits`).toHaveLength(43);
      expect(Object.keys(workspaceUi), `${locale}:workspace-ui`).toHaveLength(73);

      for (const [key, value] of Object.entries({ ...files, ...dialogues, ...shellCredits, ...workspaceUi, ...hud }) as Array<[string, string]>) {
        const source = getStudioTranslation("en-US", key as StudioTranslationKey);
        expect(placeholders(value), `${locale}:${key}`).toEqual(placeholders(source));
      }
    }
  });

  it("applies the locale language and RTL direction to the document", () => {
    window.localStorage.setItem("gbaStudio.locale", "ar-SA");

    render(
      <StudioI18nProvider>
        <span>Probe</span>
      </StudioI18nProvider>
    );

    expect(document.documentElement.lang).toBe("ar-SA");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.dataset.studioLocale).toBe("ar-SA");
  });
});
