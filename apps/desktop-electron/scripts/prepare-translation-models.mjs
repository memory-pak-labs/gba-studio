import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const registryURL = "https://storage.googleapis.com/bergamot-models-sandbox/0.3.3/registry.json";
const modelBaseURL = "https://storage.googleapis.com/bergamot-models-sandbox/0.3.3";
const corePairs = ["enpt", "pten"];
const projectLanguages = [
  { id: "pt-BR", label: "Português (Brasil)", bergamot: "pt", packId: "core" },
  { id: "en", label: "English", bergamot: "en", packId: "core" },
  { id: "es", label: "Español", bergamot: "es", packId: "es" },
  { id: "fr", label: "Français", bergamot: "fr", packId: "fr" },
  { id: "hi", label: "हिन्दी", bergamot: "hi", packId: "hi" },
  { id: "zh-CN", label: "中文 (简体)", bergamot: "zh", packId: "zh-CN" },
  { id: "ar", label: "العربية", bergamot: "ar", packId: "ar" },
  { id: "ru", label: "Русский", bergamot: "ru", packId: "ru" },
  { id: "de", label: "Deutsch", bergamot: "de", packId: "de" },
  { id: "ja", label: "日本語", bergamot: "ja", packId: "ja" },
  { id: "ko", label: "한국어", bergamot: "ko", packId: "ko" },
  { id: "it", label: "Italiano", bergamot: "it", packId: "it" },
  { id: "pl", label: "Polski", bergamot: "pl", packId: "pl" },
  { id: "nl", label: "Nederlands", bergamot: "nl", packId: "nl" }
];
const outputRoot = path.resolve(".cache/translation-runtime/translation-models");
const workerOutputRoot = path.resolve(".cache/translation-runtime/assets");
const workerSourceRoot = path.resolve("node_modules/@browsermt/bergamot-translator/worker");

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function downloadFile(url, destination, expectedHash) {
  try {
    if (await sha256(destination) === expectedHash) return;
  } catch {
    // Missing or incomplete cache; download it below.
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) throw new Error(`Checksum invalido para ${url}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

const registryResponse = await fetch(registryURL);
if (!registryResponse.ok) throw new Error(`Falha ao baixar registro Bergamot: HTTP ${registryResponse.status}`);
const upstreamRegistry = await registryResponse.json();
const localRegistry = {};

await rm(outputRoot, { force: true, recursive: true });

function pairForLanguage(language) {
  return [`en${language}`, `${language}en`].filter((pair) => Boolean(upstreamRegistry[pair]));
}

function packDescription(language) {
  return language
    ? `Modelos Bergamot para tradução offline em ${language.label}.`
    : "Modelos básicos incluídos no aplicativo.";
}

function packFiles(pairs) {
  return Object.fromEntries(pairs.map((pair) => [pair, Object.fromEntries(
    Object.entries(upstreamRegistry[pair]).flatMap(([part, file]) => {
      if (!file?.name) return [];
      return [[part, {
        name: file.name,
        size: file.size ?? 0,
        expectedSha256Hash: file.expectedSha256Hash,
        remoteURL: `${modelBaseURL}/${pair}/${file.name}`
      }]];
    })
  )]));
}

function packSize(pairs) {
  return pairs.reduce((total, pair) => total + Object.values(upstreamRegistry[pair] ?? {})
    .reduce((pairTotal, file) => pairTotal + (file?.size ?? 0), 0), 0);
}

for (const pair of corePairs) {
  const files = upstreamRegistry[pair];
  if (!files) throw new Error(`Modelo Bergamot ausente: ${pair}`);
  localRegistry[pair] = {};
  for (const [part, file] of Object.entries(files)) {
    if (!file?.name) continue;
    const sourceURL = `${modelBaseURL}/${pair}/${file.name}`;
    const destination = path.join(outputRoot, pair, file.name);
    await downloadFile(sourceURL, destination, file.expectedSha256Hash);
    localRegistry[pair][part] = {
      ...file,
      name: `translation-models/${pair}/${file.name}`
    };
  }
}

const optionalPacks = projectLanguages
  .filter((language) => language.packId !== "core")
  .map((language) => {
    const pairs = pairForLanguage(language.bergamot);
    const available = pairs.length === 2;
    return {
      id: language.packId,
      label: language.label,
      description: available
        ? packDescription(language)
        : `O catálogo Bergamot atual não oferece os pares necessários para ${language.label}.`,
      languages: [language.id],
      pairs,
      bundled: false,
      available,
      sizeBytes: packSize(pairs),
      files: packFiles(pairs),
      ...(available ? {} : { unavailableReason: "Modelo Bergamot não disponível neste catálogo." })
    };
  });

const translationPackCatalog = {
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  registryURL,
  modelBaseURL,
  corePackID: "core",
  packs: [
    {
      id: "core",
      label: "Português (Brasil) e English",
      description: packDescription(),
      languages: projectLanguages.filter((language) => language.packId === "core").map((language) => language.id),
      pairs: corePairs,
      bundled: true,
      available: true,
      sizeBytes: packSize(corePairs),
      files: packFiles(corePairs)
    },
    ...optionalPacks
  ]
};

await mkdir(outputRoot, { recursive: true });
await mkdir(workerOutputRoot, { recursive: true });
await Promise.all([
  "bergamot-translator-worker.js",
  "bergamot-translator-worker.wasm"
].map((fileName) => copyFile(path.join(workerSourceRoot, fileName), path.join(workerOutputRoot, fileName))));
await writeFile(path.join(outputRoot, "registry.json"), `${JSON.stringify(localRegistry, null, 2)}\n`);
await writeFile(path.join(path.dirname(outputRoot), "translation-packs.json"), `${JSON.stringify(translationPackCatalog, null, 2)}\n`);
await writeFile(path.join(outputRoot, "NOTICE.json"), `${JSON.stringify({
  engine: "@browsermt/bergamot-translator 0.4.9 (MPL-2.0)",
  languages: projectLanguages.map((language) => language.id),
  corePairs,
  availableOptionalPairs: optionalPacks.flatMap((pack) => pack.pairs),
  registryURL,
  generatedAt: new Date().toISOString()
}, null, 2)}\n`);

console.log(`Modelos offline prontos em ${outputRoot}`);
