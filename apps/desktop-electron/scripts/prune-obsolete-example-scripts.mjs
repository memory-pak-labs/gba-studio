// Only retired example scripts identified in the approved-scene audit are candidates.
const obsoleteEvents = new Set([
  'abertura_sinal', 'circuito_ao_entrar', 'circuito_reiniciar',
  'inventario_detalhar_modulos', 'mapa_menu_detalhar_atual',
  'mapa_menu_detalhar_penedos', 'missoes_detalhar_ativa'
]);
const obsoleteDialogues = new Set([
  'penedos_teste_signpost_fala', 'circuito_derrota', 'missao_rota_ativa',
  'inventario_modulos', 'mapa_menu_atual', 'mapa_menu_penedos'
]);
const obsoleteAudio = new Set(['farol_corrida_final', 'farol_sfx_motor']);

function hasReference(value, name, definition, definitionField) {
  if (value === definition && definitionField === null) return false;
  if (typeof value === 'string') return value.split(/\s+/).includes(name);
  if (Array.isArray(value)) return value.some(item => hasReference(item, name, definition, definitionField));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => {
    if (value === definition && key === definitionField) return false;
    return key === name || hasReference(item, name, definition, definitionField);
  });
}

/** Removes only audited retired definitions which still have no references. */
export function pruneObsoleteExampleScripts(source) {
  const p = structuredClone(source);
  for (const [collection, candidates, field] of [
    ['events', obsoleteEvents, 'name'], ['dialogues', obsoleteDialogues, 'key'],
    ['audioItems', obsoleteAudio, 'name']
  ]) {
    if (!Array.isArray(p[collection])) continue;
    p[collection] = p[collection].filter(definition => !candidates.has(definition[field])
      || hasReference(p, definition[field], definition, collection === 'audioItems' ? null : field)
      || (collection === 'audioItems' && definition.id && hasReference(p, definition.id, definition, null)));
  }
  return p;
}
