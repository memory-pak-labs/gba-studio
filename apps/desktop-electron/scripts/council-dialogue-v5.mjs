import approvedBackgrounds from "../fixtures/asset-provenance/runtime-metadata.json" with { type: "json" };

/** Builds a review copy. Callers must not promote unapproved visual assets. */
export function prepareCouncilDialogueV5(source) {
  const project = structuredClone(source);
  const room = project.rooms.find(room => room.name === 'conselho_guardia');
  const enter = project.events.find(event => event.name === room?.eventBindings.onInit);
  const guardian = project.dialogues.find(dialogue => dialogue.key === 'conselho');
  if (!room || !enter || !guardian) throw new Error('Council scene, entry event and pact dialogue are required.');
  room.playerActorName = '';
  project.actors = project.actors.filter(actor => actor.roomName !== room.name);
  // Visual Novel consumes the entry speech before its pending dialogue/choice.
  // Multiple show_dialogue commands in one script would overwrite last_dialogue.
  enter.steps = enter.steps.filter(step => step.command !== 'show_dialogue conselho_nara');
  enter.steps.push({ id: 'council-v5-enter-nara', command: 'show_dialogue conselho_nara', isEnabled: true });
  const nara = {
    key: 'conselho_nara', character: 'Nara', portrait: 'council-v5-nara.png', portraitSlot: 'left',
    text: 'We restored the coastal signals. How do we cross the storm?',
    translations: {
      'pt-BR': 'Restauramos os sinais da costa. Como atravessamos a tempestade?',
      es: 'Restauramos las señales de la costa. ¿Cómo cruzamos la tormenta?'
    },
    translationStatus: { 'pt-BR': 'draft-ai', es: 'draft-ai' },
    choices: [], choiceTranslations: {}, emote: '',
    textSound: guardian.textSound, confirmSound: guardian.confirmSound
  };
  project.dialogues = project.dialogues.filter(dialogue => dialogue.key !== nara.key);
  project.dialogues.push(nara);
  guardian.portrait = 'council-v5-guardian.png';
  guardian.portraitSlot = 'right';
  guardian.text = 'The route demands courage and precision. Do you accept the pact?';
  guardian.choices = ['Accept the alliance'];
  guardian.translations = {
    ...guardian.translations,
    'pt-BR': 'A rota exige coragem e precisão. Você aceita o pacto?',
    es: 'La ruta exige valor y precisión. ¿Aceptas el pacto?'
  };
  guardian.choiceTranslations = { ...guardian.choiceTranslations, 'pt-BR': ['Aceitar a aliança'], es: ['Aceptar la alianza'] };
  guardian.translationStatus = { ...guardian.translationStatus, es: 'draft-ai' };
  room.backgroundAssetName = 'council-v5-background.png';
  // The saved document exposes both the scene list and the active scene.
  for (const scene of [...(project.scenas ?? []), project.scena].filter(Boolean)) {
    if (scene.id === room.id) {
      scene.playerActorName = '';
      scene.backgroundAssetName = room.backgroundAssetName;
    }
  }
  for (const [id, name, kind, width, height] of [
    ['council-v5-background', 'council-v5-background.png', 'Background', 240, 160],
    ['council-v5-nara', 'council-v5-nara.png', 'Sprite', 48, 48],
    ['council-v5-guardian', 'council-v5-guardian.png', 'Sprite', 48, 48]
  ]) {
    project.assets = project.assets.filter(asset => asset.id !== id);
    project.assets.push({ id, name, kind, systemImage: kind === 'Background' ? 'building.columns' : 'person.crop.square', metadata: {
      source: `Assets/${kind === 'Background' ? 'backgrounds' : 'sprites'}/${name}`,
      generatedBy: 'council-dialogue-v5-candidate', reviewStatus: 'candidate',
      ...(kind === 'Background' ? { role: 'council-bg', sceneRoles: ['council-bg'] } : {}),
      ...(name === 'council-v5-guardian.png' ? { role: 'guardian-portrait', sceneRoles: ['guardian-portrait'] } : {}),
      provenance: 'ImageGen candidate; source-preserving nearest review, without runtime palette reduction.',
      width, height, ...(kind === 'Sprite' ? { frameWidth: width, frameHeight: height, frameCount: 1, anchor: 'top-left' } : {})
    } });
    if (kind === 'Sprite') {
      // Export derives the OBJ frame from animation data, not asset metadata.
      const animationId = `${id}-portrait`;
      project.animations = (project.animations ?? []).filter(animation => animation.id !== animationId);
      project.animations.push({
        id: animationId, name: animationId, spriteSheet: name,
        frameWidth: width, frameHeight: height, frameCount: 1,
        fps: 1, loops: false, state: 'idle', direction: 'none',
        colorMode: '4bpp', originX: 0, originY: 0
      });
    }
  }
  return project;
}

const approvedAssets = new Map([
  ['council-v5-background.png', '9153d9ecd43ee946729503fd42876f21b150f60d448d43305707b85bdedbec32'],
  ['council-v5-nara.png', 'd8a7c4af1b7592626171b2f75ca1216462f30d3ac1928b6b3fcc008e801431f2'],
  ['council-v5-guardian.png', '954aba18daad06c383f9c8b3d51003367c0d41835dc99f281b08df8e37231d5c']
]);

export function promoteApprovedCouncilDialogueV5(source) {
  const project = prepareCouncilDialogueV5(source);
  for (const asset of project.assets) {
    const sha256 = approvedAssets.get(asset.name);
    if (!sha256) continue;
    asset.metadata = {
      ...asset.metadata,
      reviewStatus: 'approved',
      preparedSha256: sha256,
      provenance: 'Approved Council V5 scene; ImageGen source and nearest-neighbor review documented in conselho-v5-candidate/SOURCES.md.',
      ...approvedBackgrounds[asset.name]
    };
  }
  return project;
}
