import { describe, expect, it } from "vitest";
import {
  buildProjectPluginRegistry,
  commandVerbFromTemplate,
  loadedPluginFromManifest,
  parsePluginManifestJson,
  resolveProjectRootFromProjectPath,
  satisfiesGbaStudioVersion,
  satisfiesPluginSdkVersion,
  validatePluginManifest
} from "./gbaStudioPlugins.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { compilePluginMappedEventCommand } from "./gbaStudioPluginExport.js";
import { createBlankProjectData } from "./newProject.js";

const recipePackManifest = {
  id: "acme/dialogue-pack",
  type: "recipePack",
  version: "1.0.0",
  gbaStudioVersion: ">=0.1.0",
  name: "Dialogue Pack",
  author: "Acme Tools",
  description: "Receitas reutilizaveis de dialogo.",
  recipes: [
    {
      id: "quick_talk",
      title: "Quick Talk",
      category: "Dialogo",
      steps: [
        {
          command: "show_dialogue intro_001",
          category: "Dialogo",
          detail: "Mostrar dialogo intro_001."
        },
        {
          command: "wait 12",
          category: "Controle",
          detail: "Aguardar leitura."
        }
      ]
    }
  ]
};

const eventCommandPackManifest = {
  id: "acme/custom-events",
  type: "eventCommandPack",
  version: "1.0.0",
  gbaStudioVersion: ">=0.1.0",
  name: "Custom Events",
  author: "Acme Tools",
  description: "Eventos customizados.",
  commands: [
    {
      id: "custom_wait",
      title: "Espera customizada",
      category: "Plugin",
      commandTemplate: "acme_wait {value}",
      runtimeStatus: "preview-runtime" as const,
      export: {
        op: "wait",
        opcode: "Wait",
        targetKind: "None" as const,
        arg0Token: 1
      }
    }
  ]
};

