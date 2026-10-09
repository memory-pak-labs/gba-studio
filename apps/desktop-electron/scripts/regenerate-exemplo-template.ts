import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditExportEventCommandCoverage } from "../src/main/exportEngineProject.js";
import { importGBStudioProject } from "../src/main/gbStudioProjectImport.js";
import { deriveEventsWorkspacePresentation } from "../src/shared/eventsWorkspace.js";
import { deriveAudioWorkspacePresentation } from "../src/shared/audioWorkspace.js";
import { buildAssetcAudioPackGeneration } from "../src/shared/engineProjectExport.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "../src/shared/projectFile.js";
import { promoteExemploGBAAudio } from "./exemplo-gba-audio.mjs";
import { promotePlatformerV7 } from "./promote-platformer-v7.mjs";
import { promotePlatformerV8 } from "./promote-platformer-v8.mjs";
import { normalizeExampleObjParts } from "./normalize-example-obj-parts.mjs";
import { promoteExemploGBAAdvancedScenes } from "./exemplo-gba-advanced-scenes.mjs";
import { promoteExemploGBAAdvancedTools } from "./exemplo-gba-advanced-tools.mjs";
import {
  isVerticeShowcaseProject,
  promoteExemploGBAVerticeCampaign
} from "./vertice-showcase-project.mjs";
import { promoteExemploGBStudioSceneTypes } from "./exemplo-gba-scene-types.mjs";
import { mergeImportedExemploEvents, promoteExemploGBAContent } from "./exemplo-gba-content.mjs";
import { localizeExemploGBAProject } from "./exemplo-gba-localization.mjs";
import {
  promoteApprovedSceneRefresh,
  readApprovedSceneRefreshManifest
} from "./promote-approved-scene-refresh.mjs";
import {
  syncVerticeInitialMenuBackground,
  syncVerticeInitialMenuActors,
  syncVerticeGenderSelectionBackground,
  syncVerticeGenderSelectionActors,
  syncVerticeLoadGameBackground,
  syncVerticeSaveGameBackground,
  syncVerticeNewGameBackground,
  syncVerticeNewGameActors,
  syncVerticeMarketSuspensoActors,
  syncVerticeMarketSuspensoBackground,
  syncVerticeMarketSuspensoTileset,
  syncVerticePointClickCandidateAssets,
  syncVerticeOpeningActor,
  syncVerticeApprovedSceneRefreshAssets,
  syncVerticeOpeningBackground,
  syncVerticeOfficialLogoBackground,
  syncVerticePenedosPlatformerLayerAssets,
  syncVerticePortLumenAssets,
  syncVerticePrologueBackground,
  syncVerticeRouteMapBackground,
  syncVerticeMapHybridAssets,
  syncVerticeProfileAssets,
  syncVerticeInventoryAssets,
  syncVerticeLutaAssets,
  syncVerticeLanguageAssets,
  syncVerticeSettingsAssets,
  syncVerticeCreditsAssets,
  syncVerticeMissionsAssets,
  syncVerticeStartMenuAssets,
  syncVerticeTitleBackground,
  syncVerticeTitleLogoActors,
  syncVerticeTempestadeAffineBackground,
  syncVerticeUsinaActors,
  syncVerticeUsinaBackground,
  setVerticeAssetSyncManifest,
  clearVerticeAssetSyncManifest
} from "./vertice-showcase-assets.mjs";

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateProjectPath = path.join(
  electronRoot,
  "default-assets",
  "templates",
  "exemplo-gba",
  "exemplo-gba.gba-project"
);

