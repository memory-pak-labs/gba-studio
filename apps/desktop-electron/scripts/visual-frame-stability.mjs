const GBA_FRAMEBUFFER_PIXEL_COUNT = 240 * 160;

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function frameIsBlank(sample, options) {
  const frame = sample?.frame ?? {};
  return frame.meaningful !== true
    || numeric(frame.pixelCount) !== options.framebufferPixelCount
    || numeric(frame.nonBlackRatio) < options.minNonBlackRatio
    || numeric(frame.uniqueColorCount) < options.minUniqueColorCount
    || numeric(frame.dominantColorRatio, 1) >= options.maxDominantColorRatio;
}

function regionIsBlank(region, options) {
  return !region
    || region.meaningful !== true
    || numeric(region.pixelCount) <= 0
    || numeric(region.nonBlackRatio) < options.minRegionNonBlackRatio
    || numeric(region.uniqueColorCount) < options.minRegionUniqueColorCount
    || numeric(region.dominantColorRatio, 1) >= options.maxRegionDominantColorRatio;
}

function contiguousRuns(indices) {
  const runs = [];
  for (const index of indices) {
    const previous = runs.at(-1);
    if (previous && index === previous.at(-1) + 1) {
      previous.push(index);
    } else {
      runs.push([index]);
    }
  }
  return runs;
}

function transientIndices(indices, sampleCount) {
  return contiguousRuns(indices)
    .filter((run) => run[0] > 0 && run.at(-1) < sampleCount - 1)
    .flat();
}

function actorCount(sample) {
  const value = Number(sample?.runtime?.actorCount);
  return Number.isFinite(value) ? value : null;
}

function firstActorVisible(sample) {
  return typeof sample?.runtime?.firstActor?.visible === "boolean"
    ? sample.runtime.firstActor.visible
    : null;
}

function transientActorDisappearance(samples) {
  const actorCounts = samples.map(actorCount);
  const countBaselineExists = actorCounts.some((value) => value !== null && value > 0);
  const countDrops = countBaselineExists
    ? transientIndices(
      actorCounts
        .map((value, index) => value === 0 ? index : null)
        .filter((index) => index !== null),
      samples.length
    ).filter((index) => actorCounts[index - 1] > 0 && actorCounts[index + 1] > 0)
    : [];

  const visibility = samples.map(firstActorVisible);
  const visibilityBaselineExists = visibility.some((value) => value === true);
  const visibilityDrops = visibilityBaselineExists
    ? transientIndices(
      visibility
        .map((value, index) => value === false ? index : null)
        .filter((index) => index !== null),
      samples.length
    ).filter((index) => visibility[index - 1] === true && visibility[index + 1] === true)
    : [];

  return [...new Set([...countDrops, ...visibilityDrops])].sort((left, right) => left - right);
}

function auditRegionValues(regions, sampleCount, options) {
  const validCount = regions.filter((region) => region && !regionIsBlank(region, options)).length;
  if (validCount < options.minimumAuditedRegionSamples) {
    return {
      audited: false,
      transientBlankFrames: [],
      regionCount: 0
    };
  }
  const blankFrames = regions
    .map((region, index) => regionIsBlank(region, options) ? index : null)
    .filter((index) => index !== null);
  return {
    audited: true,
    transientBlankFrames: transientIndices(blankFrames, sampleCount),
    regionCount: 1
  };
}

function transientSignatureChanges(regions, sampleCount) {
  const signatures = regions.map((region) => region?.signature ?? null);
  return signatures
    .map((signature, index) => (
      index > 0 && index < sampleCount - 1 && signature !== null
        && signatures[index - 1] !== null
        && signatures[index + 1] === signatures[index - 1]
        && signature !== signatures[index - 1]
        ? index
        : null
    ))
    .filter((index) => index !== null);
}

function auditRegion(samples, regionName, options) {
  return auditRegionValues(
    samples.map((sample) => sample?.regions?.[regionName] ?? null),
    samples.length,
    options
  );
}

function auditRegionSet(samples, regionName, options) {
  const regionLists = samples.map((sample) => {
    const value = sample?.regions?.[regionName];
    return Array.isArray(value) ? value : value ? [value] : [];
  });
  const regionCount = Math.max(0, ...regionLists.map((regions) => regions.length));
  if (regionCount === 0) {
    return {
      audited: false,
      transientBlankFrames: [],
      regionCount: 0
    };
  }
  return mergeRegionAudits(
    Array.from({ length: regionCount }, (_, regionIndex) => auditRegionValues(
      regionLists.map((regions) => regions[regionIndex] ?? null),
      samples.length,
      options
    ))
  );
}

function mergeRegionAudits(audits) {
  const activeAudits = audits.filter((audit) => audit.audited);
  return {
    audited: activeAudits.length > 0,
    transientBlankFrames: [...new Set(activeAudits.flatMap((audit) => audit.transientBlankFrames))]
      .sort((left, right) => left - right)
  };
}