describe("gbaStudioPlugins", () => {
  it("valida manifesto minimo de recipePack", () => {
    expect(validatePluginManifest(recipePackManifest)).toEqual({
      manifest: expect.objectContaining({
        id: "acme/dialogue-pack",
        type: "recipePack"
      })
    });
  });

  it.each(["eventsPlugin", "enginePlugin", "template", "theme", "lang"])("rejects GB Studio manifest type %s", (type) => {
    const result = validatePluginManifest({
      ...eventCommandPackManifest,
      type
    });
    expect(result).toEqual({ error: expect.stringContaining("GBA Studio") });
    expect(loadedPluginFromManifest({ ...eventCommandPackManifest, type }, "/tmp/acme/custom-events", "/tmp/acme/custom-events/plugin.json")).toBeNull();
  });

  it("does not accept gbsVersion as a GBA Studio compatibility declaration", () => {
    const { gbaStudioVersion: _version, ...manifest } = eventCommandPackManifest;
    expect(validatePluginManifest({ ...manifest, gbsVersion: ">=0.1.0" })).toEqual({ error: "Campo obrigatorio ausente: gbaStudioVersion." });
  });

  it("monta registry com receitas e verbos customizados", () => {
    const recipePlugin = loadedPluginFromManifest(
      (validatePluginManifest(recipePackManifest) as { manifest: typeof recipePackManifest }).manifest,
      "/tmp/acme/dialogue-pack",
      "/tmp/acme/dialogue-pack/plugin.json"
    )!;
    const commandPlugin = loadedPluginFromManifest(
      (validatePluginManifest(eventCommandPackManifest) as { manifest: typeof eventCommandPackManifest }).manifest,
      "/tmp/acme/custom-events",
      "/tmp/acme/custom-events/plugin.json"
    )!;

    const registry = buildProjectPluginRegistry([recipePlugin, commandPlugin]);
    expect(registry.recipes).toHaveLength(1);
    expect(registry.recipes[0]).toMatchObject({
      id: "acme/dialogue-pack/quick_talk",
      title: "Quick Talk"
    });
    expect(registry.commands).toHaveLength(1);
    expect(registry.commandVerbs.has("acme_wait")).toBe(true);
    expect(registry.commandRuntimeStatusByVerb.get("acme_wait")).toBe("preview-runtime");
    expect(registry.exportMappingByVerb.get("acme_wait")).toMatchObject({ opcode: "Wait" });
  });

  it("expoe comandos de plugin no palette de eventos", () => {
    const commandPlugin = loadedPluginFromManifest(
      (validatePluginManifest(eventCommandPackManifest) as { manifest: typeof eventCommandPackManifest }).manifest,
      "/tmp/acme/custom-events",
      "/tmp/acme/custom-events/plugin.json"
    )!;
    const registry = buildProjectPluginRegistry([commandPlugin]);
    const presentation = deriveEventsWorkspacePresentation(createBlankProjectData({ name: "Demo" }), { registry });

    expect(presentation.commandPalette.some((item) => item.id === "plugin-command:acme/custom-events/custom_wait")).toBe(true);
    expect(presentation.commandPalette.some((item) => item.id === "recipe:acme/dialogue-pack/quick_talk")).toBe(false);
    expect(presentation.commandPalette.find((item) => item.command.startsWith("acme_wait"))).toMatchObject({
      category: "Plugin",
      runtimeStatus: "preview-runtime"
    });
  });

  it("expoe receitas de plugin no palette de eventos", () => {
    const recipePlugin = loadedPluginFromManifest(
      (validatePluginManifest(recipePackManifest) as { manifest: typeof recipePackManifest }).manifest,
      "/tmp/acme/dialogue-pack",
      "/tmp/acme/dialogue-pack/plugin.json"
    )!;
    const registry = buildProjectPluginRegistry([recipePlugin]);
    const presentation = deriveEventsWorkspacePresentation(createBlankProjectData({ name: "Demo" }), { registry });

    expect(presentation.commandPalette.some((item) => item.id === "recipe:acme/dialogue-pack/quick_talk")).toBe(true);
  });

  it("compila export handler de verbo customizado", () => {
    const compiled = compilePluginMappedEventCommand(
      "acme_wait 24",
      true,
      {
        opcode: "Wait",
        targetKind: "None",
        arg0Token: 1
      },
      () => -1
    );

    expect(compiled).toMatchObject({
      opcode: "Wait",
      targetKind: "None",
      arg0: 24,
      operand: "24",
      rawCommand: "acme_wait 24"
    });
  });

  it("resolve project root a partir do caminho do arquivo", () => {
    expect(resolveProjectRootFromProjectPath("/tmp/demo/demo.gba-project")).toBe("/tmp/demo");
  });

  it("valida constraint gbaStudioVersion", () => {
    expect(satisfiesGbaStudioVersion(">=0.1.0", "0.1.0")).toBe(true);
    expect(satisfiesGbaStudioVersion(">=0.2.0", "0.1.0")).toBe(false);
    expect(satisfiesGbaStudioVersion("2.0.0", "0.1.0")).toBe(false);
    expect(satisfiesGbaStudioVersion("invalid-version", "0.1.0")).toBe(false);
    expect(satisfiesGbaStudioVersion("^0.1.0", "0.1.0")).toBe(true);
  });

  it("valida a faixa semver do SDK de plugins", () => {
    expect(satisfiesPluginSdkVersion("^1.0.0", "1.2.0")).toBe(true);
    expect(satisfiesPluginSdkVersion("~1.0.0", "1.1.0")).toBe(false);
    expect(satisfiesPluginSdkVersion(">=2.0.0", "1.0.0")).toBe(false);
    expect(validatePluginManifest({ ...recipePackManifest, sdkVersion: "1.0.0" })).toEqual({
      manifest: expect.objectContaining({ sdkVersion: "1.0.0" })
    });
    expect(validatePluginManifest({ ...recipePackManifest, sdkVersion: "sdk-next" })).toEqual({
      error: "Campo sdkVersion precisa ser uma versão semver válida."
    });
    expect(validatePluginManifest({ ...recipePackManifest, sdkVersion: "2.0.0" })).toEqual({ error: "Plugin exige SDK do GBA Studio 2.0.0." });
  });

  it("rejeita plugin.json invalido", () => {
    expect(parsePluginManifestJson("{")).toEqual({ error: "plugin.json invalido." });
    expect(validatePluginManifest({ id: "x" })).toEqual({ error: "Campo obrigatorio ausente: type." });
  });

  it.each(["../outside", "C:/outside", "acme\\..\\outside"])("rejeita id de plugin com caminho inseguro: %s", (id) => {
    expect(validatePluginManifest({ ...recipePackManifest, id })).toEqual({
      error: "Campo id precisa ser um caminho relativo seguro."
    });
  });

  it("extrai verbo do commandTemplate", () => {
    expect(commandVerbFromTemplate("show_dialogue {dialogue}")).toBe("show_dialogue");
  });
});
