import { readFileSync } from 'node:fs';

const assetsRoot = new URL('./assets/character-selection/', import.meta.url);
export function promoteApprovedCharacterSelection(input) {
  const project = structuredClone(input);
  const retiredSceneSprites = new Set(['menu-gender-title.png', 'menu-player-name-title.png', 'menu-entry-cursor.png', 'menu-male.png', 'menu-female.png', 'menu-confirm.png', 'menu-entry-back.png']);
  for (const asset of project.assets) if (retiredSceneSprites.has(asset.name))
    asset.metadata = {...asset.metadata, reusableLibraryAsset: true};
  const background = 'gender-selection-approved-v2-gba.png';
  const plan = JSON.parse(readFileSync(new URL('gender-selection-approved-v2.palette.json', assetsRoot), 'utf8'));
  const definitions = [
    ['portrait-male', 'male', 'option', 58, 48],
    ['portrait-female', 'female', 'option', 120, 48],
    ['gold-frame-male', null, 'cursor', 58, 47]
  ];
  const names = new Set(definitions.map(([name]) => `gender-${name}-gba.png`));
  project.actors = project.actors.filter(actor => actor.roomName !== 'escolha_genero');
  for (const [name, item, role, x, y] of definitions) {
    const stem = `gender-${name}-gba`;
    const sheet = `${stem}.png`;
    project.actors.push({ id: stem, name: role === 'cursor' ? 'Moldura de seleção' : stem, roomName: 'escolha_genero', x: Math.floor(x / 8), y: Math.floor(y / 8),
      menuPositionPixels: { x, y }, spriteSheet: sheet, animationName: stem,
      animationStateID: `${stem}-state`, menuActorRole: role,
      ...(role === 'cursor' ? { cursorForMenu: 'escolha_genero', menuCursorFollowsOption: true, menuCursorOffsetPixels: {x: 0, y: -1} }
        : { menuItemID: item, menuCharacterVariant: item }) });
    project.animationStates = project.animationStates.filter(state => state.spriteSheet !== sheet);
    project.animations = project.animations.filter(animation => animation.spriteSheet !== sheet);
    project.animationStates.push({id: `${stem}-state`, name: 'default', spriteSheet: sheet, animationType: 'fixed', mirrorLeftFromRight: false, animationIDs: [`${stem}-animation`]});
    project.animations.push({id: `${stem}-animation`, name: stem, spriteSheet: sheet, frameWidth: 64, frameHeight: 64, fps: 6, loops: true, frameCount: 1, state: 'idle', direction: 'none', colorMode: '4bpp', sourceColorMode: '4bpp', originX: 0, originY: 0, hitboxX: 0, hitboxY: 0, hitboxWidth: 64, hitboxHeight: 64,
      frames: [{id: `${stem}-frame`, frameIndex: 0, sourceFrameIndex: 0, width: 64, height: 64, originX: 0, originY: 0,
        tiles: [{id: `${stem}-tile`, x: 0, y: 0, sliceX: 0, sliceY: 0, sourceSheet: sheet, tileWidth: 64, tileHeight: 64, flipX: false, flipY: false, objPalette: 'OBP0', paletteIndex: 0, priority: false}]}]});
  }
  project.assets = project.assets.filter(asset => !names.has(asset.name) && asset.name !== background && asset.name !== 'gender-gold-frame-female-gba.png');
  project.animations = project.animations.filter(animation => animation.spriteSheet !== 'gender-gold-frame-female-gba.png');
  project.animationStates = project.animationStates.filter(state => state.spriteSheet !== 'gender-gold-frame-female-gba.png');
  project.assets.push({id: 'gender-selection-approved-v2', name: background, kind: 'Background', metadata: {
    source: `Assets/backgrounds/${background}`, width: 240, height: 160, colorMode: '4bpp', backgroundPaletteBankBudget: 16,
    backgroundPaletteReferencePlan: {banks: plan.banks, tile_palette_banks: plan.tile_palette_banks},
    backgroundTileOptimizer: {enabled: true, tileBudget: 600, maxSourcePixelErrorRatio: 0, maxFramebufferMismatchRatio: 0},
    generatedBy: 'approved-character-selection-v2', reviewStatus: 'approved', provenance: 'Composição aprovada pelo usuário; textos estáticos no BG; assetc 4bpp por tile e banco.'}});
  for (const [name] of definitions) {
    const sheet = `gender-${name}-gba.png`;
    project.assets.push({id: `asset-${sheet}`, name: sheet, kind: 'Sprite', metadata: { source: `Assets/sprites/${sheet}`, frameWidth: 64, frameHeight: 64, frameCount: 1, colorMode: '4bpp', sourceContract: 'gba-native', visibleColors: 15, transparentIndex: 0, generatedBy: 'approved-character-selection-v2', reviewStatus: 'approved' }});
  }
  for (const scenes of [project.scenas, project.rooms]) {
    for (const scene of scenes ?? []) {
      if (scene.name !== 'escolha_genero') continue;
      if (!(scene.referenceImages ?? []).some(reference => reference.assetName === 'gender-selection-gba.png'))
        scene.referenceImages = [...(scene.referenceImages ?? []), {id: 'gender-background-history', assetName: 'gender-selection-gba.png', title: 'Background anterior preservado', visible: false}];
      scene.backgroundAssetName = background;
      scene.playerActorName = 'Moldura de seleção';
      const config = scene.runtime.config;
      config.title = 'SEU PERSONAGEM';
      config.items = config.items.filter(item => item.id === 'male' || item.id === 'female').map((item, index) => ({...item, clickBox: {x: index === 0 ? 64 : 128, y: 49, width: index === 0 ? 52 : 48, height: 60}}));
      config.hudMode = 'none';
      if (scene.campaign && Object.keys(scene.campaign).length === 1 && 'controls' in scene.campaign) delete scene.campaign;
    }
  }
  for (const event of project.events) {
    if (!['escolha_genero_homem', 'escolha_genero_mulher'].includes(event.name)) continue;
    event.steps = event.steps.filter(step => !step.command.startsWith('change_scene '));
    event.steps.push({id: `${event.id}-confirm-name`, command: 'change_scene nome_jogador 21 17 right', isEnabled: true});
  }
  const nameBackground = 'name-input-approved-v2-gba.png';
  const namePlan = JSON.parse(readFileSync(new URL('name-input-approved-v2.palette.json', assetsRoot), 'utf8'));
  project.assets = project.assets.filter(asset => asset.name !== nameBackground && !['name-portrait-male-gba.png', 'name-portrait-female-gba.png'].includes(asset.name));
  project.assets.push({id: 'name-input-approved-v2', name: nameBackground, kind: 'Background', metadata: {
    source: `Assets/backgrounds/${nameBackground}`, width: 240, height: 160, colorMode: '4bpp', backgroundPaletteBankBudget: 14,
    backgroundPaletteReferencePlan: {banks: namePlan.banks, tile_palette_banks: namePlan.tile_palette_banks},
    backgroundTileOptimizer: {enabled: true, tileBudget: 600, maxSourcePixelErrorRatio: 0, maxFramebufferMismatchRatio: 0},
    generatedBy: 'approved-character-selection-v2', reviewStatus: 'approved', provenance: 'Composição aprovada 4x8; BG contém placas e teclas; BG0 e OBJ desenham o conteúdo variável.'}});
  project.actors = project.actors.filter(actor => actor.roomName !== 'nome_jogador');
  for (const [index, variant] of ['male', 'female'].entries()) {
    const stem = `name-portrait-${variant}-gba`, sheet = `${stem}.png`;
    project.actors.push({id: stem, name: stem, roomName: 'nome_jogador', x: 6, y: 4, menuPositionPixels: {x: 52, y: 36}, spriteSheet: sheet,
      animationName: stem, animationStateID: `${stem}-state`, menuActorRole: 'decorative', menuVisibilityVariable: 'var_character_gender', menuVisibilityValue: index});
    project.assets.push({id: `asset-${stem}`, name: sheet, kind: 'Sprite', metadata: {source: `Assets/sprites/${sheet}`, frameWidth: 32, frameHeight: 32, frameCount: 1, colorMode: '4bpp', visibleColors: 15, transparentIndex: 0, generatedBy: 'approved-character-selection-v2', reviewStatus: 'approved'}});
    project.animationStates = project.animationStates.filter(state => state.spriteSheet !== sheet);
    project.animations = project.animations.filter(animation => animation.spriteSheet !== sheet);
    project.animationStates.push({id: `${stem}-state`, name: 'default', spriteSheet: sheet, animationType: 'fixed', mirrorLeftFromRight: false, animationIDs: [`${stem}-animation`]});
    project.animations.push({id: `${stem}-animation`, name: stem, spriteSheet: sheet, frameWidth: 32, frameHeight: 32, fps: 6, loops: true, frameCount: 1, state: 'idle', direction: 'none', colorMode: '4bpp', sourceColorMode: '4bpp', originX: 0, originY: 0,
      frames: [{id: `${stem}-frame`, frameIndex: 0, sourceFrameIndex: 0, width: 32, height: 32, originX: 0, originY: 0,
        tiles: [{id: `${stem}-tile`, x: 0, y: 0, sliceX: 0, sliceY: 0, sourceSheet: sheet, tileWidth: 32, tileHeight: 32, flipX: false, flipY: false, objPalette: 'OBP0', paletteIndex: 0, priority: false}]}]});
  }
  for (const scenes of [project.scenas, project.rooms]) for (const scene of scenes ?? []) {
    if (scene.name !== 'nome_jogador') continue;
    if (!(scene.referenceImages ?? []).some(reference => reference.assetName === 'name-input-bg-gba.png'))
      scene.referenceImages = [...(scene.referenceImages ?? []), {id: 'name-background-history', assetName: 'name-input-bg-gba.png', title: 'Background anterior preservado', visible: false}];
    scene.backgroundAssetName = nameBackground;
    scene.paletteBankPolicy = 'ui-reserved';
    const config = scene.runtime.config;
    config.textInput = {...config.textInput, x: 13, y: 6, width: 8, maxLength: 8,
      keyboard: {layout: 'grid', controlLayout: 'bottom_grid', surface: 'background', x: 7, y: 8, width: 16, height: 10, allowLowercase: true}};
    config.items = config.items.map(item => ({...item, clickBox: item.id === 'name' ? {x: 88, y: 40, width: 96, height: 24} : {x: 152, y: 128, width: 40, height: 16}}));
  }
  const nameEnter = project.events.find(event => event.name === 'nome_jogador_ao_entrar');
  if (nameEnter && !nameEnter.steps.some(step => step.command.startsWith('open_text_input ')))
    nameEnter.steps.push({id: 'name-approved-keyboard-open', command: 'open_text_input var_character_name 8 0', isEnabled: true});
  return project;
}
