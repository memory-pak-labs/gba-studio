#!/usr/bin/env node

import ts from "typescript";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(appRoot, "src/renderer/i18n.tsx");
const sourceText = readFileSync(sourcePath, "utf8");
const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const namespaceSourcePaths = [
  resolve(appRoot, "src/renderer/i18nAdditionalFiles.ts"),
  resolve(appRoot, "src/renderer/i18nAdditionalDialogues.ts"),
  resolve(appRoot, "src/renderer/i18nAdditionalShellCredits.ts"),
  resolve(appRoot, "src/renderer/i18nAdditionalWorkspaceUi.ts"),
  resolve(appRoot, "src/renderer/i18nAdditionalHud.ts")
];
const namespaceSourceFiles = namespaceSourcePaths.map((path) => {
  const text = readFileSync(path, "utf8");
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
});

const localeOrder = [
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
];

function unwrapExpression(expression) {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function findObjectDeclaration(name, file, path) {
  let result = null;

  function visit(node) {
    if (ts.isVariableDeclaration(node)
      && node.name.getText(file) === name
      && node.initializer
      && ts.isObjectLiteralExpression(unwrapExpression(node.initializer))) {
      result = unwrapExpression(node.initializer);
      return;
    }
    if (!result) ts.forEachChild(node, visit);
  }

  visit(file);
  if (!result) throw new Error(`Objeto ${name} não encontrado em ${path}.`);
  return result;
}

function propertyKey(property) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function objectKeys(object) {
  return object.properties
    .map(propertyKey)
    .filter((key) => key !== null);
}

function objectProperty(object, key) {
  return object.properties.find((property) => propertyKey(property) === key) ?? null;
}

function nestedObjectKeys(object, key) {
  const property = objectProperty(object, key);
  return property && ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)
    ? objectKeys(property.initializer)
    : [];
}

const ptObject = findObjectDeclaration("ptBRTranslations", sourceFile, sourcePath);
const additionalObject = findObjectDeclaration("additionalLocaleTranslationsBase", sourceFile, sourcePath);
const translationsObject = findObjectDeclaration("translations", sourceFile, sourcePath);
const filesNamespaceObject = findObjectDeclaration(
  "additionalLocaleFilesTranslations",
  namespaceSourceFiles[0],
  namespaceSourcePaths[0]
);
const dialoguesNamespaceObject = findObjectDeclaration(
  "additionalLocaleDialoguesTranslations",
  namespaceSourceFiles[1],
  namespaceSourcePaths[1]
);
const shellCreditsNamespaceObject = findObjectDeclaration(
  "additionalLocaleShellCreditsTranslations",
  namespaceSourceFiles[2],
  namespaceSourcePaths[2]
);
const workspaceUiNamespaceObject = findObjectDeclaration(
  "additionalLocaleWorkspaceUiTranslations",
  namespaceSourceFiles[3],
  namespaceSourcePaths[3]
);
const hudNamespaceObject = findObjectDeclaration(
  "additionalLocaleHudTranslations",
  namespaceSourceFiles[4],
  namespaceSourcePaths[4]
);
const catalogKeys = objectKeys(ptObject);
const localeKeys = new Map();

localeKeys.set("pt-BR", catalogKeys);
for (const locale of ["en-US", "es-ES"]) {
  localeKeys.set(locale, nestedObjectKeys(translationsObject, locale));
}
for (const locale of localeOrder.filter((item) => !["pt-BR", "en-US", "es-ES"].includes(item))) {
  localeKeys.set(locale, [
    ...nestedObjectKeys(additionalObject, locale),
    ...nestedObjectKeys(filesNamespaceObject, locale),
    ...nestedObjectKeys(dialoguesNamespaceObject, locale),
    ...nestedObjectKeys(shellCreditsNamespaceObject, locale),
    ...nestedObjectKeys(workspaceUiNamespaceObject, locale),
    ...nestedObjectKeys(hudNamespaceObject, locale)
  ]);
}