export function auditTemporalVisualStability(samples, thresholds = {}) {
  const sampleList = Array.isArray(samples) ? samples : [];
  const options = {
    framebufferPixelCount: GBA_FRAMEBUFFER_PIXEL_COUNT,
    maxDominantColorRatio: 0.995,
    minNonBlackRatio: 0.01,
    minUniqueColorCount: 3,
    maxRegionDominantColorRatio: 0.995,
    minRegionNonBlackRatio: 0.01,
    minRegionUniqueColorCount: 3,
    minimumAuditedRegionSamples: 2,
    enforceSignatureContinuity: false,
    ...thresholds
  };
  const blankFrames = sampleList
    .map((sample, index) => frameIsBlank(sample, options) ? index : null)
    .filter((index) => index !== null);
  const transientBlankFrames = transientIndices(blankFrames, sampleList.length);
  const actorDisappearanceFrames = transientActorDisappearance(sampleList);
  const backgroundRegion = auditRegion(sampleList, "background", options);
  const backgroundTransientSignatureFrames = options.enforceSignatureContinuity
    ? transientSignatureChanges(
      sampleList.map((sample) => sample?.regions?.background ?? null),
      sampleList.length
    )
    : [];
  const actorRegion = auditRegionSet(sampleList, "actors", options);
  const hudRegion = mergeRegionAudits([
    auditRegion(sampleList, "hudTop", options),
    auditRegion(sampleList, "hudBottom", options)
  ]);
  const dialogueRegion = auditRegion(sampleList, "dialogue", options);
  const titleMenuRegion = auditRegion(sampleList, "titleMenu", options);
  const menuRegion = auditRegion(sampleList, "menu", options);
  const backgroundTransientBlankFrames = [...new Set([
    ...transientBlankFrames,
    ...backgroundRegion.transientBlankFrames
  ])].sort((left, right) => left - right);
  const frameIssues = transientBlankFrames.length > 0
    ? [`Framebuffer vazio entre frames válidos: ${transientBlankFrames.join(", ")}.`]
    : [];
  const backgroundIssues = backgroundRegion.transientBlankFrames.length > 0
    ? [`A camada de cenário ficou vazia entre frames válidos: ${backgroundRegion.transientBlankFrames.join(", ")}.`]
    : [];
  const backgroundSignatureIssues = backgroundTransientSignatureFrames.length > 0
    ? [`A assinatura visual do cenário mudou em um único frame: ${backgroundTransientSignatureFrames.join(", ")}.`]
    : [];
  const hudIssues = hudRegion.transientBlankFrames.length > 0
    ? [`A camada de HUD ficou vazia entre frames válidos: ${hudRegion.transientBlankFrames.join(", ")}.`]
    : [];
  const dialogueIssues = dialogueRegion.transientBlankFrames.length > 0
    ? [`A camada de diálogo ficou vazia entre frames válidos: ${dialogueRegion.transientBlankFrames.join(", ")}.`]
    : [];
  const actorRegionIssues = actorRegion.transientBlankFrames.length > 0
    ? [`A região visual dos atores ficou vazia entre frames válidos: ${actorRegion.transientBlankFrames.join(", ")}.`]
    : [];
  const actorTelemetryIssues = actorDisappearanceFrames.length > 0
    ? [`Atores desapareceram entre frames válidos: ${actorDisappearanceFrames.join(", ")}.`]
    : [];
  const actorIssues = [...actorRegionIssues, ...actorTelemetryIssues];
  const issues = [
    ...frameIssues,
    ...backgroundIssues,
    ...backgroundSignatureIssues,
    ...hudIssues,
    ...dialogueIssues,
    ...actorIssues
  ];
  const actorTelemetryAudited = sampleList.some((sample) => (
    actorCount(sample) !== null || firstActorVisible(sample) !== null
  ));

  return Object.freeze({
    actors: Object.freeze({
      audited: actorTelemetryAudited || actorRegion.audited,
      ok: actorIssues.length === 0,
      transientBlankFrames: Object.freeze(actorRegion.transientBlankFrames),
      transientDisappearanceFrames: Object.freeze(actorDisappearanceFrames)
    }),
    background: Object.freeze({
      audited: true,
      ok: frameIssues.length === 0 && backgroundIssues.length === 0 && backgroundSignatureIssues.length === 0,
      transientBlankFrames: Object.freeze(backgroundTransientBlankFrames),
      transientSignatureFrames: Object.freeze(backgroundTransientSignatureFrames)
    }),
    hud: Object.freeze({
      audited: hudRegion.audited,
      ok: hudIssues.length === 0,
      transientBlankFrames: Object.freeze(hudRegion.transientBlankFrames)
    }),
    dialogue: Object.freeze({
      audited: dialogueRegion.audited,
      ok: dialogueIssues.length === 0,
      transientBlankFrames: Object.freeze(dialogueRegion.transientBlankFrames)
    }),
    titleMenu: Object.freeze({
      audited: titleMenuRegion.audited,
      ok: frameIssues.length === 0 && titleMenuRegion.transientBlankFrames.length === 0,
      transientBlankFrames: Object.freeze(titleMenuRegion.transientBlankFrames)
    }),
    menu: Object.freeze({
      audited: menuRegion.audited,
      ok: frameIssues.length === 0 && menuRegion.transientBlankFrames.length === 0,
      transientBlankFrames: Object.freeze(menuRegion.transientBlankFrames)
    }),
    frame: Object.freeze({
      blankFrames: Object.freeze(blankFrames),
      ok: frameIssues.length === 0,
      transientBlankFrames: Object.freeze(transientBlankFrames)
    }),
    issues: Object.freeze(issues),
    ok: issues.length === 0,
    sampleCount: sampleList.length
  });
}
