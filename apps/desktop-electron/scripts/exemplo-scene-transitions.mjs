// Short native menu branches stay immediate. Story, exploration and challenge
// passages demonstrate the effects supported by the GBA compositor.
const presets = [
  ["logo", "abertura", "cut", 0],
  ["abertura", "titulo", "fade", 30],
  ["titulo", "escolha_genero", "cut", 0],
  ["titulo", "carregar_jogo", "cut", 0],
  ["titulo", "configuracoes", "cut", 0],
  ["titulo", "creditos", "cut", 0],
  ["escolha_genero", "nome_jogador", "wipe", 20],
  ["nome_jogador", "prologo", "fade", 24],
  ["prologo", "porto_lumen", "fade-color", 24],
  ["porto_lumen", "farol_interior", "fade", 20],
  ["farol_interior", "porto_lumen", "fade", 20],
  ["porto_lumen", "mapa_rota", "wipe", 24],
  ["penedos_vento", "armazem_das_mares", "slide", 24],
  ["armazem_das_mares", "observatorio_do_farol", "crossfade", 24],
  ["observatorio_do_farol", "mercado_suspenso", "mosaic", 24],
  ["mercado_suspenso", "usina_submersa", "wipe", 24],
  ["usina_submersa", "usina_combate", "fade", 18],
  ["usina_combate", "usina_saida", "fade", 18],
  ["usina_saida", "conselho_guardia", "fade-color", 30],
  ["conselho_guardia", "tempestade", "fade", 30],
  ["tempestade", "guardiao_rele", "mosaic", 24],
  ["guardiao_rele", "arena_arrancada", "fade-color", 24],
  ["arena_arrancada", "circuito_final", "slide", 24],
  ["circuito_final", "titulo", "fade", 30],
  ["mapa_rota", "porto_lumen", "slide", 24],
  ["mapa_rota", "penedos_vento", "wipe", 24],
  ["mapa_rota", "armazem_das_mares", "crossfade", 24],
  ["mapa_rota", "observatorio_do_farol", "fade", 24],
  ["mapa_rota", "mercado_suspenso", "mosaic", 24],
  ["mapa_rota", "usina_submersa", "fade", 24],
  ["mapa_rota", "conselho_guardia", "fade-color", 24],
  ["mapa_rota", "circuito_final", "slide", 24],
  ["mercado_suspenso", "arena_tatica", "crossfade", 24],
  ["arena_tatica", "mercado_suspenso", "crossfade", 24]
];

export function applyExampleSceneTransitions(project) {
  const lookup = new Map(presets.map(([from, to, style, durationFrames]) => [
    `${from}\0${to}`, { style, durationFrames, fadeOut: true, fadeIn: true }
  ]));
  return {
    ...project,
    editorState: {
      ...project.editorState,
      scenaConnections: (project.editorState?.scenaConnections ?? []).map(connection => {
        const transition = lookup.get(`${connection.from}\0${connection.to}`);
        return transition ? { ...connection, transition: { ...transition } } : connection;
      })
    }
  };
}
