function transientIndices(indices, sampleCount) {
  const runs = [];
  for (const index of indices) {
    const previous = runs.at(-1);
    if (previous && index === previous.at(-1) + 1) {
      previous.push(index);
    } else {
      runs.push([index]);
    }
  }
  return runs
    .filter((run) => run[0] > 0 && run.at(-1) < sampleCount - 1)
    .flat();
}

function changedBetweenStableNeighbors(values) {
  return values
    .map((value, index) => (
      index > 0 && index < values.length - 1
        && value !== null
        && values[index - 1] !== null
        && values[index + 1] === values[index - 1]
        && value !== values[index - 1]
        ? index
        : null
    ))
    .filter((index) => index !== null);
}

export function auditIsometricPreviewStability(samples) {
  const sampleList = Array.isArray(samples) ? samples : [];
  const invalidFrames = sampleList
    .map((sample, index) => {
      const bitmap = sample?.rasterBitmap ?? sample?.canvasBitmap ?? {};
      const layer = sample?.layer ?? {};
      const validProjection = sample?.projection === "isometric-contain"
        || sample?.projection === "fill" && sample?.backgroundLayout === true;
      return (sample?.hasRasterContent !== true && sample?.hasCanvas !== true)
        || sample?.hasPreviewLayer !== true
        || !validProjection
        || Number(bitmap.width) <= 0
        || Number(bitmap.height) <= 0
        || Number(layer.width) <= 0
        || Number(layer.height) <= 0
        || Number(sample?.nonTransparentPixelCount) <= 0
        ? index
        : null;
    })
    .filter((index) => index !== null);
  const transientBlankFrames = transientIndices(invalidFrames, sampleList.length);
  const signatures = sampleList.map((sample) => sample?.signature ?? null);
  const geometrySignatures = sampleList.map((sample) => {
    const bitmap = sample?.rasterBitmap ?? sample?.canvasBitmap ?? {};
    const layer = sample?.layer ?? {};
    return sample?.projection && Number(bitmap.width) > 0 && Number(bitmap.height) > 0
      && Number(layer.width) > 0 && Number(layer.height) > 0
      ? `${sample.projection}:${bitmap.width}x${bitmap.height}:${layer.width}x${layer.height}`
      : null;
  });
  const transientSignatureFrames = changedBetweenStableNeighbors(signatures);
  const transientGeometryFrames = changedBetweenStableNeighbors(geometrySignatures);
  const persistentSignatureFrames = signatures
    .map((signature, index) => signature !== null && index > 0 && signature !== signatures[index - 1] ? index : null)
    .filter((index) => index !== null);
  const persistentGeometryFrames = geometrySignatures
    .map((signature, index) => signature !== null && index > 0 && signature !== geometrySignatures[index - 1] ? index : null)
    .filter((index) => index !== null);
  const issues = [];
  if (invalidFrames.length > 0) issues.push(`Preview inválido ou transparente nos frames: ${invalidFrames.join(", ")}.`);
  if (transientSignatureFrames.length > 0) issues.push(`A imagem do card mudou por um único frame: ${transientSignatureFrames.join(", ")}.`);
  if (transientGeometryFrames.length > 0) issues.push(`A geometria do card mudou por um único frame: ${transientGeometryFrames.join(", ")}.`);
  if (persistentSignatureFrames.length > 0) issues.push(`A imagem do card mudou durante a amostragem: ${persistentSignatureFrames.join(", ")}.`);
  if (persistentGeometryFrames.length > 0) issues.push(`A geometria do card mudou durante a amostragem: ${persistentGeometryFrames.join(", ")}.`);
  return Object.freeze({
    geometry: Object.freeze({
      changedFrames: Object.freeze(persistentGeometryFrames),
      transientFrames: Object.freeze(transientGeometryFrames)
    }),
    image: Object.freeze({
      changedFrames: Object.freeze(persistentSignatureFrames),
      transientFrames: Object.freeze(transientSignatureFrames)
    }),
    invalidFrames: Object.freeze(invalidFrames),
    issues: Object.freeze(issues),
    ok: issues.length === 0,
    sampleCount: sampleList.length,
    transientBlankFrames: Object.freeze(transientBlankFrames)
  });
}