function syncCanonicalSceneGeometry(sourceData: Record<string, unknown>, promotedData: Record<string, unknown>) {
  const promotedScenes = Array.isArray(promotedData.scenas) ? promotedData.scenas as Array<Record<string, unknown>> : [];
  const promotedScenesByName = new Map(promotedScenes.map((scene) => [scene.name, scene]));
  const copySceneGeometry = (scene: Record<string, unknown>) => {
    const promotedScene = promotedScenesByName.get(scene.name);
    if (!promotedScene) return scene;
    return {
      ...scene,
      collisionTypes: structuredClone(promotedScene.collisionTypes),
      collisions: structuredClone(promotedScene.collisions)
    };
  };
  const data = structuredClone(sourceData);
  if (Array.isArray(data.scenas)) data.scenas = data.scenas.map(copySceneGeometry);
  if (Array.isArray(data.rooms)) data.rooms = data.rooms.map(copySceneGeometry);

  const promotedActors = Array.isArray(promotedData.actors) ? promotedData.actors as Array<Record<string, unknown>> : [];
  const promotedActorsById = new Map(promotedActors.map((actor) => [actor.id, actor]));
  if (Array.isArray(data.actors)) {
    data.actors = data.actors.map((actor) => {
      const promotedActor = promotedActorsById.get(actor.id);
      return promotedActor && Number.isInteger(promotedActor.x) && Number.isInteger(promotedActor.y)
        ? { ...actor, x: promotedActor.x, y: promotedActor.y }
        : actor;
    });
  }

  const promotedTriggers = Array.isArray(promotedData.triggers) ? promotedData.triggers as Array<Record<string, unknown>> : [];
  const promotedTriggersById = new Map(promotedTriggers.map((trigger) => [trigger.id, trigger]));
  if (Array.isArray(data.triggers)) {
    data.triggers = data.triggers.map((trigger) => {
      const promotedTrigger = promotedTriggersById.get(trigger.id);
      return promotedTrigger
        ? {
            ...trigger,
            x: promotedTrigger.x,
            y: promotedTrigger.y,
            width: promotedTrigger.width,
            height: promotedTrigger.height
          }
        : trigger;
    });
  }
  return data;
}

const useCurrentTemplate = process.argv.includes("--current");
const logoOnly = process.argv.includes("--logo-only");
const titleOnly = process.argv.includes("--title-only");
const openingOnly = process.argv.includes("--opening-only");
const openingActorOnly = process.argv.includes("--opening-actor-only");
const newGameOnly = process.argv.includes("--new-game-only");
const menuResetOnly = process.argv.includes("--menu-reset-only");
const loadGameOnly = process.argv.includes("--load-game-only");
const saveGameOnly = process.argv.includes("--save-game-only");
const startMenuOnly = process.argv.includes("--start-menu-only");
const missionsOnly = process.argv.includes("--missions-only");
const inventoryOnly = process.argv.includes("--inventory-only");
const mapHybridOnly = process.argv.includes("--map-hybrid-only");
const profileOnly = process.argv.includes("--profile-only");
const languageOnly = process.argv.includes("--language-only");
const settingsOnly = process.argv.includes("--settings-only");
const creditsOnly = process.argv.includes("--credits-only");
const marketOnly = process.argv.includes("--market-only");
const usinaOnly = process.argv.includes("--usina-only");
const portOnly = process.argv.includes("--port-only");
const tempestadeOnly = process.argv.includes("--tempestade-only");
const pointClickOnly = process.argv.includes("--point-click-only");
const geometryOnly = process.argv.includes("--geometry-only");
const contentOnly = process.argv.includes("--content-only");
const focusedOnly = logoOnly || titleOnly || openingOnly || openingActorOnly || newGameOnly || menuResetOnly || loadGameOnly || saveGameOnly || startMenuOnly || missionsOnly || inventoryOnly || mapHybridOnly || profileOnly || languageOnly || settingsOnly || creditsOnly || marketOnly || usinaOnly || portOnly || tempestadeOnly || pointClickOnly || geometryOnly || contentOnly;
const sourceProjectPath = useCurrentTemplate
  ? templateProjectPath
  : path.resolve(
      process.argv[2]
        ?? process.env.GB_STUDIO_EXAMPLE_PROJECT
        ?? "/Users/example/Documents/Exemplo/Exemplo.gbsproj"
    );

