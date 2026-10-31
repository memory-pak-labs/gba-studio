// Authored English source for the Portuguese source-text entries in the example.
// Preserve dialogue keys and story/choice order; correct diary directions/item naming below.
const english = {
  prologo_frame_1: 'The coastal lighthouses go dark one by one. The last beam still cuts across the pier.',
  prologo_frame_2: 'The air route disappears into the storm. Nara finds the airship before night closes in on the port.',
  prologo_frame_3: 'If the lighthouse cannot guide the way, I will light it again.',
  porto_objetivo: 'The airship frame is on the eastern dock.',
  farol_interior_objetivo: 'The lens still responds, but the mechanism needs maintenance. I will speak to the keeper.',
  farol_guardiao: 'The tide brought salt into the fittings. Examine the lens, then return to the dock; the signal needs a clear route.',
  farol_lente: 'The lens is intact. The lighthouse can guide Lumen Port again.',
  usina_objetivo: 'Water has flooded the core. I will follow the central corridor and find the sentinel door.',
  usina_combate_objetivo: 'The sentinel sealed the core. I must defeat it to open the energy compartment.',
  usina_sentinela: 'The core is protected. The passage only responds after the energy cell is removed.',
  usina_celula_recuperada: 'Cell recovered. The antechamber door is powered; now I can return through the corridor.',
  usina_celula_ja_recuperada: 'The cell is already aboard the airship. The antechamber remains open.',
  usina_saida_bloqueada: 'The door does not respond. The core still needs the energy cell.',
  usina_saida_objetivo: 'The corridor is clear. I will recover the cell and reach the Guardian antechamber.',
  arena_derrota: 'The track leaves no room for hesitation. Try again.',
  creditos_projeto: 'Example GBA: a study campaign demonstrating scenes, menus, actors, backgrounds and events on Game Boy Advance hardware.',
  creditos_engine: 'GBA Studio Engine: the project runtime and exporter, with its own architecture built around GBA capabilities.',
  epilogo: 'The lighthouses shine again, and the Lumen route remains open.',
  armazem_das_mares_carta: 'The chart still marks the lighthouse route.',
  armazem_das_mares_bau: 'The chest holds a sealed mechanism.',
  observatorio_do_farol_telescopio: 'The telescope can still find the last lighthouse.',
  observatorio_do_farol_mapa: 'The table brings together the route and the tide.',
  'ingame-next-0': 'The lighthouse beam is restored. The campaign is complete.',
  'ingame-next-1': 'Race the Final Circuit and complete all three laps.',
  'ingame-next-2': 'Win the Starting Arena to earn the booster.',
  'ingame-next-3': 'Defeat the Relay Guardian to unlock the arena.',
  'ingame-next-4': 'Cross the Storm to obtain the armor.',
  'ingame-next-5': 'Take the cell to the Council and confirm the pact.',
  'ingame-next-6': 'Find the cell at the Submerged Plant exit.',
  'ingame-next-7': 'Cross the Submerged Plant and defeat the sentinel.',
  'ingame-next-8': 'Go to the Hanging Market and find the shortcut.',
  'ingame-next-9': 'Examine the Lighthouse Observatory.',
  'ingame-next-10': 'Explore the Tidal Warehouse and read the chart.',
  'ingame-next-11': 'Use the travel map to reach the Wind Cliffs.',
  'ingame-next-start': 'Speak to the mechanic on the eastern dock in Lumen Port to obtain the airship frame.',
  'ingame-mission-frame': 'Speak to the mechanic on the eastern dock in Lumen Port. OK means the airship frame has been obtained.',
  'ingame-mission-cell': 'Defeat the sentinel and find the cell at the Plant exit.',
  'ingame-mission-bond': 'Confirm the pact at the Guardian Council.',
  'ingame-mission-final': 'Complete the Final Circuit to restore the light.',
  'ingame-item-frame': 'Airship frame obtained in Lumen Port. OK: obtained. NO: not yet obtained.',
  'ingame-item-grip': 'Module obtained at the Wind Cliffs. OK: obtained. NO: not yet obtained.',
  'ingame-item-cell': 'Cell collected at the Submerged Plant exit. OK: obtained. NO: not yet obtained.',
  'ingame-item-shield': 'Module obtained by crossing the Storm. OK: obtained. NO: not yet obtained.',
  'ingame-item-boost': 'Module obtained by winning the Starting Arena. OK: obtained. NO: not yet obtained.',
  'ingame-map-porto': 'The journey begins here. Speak to the mechanic on the eastern dock to obtain the airship frame. This map is for reference only.',
  'ingame-map-penedos': 'Travel here from the route map. Complete the platforming course. This map is for reference only.',
  'ingame-map-armazem': 'After the Cliffs, read the chart to continue to the Observatory. This map is for reference only.',
  'ingame-map-observatorio': 'Read the lighthouse record before heading to the Market. This map is for reference only.',
  'ingame-map-mercado': 'Cross the Market and find the Plant entrance. This map is for reference only.',
  'ingame-map-usina': 'Explore, defeat the sentinel and collect the energy cell. This map is for reference only.',
  'ingame-map-conselho': 'Confirm the pact. Next: Storm, Relay, Arena and Final Circuit. This map is for reference only.',
  'ingame-map-circuito': 'Complete three laps. Check Missions for your next objective. This map is for reference only.',
  'ingame-controls': 'D-pad: move and select. A: confirm or interact. B: back. Start: pause. Dungeon: R pauses, Start opens the map, Select opens the bag. Racing: A accelerates, B brakes; D-pad steers.',
  penedos_teste_npc_fala: 'A jumps; press A in the air to jump again. B dashes, R glides and UP climbs ladders. Use L to attack and A near the beacon to save.',
  penedos_teste_checkpoint_fala: 'Beacon lit. Progress saved! You return here after falling or touching an enemy.'
};