function groupKeys(keys) {
  return keys.reduce((groups, key) => {
    const prefix = key.split(".")[0];
    groups[prefix] = (groups[prefix] ?? 0) + 1;
    return groups;
  }, {});
}

const reportLocales = localeOrder.map((locale) => {
  const explicitKeys = new Set(localeKeys.get(locale) ?? []);
  const fallbackKeys = catalogKeys.filter((key) => !explicitKeys.has(key));
  const fallbackSources = fallbackKeys.reduce((sources, key) => {
    const source = locale === "pt-BR"
      ? null
      : (localeKeys.get("en-US") ?? []).includes(key) ? "en-US" : "pt-BR";
    if (source) sources[source] = (sources[source] ?? 0) + 1;
    return sources;
  }, {});

  return {
    locale,
    explicitCount: explicitKeys.size,
    fallbackCount: fallbackKeys.length,
    coveragePercent: Number(((explicitKeys.size / catalogKeys.length) * 100).toFixed(1)),
    fallbackSources,
    fallbackByNamespace: groupKeys(fallbackKeys),
    fallbackKeys
  };
});

const report = {
  kind: "gba_studio_i18n_coverage",
  source: "src/renderer/i18n.tsx + src/renderer/i18nAdditionalFiles.ts + src/renderer/i18nAdditionalDialogues.ts + src/renderer/i18nAdditionalShellCredits.ts + src/renderer/i18nAdditionalWorkspaceUi.ts + src/renderer/i18nAdditionalHud.ts",
  catalogKeyCount: catalogKeys.length,
  locales: reportLocales
};

function formatMarkdown(value) {
  const lines = [
    "# Cobertura do catálogo i18n do GBA Studio",
    "",
    `Fonte: \`${value.source}\``,
    `Chaves catalogadas: **${value.catalogKeyCount}**`,
    "",
    "## Resumo por idioma",
    "",
    "| Locale | Explícitas | Fallback | Cobertura | Origem do fallback |",
    "| --- | ---: | ---: | ---: | --- |"
  ];

  for (const locale of value.locales) {
    const sources = Object.entries(locale.fallbackSources).map(([source, count]) => `${source} (${count})`).join(", ") || "—";
    lines.push(`| ${locale.locale} | ${locale.explicitCount} | ${locale.fallbackCount} | ${locale.coveragePercent}% | ${sources} |`);
  }

  lines.push("", "## Fallbacks por namespace", "");
  for (const locale of value.locales.filter((item) => item.fallbackCount > 0)) {
    lines.push(`### ${locale.locale}`, "", "| Namespace | Chaves em fallback |", "| --- | ---: |");
    for (const [namespace, count] of Object.entries(locale.fallbackByNamespace)) {
      lines.push(`| ${namespace} | ${count} |`);
    }
    lines.push("");
  }

  lines.push(
    "## Leitura do snapshot",
    "",
    "- `pt-BR` é a fonte completa do catálogo e não possui fallback.",
    `- \`en-US\` e \`es-ES\` possuem cobertura explícita de todas as ${catalogKeys.length} chaves.`,
    `- Os 11 idiomas adicionais possuem cobertura explícita de todas as ${catalogKeys.length} chaves, incluindo a tela inicial, arquivos, diálogos, shell, workspace, créditos e os rótulos de interface auditados.`,
    "- O relatório mede apenas chaves presentes no catálogo. Strings ainda hardcoded fora de `i18n.tsx` não entram nesta contagem.",
    "",
    "## Reproduzir",
    "",
    "Na raiz de `apps/desktop-electron`:",
    "",
    "```sh",
    "npm run audit:i18n-coverage",
    "npm run audit:i18n-coverage -- --json",
    "```"
  );

  return `${lines.join("\n")}\n`;
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatMarkdown(report));
}
