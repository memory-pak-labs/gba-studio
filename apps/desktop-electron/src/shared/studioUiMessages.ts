import { studioUiMessages } from "./studioUiCatalog.js";

export { studioUiMessages } from "./studioUiCatalog.js";
export type StudioUiMessageValues = Readonly<Record<string, string | number | boolean | null | undefined>>;
export type PrimaryStudioLocale = "pt-BR" | "en-US" | "es-ES";

export function primaryStudioLocale(locale: string | null | undefined): PrimaryStudioLocale {
  if (!locale || locale.startsWith("pt")) return "pt-BR";
  return locale.startsWith("es") ? "es-ES" : "en-US";
}
function column(locale: string): 0 | 1 | 2 {
  const primary = primaryStudioLocale(locale);
  return primary === "pt-BR" ? 0 : primary === "en-US" ? 1 : 2;
}
function format(message: string, values: StudioUiMessageValues): string {
  // One pass: an authored value containing another placeholder stays unchanged.
  return message.replace(/\{([^}]+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token);
}
function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const templates = Object.entries(studioUiMessages).flatMap(([source, messages]) => {
  const tokens = [...source.matchAll(/\{(\d+)\}/g)];
  // Placeholder-only layouts are not diagnostic signatures. Matching them would
  // reinterpret arbitrary names and already translated UI copy.
  if (!tokens.length || !/[A-Za-zÀ-ÿ]{3}/.test(source.replace(/\{\d+\}/g, ""))) return [];
  let end = 0;
  let pattern = "^";
  for (const token of tokens) {
    pattern += escapePattern(source.slice(end, token.index)) + "([\\s\\S]*?)";
    end = token.index! + token[0].length;
  }
  pattern += escapePattern(source.slice(end)) + "$";
  return [{ prefix: source.slice(0, tokens[0].index), suffix: source.slice(end),
    keys: tokens.map(token => token[1]!), pattern: new RegExp(pattern), messages }];
}).sort((a, b) => b.prefix.length - a.prefix.length || b.suffix.length - a.suffix.length);
const resolvedMessages = new Map<string, string>();
const uppercaseMessages = new Map(Object.entries(studioUiMessages).map(([source, messages]) =>
  [source.toUpperCase(), messages] as const));
const localizedMessages = [0, 1, 2].map(index => new Set(Object.values(studioUiMessages).map(messages => messages[index])));
function remember(key: string, message: string): string {
  if (resolvedMessages.size >= 2048) resolvedMessages.clear();
  resolvedMessages.set(key, message);
  return message;
}

/** Localize only application copy at a presentation boundary, never project data. */
export function translateStudioMessage(locale: string, message: string, values?: StudioUiMessageValues): string {
  const leading = message.match(/^\s*/)?.[0] ?? "";
  const trailing = message.match(/\s*$/)?.[0] ?? "";
  const source = message.trim();
  if (!source) return message;
  const index = column(locale);
  const exact = Object.hasOwn(studioUiMessages, source) ? studioUiMessages[source] : undefined;
  if (exact) return leading + (values ? format(exact[index], values) : exact[index]) + trailing;
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    const uppercase = uppercaseMessages.get(source);
    if (uppercase) {
      const localized = uppercase[index].split(/(\{[^}]+\})/).map(part =>
        /^\{[^}]+\}$/.test(part) ? part : part.toUpperCase()).join("");
      return leading + (values ? format(localized, values) : localized) + trailing;
    }
  }
  if (values) return leading + format(source, values) + trailing;
  if (localizedMessages[index]!.has(source)) return message;
  const cacheKey = index + ":" + source;
  const cached = resolvedMessages.get(cacheKey);
  if (cached !== undefined) return leading + cached + trailing;
  for (const template of templates) {
    if (!source.startsWith(template.prefix) || !source.endsWith(template.suffix)) continue;
    const match = template.pattern.exec(source);
    if (!match) continue;
    const parameters = Object.fromEntries(template.keys.map((key, i) => [key, match[i + 1] ?? ""]));
    return leading + remember(cacheKey, format(template.messages[index], parameters)) + trailing;
  }
  remember(cacheKey, source);
  return message;
}
