import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )));
});

describe("sincronização dos assets de diálogo do template", () => {
  it("não cria um espelho visual quando só o template canônico é informado", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-template-ui-canonical-"));
    temporaryRoots.push(root);
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const templateUiDir = path.join(path.dirname(templateProjectPath), "Assets", "ui");
    await mkdir(templateUiDir, { recursive: true });
    await writeFile(path.join(templateUiDir, "dialogue-box-gba.png"), "farol-authored");

    const { syncExemploTemplateUiAssets } = await import("./exemplo-template-ui-assets.mjs");
    await syncExemploTemplateUiAssets({ templateProjectPath, fileNames: ["dialogue-box-gba.png"] });

    expect(await readFile(path.join(templateUiDir, "dialogue-box-gba.png"), "utf8"))
      .toBe("farol-authored");
  });

  it("preserva o asset autoral do template e o replica para o fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-template-ui-assets-"));
    temporaryRoots.push(root);
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const templateUiDir = path.join(path.dirname(templateProjectPath), "Assets", "ui");
    const fixtureUiDir = path.join(path.dirname(fixtureProjectPath), "Assets", "ui");
    await mkdir(templateUiDir, { recursive: true });
    await mkdir(fixtureUiDir, { recursive: true });
    await writeFile(path.join(templateUiDir, "dialogue-box-gba.png"), "farol-authored");
    await writeFile(path.join(fixtureUiDir, "dialogue-box-gba.png"), "legacy-generic");

    const { syncExemploTemplateUiAssets } = await import("./exemplo-template-ui-assets.mjs");
    await syncExemploTemplateUiAssets({
      templateProjectPath,
      fixtureProjectPath,
      fileNames: ["dialogue-box-gba.png"]
    });

    expect(await readFile(path.join(templateUiDir, "dialogue-box-gba.png"), "utf8"))
      .toBe("farol-authored");
    expect(await readFile(path.join(fixtureUiDir, "dialogue-box-gba.png"), "utf8"))
      .toBe("farol-authored");
  });
});
