import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { extendExampleEncore } from "./encore-project.mjs";
import { createExternalReviewDirectory } from "./lib/external-review-directory.mjs";

const template = fileURLToPath(new URL("../default-assets/templates/exemplo-gba/", import.meta.url));
const approvalFile = new URL("../fixtures/asset-provenance/encore-approved.json", import.meta.url);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const destinations = new Map([
  ["recovered-radio.png", "Assets/sprites/recovered-radio.png"],
  ["radio-lume-pcm.wav", "Assets/audio/radio-lume-pcm.wav"]
]);

/** Copy approved content by default; candidate preparation is explicit and never grants approval. */
export async function prepareEncoreReview(directory, { candidateAssets } = {}) {
  const approvedBytes = await fs.readFile(approvalFile);
  const approved = JSON.parse(approvedBytes);
  if (approved.approval?.approved !== true || approved.approval.visual !== true || approved.approval.audio !== true) {
    throw Error("Explicit artwork and audio approval required for the canonical review.");
  }
  if (approved.assets.length !== destinations.size || new Set(approved.assets.map(asset => asset.name)).size !== destinations.size) {
    throw Error("Unexpected Encore asset manifest.");
  }
  const projectBytes = await fs.readFile(path.join(template, "exemplo-gba.gba-project"));
  const source = JSON.parse(projectBytes);
  if (!source.events.some(event => event.name === "encore_radio_play")) throw Error("Canonical Encore content is not integrated.");
  const assets = new Map();
  for (const asset of approved.assets) {
    if (asset.metadata?.source !== destinations.get(asset.name) || asset.metadata.approved !== true) {
      throw Error("Unexpected or unapproved Encore asset: " + asset.name);
    }
    const declared = source.assets.find(row => row.id === asset.id);
    const original = await fs.readFile(path.join(template, asset.metadata.source));
    if (declared?.metadata?.approved !== true || declared.metadata.preparedSha256 !== asset.metadata.preparedSha256
      || digest(original) !== asset.metadata.preparedSha256) throw Error("Approved asset hash mismatch: " + asset.name);
    assets.set(asset.name, candidateAssets ? await fs.readFile(path.join(candidateAssets, asset.name)) : original);
  }

  const manifest = structuredClone(approved);
  if (candidateAssets) {
    manifest.approval = { approved: false, visual: false, audio: false };
    for (const asset of manifest.assets) {
      delete asset.metadata.approvedAt;
      delete asset.metadata.approvalDate;
      Object.assign(asset.metadata, {
        approved: false, reviewStatus: "candidate", visualStatus: "candidate",
        license: "Unverified candidate; supply its license before promotion",
        generatedBy: "prepare-encore-review.mjs; candidate copy only",
        preparedSha256: digest(assets.get(asset.name))
      });
    }
  }
  // Validate/read inputs before claiming a fresh output. No existing directory is refreshed.
  const output = createExternalReviewDirectory(directory);
  const projectRoot = path.join(output, "project"), assetsRoot = path.join(output, "assets");
  await fs.cp(template, projectRoot, { recursive: true, force: false, errorOnExist: true });
  await fs.mkdir(assetsRoot);
  for (const asset of manifest.assets) {
    const bytes = assets.get(asset.name);
    await fs.writeFile(path.join(assetsRoot, asset.name), bytes, { flag: "wx" });
    if (candidateAssets) await fs.writeFile(path.join(projectRoot, destinations.get(asset.name)), bytes);
  }
  if (candidateAssets) {
    const project = extendExampleEncore(source, manifest);
    await fs.writeFile(path.join(projectRoot, "exemplo-gba.gba-project"), JSON.stringify(project, null, 2) + "\n");
  }
  await fs.writeFile(path.join(assetsRoot, "manifest.json"), candidateAssets ? JSON.stringify(manifest, null, 2) + "\n" : approvedBytes, { flag: "wx" });
  const result = { mode: candidateAssets ? "candidate" : "approved", projectRoot, sourceSha256: digest(projectBytes), approval: manifest.approval };
  await fs.writeFile(path.join(output, "review.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, option, ...extra] = process.argv.slice(2);
  if (!output || output.startsWith("--") || extra.length || (option && !option.startsWith("--candidate-assets=")) || option === "--candidate-assets=") {
    throw Error("Usage: prepare-encore-review.mjs NEW_EXTERNAL_DIRECTORY [--candidate-assets=DIRECTORY]");
  }
  console.log(JSON.stringify(await prepareEncoreReview(output, { candidateAssets: option?.slice("--candidate-assets=".length) }), null, 2));
}
