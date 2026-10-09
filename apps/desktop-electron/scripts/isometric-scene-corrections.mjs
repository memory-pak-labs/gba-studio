/** Keeps approved image bytes; clips unreachable screen area in the fixed Arena. */
function containArenaFloor(room) {
  const config = room.runtime?.config;
  if (!config || room.cameraMode !== 'fixed_center') return;
  for (const field of ['collisions', 'collisionTypes']) {
    const original = room[field];
    const cells = Array.isArray(original) ? [...original]
      : original?.encoding === 'rle-v1' ? original.runs.flatMap(([value,count]) => Array(count).fill(value)) : null;
    if (!cells) continue;
    for (let i=0;i<cells.length;i++) {
      const x=i%room.width,y=Math.floor(i/room.width);
      const px=config.originX+(x-y)*config.tileWidth/2;
      const py=config.originY+(x+y)*config.tileHeight/2-(room.heightLevels?.[i] ?? 0)*config.heightStep;
      if (px-config.tileWidth/2<0 || px+config.tileWidth/2>240 || py<0 || py+config.tileHeight>160) cells[i]='solid';
    }
    if (Array.isArray(original)) room[field]=cells;
    else {
      const runs=[];
      for (const value of cells) {
        const last=runs.at(-1);
        if (last?.[0]===value) last[1]++;
        else runs.push([value,1]);
      }
      room[field]={...original,runs};
    }
  }
}

