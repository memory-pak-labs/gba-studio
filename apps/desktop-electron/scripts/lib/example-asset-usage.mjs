const rows = value => Array.isArray(value) ? value : [];
const libraryKeys = new Set(['assets', 'animations', 'animationStates', 'assetGroups', 'spriteReferenceImages', 'editorState', 'gbStudioImport', 'paletteFamilies']);
// These references were explicitly created as backups by earlier promotions.
// Ordinary authoring references remain roots, even when temporarily hidden.
const archivedReference = row => row.visible === false && /anterior preservad/i.test(row.title ?? '');

/** Analyze the example library from live scene/project roots, never from the library itself. */
export function analyzeExampleAssetUsage(project) {
  const assets = rows(project.assets), usedNames = new Set(), usages = {}, pending = [];
  const byReference = new Map();
  for (const asset of assets) {
    for (const key of [asset.name, asset.id, asset.metadata?.source]) {
      if (key) byReference.set(key, asset.name);
    }
  }
  const byName = new Map(assets.map(asset=>[asset.name,asset]));
  const animationRows = [...rows(project.animations), ...rows(project.animationStates)];
  const byID = new Map(animationRows.map(row => [row.id, row]));
  const visited = new Set();
  const visit = (value, at) => {
    if (Array.isArray(value)) return value.forEach((item, i) => visit(item, `${at}[${i}]`));
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (key === 'metadata') continue;
        if (key === 'referenceImages') {
          rows(item).filter(row => !archivedReference(row)).forEach((row, i) => visit(row, `${at}.${key}[${i}]`));
        } else visit(item, `${at}.${key}`);
      }
      return;
    }
    if (typeof value !== 'string') return;
    const tokens = [value, ...Array.from(value.matchAll(/"([^"]+)"|'([^']+)'|[^\s"',;=]+/g), m => m[1] ?? m[2] ?? m[0])];
    for (const token of new Set(tokens)) {
      const name = byReference.get(token);
      if (name) {
        (usages[name] ??= []).push(at);
        if (!usedNames.has(name)) {
          usedNames.add(name); pending.push(...animationRows.filter(row => row.spriteSheet === name));
          // Runtime sidecars are live dependencies; provenance/review metadata is not.
          const dependencies=byName.get(name)?.metadata?.runtimeDependencies;
          if(Array.isArray(dependencies))pending.push({id:`dependencies:${name}`,references:dependencies});
        }
      }
      if (byID.has(token)) pending.push(byID.get(token));
    }
  };
  for (const [key, value] of Object.entries(project)) {
    // `scena` is an editor snapshot, not an additional scene. Its old contents
    // must not keep a replaced background alive after rooms/scenas were updated.
    if (key === 'scena' && rows(project.rooms).some(room => room.name === value?.name)) continue;
    if (!libraryKeys.has(key)) visit(value, key);
  }
  for (const reference of rows(project.spriteReferenceImages).filter(row => !archivedReference(row))) visit(reference, 'spriteReferenceImages');
  while (pending.length) {
    const row = pending.shift();
    if (visited.has(row)) continue;
    visited.add(row);
    visit(row, `animationLibrary.${row.id}`);
  }
  for (const name of Object.keys(usages)) usages[name] = [...new Set(usages[name])].sort();
  return { usedNames, usages, unusedAssets: assets.filter(asset => !usedNames.has(asset.name)) };
}

/** Pure authoring cleanup, applied only to the canonical example after promotions. */
export function pruneUnusedExampleAssets(project) {
  const result = structuredClone(project), { usedNames } = analyzeExampleAssetUsage(project);
  result.assets = rows(result.assets).filter(asset => usedNames.has(asset.name));
  const ids = new Set(result.assets.map(asset => asset.id));
  for (const key of ['animations', 'animationStates']) {
    if (Array.isArray(result[key])) result[key] = result[key].filter(row => usedNames.has(row.spriteSheet));
  }
  for (const group of rows(result.assetGroups)) {
    if (Array.isArray(group.assetIDs)) group.assetIDs = group.assetIDs.filter(id => ids.has(id));
  }
  for (const key of ['rooms', 'scenas']) {
    for (const room of rows(result[key])) {
      if (Array.isArray(room.referenceImages)) room.referenceImages = room.referenceImages.filter(row => !archivedReference(row));
    }
  }
  if (Array.isArray(result.scena?.referenceImages)) result.scena.referenceImages = result.scena.referenceImages.filter(row => !archivedReference(row));
  const selectedRoom = rows(result.rooms).find(room => room.name === result.scena?.name);
  if (selectedRoom) result.scena = structuredClone(selectedRoom);
  if (Array.isArray(result.spriteReferenceImages)) result.spriteReferenceImages = result.spriteReferenceImages.filter(row => !archivedReference(row));
  return result;
}
