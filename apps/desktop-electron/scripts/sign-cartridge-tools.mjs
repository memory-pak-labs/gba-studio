import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sign } from "@electron/osx-sign";
import source from "./cfb-support-source.json" with { type: "json" };

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
/** Called only by packaging after its normal executable signing step. */
export async function recordSignedCfbExecutable(directory) {
  const file = join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.version !== source.version || manifest.sourceCommit !== source.commit || manifest.patchSha256 !== source.patchSha256) throw new Error("Manifesto ChisFlash inválido após a assinatura.");
  for (const name of ["COPYING", "corresponding-source.tar.gz"]) {
    const bytes = await readFile(join(directory, name));
    if (bytes.length !== manifest.files?.[name]?.bytes || hash(bytes) !== manifest.files?.[name]?.sha256) throw new Error("As fontes/licença ChisFlash mudaram durante a assinatura.");
  }
  const name = manifest.platform === "win32" ? "cfb.exe" : "cfb";
  const binary = await readFile(join(directory, name));
  manifest.files[name] = { bytes: binary.length, sha256: hash(binary) };
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
}
/** Sign nested code normally, record its resulting bytes, then seal only the outer app. */
export async function signWithCartridgeManifest(options, signOperation = sign) {
  const root = join(options.app, "Contents/Resources/cartridge-tools");
  let entries;
  try { entries = await readdir(root); }
  catch (error) { if (error.code !== "ENOENT") throw error; entries = []; }
  const manifests = [];
  for (const entry of entries.filter(name => /^darwin-(arm64|x64)$/.test(name))) {
    const directory = join(root, entry);
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    if (manifest.schemaVersion !== 1 || manifest.version !== source.version || manifest.sourceCommit !== source.commit || manifest.patchSha256 !== source.patchSha256 || entry !== `${manifest.platform}-${manifest.arch}`) throw new Error("Manifesto ChisFlash inválido antes da assinatura.");
    for (const name of ["cfb", "COPYING", "corresponding-source.tar.gz"]) {
      const bytes = await readFile(join(directory, name));
      if (bytes.length !== manifest.files?.[name]?.bytes || hash(bytes) !== manifest.files?.[name]?.sha256) throw new Error(`Checksum ChisFlash inválido antes da assinatura: ${name}.`);
    }
    manifests.push({ directory, manifest });
  }
  await signOperation(options);
  if (!manifests.length) return;
  for (const { directory } of manifests) await recordSignedCfbExecutable(directory);
  // Re-signing nested code again would invalidate the just-recorded checksum.
  await signOperation({ ...options, binaries: [], preAutoEntitlements: false, ignore: file => resolve(file) !== resolve(options.app) });
}
// electron-builder supplies its packager as a second argument. Keep that
// separate from the optional signing operation used by the internal helper.
export default async function signForElectronBuilder(options) {
  await signWithCartridgeManifest(options);
}
