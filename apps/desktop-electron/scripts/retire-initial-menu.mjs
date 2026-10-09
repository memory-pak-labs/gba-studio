const LEGACY_SCENE = "menu_inicial";
const TITLE_SCENE = "titulo";
const OPTIONS_SCREEN = "title_options";
const NEW_GAME_EVENT = "titulo_novo_jogo";
const OPTIONS = ["new-game", "load-game", "language", "settings", "credits"];
const DECORATIVE_ARROWS = new Set(["title-carousel-arrow-left", "title-carousel-arrow-right"]);

function titleCarouselActors(actors) {
  const menuActors = actors.filter((actor) => actor.roomName === LEGACY_SCENE);
  const options = menuActors.filter((actor) => OPTIONS.includes(actor.menuItemID));
  return options.map((actor) => ({
      ...actor,
      id: `title-carousel-${actor.menuItemID}`,
      roomName: TITLE_SCENE,
      x: 11,
      y: 13,
      menuScreenIDs: [OPTIONS_SCREEN]
    }));
}

function updateTitleScene(scene, legacyMenu) {
  const config = scene.runtime?.config ?? {};
  const screens = Array.isArray(config.screens) ? config.screens : [];
  const titleScreen = screens.find((screen) => screen.id === "title") ?? {};
  const existingOptions = screens.find((screen) => screen.id === OPTIONS_SCREEN);
  const legacyItems = legacyMenu?.runtime?.config?.screens?.[0]?.items ?? [];
  const items = (existingOptions?.items?.length ? existingOptions.items : legacyItems).map((item) => ({
    ...item,
    ...(item.id === "new-game" ? { eventName: NEW_GAME_EVENT } : {}),
    ...(item.id === "language" ? { targetItemID: "language" } : {}),
    clickBox: { x: 80, y: 104, width: 80, height: 32 }
  }));
  const startItems = (titleScreen.items ?? []).map((item) => item.id === "start"
    ? { ...item, action: "push_screen", targetScreenID: OPTIONS_SCREEN }
    : item);
  return {
    ...scene,
    campaign: {
      ...(scene.campaign ?? {}),
      nextScene: "escolha_genero",
      controls: "Start abre as opções; esquerda/direita seleciona; A confirma; B retorna."
    },
    runtime: {
      ...scene.runtime,
      config: {
        ...config,
        role: "title",
        menuProfile: "initial",
        hudMode: "none",
        screens: [
          { ...titleScreen, items: startItems },
          {
            ...(existingOptions ?? {}),
            id: OPTIONS_SCREEN,
            menuProfile: "initial",
            screenType: "menu",
            title: config.title ?? "O Último Farol",
            titleOverlayAssetName: "",
            titleFadeFrames: 0,
            autoAdvanceFrames: 0,
            allowSkip: true,
            nextScreenID: "",
            onEnterEventName: "",
            carousel: true,
            hudMode: "none",
            items
          }
        ]
      }
    }
  };
}

export function retireInitialMenuScene(source) {
  const project = structuredClone(source);
  project.actors = (project.actors ?? []).filter((actor) => !DECORATIVE_ARROWS.has(actor.id)).map((actor) => {
    if (actor.id !== "menu-escolha-genero-confirm" || !actor.eventBindings?.onInteract) return actor;
    const { onInteract: _duplicateSelectionEvent, ...eventBindings } = actor.eventBindings;
    const { eventBindings: _oldBindings, ...unboundActor } = actor;
    return Object.keys(eventBindings).length ? { ...unboundActor, eventBindings } : unboundActor;
  });
  const legacyMenu = project.scenas?.find((scene) => scene.name === LEGACY_SCENE);
  if (!legacyMenu) return project;

  for (const key of ["rooms", "scenas"]) {
    project[key] = (project[key] ?? [])
      .filter((scene) => scene.name !== LEGACY_SCENE)
      .map((scene) => scene.name === TITLE_SCENE ? updateTitleScene(scene, legacyMenu) : scene);
  }

  const existingActors = project.actors ?? [];
  const actorIDs = new Set(existingActors.map((actor) => actor.id));
  project.actors = [
    ...existingActors.filter((actor) => actor.roomName !== LEGACY_SCENE).map((actor) => {
      if (actor.roomName !== TITLE_SCENE) return actor;
      if (actor.id === "title-press-start") return { ...actor, menuScreenIDs: ["title"] };
      if (actor.id === "title-logo-v2") return { ...actor, menuScreenIDs: ["title", OPTIONS_SCREEN] };
      return actor;
    }),
    ...titleCarouselActors(existingActors).filter((actor) => !actorIDs.has(actor.id))
  ];

  project.events = (project.events ?? []).flatMap((event) => {
    if (event.name === "titulo_abrir_menu") {
      const steps = (event.steps ?? []).filter((step) => !step.command?.startsWith("change_scene menu_inicial"));
      if (!steps.some((step) => step.command === `slider ${OPTIONS_SCREEN}`)) {
        steps.push({ id: "event-title-open-slider", command: `slider ${OPTIONS_SCREEN}`, isEnabled: true });
      }
      return [{ ...event, steps, command: steps[0]?.command ?? "noop" }];
    }
    if (event.name === "menu_inicial_novo_jogo") {
      return [{ ...event, id: "event-title-new-game", name: NEW_GAME_EVENT, roomName: TITLE_SCENE }];
    }
    return event.roomName === LEGACY_SCENE ? [] : [event];
  });

  const editor = project.editorState ?? {};
  const connections = (editor.scenaConnections ?? []).flatMap((connection) => {
    if (connection.to === LEGACY_SCENE) return [];
    if (connection.from !== LEGACY_SCENE) return [connection];
    const { eventName: _legacyEventName, ...route } = connection;
    return [{
      ...route,
      from: TITLE_SCENE,
      ...(connection.to === "escolha_genero" ? { eventName: NEW_GAME_EVENT } : {})
    }];
  });
  const positions = { ...(editor.sceneMapPositions ?? {}) };
  if (positions[LEGACY_SCENE]) positions.escolha_genero = positions[LEGACY_SCENE];
  delete positions[LEGACY_SCENE];
  const explorer = editor.sceneExplorer ?? {};
  project.editorState = {
    ...editor,
    scenaConnections: connections,
    sceneMapPositions: positions,
    sceneExplorer: {
      ...explorer,
      order: (explorer.order ?? []).filter((id) => id !== "scene-menu_inicial"),
      groups: (explorer.groups ?? []).map((group) => ({
        ...group,
        sceneIDs: (group.sceneIDs ?? []).filter((id) => id !== "scene-menu_inicial")
      }))
    }
  };
  return project;
}
