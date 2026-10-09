import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function syncExemploTemplateUiAssets({
  templateProjectPath,
  fixtureProjectPath,
  fileNames
}) {
  if (!fixtureProjectPath) return;
  const templateAssetsDir = path.join(path.dirname(templateProjectPath), "Assets");
  const fixtureAssetsDir = path.join(path.dirname(fixtureProjectPath), "Assets");
  for (const fileName of fileNames) {
    const assetDirectory = fileName.includes("font") ? "fonts" : "ui";
    const templateAssetDir = path.join(templateAssetsDir, assetDirectory);
    const fixtureAssetDir = path.join(fixtureAssetsDir, assetDirectory);
    await mkdir(fixtureAssetDir, { recursive: true });
    await copyFile(
      path.join(templateAssetDir, fileName),
      path.join(fixtureAssetDir, fileName)
    );
  }
}
