const OLD_THEME = "farol_tema_principal";
const INITIAL_SCENES = new Set([
  "logo", "abertura", "titulo", "menu_inicial", "escolha_genero",
  "nome_jogador", "carregar_jogo", "configuracoes", "creditos"
]);
const ENTRY_EVENTS = new Set(["logo_ao_entrar", "abertura_ao_entrar", "titulo_ao_entrar"]);

// Keep the shared track available to gameplay while retiring it from startup.
export function silenceInitialMenuMusic(source) {
  const project = structuredClone(source);
  for (const key of ["rooms", "scenas"]) {
    if (!Array.isArray(project[key])) continue;
    project[key] = project[key].map(scene => INITIAL_SCENES.has(scene.name) && scene.music === OLD_THEME
      ? { ...scene, music: "" } : scene);
  }
  const stopOldTheme = command => typeof command === "string"
    && /^play_music\s+farol_tema_principal(?:\s|$)/.test(command.trim()) ? "stop_music" : command;
  project.events = (project.events ?? []).map(event => {
    if (!INITIAL_SCENES.has(event.roomName) && !ENTRY_EVENTS.has(event.name)) return event;
    const steps = (event.steps ?? []).map(step => ({ ...step, command: stopOldTheme(step.command) }));
    if (ENTRY_EVENTS.has(event.name) && !steps.some(step => step.command === "stop_music" && step.isEnabled !== false)) {
      steps.unshift({ id: `quiet-initial-${event.name}`, command: "stop_music", isEnabled: true });
    }
    return { ...event, command: stopOldTheme(event.command), steps };
  });
  return project;
}

const FEEDBACK_NAMES = ["abrir", "navegar", "confirmar", "voltar", "indisponivel"];
const actionSounds = {
  navigate: "menu-navegar-v1.wav", confirm: "menu-confirmar-v1.wav",
  back: "menu-voltar-v1.wav", unavailable: "menu-indisponivel-v1.wav"
};

export function integrateApprovedInitialMenuAudio(source, manifest) {
  if (manifest?.approval?.approved !== true || manifest?.approval?.auditory !== true) {
    throw new Error("Initial menu audio requires explicit auditory approval.");
  }
  for (const name of FEEDBACK_NAMES) {
    const asset = manifest.assets?.find(asset => asset.name === `menu-${name}-v1.wav`);
    if (!asset?.metadata?.approved || asset.metadata.reviewStatus !== "approved" || !asset.metadata.preparedSha256) {
      throw new Error(`Missing approved menu sound: ${name}`);
    }
    if (!manifest.audioItems?.some(item => item.sourceAssetID === asset.id && item.loops === false)) {
      throw new Error(`Missing non-looping menu audio item: ${name}`);
    }
  }
  const project = silenceInitialMenuMusic(source);
  for (const [key, rows] of [["assets", manifest.assets], ["audioItems", manifest.audioItems]]) {
    const ids = new Set(rows.map(row => row.id));
    project[key] = [...(project[key] ?? []).filter(row => !ids.has(row.id)), ...structuredClone(rows)];
  }
  for (const key of ["rooms", "scenas"]) {
    project[key] = (project[key] ?? []).map(scene => {
      if (!INITIAL_SCENES.has(scene.name) || scene.runtime?.type !== "menu") return scene;
      const config = { ...scene.runtime.config };
      if (scene.name === "titulo") {
        config.screens = (config.screens ?? []).map(screen => screen.id === "title_options"
          ? { ...screen, actionSounds: { ...actionSounds } } : screen);
      } else config.actionSounds = { ...actionSounds };
      return { ...scene, runtime: { ...scene.runtime, config } };
    });
  }
  project.events = project.events.map(event => {
    if (event.name === "titulo_abrir_menu") {
      const replace = command => command === "play_sfx farol_sfx_cursor" ? "play_sfx menu-abrir-v1.wav 65 8" : command;
      return { ...event, command: replace(event.command), steps: event.steps.map(step => ({ ...step, command: replace(step.command) })) };
    }
    if (event.name === "titulo_novo_jogo") {
      return { ...event, steps: event.steps.filter(step => step.command !== "play_sfx farol_sfx_confirmar") };
    }
    return event;
  });
  const references = JSON.stringify({ ...project, audioItems: [] });
  if (!references.includes('"farol_sfx_cursor"')) project.audioItems = project.audioItems.filter(item => item.name !== "farol_sfx_cursor");
  return project;
}

export function preserveApprovedInitialMenuAudio(source, generated) {
  const assets = (source.assets ?? []).filter(asset => asset.id?.startsWith("initial-menu-"));
  if (!assets.length) return generated;
  return integrateApprovedInitialMenuAudio(generated, {
    approval: { approved: assets.every(asset => asset.metadata?.approved === true), auditory: assets.every(asset => asset.metadata?.reviewStatus === "approved") },
    assets,
    audioItems: (source.audioItems ?? []).filter(item => item.id?.startsWith("initial-menu-"))
  });
}