const imported = useCurrentTemplate ? null : await importGBStudioProject(sourceProjectPath);
try {
  // O template distribuído é a única fonte autoritativa.
  const promoted = parseGBAProjectFile(await readFile(templateProjectPath, "utf8"));
  const promotedImport = promoted.data.gbStudioImport as Record<string, unknown> | undefined;
  const freshImport = (imported?.project ?? promoted).data.gbStudioImport as Record<string, unknown> | undefined;
  const alreadyVertice = isVerticeShowcaseProject(promoted.data);
  const canonicalBeforePromotion = geometryOnly && useCurrentTemplate
    ? structuredClone(promoted.data)
    : null;

  promoted.data.events = mergeImportedExemploEvents(
    imported?.project.data.events ?? promoted.data.events,
    promoted.data.events
  );
  if (!alreadyVertice) {
    promoted.data = promoteExemploGBAAudio(promoted.data);
    promoted.data = promoteExemploGBAContent(promoted.data);
    promoted.data = promoteExemploGBStudioSceneTypes(promoted.data);
    promoted.data = promoteExemploGBAAdvancedScenes(promoted.data);
    promoted.data = promoteExemploGBAAdvancedTools(promoted.data);
    promoted.data = localizeExemploGBAProject(promoted.data);
  }
  promoted.data = promoteExemploGBAVerticeCampaign(promoted.data);
  // O refresh de abertura/título é parte da invariável visual do template.
  // Mesmo uma regeneração focada deve reaplicá-lo para não rebaixar as cenas
  // aprovadas para os assets legados.
  promoted.data = promoteApprovedSceneRefresh(
    promoted.data,
    await readApprovedSceneRefreshManifest()
  );
  if (!geometryOnly) {
    // A materialização visual do Vértice remove áudio para poder ser usada
    // como base neutra; a promoção sonora precisa ser a última etapa do
    // projeto canônico para restaurar músicas, SFX e sons de diálogo.
    promoted.data = promoteExemploGBAAudio(promoted.data);
  }
  if (canonicalBeforePromotion) {
    promoted.data = syncCanonicalSceneGeometry(canonicalBeforePromotion, promoted.data);
  }
  promoted.data = normalizeExampleObjParts(promotePlatformerV8(promotePlatformerV7(promoted.data)));
  promoted.data.gbStudioImport = {
    ...(promotedImport ?? {}),
    sourceVersion: freshImport?.sourceVersion,
    sourceRelease: freshImport?.sourceRelease,
    sourceAuthor: freshImport?.sourceAuthor,
    sourceProjectFile: freshImport?.sourceProjectFile,
    importedAt: freshImport?.importedAt,
    resourceCount: freshImport?.resourceCount,
    translatedEventCount: freshImport?.translatedEventCount,
    unsupportedEventCount: freshImport?.unsupportedEventCount
  };
  const settings = promoted.data.settings as Record<string, unknown> | undefined;
  const uiDialogs = settings?.uiDialogs as Record<string, unknown> | undefined;
  const assets = Array.isArray(promoted.data.assets)
    ? promoted.data.assets as Array<Record<string, unknown>>
    : [];
  const boxImage = typeof uiDialogs?.boxImage === "string" ? uiDialogs.boxImage : "";
  if (boxImage && !assets.some((asset) => asset.name === boxImage)) {
    uiDialogs!.boxImage = "";
  }

  const presentation = deriveEventsWorkspacePresentation(promoted.data);
  const audio = deriveAudioWorkspacePresentation(promoted.data);
  const audioPack = buildAssetcAudioPackGeneration(promoted.data);
  const coverage = auditExportEventCommandCoverage(promoted.data);
  const intentionallyUnlinkedPendingEvents = new Set([
    "porto_recuperar_estrutura",
    "penedos_recolher_aderencia",
    "mercado_abrir_atalho",
    "usina_coletar_celula",
    "tempestade_drone_disparar",
    "tempestade_concluir"
  ]);
  const unexpectedUnlinkedEvents = presentation.groups
    .flatMap((group) => group.events)
    .filter((event) => event.isUnlinked && !intentionallyUnlinkedPendingEvents.has(event.name));
  const unsupportedEventCount = Number(
    (promoted.data.gbStudioImport as Record<string, unknown>).unsupportedEventCount ?? -1
  );
  // O projeto canônico autoriza áudio composto: o pack esperado contém as
  // músicas tracker e os SFX gerados a partir dos patterns do exemplo. A
  // regeneração deve bloquear somente avisos reais de exportação, não a
  // presença dos itens que serão consumidos pelo assetc.
  const audioExportIssues = !geometryOnly && audio.items.some((item) => item.warnings.length > 0);
  if (
    presentation.summary.missingReferenceCount !== 0
    || unexpectedUnlinkedEvents.length !== 0
    || audioExportIssues
    || unsupportedEventCount !== 0
    || !coverage.ok
  ) {
    throw new Error(
      `Template regenerado invalido: pendencias=${presentation.summary.missingReferenceCount}, `
      + `soltos=${unexpectedUnlinkedEvents.map((event) => event.name).join(",") || "ok"}, unsupported=${unsupportedEventCount}, `
      + `audio=${audio.items.flatMap((item) => item.warnings).join(";") || "ok"}, `
      + `tracker=${audioPack?.document.tracker.length ?? 0}, sfx=${audioPack?.document.sfx.length ?? 0}, `
      + `coverage=${coverage.unsupported.join(",") || "ok"}`
    );
  }

  const serialized = serializeGBAProjectFile(promoted);
  setVerticeAssetSyncManifest(templateProjectPath, promoted.data);
  if (!focusedOnly) {
    await syncVerticeTitleBackground({ templateProjectPath });
    await syncVerticeOpeningBackground({ templateProjectPath });
    await syncVerticeOpeningActor({ templateProjectPath });
    await syncVerticeInitialMenuBackground({ templateProjectPath });
    await syncVerticeInitialMenuActors({ templateProjectPath });
    await syncVerticeGenderSelectionBackground({ templateProjectPath });
    await syncVerticeGenderSelectionActors({ templateProjectPath });
    await syncVerticeNewGameBackground({ templateProjectPath });
    await syncVerticeNewGameActors({ templateProjectPath });
    await syncVerticeLoadGameBackground({ templateProjectPath });
    await syncVerticeSaveGameBackground({ templateProjectPath });
    await syncVerticeStartMenuAssets({ templateProjectPath });
    await syncVerticeMissionsAssets({ templateProjectPath });
    await syncVerticeInventoryAssets({ templateProjectPath });
    await syncVerticeMapHybridAssets({ templateProjectPath });
    await syncVerticeProfileAssets({ templateProjectPath });
    await syncVerticeLanguageAssets({ templateProjectPath });
    await syncVerticeSettingsAssets({ templateProjectPath });
    await syncVerticeCreditsAssets({ templateProjectPath });
    await syncVerticeOfficialLogoBackground({ templateProjectPath });
    await syncVerticePortLumenAssets({ templateProjectPath });
    await syncVerticePenedosPlatformerLayerAssets({ templateProjectPath });
    await syncVerticePointClickCandidateAssets({ templateProjectPath });
    await syncVerticeMarketSuspensoBackground({ templateProjectPath });
    await syncVerticeMarketSuspensoActors({ templateProjectPath });
    await syncVerticePrologueBackground({ templateProjectPath });
    await syncVerticeRouteMapBackground({ templateProjectPath });
    await syncVerticeUsinaBackground({ templateProjectPath });
    await syncVerticeUsinaActors({ templateProjectPath });
    await syncVerticeLutaAssets({ templateProjectPath });
    await syncVerticeTempestadeAffineBackground({ templateProjectPath });
  }
  // Os binários do refresh precisam acompanhar a promoção mesmo quando a
  // regeneração é focada em outra família de cenas.
  await syncVerticeApprovedSceneRefreshAssets({ templateProjectPath });
  if (openingOnly) {
    await syncVerticeOpeningBackground({ templateProjectPath });
  }
  if (titleOnly) {
    await syncVerticeTitleBackground({ templateProjectPath });
    await syncVerticeTitleLogoActors({ templateProjectPath });
  }
  if (openingActorOnly) {
    await syncVerticeOpeningActor({ templateProjectPath });
  }
  if (logoOnly) {
    await syncVerticeOfficialLogoBackground({ templateProjectPath });
  }
  if (newGameOnly) {
    await syncVerticeNewGameBackground({ templateProjectPath });
    await syncVerticeNewGameActors({ templateProjectPath });
  }
  if (menuResetOnly) {
    await syncVerticeInitialMenuBackground({ templateProjectPath });
    await syncVerticeInitialMenuActors({ templateProjectPath });
    await syncVerticeGenderSelectionBackground({ templateProjectPath });
    await syncVerticeGenderSelectionActors({ templateProjectPath });
    await syncVerticeNewGameBackground({ templateProjectPath });
    await syncVerticeNewGameActors({ templateProjectPath });
  }
  if (loadGameOnly) {
    await syncVerticeLoadGameBackground({ templateProjectPath });
  }
  if (saveGameOnly) {
    await syncVerticeSaveGameBackground({ templateProjectPath });
  }
  if (startMenuOnly) {
    await syncVerticeStartMenuAssets({ templateProjectPath });
  }
  if (missionsOnly) {
    await syncVerticeMissionsAssets({ templateProjectPath });
  }
  if (inventoryOnly) {
    await syncVerticeInventoryAssets({ templateProjectPath });
  }
  if (mapHybridOnly) {
    await syncVerticeMapHybridAssets({ templateProjectPath });
  }
  if (profileOnly) {
    await syncVerticeProfileAssets({ templateProjectPath });
  }
  if (languageOnly) {
    await syncVerticeLanguageAssets({ templateProjectPath });
  }
  if (settingsOnly) {
    await syncVerticeSettingsAssets({ templateProjectPath });
  }
  if (creditsOnly) {
    await syncVerticeCreditsAssets({ templateProjectPath });
  }
  if (marketOnly) {
    await syncVerticeMarketSuspensoBackground({ templateProjectPath });
    await syncVerticeMarketSuspensoTileset({ templateProjectPath });
    await syncVerticeMarketSuspensoActors({ templateProjectPath });
  }
  if (usinaOnly) {
    await syncVerticeUsinaBackground({ templateProjectPath });
  }
  if (portOnly) {
    await syncVerticePortLumenAssets({ templateProjectPath });
  }
  if (tempestadeOnly) {
    await syncVerticeTempestadeAffineBackground({ templateProjectPath });
  }
  if (pointClickOnly) {
    await syncVerticePointClickCandidateAssets({ templateProjectPath });
  }
  await writeFile(templateProjectPath, serialized, "utf8");

  console.log(JSON.stringify({
    sourceProjectPath,
    templateProjectPath,
    translatedEventCount: freshImport?.translatedEventCount,
    unsupportedEventCount,
    eventCount: presentation.summary.eventCount,
    stepCount: presentation.summary.stepCount,
    missingReferenceCount: presentation.summary.missingReferenceCount,
    unlinkedEventCount: presentation.summary.unlinkedEventCount
  }, null, 2));
} finally {
  clearVerticeAssetSyncManifest(templateProjectPath);
  if (imported) {
    await rm(path.dirname(imported.projectPath), { recursive: true, force: true });
  }
}