const spanish = {
  prologo_frame_1: 'Los faros de la costa se apagan uno a uno. El último haz de luz aún cruza el muelle.',
  prologo_frame_2: 'La ruta aérea desaparece entre la tormenta. Nara encuentra la aeronave antes de que la noche cierre el puerto.',
  prologo_frame_3: 'Si el faro no puede guiar el camino, volveré a encenderlo.',
  porto_objetivo: 'La estructura de la aeronave está en el muelle este.',
  farol_interior_objetivo: 'La lente aún responde, pero el mecanismo necesita mantenimiento. Hablaré con el guardián.',
  farol_guardiao: 'La marea dejó sal en los encajes. Examina la lente y vuelve al muelle; la señal necesita una ruta despejada.',
  farol_lente: 'La lente está intacta. El faro puede volver a guiar el Puerto de Lumen.',
  usina_objetivo: 'El agua ha inundado el núcleo. Seguiré el corredor central hasta la puerta de la centinela.',
  usina_combate_objetivo: 'La centinela selló el núcleo. Debo derrotarla para abrir el compartimento de energía.',
  usina_sentinela: 'El núcleo está protegido. El paso solo responde después de retirar la célula de energía.',
  usina_celula_recuperada: 'Célula recuperada. La puerta de la antecámara tiene energía; ya puedo volver por el corredor.',
  usina_celula_ja_recuperada: 'La célula ya está en la aeronave. La antecámara permanece abierta.',
  usina_saida_bloqueada: 'La puerta no responde. El núcleo aún necesita la célula de energía.',
  usina_saida_objetivo: 'El corredor está despejado. Recuperaré la célula y llegaré a la antecámara de la Guardiana.',
  arena_derrota: 'La pista no perdona las dudas. Inténtalo de nuevo.',
  creditos_projeto: 'Ejemplo GBA: una campaña de estudio para demostrar escenas, menús, actores, fondos y eventos en Game Boy Advance.',
  creditos_engine: 'GBA Studio Engine: el motor y exportador del proyecto, con arquitectura propia orientada a las capacidades del GBA.',
  epilogo: 'Los faros vuelven a brillar y la ruta de Lumen permanece abierta.',
  armazem_das_mares_carta: 'La carta aún marca la ruta del faro.',
  armazem_das_mares_bau: 'El cofre guarda un mecanismo sellado.',
  observatorio_do_farol_telescopio: 'El telescopio aún encuentra el último faro.',
  observatorio_do_farol_mapa: 'La mesa reúne la ruta y la marea.',
  'ingame-next-start': 'Habla con la mecánica del muelle este del Puerto de Lumen para obtener la estructura de la aeronave.',
  'ingame-mission-frame': 'Habla con la mecánica del muelle este del Puerto de Lumen. OK indica que ya tienes la estructura de la aeronave.',
  'ingame-item-frame': 'Estructura de la aeronave obtenida en el Puerto de Lumen. OK: obtenida. NO: aún falta.',
  'ingame-map-porto': 'La aventura empieza aquí. Habla con la mecánica del muelle este para obtener la estructura de la aeronave. Este mapa es solo de consulta.'
};

export const reviewedPortuguese = {
  'ingame-next-start': 'Converse com a mecânica no cais leste de Porto de Lúmen para obter a estrutura da aeronave.',
  'ingame-mission-frame': 'Converse com a mecânica no cais leste de Porto de Lúmen. OK indica que a estrutura da aeronave foi obtida.',
  'ingame-item-frame': 'Estrutura da aeronave obtida em Porto de Lúmen. OK: obtida. NÃO: ainda não obtida.',
  'ingame-map-porto': 'Início da jornada. Fale com a mecânica no cais leste para obter a estrutura da aeronave. Este mapa serve apenas para consulta.'
};

/** Pure/idempotent final content pass; new AI translations await human approval. */
export function reviewExemploLocalization(data) {
  const result = structuredClone(data);
  for (const dialogue of result.dialogues ?? []) {
    const before = dialogue.translations ?? {};
    const text = english[dialogue.key] ?? before.en ?? dialogue.text;
    const es = spanish[dialogue.key] ?? before.es;
    const pt = reviewedPortuguese[dialogue.key] ?? before['pt-BR'];
    if (typeof text !== 'string' || typeof pt !== 'string' || typeof es !== 'string') {
      throw new Error(`Incomplete canonical localization: ${dialogue.key}`);
    }
    dialogue.translationStatus = { ...dialogue.translationStatus };
    if (before.en !== text) dialogue.translationStatus.en = 'draft-ai';
    if (before.es !== es) dialogue.translationStatus.es = 'draft-ai';
    if (before['pt-BR'] !== pt) dialogue.translationStatus['pt-BR'] = 'draft-ai';
    dialogue.text = text;
    dialogue.translations = { ...before, en: text, 'pt-BR': pt, es };
    const choices = dialogue.choices ?? [];
    dialogue.choiceTranslations = { ...dialogue.choiceTranslations,
      en: [...choices], 'pt-BR': [...(dialogue.choiceTranslations?.['pt-BR'] ?? [])],
      es: [...(dialogue.choiceTranslations?.es ?? [])] };
  }
  return result;
}