export function correctIsometricScenes(input) {
  const project = structuredClone(input);
  if (!project.rooms?.some(room => room.name === "mercado_suspenso")) return project;
  // The legacy modular correction must not restore old coordinates over the approved paged adventure.
  if (project.rooms.some(room => room.name === "mercado_suspenso" && room.width === 36 && room.backgroundAssetName === "mercado-adventure-surface.png")) return project;
  const marketHud = project.settings?.hudPresets?.find(item => item.id === "hud-mercado-avancada");
  if (marketHud) {
    marketHud.description = "Nome da personagem e comando de interação no Mercado Suspenso.";
    marketHud.components = marketHud.components.map(component => component.id === "hud-mercado-energy" || component.id === "hud-mercado-interact"
      ? { ...component, id: "hud-mercado-interact", kind: "text", label: "Interagir", text: "A INTERAGIR", x: 136, width: 88 }
      : component);
  }
  const arena = project.rooms.find(room => room.name === "arena_tatica");
  const arenaPlayer = project.actors.find(actor => actor.roomName === "arena_tatica" && actor.id === "tactical-nara");
  const arenaEntry = arenaPlayer && arenaPlayer.x >= 0 && arenaPlayer.x < arena?.width && arenaPlayer.y >= 0 && arenaPlayer.y < arena?.height
    ? { x: arenaPlayer.x, y: arenaPlayer.y, direction: arenaPlayer.direction ?? "down" }
    : { x: 4, y: 7, direction: "down" };
  const event = (name, roomName, commands) => ({ id: `iso-v4-${name}`, name, roomName, category: "Cena", detail: "Percurso isométrico e treino tático.", command: "noop",
    steps: commands.map((command, i) => ({ id: `iso-v4-${name}-${i}`, command, isEnabled: true })) });
  const updatedEvents = [
    event("mercado_ao_entrar", "mercado_suspenso", ["play_music farol_falesias", "set_camera_property pan_y 24", "remove_button l", "remove_button r", "if_variable var_market_shortcut 1", "set_actor_position market-guard-v1 18 5", "else", "set_actor_position market-guard-v1 19 6", "condition_end"]),
    event("mercado_abrir_atalho", "mercado_suspenso", ["if_variable var_market_shortcut 0", "set_variable var_market_shortcut 1", "set_actor_position market-guard-v1 18 5", "play_sfx farol_sfx_dialogo", "save_game 0", "show_dialogue mercado_ponte_organizada", "else", "show_dialogue mercado_ponte_ja_organizada", "condition_end"]),
    event("mercado_falar_guarda", "mercado_suspenso", ["attach_button r mercado_entrar_arena true", "show_dialogue mercado_guarda"]),
    event("mercado_entrar_arena", "mercado_suspenso", [`change_scene arena_tatica ${arenaEntry.x} ${arenaEntry.y} ${arenaEntry.direction}`]),
    event("arena_tatica_ao_entrar", "arena_tatica", ["remove_button r", "attach_button l arena_tatica_sair true", "show_dialogue arena_tatica_controles"]),
    event("arena_tatica_sair", "arena_tatica", ["remove_button l", "change_scene mercado_suspenso 18 7 down"])
  ];
  project.events = project.events.filter(item => item.name !== "menu_start_arena_tatica" && !updatedEvents.some(update => update.name === item.name)).concat(updatedEvents);
  const texts = [
    ["mercado_objetivo", "Nara", "Vou registrar a carga no posto da ponte. Assim o guarda libera o acesso à usina.", "I'll register the cargo at the bridge checkpoint so the guard can open the way to the plant.", "Registraré la carga en el puesto del puente para que el guardia abra el acceso a la planta."],
    ["mercado_mercador", "Mercador", "O posto de registro fica na ponte de carga. Confirme a entrega ali; o guarda sairá da passagem norte.", "The cargo checkpoint is on the bridge. Confirm the delivery there; the guard will clear the northern passage.", "El puesto de registro está en el puente de carga. Confirma la entrega allí; el guardia despejará el paso norte."],
    ["mercado_ponte_organizada", "Nara", "Carga registrada! O guarda liberou a passagem. O acesso à usina fica no deck superior.", "Cargo registered! The guard has cleared the passage. The plant entrance is on the upper deck.", "¡Carga registrada! El guardia ha despejado el paso. La entrada a la planta está en la plataforma superior."],
    ["mercado_ponte_ja_organizada", "Mercador", "A entrega já está registrada. Siga pelo deck superior até a passagem da usina.", "The delivery is already registered. Follow the upper deck to the plant entrance.", "La entrega ya está registrada. Sigue la plataforma superior hasta la entrada a la planta."],
    ["mercado_saida_bloqueada", "Nara", "Ainda falta registrar a entrega no posto da ponte de carga.", "I still need to register the delivery at the bridge checkpoint.", "Aún tengo que registrar la entrega en el puesto del puente de carga."],
    ["mercado_guarda", "Guarda", "Registre a carga na ponte para acessar a usina. Para treinar contra a sentinela, feche esta fala e pressione R. Na Arena, L traz você de volta.", "Register the cargo at the bridge to access the plant. To train against the sentinel, close this dialogue and press R. In the Arena, L brings you back.", "Registra la carga en el puente para acceder a la planta. Para entrenar contra el centinela, cierra este diálogo y pulsa R. En la Arena, L te trae de vuelta."],
    ["arena_tatica_controles", "Sentinela", "Selecione Nara com A. No menu, use o direcional e A: Mover, Atacar ou Esperar. Após mover, escolha Atacar. B volta. O inimigo joga sozinho. L volta ao Mercado.", "Select Nara with A. Use the D-pad and A in the menu: Move, Attack or Wait. After moving, choose Attack. B goes back. The enemy plays automatically. L returns to the Market.", "Elige a Nara con A. Usa la cruceta y A en el menu: Mover, Atacar o Esperar. Tras moverte, elige Atacar. B vuelve. El enemigo juega solo. L vuelve al Mercado."]
  ];
  for (const [key, character, pt, en, es] of texts) {
    const old = project.dialogues.find(item => item.key === key);
    const dialogue = { ...old, key, character, text: pt, portrait: old?.portrait ?? "", emote: "", choices: [], choiceTranslations: {}, textSound: "farol_sfx_texto", confirmSound: "farol_sfx_dialogo",
      translations: { "pt-BR": pt, en, es }, translationStatus: { "pt-BR": "draft", en: "draft", es: "draft" } };
    project.dialogues = project.dialogues.filter(item => item.key !== key).concat(dialogue);
  }
  project.actors = project.actors.map(actor => actor.id === "market-guard-v1" ? { ...actor, x: 19, y: 6, z: 2, eventBindings: { ...actor.eventBindings, onInteract: "mercado_falar_guarda" } } : actor);
  project.triggers = project.triggers.map(trigger => trigger.id === "trigger-market-bridge" ? { ...trigger, name: "Registro de carga" } : trigger);
  for (const collection of [project.rooms, project.scenas]) for (const room of collection ?? []) {
    if (room.name === "mercado_suspenso") room.campaign = { ...room.campaign,
      objective: "Registrar a entrega no posto da ponte e liberar o acesso à usina.",
      controls: "Direcional move em oito direções; A interage; B seleciona os alvos próximos. Combine duas setas para seguir as bordas dos losangos nas escadas.",
      success: "Registro confirmado e guarda fora da passagem.", failureRecovery: "O guarda orienta como registrar a carga." };
    if (room.name === "arena_tatica") {
      containArenaFloor(room);
      room.showcase = { ...room.showcase, access: "market-guard" };
      room.supportBriefing = { ...room.supportBriefing, objective: "Treinar contra a sentinela autônoma.", controls: "A abre o menu da unidade; direcional escolhe Mover, Atacar ou Esperar; A confirma; B volta; Select encerra o turno; L volta ao Mercado.", failureRecovery: "Volte ao Mercado com L e fale com o guarda para tentar novamente." };
    }
  }
  project.editorState.scenaConnections = project.editorState.scenaConnections.filter(connection => connection.eventName !== "menu_start_arena_tatica").map(connection => {
    if (connection.eventName === "mercado_entrar_arena") return { ...connection, entry: { x: arenaEntry.x, y: arenaEntry.y, width: 1, height: 1 } };
    if (connection.eventName === "mercado_abrir_usina") return { ...connection, exit: { x: 19, y: 6, width: 1, height: 1 } };
    if (connection.eventName === "arena_tatica_sair") return { ...connection, to: "mercado_suspenso", exit: { x: 0, y: 0, width: 0, height: 0 }, entry: { x: 18, y: 7, width: 1, height: 1 } };
    return connection;
  });
  if (!project.editorState.scenaConnections.some(connection => connection.eventName === "mercado_entrar_arena")) project.editorState.scenaConnections.push({ from: "mercado_suspenso", to: "arena_tatica", eventName: "mercado_entrar_arena", exit: { x: 0, y: 0, width: 0, height: 0 }, entry: { x: arenaEntry.x, y: arenaEntry.y, width: 1, height: 1 } });
  return project;
}
