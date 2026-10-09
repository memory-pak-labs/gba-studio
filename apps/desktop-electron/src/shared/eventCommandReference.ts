/*! GB Studio reference vocabulary, https://github.com/chrismaltby/gb-studio/tree/v4.3.2
MIT License

Copyright (c) 2019-2026 Chris Maltby

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
/** Reviewed authoring correspondence with GB Studio 4.3.2 (MIT, Chris Maltby).
 * Source: https://github.com/chrismaltby/gb-studio/tree/v4.3.2/src/lib/events
 * Reference identity describes the authoring concept, not ROM or argument compatibility.
 * Local IDs and command templates remain in eventCommandLibrary.ts.
 */
export interface EventAuthoringCategory { category: string; section: string | null; }
export interface EventCommandReference { id: string; version: "4.3.2"; path: string; fieldKeys: string[]; }
export interface EventCommandAuthoring {
  title: string;
  category: string;
  section: string | null;
  groups: EventAuthoringCategory[];
  aliases: string[];
  reference: EventCommandReference | null;
  adaptation: string | null;
}
export const eventCommandAuthoring: Readonly<Record<string, EventCommandAuthoring>> = {
  "scene.set_background": {
    "title": "Trocar fundo da cutscene",
    "category": "Cena",
    "section": "Fundo",
    "groups": [
      {
        "category": "Cena",
        "section": "Fundo"
      }
    ],
    "aliases": [
      "Trocar fundo da cutscene"
    ],
    "reference": null,
    "adaptation": null
  },
  "dialogue.show": {
    "title": "Exibir diálogo",
    "category": "Diálogo e menus",
    "section": null,
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": null
      }
    ],
    "aliases": [
      "Exibir dialogo",
      "Display Dialogue"
    ],
    "reference": {
      "id": "EVENT_TEXT",
      "version": "4.3.2",
      "path": "src/lib/events/eventTextDialogue.js",
      "fieldKeys": [
        "text",
        "avatarId",
        "minHeight",
        "maxHeight",
        "textX",
        "textY",
        "textHeight",
        "position",
        "clearPrevious",
        "showFrame",
        "speedIn",
        "speedOut",
        "closeWhen",
        "closeButton",
        "closeDelayTime",
        "closeDelayUnits",
        "closeDelayFrames"
      ]
    },
    "adaptation": null
  },
  "scene.change": {
    "title": "Trocar cena",
    "category": "Cena",
    "section": null,
    "groups": [
      {
        "category": "Cena",
        "section": null
      }
    ],
    "aliases": [
      "Trocar cena",
      "Change Scene"
    ],
    "reference": {
      "id": "EVENT_SWITCH_SCENE",
      "version": "4.3.2",
      "path": "src/lib/events/eventSceneSwitch.js",
      "fieldKeys": [
        "sceneId",
        "x",
        "y",
        "direction",
        "fadeSpeed"
      ]
    },
    "adaptation": null
  },
  "scene.advance_campaign": {
    "title": "Avançar campanha",
    "category": "Cena",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Cena",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Avançar campanha"
    ],
    "reference": null,
    "adaptation": null
  },
  "actor.projectile_load_slot": {
    "title": "Carregar projétil para espaço",
    "category": "Ator",
    "section": "Ações",
    "groups": [
      {
        "category": "Ator",
        "section": "Ações"
      }
    ],
    "aliases": [
      "Carregar projetil para espaco",
      "Load Projectile Into Slot"
    ],
    "reference": {
      "id": "EVENT_LOAD_PROJECTILE_SLOT",
      "version": "4.3.2",
      "path": "src/lib/events/eventLoadProjectile.js",
      "fieldKeys": [
        "slot",
        "spriteSheetId",
        "spriteStateId",
        "speed",
        "animSpeed",
        "lifeTime",
        "initialOffset",
        "loopAnim",
        "destroyOnHit",
        "collisionGroup",
        "collisionMask"
      ]
    },
    "adaptation": null
  },
  "actor.show_gesture": {
    "title": "Exibir balão de gesto",
    "category": "Ator",
    "section": "Ações",
    "groups": [
      {
        "category": "Ator",
        "section": "Ações"
      }
    ],
    "aliases": [
      "Exibir balao de gesto",
      "Show Emote Bubble"
    ],
    "reference": {
      "id": "EVENT_ACTOR_EMOTE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorEmote.js",
      "fieldKeys": [
        "actorId",
        "emoteId"
      ]
    },
    "adaptation": null
  },
  "actor.launch_projectile": {
    "title": "Lançar projétil",
    "category": "Ator",
    "section": "Ações",
    "groups": [
      {
        "category": "Ator",
        "section": "Ações"
      }
    ],
    "aliases": [
      "Lancar projetil",
      "Launch Projectile"
    ],
    "reference": {
      "id": "EVENT_LAUNCH_PROJECTILE",
      "version": "4.3.2",
      "path": "src/lib/events/eventLaunchProjectile.js",
      "fieldKeys": [
        "spriteSheetId",
        "spriteStateId",
        "actorId",
        "x",
        "y",
        "directionType",
        "otherActorId",
        "direction",
        "angle",
        "angleVariable",
        "targetActorId",
        "speed",
        "animSpeed",
        "lifeTime",
        "initialOffset",
        "loopAnim",
        "destroyOnHit",
        "collisionGroup",
        "collisionMask"
      ]
    },
    "adaptation": null
  },
  "actor.launch_projectile_slot": {
    "title": "Lançar projétil de espaço",
    "category": "Ator",
    "section": "Ações",
    "groups": [
      {
        "category": "Ator",
        "section": "Ações"
      }
    ],
    "aliases": [
      "Lancar projetil de espaco",
      "Launch Projectile In Slot"
    ],
    "reference": {
      "id": "EVENT_LAUNCH_PROJECTILE_SLOT",
      "version": "4.3.2",
      "path": "src/lib/events/eventLaunchProjectileSlot.js",
      "fieldKeys": [
        "actorId",
        "x",
        "y",
        "directionType",
        "otherActorId",
        "direction",
        "angle",
        "angleVariable",
        "targetActorId",
        "slot"
      ]
    },
    "adaptation": null
  },
  "actor.if_distance": {
    "title": "Se a distância entre o ator e o ator",
    "category": "Ator",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Ator"
      },
      {
        "category": "Ator",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Se a distancia entre o ator e o ator",
      "If Actor Distance From Actor"
    ],
    "reference": {
      "id": "EVENT_IF_ACTOR_DISTANCE_FROM_ACTOR",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfActorDistanceFromActor.js",
      "fieldKeys": [
        "actorId",
        "operator",
        "distance",
        "otherActorId",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "actor.if_relative": {
    "title": "Se o ator é relativo ao ator",
    "category": "Ator",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Ator"
      },
      {
        "category": "Ator",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Se o ator e relativo ao ator",
      "If Actor Relative To Actor"
    ],
    "reference": {
      "id": "EVENT_IF_ACTOR_RELATIVE_TO_ACTOR",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfActorRelativeToActor.js",
      "fieldKeys": [
        "actorId",
        "operation",
        "otherActorId",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "actor.if_direction": {
    "title": "Se o ator está na direção",
    "category": "Ator",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Ator"
      },
      {
        "category": "Ator",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Se o ator esta na direcao",
      "If Actor Facing Direction"
    ],
    "reference": {
      "id": "EVENT_IF_ACTOR_DIRECTION",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfActorDirection.js",
      "fieldKeys": [
        "actorId",
        "direction",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "actor.if_position": {
    "title": "Se o ator estiver na posição",
    "category": "Ator",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Ator"
      },
      {
        "category": "Ator",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Se o ator estiver na posicao",
      "If Actor At Position"
    ],
    "reference": {
      "id": "EVENT_IF_ACTOR_AT_POSITION",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfActorAtPosition.js",
      "fieldKeys": [
        "actorId",
        "x",
        "y",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "actor.cancel_movement": {
    "title": "Cancelar movimento do ator",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Cancelar movimento do ator",
      "Actor Move Cancel"
    ],
    "reference": {
      "id": "EVENT_ACTOR_MOVE_CANCEL",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorMoveCancel.js",
      "fieldKeys": [
        "actorId"
      ]
    },
    "adaptation": null
  },
  "actor.set_position": {
    "title": "Definir posição do ator",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Definir posicao do ator",
      "Set Actor Position"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_POSITION",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetPosition.js",
      "fieldKeys": [
        "actorId",
        "x",
        "y"
      ]
    },
    "adaptation": null
  },
  "actor.set_relative_position": {
    "title": "Definir posição relativa do ator",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Definir posicao relativa do ator",
      "Set Actor Relative Position"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_POSITION_RELATIVE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetPositionRelative.js",
      "fieldKeys": [
        "actorId",
        "x",
        "y"
      ]
    },
    "adaptation": null
  },
  "actor.push_away_player": {
    "title": "Empurrar ator para longe do jogador",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Empurrar ator para longe do jogador",
      "Push Actor Away From Player"
    ],
    "reference": {
      "id": "EVENT_ACTOR_PUSH",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorPush.js",
      "fieldKeys": [
        "continue"
      ]
    },
    "adaptation": null
  },
  "actor.move_to": {
    "title": "Mover ator para",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Mover ator para",
      "Actor Move To"
    ],
    "reference": {
      "id": "EVENT_ACTOR_MOVE_TO",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorMoveTo.js",
      "fieldKeys": [
        "actorId",
        "x",
        "y",
        "collideWith",
        "lockDirection",
        "moveType"
      ]
    },
    "adaptation": null
  },
  "actor.move_relative": {
    "title": "Mover ator relativo",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Mover ator relativo",
      "Actor Move Relative"
    ],
    "reference": {
      "id": "EVENT_ACTOR_MOVE_RELATIVE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorMoveRelative.js",
      "fieldKeys": [
        "actorId",
        "x",
        "y",
        "collideWith",
        "lockDirection",
        "moveType"
      ]
    },
    "adaptation": null
  },
  "actor.player_bounce": {
    "title": "Ricochete do jogador",
    "category": "Ator",
    "section": "Plataforma",
    "groups": [
      {
        "category": "Ator",
        "section": "Plataforma"
      }
    ],
    "aliases": [
      "Ricochete do jogador",
      "Player Bounce"
    ],
    "reference": {
      "id": "EVENT_PLAYER_BOUNCE",
      "version": "4.3.2",
      "path": "src/lib/events/eventPlatformerBounce.js",
      "fieldKeys": [
        "height"
      ]
    },
    "adaptation": null
  },
  "actor.active": {
    "title": "Ativar ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Ativar ator",
      "Activate Actor"
    ],
    "reference": {
      "id": "EVENT_ACTOR_ACTIVATE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorActivate.js",
      "fieldKeys": [
        "actorId"
      ]
    },
    "adaptation": null
  },
  "actor.collision_box": {
    "title": "Definir caixa de colisão do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir caixa de colisao do ator",
      "Set Actor Collision Bounding Box"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_COLLISION_BOX",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetCollisionBox.js",
      "fieldKeys": [
        "actorId",
        "x",
        "y",
        "width",
        "height"
      ]
    },
    "adaptation": null
  },
  "actor.set_direction": {
    "title": "Definir direção do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir direcao do ator",
      "Set Actor Direction"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_DIRECTION",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetDirection.js",
      "fieldKeys": [
        "actorId",
        "direction"
      ]
    },
    "adaptation": null
  },
  "actor.set_animation_state": {
    "title": "Definir estado de animação do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir estado de animacao do ator",
      "Set Actor Animation State"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_STATE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetState.js",
      "fieldKeys": [
        "actorId",
        "spriteStateId",
        "loopAnim"
      ]
    },
    "adaptation": null
  },
  "actor.change_sprite": {
    "title": "Definir folha de sprite do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir folha de sprite do ator",
      "Set Actor Sprite Sheet"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_SPRITE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetSprite.js",
      "fieldKeys": [
        "actorId",
        "spriteSheetId"
      ]
    },
    "adaptation": null
  },
  "actor.change_player_sprite": {
    "title": "Definir folha de sprite do jogador",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir folha de sprite do jogador",
      "Set Player Sprite Sheet"
    ],
    "reference": {
      "id": "EVENT_PLAYER_SET_SPRITE",
      "version": "4.3.2",
      "path": "src/lib/events/eventPlayerSetSprite.js",
      "fieldKeys": [
        "spriteSheetId"
      ]
    },
    "adaptation": null
  },
  "actor.animation_frame": {
    "title": "Definir quadro da animação do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir quadro da animacao do ator",
      "Set Actor Animation Frame"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_FRAME",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetFrame.js",
      "fieldKeys": [
        "actorId",
        "frame"
      ]
    },
    "adaptation": null
  },
  "actor.animation_speed": {
    "title": "Definir velocidade da animação do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir velocidade da animacao do ator",
      "Set Actor Animation Speed"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_ANIMATION_SPEED",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetAnimationSpeed.js",
      "fieldKeys": [
        "actorId",
        "speed"
      ]
    },
    "adaptation": null
  },
  "actor.movement_speed": {
    "title": "Definir velocidade de movimento do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir velocidade de movimento do ator",
      "Set Actor Movement Speed"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SET_MOVEMENT_SPEED",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorSetMovementSpeed.js",
      "fieldKeys": [
        "actorId",
        "speed"
      ]
    },
    "adaptation": null
  },
  "actor.hide": {
    "title": "Desativar ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Desativar ator",
      "Deactivate Actor"
    ],
    "reference": {
      "id": "EVENT_ACTOR_DEACTIVATE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorDeactivate.js",
      "fieldKeys": [
        "actorId"
      ]
    },
    "adaptation": null
  },
  "actor.disable_collision": {
    "title": "Desativar colisão de atores",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Desativar colisao de atores",
      "Set Actor Collisions Disable"
    ],
    "reference": {
      "id": "EVENT_ACTOR_COLLISIONS_DISABLE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorCollisionsDisable.js",
      "fieldKeys": [
        "actorId"
      ]
    },
    "adaptation": null
  },
  "actor.effects": {
    "title": "Efeitos do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Efeitos do ator",
      "Actor Effects"
    ],
    "reference": {
      "id": "EVENT_ACTOR_EFFECTS",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorEffects.js",
      "fieldKeys": [
        "effect",
        "actorId",
        "distance",
        "speed",
        "time",
        "timeUnits",
        "frames"
      ]
    },
    "adaptation": null
  },
  "actor.enable_collision": {
    "title": "Habilitar colisão de atores",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Habilitar colisao de atores",
      "Set Actor Collisions Enable"
    ],
    "reference": {
      "id": "EVENT_ACTOR_COLLISIONS_ENABLE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorCollisionsEnable.js",
      "fieldKeys": [
        "actorId"
      ]
    },
    "adaptation": null
  },
  "actor.store_direction": {
    "title": "Armazenar direção ator em variáveis",
    "category": "Ator",
    "section": "Variáveis",
    "groups": [
      {
        "category": "Ator",
        "section": "Variáveis"
      },
      {
        "category": "Variáveis",
        "section": "Ator"
      }
    ],
    "aliases": [
      "Armazenar direcao ator em variaveis",
      "Store Actor Direction In Variable"
    ],
    "reference": {
      "id": "EVENT_ACTOR_GET_DIRECTION",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorGetDirection.js",
      "fieldKeys": [
        "actorId",
        "direction"
      ]
    },
    "adaptation": null
  },
  "actor.store_position": {
    "title": "Armazenar posição ator em variáveis",
    "category": "Ator",
    "section": "Variáveis",
    "groups": [
      {
        "category": "Ator",
        "section": "Variáveis"
      },
      {
        "category": "Variáveis",
        "section": "Ator"
      }
    ],
    "aliases": [
      "Armazenar posicao ator em variaveis",
      "Store Actor Position In Variables"
    ],
    "reference": {
      "id": "EVENT_ACTOR_GET_POSITION",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorGetPosition.js",
      "fieldKeys": [
        "actorId",
        "vectorX",
        "vectorY"
      ]
    },
    "adaptation": null
  },
  "actor.show": {
    "title": "Exibir ator",
    "category": "Ator",
    "section": "Visibilidade",
    "groups": [
      {
        "category": "Ator",
        "section": "Visibilidade"
      }
    ],
    "aliases": [
      "Exibir ator",
      "Show Actor"
    ],
    "reference": {
      "id": "EVENT_ACTOR_SHOW",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorShow.js",
      "fieldKeys": [
        "actorId"
      ]
    },
    "adaptation": null
  },
  "actor.show_all_sprites": {
    "title": "Exibir todos os sprites",
    "category": "Ator",
    "section": "Visibilidade",
    "groups": [
      {
        "category": "Ator",
        "section": "Visibilidade"
      }
    ],
    "aliases": [
      "Exibir todos os sprites",
      "Show All Sprites"
    ],
    "reference": {
      "id": "EVENT_SHOW_SPRITES",
      "version": "4.3.2",
      "path": "src/lib/events/eventSpritesShow.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "actor.hide_actor": {
    "title": "Ocultar ator",
    "category": "Ator",
    "section": "Visibilidade",
    "groups": [
      {
        "category": "Ator",
        "section": "Visibilidade"
      }
    ],
    "aliases": [
      "Ocultar ator",
      "Hide Actor"
    ],
    "reference": {
      "id": "EVENT_ACTOR_HIDE",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorHide.js",
      "fieldKeys": [
        "actorId"
      ]
    },
    "adaptation": null
  },
  "actor.hide_all_sprites": {
    "title": "Ocultar todos os sprites",
    "category": "Ator",
    "section": "Visibilidade",
    "groups": [
      {
        "category": "Ator",
        "section": "Visibilidade"
      }
    ],
    "aliases": [
      "Ocultar todos os sprites",
      "Hide All Sprites"
    ],
    "reference": {
      "id": "EVENT_HIDE_SPRITES",
      "version": "4.3.2",
      "path": "src/lib/events/eventSpritesHide.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "actor.move": {
    "title": "Mover ator",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Mover ator"
    ],
    "reference": null,
    "adaptation": null
  },
  "actor.teleport": {
    "title": "Teleportar ator",
    "category": "Ator",
    "section": "Movimentação",
    "groups": [
      {
        "category": "Ator",
        "section": "Movimentação"
      }
    ],
    "aliases": [
      "Teleportar ator"
    ],
    "reference": null,
    "adaptation": null
  },
  "actor.turn": {
    "title": "Virar ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Virar ator"
    ],
    "reference": null,
    "adaptation": null
  },
  "actor.set_animation": {
    "title": "Definir animação do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir animacao do ator"
    ],
    "reference": null,
    "adaptation": null
  },
  "actor.play_animation": {
    "title": "Reproduzir animação do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Reproduzir animacao do ator"
    ],
    "reference": null,
    "adaptation": null
  },
  "actor.wait_animation": {
    "title": "Aguardar animação do ator",
    "category": "Ator",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Ator",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Aguardar animacao do ator"
    ],
    "reference": null,
    "adaptation": null
  },
  "actor.shop": {
    "title": "Abrir diálogo de loja",
    "category": "Ator",
    "section": "Loja",
    "groups": [
      {
        "category": "Ator",
        "section": "Loja"
      }
    ],
    "aliases": [
      "Abrir dialogo de loja"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.store_field": {
    "title": "Armazenar campo do motor em variável",
    "category": "Campos do motor",
    "section": null,
    "groups": [
      {
        "category": "Campos do motor",
        "section": null
      },
      {
        "category": "Variáveis",
        "section": "Campos do motor"
      }
    ],
    "aliases": [
      "Armazenar campo do motor em variavel",
      "Store Engine Field In Variable"
    ],
    "reference": {
      "id": "EVENT_ENGINE_FIELD_STORE",
      "version": "4.3.2",
      "path": "src/lib/events/eventEngineFieldStore.js",
      "fieldKeys": [
        "engineFieldKey",
        "value"
      ]
    },
    "adaptation": null
  },
  "engine.update_field": {
    "title": "Atualizar campo do motor",
    "category": "Campos do motor",
    "section": null,
    "groups": [
      {
        "category": "Campos do motor",
        "section": null
      }
    ],
    "aliases": [
      "Atualizar campo do motor",
      "Engine Field Update"
    ],
    "reference": {
      "id": "EVENT_ENGINE_FIELD_SET",
      "version": "4.3.2",
      "path": "src/lib/events/eventEngineFieldSet.js",
      "fieldKeys": [
        "engineFieldKey",
        "value"
      ]
    },
    "adaptation": null
  },
  "engine.attach_adventure_callback": {
    "title": "Anexar script ao callback de Aventura",
    "category": "Campos do motor",
    "section": "Aventura",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Aventura"
      }
    ],
    "aliases": [
      "Anexar script ao callback de Aventura",
      "Attach Script To Adventure Event Callback"
    ],
    "reference": {
      "id": "EVENT_SET_ADVENTURE_CALLBACK_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventAdventureCallbackScriptSet.js",
      "fieldKeys": [
        "event",
        "script"
      ]
    },
    "adaptation": null
  },
  "engine.remove_adventure_callback": {
    "title": "Remover script do callback de Aventura",
    "category": "Campos do motor",
    "section": "Aventura",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Aventura"
      }
    ],
    "aliases": [
      "Remover script do callback de Aventura",
      "Remove Script From Adventure Event Callback"
    ],
    "reference": {
      "id": "EVENT_REMOVE_ADVENTURE_CALLBACK_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventAdventureCallbackScriptRemove.js",
      "fieldKeys": [
        "event"
      ]
    },
    "adaptation": null
  },
  "engine.set_adventure_state": {
    "title": "Definir estado da Aventura",
    "category": "Campos do motor",
    "section": "Aventura",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Aventura"
      }
    ],
    "aliases": [
      "Set Adventure State"
    ],
    "reference": {
      "id": "EVENT_ADVENTURE_STATE_SET",
      "version": "4.3.2",
      "path": "src/lib/events/eventAdventureStateSet.js",
      "fieldKeys": [
        "state"
      ]
    },
    "adaptation": "O conceito possui referência, mas o contrato local ainda não solicita estados reais."
  },
  "engine.if_field_value": {
    "title": "Se comparar campo do motor com valor",
    "category": "Campos do motor",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Se o campo do motor for comparado com valor"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.if_field_variable": {
    "title": "Se comparar campo do motor com variável",
    "category": "Campos do motor",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Se o campo do motor for comparado com variavel"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.attach_platform_callback": {
    "title": "Anexar script ao retorno de chamada de evento de plataforma",
    "category": "Campos do motor",
    "section": "Plataforma",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Plataforma"
      }
    ],
    "aliases": [
      "Anexar script ao retorno de chamada de evento de plataforma",
      "Attach Script To Platformer Event Callback"
    ],
    "reference": {
      "id": "EVENT_SET_PLATFORMER_CALLBACK_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventPlatformerCallbackScriptSet.js",
      "fieldKeys": [
        "event",
        "script"
      ]
    },
    "adaptation": null
  },
  "engine.set_platform_state": {
    "title": "Definir estado da plataforma",
    "category": "Campos do motor",
    "section": "Plataforma",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Plataforma"
      }
    ],
    "aliases": [
      "Definir estado da plataforma",
      "Set Platformer State"
    ],
    "reference": {
      "id": "EVENT_PLATFORMER_STATE_SET",
      "version": "4.3.2",
      "path": "src/lib/events/eventPlatformerStateSet.js",
      "fieldKeys": [
        "state"
      ]
    },
    "adaptation": null
  },
  "engine.remove_platform_callback": {
    "title": "Remover script ao retorno de chamada de evento de plataforma",
    "category": "Campos do motor",
    "section": "Plataforma",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Plataforma"
      }
    ],
    "aliases": [
      "Remover script ao retorno de chamada de evento de plataforma",
      "Remove Script From Platformer Event Callback"
    ],
    "reference": {
      "id": "EVENT_REMOVE_PLATFORMER_CALLBACK_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventPlatformerCallbackScriptRemove.js",
      "fieldKeys": [
        "event"
      ]
    },
    "adaptation": null
  },
  "engine.player_speed_profile": {
    "title": "Definir perfil de velocidade",
    "category": "Campos do motor",
    "section": "Movimento",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Movimento"
      }
    ],
    "aliases": [
      "Definir perfil de velocidade"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.player_movement_state": {
    "title": "Definir estado de movimento",
    "category": "Campos do motor",
    "section": "Movimento",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Movimento"
      }
    ],
    "aliases": [
      "Definir estado de movimento"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.push_actor": {
    "title": "Empurrar ator",
    "category": "Campos do motor",
    "section": "Puzzle",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Puzzle"
      }
    ],
    "aliases": [
      "Empurrar ator"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.clock_start": {
    "title": "Iniciar relógio do jogo",
    "category": "Campos do motor",
    "section": "Tempo",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Tempo"
      }
    ],
    "aliases": [
      "Iniciar relogio do jogo"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.clock_advance": {
    "title": "Avançar tempo",
    "category": "Campos do motor",
    "section": "Tempo",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Tempo"
      }
    ],
    "aliases": [
      "Avancar tempo"
    ],
    "reference": null,
    "adaptation": null
  },
  "rtc.read_field": {
    "title": "Ler campo do RTC",
    "category": "Hardware",
    "section": "Tempo real",
    "groups": [
      {
        "category": "Hardware",
        "section": "Tempo real"
      }
    ],
    "aliases": [
      "Ler campo do RTC"
    ],
    "reference": null,
    "adaptation": null
  },
  "rtc.if_field": {
    "title": "Se o RTC corresponder",
    "category": "Hardware",
    "section": "Tempo real",
    "groups": [
      {
        "category": "Hardware",
        "section": "Tempo real"
      }
    ],
    "aliases": [
      "Se o RTC corresponder"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.equip_menu": {
    "title": "Abrir menu de equipamento",
    "category": "Campos do motor",
    "section": "Inventário",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Inventário"
      }
    ],
    "aliases": [
      "Abrir menu de equipamento"
    ],
    "reference": null,
    "adaptation": null
  },
  "engine.equip_item": {
    "title": "Definir item equipado",
    "category": "Campos do motor",
    "section": "Inventário",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Inventário"
      }
    ],
    "aliases": [
      "Definir item equipado"
    ],
    "reference": null,
    "adaptation": null
  },
  "inventory.add_item": {
    "title": "Adicionar item ao inventário",
    "category": "Campos do motor",
    "section": "Inventário",
    "groups": [
      {
        "category": "Campos do motor",
        "section": "Inventário"
      }
    ],
    "aliases": [
      "Adicionar item ao inventario"
    ],
    "reference": null,
    "adaptation": null
  },
  "scene.if_current": {
    "title": "Se cena atual é",
    "category": "Cena",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Cena"
      },
      {
        "category": "Cena",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Se cena atual e",
      "If Current Scene Is"
    ],
    "reference": {
      "id": "EVENT_IF_CURRENT_SCENE_IS",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfCurrentSceneIs.js",
      "fieldKeys": [
        "sceneId",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "scene.change_by_variable": {
    "title": "Trocar cena por variável",
    "category": "Cena",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Cena",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Trocar cena por variavel"
    ],
    "reference": null,
    "adaptation": null
  },
  "scene.stack_push": {
    "title": "Armazenar cena atual na pilha",
    "category": "Cena",
    "section": "Pilha de cenas",
    "groups": [
      {
        "category": "Cena",
        "section": "Pilha de cenas"
      }
    ],
    "aliases": [
      "Armazenar cena atual na pilha",
      "Store Current Scene On Stack"
    ],
    "reference": {
      "id": "EVENT_SCENE_PUSH_STATE",
      "version": "4.3.2",
      "path": "src/lib/events/eventScenePushState.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "scene.stack_clear": {
    "title": "Remover tudo da pilha de cenas",
    "category": "Cena",
    "section": "Pilha de cenas",
    "groups": [
      {
        "category": "Cena",
        "section": "Pilha de cenas"
      }
    ],
    "aliases": [
      "Remover tudo da pilha de cenas",
      "Remove All From Scene Stack"
    ],
    "reference": {
      "id": "EVENT_SCENE_RESET_STATE",
      "version": "4.3.2",
      "path": "src/lib/events/eventSceneResetState.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "scene.stack_previous": {
    "title": "Restaurar cena anterior da pilha",
    "category": "Cena",
    "section": "Pilha de cenas",
    "groups": [
      {
        "category": "Cena",
        "section": "Pilha de cenas"
      }
    ],
    "aliases": [
      "Restaurar cena anterior da pilha",
      "Restore Previous Scene From Stack"
    ],
    "reference": {
      "id": "EVENT_SCENE_POP_STATE",
      "version": "4.3.2",
      "path": "src/lib/events/eventScenePopState.js",
      "fieldKeys": [
        "fadeSpeed"
      ]
    },
    "adaptation": null
  },
  "scene.stack_first": {
    "title": "Restaurar primeira cena da pilha",
    "category": "Cena",
    "section": "Pilha de cenas",
    "groups": [
      {
        "category": "Cena",
        "section": "Pilha de cenas"
      }
    ],
    "aliases": [
      "Restaurar primeira cena da pilha",
      "Restore First Scene From Stack"
    ],
    "reference": {
      "id": "EVENT_SCENE_POP_ALL_STATE",
      "version": "4.3.2",
      "path": "src/lib/events/eventScenePopAllState.js",
      "fieldKeys": [
        "fadeSpeed"
      ]
    },
    "adaptation": null
  },
  "scene.pause_type": {
    "title": "Pausar lógica para o tipo de cena",
    "category": "Cena",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Cena",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Pausar logica para o tipo de cena",
      "Pause Logic For Scene Type"
    ],
    "reference": {
      "id": "EVENT_SCENE_UPDATE_PAUSE",
      "version": "4.3.2",
      "path": "src/lib/events/eventSceneUpdatePause.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "scene.resume_type": {
    "title": "Retomar lógica para o tipo de cena",
    "category": "Cena",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Cena",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Retomar logica para o tipo de cena",
      "Resume Logic For Scene Type"
    ],
    "reference": {
      "id": "EVENT_SCENE_UPDATE_RESUME",
      "version": "4.3.2",
      "path": "src/lib/events/eventSceneUpdateResume.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "scene.replace_tile": {
    "title": "Substituir tile na posição",
    "category": "Cena",
    "section": "Tiles",
    "groups": [
      {
        "category": "Cena",
        "section": "Tiles"
      }
    ],
    "aliases": [
      "Substituir tile na posicao",
      "Replace Tile At Position"
    ],
    "reference": {
      "id": "EVENT_REPLACE_TILE_XY",
      "version": "4.3.2",
      "path": "src/lib/events/eventReplaceTileXY.js",
      "fieldKeys": [
        "x",
        "y",
        "tilesetId",
        "tileIndex"
      ]
    },
    "adaptation": null
  },
  "scene.replace_tile_sequence": {
    "title": "Substituir tile na posição da sequência",
    "category": "Cena",
    "section": "Tiles",
    "groups": [
      {
        "category": "Cena",
        "section": "Tiles"
      }
    ],
    "aliases": [
      "Substituir tile na posicao da sequencia",
      "Replace Tile At Position From Sequence"
    ],
    "reference": {
      "id": "EVENT_REPLACE_TILE_XY_SEQUENCE",
      "version": "4.3.2",
      "path": "src/lib/events/eventReplaceTileXYSequence.js",
      "fieldKeys": [
        "x",
        "y",
        "tilesetId",
        "tileIndex",
        "frames",
        "variable"
      ]
    },
    "adaptation": null
  },
  "colors.restore": {
    "title": "Restaurar cores padrão",
    "category": "Cores",
    "section": null,
    "groups": [
      {
        "category": "Cores",
        "section": null
      }
    ],
    "aliases": [
      "Restaurar cores padrao"
    ],
    "reference": null,
    "adaptation": null
  },
  "camera.follow_player": {
    "title": "Definir câmera no jogador",
    "category": "Câmera",
    "section": null,
    "groups": [
      {
        "category": "Câmera",
        "section": null
      }
    ],
    "aliases": [
      "Definir camera no jogador",
      "Set Camera Lock On Player"
    ],
    "reference": {
      "id": "EVENT_CAMERA_SET_LOCK",
      "version": "4.3.2",
      "path": "src/lib/events/eventCameraSetLock.js",
      "fieldKeys": [
        "axis",
        "preventScroll"
      ]
    },
    "adaptation": null
  },
  "camera.bounds": {
    "title": "Definir limite da câmera",
    "category": "Câmera",
    "section": null,
    "groups": [
      {
        "category": "Câmera",
        "section": null
      }
    ],
    "aliases": [
      "Definir limite da camera",
      "Set Camera Bounds"
    ],
    "reference": {
      "id": "EVENT_CAMERA_SET_BOUNDS",
      "version": "4.3.2",
      "path": "src/lib/events/eventCameraSetBounds.js",
      "fieldKeys": [
        "x",
        "y",
        "width",
        "height"
      ]
    },
    "adaptation": null
  },
  "camera.position": {
    "title": "Definir posição da câmera",
    "category": "Câmera",
    "section": null,
    "groups": [
      {
        "category": "Câmera",
        "section": null
      }
    ],
    "aliases": [
      "Definir posicao da camera",
      "Set Camera Position"
    ],
    "reference": {
      "id": "EVENT_CAMERA_SET_POSITION",
      "version": "4.3.2",
      "path": "src/lib/events/eventCameraSetPosition.js",
      "fieldKeys": [
        "x",
        "y"
      ]
    },
    "adaptation": null
  },
  "camera.move": {
    "title": "Mover câmera para",
    "category": "Câmera",
    "section": null,
    "groups": [
      {
        "category": "Câmera",
        "section": null
      }
    ],
    "aliases": [
      "Mover camera para",
      "Camera Move To"
    ],
    "reference": {
      "id": "EVENT_CAMERA_MOVE_TO",
      "version": "4.3.2",
      "path": "src/lib/events/eventCameraMoveTo.js",
      "fieldKeys": [
        "x",
        "y",
        "speed"
      ]
    },
    "adaptation": null
  },
  "camera.lock_player": {
    "title": "Travar câmera no jogador",
    "category": "Câmera",
    "section": null,
    "groups": [
      {
        "category": "Câmera",
        "section": null
      }
    ],
    "aliases": [
      "Travar camera no jogador",
      "Camera Move To Lock On Player"
    ],
    "reference": {
      "id": "EVENT_CAMERA_LOCK",
      "version": "4.3.2",
      "path": "src/lib/events/eventCameraLock.js",
      "fieldKeys": [
        "speed",
        "axis",
        "preventScroll"
      ]
    },
    "adaptation": null
  },
  "camera.shake": {
    "title": "Vibração de câmera",
    "category": "Câmera",
    "section": null,
    "groups": [
      {
        "category": "Câmera",
        "section": null
      }
    ],
    "aliases": [
      "Vibracao de camera",
      "Camera Shake"
    ],
    "reference": {
      "id": "EVENT_CAMERA_SHAKE",
      "version": "4.3.2",
      "path": "src/lib/events/eventCameraShake.js",
      "fieldKeys": [
        "time",
        "units",
        "frames",
        "shakeDirection",
        "magnitude"
      ]
    },
    "adaptation": null
  },
  "camera.property": {
    "title": "Definir propriedade da câmera",
    "category": "Câmera",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Câmera",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir propriedade da camera",
      "Set Camera Property"
    ],
    "reference": {
      "id": "EVENT_CAMERA_PROPERTY_SET",
      "version": "4.3.2",
      "path": "src/lib/events/eventCameraPropertySet.js",
      "fieldKeys": [
        "property",
        "value"
      ]
    },
    "adaptation": null
  },
  "camera.fade_out": {
    "title": "Desaparecimento de tela gradual",
    "category": "Câmera",
    "section": "Tela",
    "groups": [
      {
        "category": "Tela",
        "section": null
      },
      {
        "category": "Câmera",
        "section": "Tela"
      }
    ],
    "aliases": [
      "Desaparecimento de tela gradual",
      "Fade Screen Out"
    ],
    "reference": {
      "id": "EVENT_FADE_OUT",
      "version": "4.3.2",
      "path": "src/lib/events/eventFadeOut.js",
      "fieldKeys": [
        "speed"
      ]
    },
    "adaptation": null
  },
  "camera.fade_in": {
    "title": "Aparecimento de tela gradual",
    "category": "Câmera",
    "section": "Tela",
    "groups": [
      {
        "category": "Tela",
        "section": null
      },
      {
        "category": "Câmera",
        "section": "Tela"
      }
    ],
    "aliases": [
      "Aparecimento de tela gradual",
      "Fade Screen In"
    ],
    "reference": {
      "id": "EVENT_FADE_IN",
      "version": "4.3.2",
      "path": "src/lib/events/eventFadeIn.js",
      "fieldKeys": [
        "speed"
      ]
    },
    "adaptation": null
  },
  "dialogue.draw_text": {
    "title": "Desenhar texto",
    "category": "Diálogo e menus",
    "section": null,
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": null
      }
    ],
    "aliases": [
      "Desenhar texto",
      "Draw Text"
    ],
    "reference": {
      "id": "EVENT_TEXT_DRAW",
      "version": "4.3.2",
      "path": "src/lib/events/eventTextDraw.js",
      "fieldKeys": [
        "text",
        "x",
        "y",
        "location"
      ]
    },
    "adaptation": "A referência configura texto, posição e camada; o contrato local de texto simples ainda não oferece isso."
  },
  "dialogue.menu": {
    "title": "Exibir menu",
    "category": "Diálogo e menus",
    "section": null,
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": null
      }
    ],
    "aliases": [
      "Exibir menu",
      "Display Menu"
    ],
    "reference": {
      "id": "EVENT_MENU",
      "version": "4.3.2",
      "path": "src/lib/events/eventMenu.js",
      "fieldKeys": [
        "variable",
        "items",
        "option${i + 1}",
        "cancelOnLastOption",
        "cancelOnB",
        "layout"
      ]
    },
    "adaptation": "A referência configura opções, resposta e layout; o comando local sem argumentos ainda não realiza essa função."
  },
  "menu.slider": {
    "title": "Slider de opções",
    "category": "Diálogo e menus",
    "section": "Navegação",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Navegação"
      }
    ],
    "aliases": [
      "Slider de opções"
    ],
    "reference": null,
    "adaptation": null
  },
  "dialogue.choice": {
    "title": "Exibir múltipla escolha",
    "category": "Diálogo e menus",
    "section": null,
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": null
      }
    ],
    "aliases": [
      "Exibir multipla escolha",
      "Display Multiple Choice"
    ],
    "reference": {
      "id": "EVENT_CHOICE",
      "version": "4.3.2",
      "path": "src/lib/events/eventTextChoice.js",
      "fieldKeys": [
        "variable",
        "trueText",
        "falseText"
      ]
    },
    "adaptation": null
  },
  "dialogue.choice_branch": {
    "title": "Executar script da escolha",
    "category": "Diálogo e menus",
    "section": null,
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": null
      }
    ],
    "aliases": [
      "Branch de escolha"
    ],
    "reference": null,
    "adaptation": null
  },
  "dialogue.text_sfx": {
    "title": "Definir efeito sonoro do texto",
    "category": "Diálogo e menus",
    "section": "Música e efeitos sonoros",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Música e efeitos sonoros"
      },
      {
        "category": "Música e efeitos sonoros",
        "section": "Diálogo e menus"
      }
    ],
    "aliases": [
      "Definir efeito sonoro do texto",
      "Set Text Sound Effect"
    ],
    "reference": {
      "id": "EVENT_TEXT_SET_SOUND_EFFECT",
      "version": "4.3.2",
      "path": "src/lib/events/eventTextSetSound.js",
      "fieldKeys": [
        "type",
        "pitch",
        "frequency",
        "duration",
        "effect"
      ]
    },
    "adaptation": null
  },
  "dialogue.frame": {
    "title": "Definir quadro de diálogo",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir quadro de dialogo",
      "Set Dialogue Frame"
    ],
    "reference": {
      "id": "EVENT_SET_DIALOGUE_FRAME",
      "version": "4.3.2",
      "path": "src/lib/events/eventSetDialogueFrame.js",
      "fieldKeys": [
        "tilesetId"
      ]
    },
    "adaptation": null
  },
  "dialogue.text_speed": {
    "title": "Definir velocidade da animação do texto",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir velocidade da animacao do texto",
      "Set Text Animation Speed"
    ],
    "reference": {
      "id": "EVENT_TEXT_SET_ANIMATION_SPEED",
      "version": "4.3.2",
      "path": "src/lib/events/eventTextSetAnimationSpeed.js",
      "fieldKeys": [
        "speedIn",
        "speedOut",
        "speed",
        "allowFastForward"
      ]
    },
    "adaptation": null
  },
  "dialogue.language": {
    "title": "Definir idioma do jogo",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Definir idioma do jogo"
    ],
    "reference": null,
    "adaptation": null
  },
  "dialogue.close_non_modal": {
    "title": "Fechar o diálogo não modal",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Propriedades"
      }
    ],
    "aliases": [
      "Fechar o dialogo nao modal",
      "Close Non-Modal Dialogue"
    ],
    "reference": {
      "id": "EVENT_DIALOGUE_CLOSE_NONMODAL",
      "version": "4.3.2",
      "path": "src/lib/events/eventTextCloseNonModal.js",
      "fieldKeys": [
        "speed"
      ]
    },
    "adaptation": null
  },
  "dialogue.text_input": {
    "title": "Abrir entrada de texto",
    "category": "Diálogo e menus",
    "section": "Sistemas prontos",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Sistemas prontos"
      }
    ],
    "aliases": [
      "Abrir entrada de texto"
    ],
    "reference": null,
    "adaptation": null
  },
  "dialogue.code_lock": {
    "title": "Abrir cadeado numérico",
    "category": "Diálogo e menus",
    "section": "Sistemas prontos",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Sistemas prontos"
      }
    ],
    "aliases": [
      "Abrir cadeado numerico"
    ],
    "reference": null,
    "adaptation": null
  },
  "dialogue.speaker": {
    "title": "Mostrar diálogo com nome",
    "category": "Diálogo e menus",
    "section": "Sistemas prontos",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Sistemas prontos"
      }
    ],
    "aliases": [
      "Mostrar dialogo com nome"
    ],
    "reference": null,
    "adaptation": null
  },
  "hud.stat_set": {
    "title": "Definir atributo",
    "category": "HUD",
    "section": "Atributos",
    "groups": [
      {
        "category": "HUD",
        "section": "Atributos"
      }
    ],
    "aliases": [
      "Definir status"
    ],
    "reference": null,
    "adaptation": null
  },
  "hud.stat_modify": {
    "title": "Modificar atributo",
    "category": "HUD",
    "section": "Atributos",
    "groups": [
      {
        "category": "HUD",
        "section": "Atributos"
      }
    ],
    "aliases": [
      "Modificar status"
    ],
    "reference": null,
    "adaptation": null
  },
  "hud.stat_bar": {
    "title": "Exibir barra de atributo",
    "category": "HUD",
    "section": "Atributos",
    "groups": [
      {
        "category": "HUD",
        "section": "Atributos"
      }
    ],
    "aliases": [
      "Exibir barra de status"
    ],
    "reference": null,
    "adaptation": null
  },
  "hud.hearts": {
    "title": "Exibir corações",
    "category": "HUD",
    "section": "Atributos",
    "groups": [
      {
        "category": "HUD",
        "section": "Atributos"
      }
    ],
    "aliases": [
      "Exibir coracoes"
    ],
    "reference": null,
    "adaptation": null
  },
  "hud.wallet_modify": {
    "title": "Modificar carteira",
    "category": "HUD",
    "section": "Carteira",
    "groups": [
      {
        "category": "HUD",
        "section": "Carteira"
      }
    ],
    "aliases": [
      "Modificar carteira"
    ],
    "reference": null,
    "adaptation": null
  },
  "hud.number": {
    "title": "Exibir número no HUD",
    "category": "HUD",
    "section": "Carteira",
    "groups": [
      {
        "category": "HUD",
        "section": "Carteira"
      }
    ],
    "aliases": [
      "Exibir numero no HUD"
    ],
    "reference": null,
    "adaptation": null
  },
  "input.attach_button": {
    "title": "Anexar script ao botão",
    "category": "Entrada de controle",
    "section": null,
    "groups": [
      {
        "category": "Entrada de controle",
        "section": null
      }
    ],
    "aliases": [
      "Anexar script ao botao",
      "Attach Script To Button"
    ],
    "reference": {
      "id": "EVENT_SET_INPUT_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventInputScriptSet.js",
      "fieldKeys": [
        "input",
        "override",
        "true"
      ]
    },
    "adaptation": null
  },
  "input.wait_button": {
    "title": "Pausar script até pressionar botão",
    "category": "Entrada de controle",
    "section": null,
    "groups": [
      {
        "category": "Entrada de controle",
        "section": null
      }
    ],
    "aliases": [
      "Pausar script ate pressionar botao",
      "Pause Script Until Button Pressed"
    ],
    "reference": {
      "id": "EVENT_AWAIT_INPUT",
      "version": "4.3.2",
      "path": "src/lib/events/eventInputAwait.js",
      "fieldKeys": [
        "input"
      ]
    },
    "adaptation": null
  },
  "input.remove_button": {
    "title": "Remover script do botão",
    "category": "Entrada de controle",
    "section": null,
    "groups": [
      {
        "category": "Entrada de controle",
        "section": null
      }
    ],
    "aliases": [
      "Remover script do botao",
      "Remove Button Script"
    ],
    "reference": {
      "id": "EVENT_REMOVE_INPUT_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventInputScriptRemove.js",
      "fieldKeys": [
        "input"
      ]
    },
    "adaptation": null
  },
  "input.if_button": {
    "title": "Se o botão está pressionado",
    "category": "Entrada de controle",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Entrada de controle",
        "section": "Fluxo de controle"
      },
      {
        "category": "Fluxo de controle",
        "section": "Entrada de controle"
      }
    ],
    "aliases": [
      "Se o botao esta pressionado",
      "If Button Held"
    ],
    "reference": {
      "id": "EVENT_IF_INPUT",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfInput.js",
      "fieldKeys": [
        "input",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "flow.call_event": {
    "title": "Chamar script",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Chamar evento",
      "Call Script"
    ],
    "reference": {
      "id": "EVENT_CALL_CUSTOM_EVENT",
      "version": "4.3.2",
      "path": "src/lib/events/eventCallCustomEvent.js",
      "fieldKeys": [
        "customEventId"
      ]
    },
    "adaptation": "Chama um script nomeado do projeto; parâmetros de procedures são outra ação."
  },
  "flow.if_flag": {
    "title": "Se flag",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se flag"
    ],
    "reference": null,
    "adaptation": null
  },
  "flow.if_variable": {
    "title": "Se comparar variável com valor",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      },
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se comparar variavel com valor",
      "If Variable Compare With Value"
    ],
    "reference": {
      "id": "EVENT_IF_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfVariableValue.js",
      "fieldKeys": [
        "variable",
        "operator",
        "comparator",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "flow.else": {
    "title": "Senao",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Senao"
    ],
    "reference": null,
    "adaptation": null
  },
  "flow.switch_variable": {
    "title": "Switch por variável",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Switch por variavel",
      "Switch"
    ],
    "reference": {
      "id": "EVENT_SWITCH",
      "version": "4.3.2",
      "path": "src/lib/events/eventSwitch.js",
      "fieldKeys": [
        "variable",
        "choices",
        "value${i}",
        "true${i}",
        "false"
      ]
    },
    "adaptation": "A sintaxe local encaminha valores a scripts nomeados."
  },
  "flow.if_variable_greater": {
    "title": "Se variável maior que valor",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      },
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se variavel maior que valor",
      "If Variable Compare With Value"
    ],
    "reference": {
      "id": "EVENT_IF_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfVariableValue.js",
      "fieldKeys": [
        "variable",
        "operator",
        "comparator",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "flow.if_variable_less": {
    "title": "Se variável menor que valor",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      },
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se variavel menor que valor",
      "If Variable Compare With Value"
    ],
    "reference": {
      "id": "EVENT_IF_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfVariableValue.js",
      "fieldKeys": [
        "variable",
        "operator",
        "comparator",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "flow.has_item": {
    "title": "Se possuir item",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se possuir item"
    ],
    "reference": null,
    "adaptation": null
  },
  "flow.stop": {
    "title": "Parar script",
    "category": "Fluxo de controle",
    "section": null,
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Parar evento",
      "Stop Script"
    ],
    "reference": {
      "id": "EVENT_STOP",
      "version": "4.3.2",
      "path": "src/lib/events/eventScriptStop.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "math.random_seed": {
    "title": "Definir variável para valor aleatório",
    "category": "Variáveis",
    "section": "Aleatório",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Aleatório"
      }
    ],
    "aliases": [
      "Semente de gerador de numero aleatorio",
      "Variable Set To Value"
    ],
    "reference": {
      "id": "EVENT_SET_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetToValue.js",
      "fieldKeys": [
        "variable",
        "value"
      ]
    },
    "adaptation": "Gera um valor numa faixa; não define a semente do gerador."
  },
  "math.repeat_expression": {
    "title": "Repetir enquanto comparar variável",
    "category": "Matemática",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Matemática",
        "section": "Fluxo de controle"
      }
    ],
    "aliases": [
      "Repetir durante expressao matematica"
    ],
    "reference": null,
    "adaptation": null
  },
  "math.if_expression": {
    "title": "Se variável maior que valor",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      },
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se a expressao matematica",
      "If Variable Compare With Value"
    ],
    "reference": {
      "id": "EVENT_IF_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfVariableValue.js",
      "fieldKeys": [
        "variable",
        "operator",
        "comparator",
        "true",
        "false"
      ]
    },
    "adaptation": "Esta entrada local compara uma variável com um valor; não avalia uma expressão arbitrária."
  },
  "math.evaluate": {
    "title": "Definir variável para valor",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      }
    ],
    "aliases": [
      "Avaliar expressao matematica",
      "Variable Set To Value"
    ],
    "reference": {
      "id": "EVENT_SET_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetToValue.js",
      "fieldKeys": [
        "variable",
        "value"
      ]
    },
    "adaptation": "Esta entrada local atribui um valor; não representa o editor de expressão matemática do GB Studio."
  },
  "math.functions": {
    "title": "Multiplicar variável por valor",
    "category": "Matemática",
    "section": "Variáveis",
    "groups": [
      {
        "category": "Matemática",
        "section": "Variáveis"
      },
      {
        "category": "Variáveis",
        "section": "Matemática"
      }
    ],
    "aliases": [
      "Funcoes matematicas",
      "Math Functions"
    ],
    "reference": {
      "id": "EVENT_VARIABLE_MATH",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableMath.js",
      "fieldKeys": [
        "vectorX",
        "operation",
        "other",
        "vectorY",
        "value",
        "minValue",
        "maxValue",
        "clamp"
      ]
    },
    "adaptation": "Esta entrada local oferece multiplicação por valor, uma parte das operações matemáticas da referência."
  },
  "audio.play_music": {
    "title": "Reproduzir faixa de música",
    "category": "Música e efeitos sonoros",
    "section": null,
    "groups": [
      {
        "category": "Música e efeitos sonoros",
        "section": null
      }
    ],
    "aliases": [
      "Reproduzir faixa de musica",
      "Play Music Track"
    ],
    "reference": {
      "id": "EVENT_MUSIC_PLAY",
      "version": "4.3.2",
      "path": "src/lib/events/eventMusicPlay.js",
      "fieldKeys": [
        "musicId"
      ]
    },
    "adaptation": null
  },
  "audio.play_sfx": {
    "title": "Tocar efeito sonoro",
    "category": "Música e efeitos sonoros",
    "section": null,
    "groups": [
      {
        "category": "Música e efeitos sonoros",
        "section": null
      }
    ],
    "aliases": [
      "Tocar efeito sonoro",
      "Play Sound Effect"
    ],
    "reference": {
      "id": "EVENT_SOUND_PLAY_EFFECT",
      "version": "4.3.2",
      "path": "src/lib/events/eventSoundPlayEffect.js",
      "fieldKeys": [
        "type",
        "priority",
        "pitch",
        "frequency",
        "duration",
        "wait",
        "effect"
      ]
    },
    "adaptation": null
  },
  "audio.text_sfx": {
    "title": "Definir efeito sonoro do texto",
    "category": "Música e efeitos sonoros",
    "section": "Diálogo e menus",
    "groups": [
      {
        "category": "Diálogo e menus",
        "section": "Música e efeitos sonoros"
      },
      {
        "category": "Música e efeitos sonoros",
        "section": "Diálogo e menus"
      }
    ],
    "aliases": [
      "Definir efeito sonoro do texto",
      "Set Text Sound Effect"
    ],
    "reference": {
      "id": "EVENT_TEXT_SET_SOUND_EFFECT",
      "version": "4.3.2",
      "path": "src/lib/events/eventTextSetSound.js",
      "fieldKeys": [
        "type",
        "pitch",
        "frequency",
        "duration",
        "effect"
      ]
    },
    "adaptation": null
  },
  "audio.stop_music": {
    "title": "Parar música",
    "category": "Música e efeitos sonoros",
    "section": "Parar",
    "groups": [
      {
        "category": "Música e efeitos sonoros",
        "section": "Parar"
      }
    ],
    "aliases": [
      "Parar musica",
      "Stop Music"
    ],
    "reference": {
      "id": "EVENT_MUSIC_STOP",
      "version": "4.3.2",
      "path": "src/lib/events/eventMusicStop.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "audio.mute_channel": {
    "title": "Silenciar canal",
    "category": "Música e efeitos sonoros",
    "section": "Parar",
    "groups": [
      {
        "category": "Música e efeitos sonoros",
        "section": "Parar"
      }
    ],
    "aliases": [
      "Silenciar canal",
      "Mute Channel"
    ],
    "reference": {
      "id": "EVENT_MUTE_CHANNEL",
      "version": "4.3.2",
      "path": "src/lib/events/eventMuteChannel.js",
      "fieldKeys": [
        "channels"
      ]
    },
    "adaptation": null
  },
  "audio.set_volume": {
    "title": "Definir volume do canal",
    "category": "Música e efeitos sonoros",
    "section": "Mixagem",
    "groups": [
      {
        "category": "Música e efeitos sonoros",
        "section": "Mixagem"
      }
    ],
    "aliases": [
      "Definir volume do canal"
    ],
    "reference": null,
    "adaptation": null
  },
  "audio.fade_volume": {
    "title": "Transicionar volume do canal",
    "category": "Música e efeitos sonoros",
    "section": "Mixagem",
    "groups": [
      {
        "category": "Música e efeitos sonoros",
        "section": "Mixagem"
      }
    ],
    "aliases": [
      "Transicionar volume do canal"
    ],
    "reference": null,
    "adaptation": null
  },
  "audio.routine": {
    "title": "Executar rotina de música",
    "category": "Música e efeitos sonoros",
    "section": "Script",
    "groups": [
      {
        "category": "Música e efeitos sonoros",
        "section": "Script"
      }
    ],
    "aliases": [
      "Executar rotina de música"
    ],
    "reference": null,
    "adaptation": null
  },
  "save.load": {
    "title": "Carregar dados do jogo",
    "category": "Salvar dados",
    "section": null,
    "groups": [
      {
        "category": "Salvar dados",
        "section": null
      }
    ],
    "aliases": [
      "Carregar dados do jogo",
      "Game Data Load"
    ],
    "reference": {
      "id": "EVENT_LOAD_DATA",
      "version": "4.3.2",
      "path": "src/lib/events/eventDataLoad.js",
      "fieldKeys": [
        "saveSlot"
      ]
    },
    "adaptation": null
  },
  "save.remove": {
    "title": "Remover dados do jogo",
    "category": "Salvar dados",
    "section": null,
    "groups": [
      {
        "category": "Salvar dados",
        "section": null
      }
    ],
    "aliases": [
      "Remover dados do jogo",
      "Game Data Remove"
    ],
    "reference": {
      "id": "EVENT_CLEAR_DATA",
      "version": "4.3.2",
      "path": "src/lib/events/eventDataClear.js",
      "fieldKeys": [
        "saveSlot"
      ]
    },
    "adaptation": null
  },
  "save.save": {
    "title": "Salvar dados do jogo",
    "category": "Salvar dados",
    "section": null,
    "groups": [
      {
        "category": "Salvar dados",
        "section": null
      }
    ],
    "aliases": [
      "Salvar dados do jogo",
      "Game Data Save"
    ],
    "reference": {
      "id": "EVENT_SAVE_DATA",
      "version": "4.3.2",
      "path": "src/lib/events/eventDataSave.js",
      "fieldKeys": [
        "saveSlot",
        "true",
        "load"
      ]
    },
    "adaptation": null
  },
  "save.if_saved": {
    "title": "Se salvar dados do jogo",
    "category": "Salvar dados",
    "section": "Fluxo de controle",
    "groups": [
      {
        "category": "Salvar dados",
        "section": "Fluxo de controle"
      },
      {
        "category": "Fluxo de controle",
        "section": "Salvar dados"
      }
    ],
    "aliases": [
      "Se salvar dados do jogo",
      "If Game Data Saved"
    ],
    "reference": {
      "id": "EVENT_IF_SAVED_DATA",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfDataSaved.js",
      "fieldKeys": [
        "saveSlot",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "save.store_variable": {
    "title": "Consultar presença do save em variável",
    "category": "Salvar dados",
    "section": "Variáveis",
    "groups": [
      {
        "category": "Salvar dados",
        "section": "Variáveis"
      }
    ],
    "aliases": [
      "Consultar presença do save em variável"
    ],
    "reference": null,
    "adaptation": null
  },
  "data.lookup": {
    "title": "Consultar tabela de dados",
    "category": "Variáveis",
    "section": "Tabelas de dados",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Tabelas de dados"
      }
    ],
    "aliases": [
      "Data Table Lookup"
    ],
    "reference": {
      "id": "EVENT_DATA_TABLE",
      "version": "4.3.2",
      "path": "src/lib/events/eventDataTable.js",
      "fieldKeys": [
        "indexVariable",
        "data"
      ]
    },
    "adaptation": null
  },
  "screen.fade_out": {
    "title": "Desaparecimento de tela gradual",
    "category": "Tela",
    "section": null,
    "groups": [
      {
        "category": "Tela",
        "section": null
      },
      {
        "category": "Câmera",
        "section": "Tela"
      }
    ],
    "aliases": [
      "Desaparecimento de tela gradual",
      "Fade Screen Out"
    ],
    "reference": {
      "id": "EVENT_FADE_OUT",
      "version": "4.3.2",
      "path": "src/lib/events/eventFadeOut.js",
      "fieldKeys": [
        "speed"
      ]
    },
    "adaptation": null
  },
  "screen.fade_in": {
    "title": "Aparecimento de tela gradual",
    "category": "Tela",
    "section": null,
    "groups": [
      {
        "category": "Tela",
        "section": null
      },
      {
        "category": "Câmera",
        "section": "Tela"
      }
    ],
    "aliases": [
      "Aparecimento de tela gradual",
      "Fade Screen In"
    ],
    "reference": {
      "id": "EVENT_FADE_IN",
      "version": "4.3.2",
      "path": "src/lib/events/eventFadeIn.js",
      "fieldKeys": [
        "speed"
      ]
    },
    "adaptation": null
  },
  "visual.apply_effect": {
    "title": "Aplicar efeito visual",
    "category": "Efeitos visuais",
    "section": null,
    "groups": [
      {
        "category": "Efeitos visuais",
        "section": null
      }
    ],
    "aliases": [
      "Aplicar efeito visual"
    ],
    "reference": null,
    "adaptation": null
  },
  "screen.overlay_line": {
    "title": "Definir corte de linha da sobreposição",
    "category": "Tela",
    "section": "Sobreposição",
    "groups": [
      {
        "category": "Tela",
        "section": "Sobreposição"
      }
    ],
    "aliases": [
      "Definir corte de linha da sobreposicao",
      "Set Overlay Scanline Cutoff"
    ],
    "reference": {
      "id": "EVENT_OVERLAY_SET_SCANLINE_CUTOFF",
      "version": "4.3.2",
      "path": "src/lib/events/eventOverlaySetScanlineCutoff.js",
      "fieldKeys": [
        "y"
      ]
    },
    "adaptation": null
  },
  "screen.overlay_show": {
    "title": "Exibir sobreposição",
    "category": "Tela",
    "section": "Sobreposição",
    "groups": [
      {
        "category": "Tela",
        "section": "Sobreposição"
      }
    ],
    "aliases": [
      "Exibir sobreposicao",
      "Show Overlay"
    ],
    "reference": {
      "id": "EVENT_OVERLAY_SHOW",
      "version": "4.3.2",
      "path": "src/lib/events/eventOverlayShow.js",
      "fieldKeys": [
        "color",
        "x",
        "y"
      ]
    },
    "adaptation": null
  },
  "screen.overlay_move": {
    "title": "Mover sobreposição para",
    "category": "Tela",
    "section": "Sobreposição",
    "groups": [
      {
        "category": "Tela",
        "section": "Sobreposição"
      }
    ],
    "aliases": [
      "Mover sobreposicao para",
      "Overlay Move To"
    ],
    "reference": {
      "id": "EVENT_OVERLAY_MOVE_TO",
      "version": "4.3.2",
      "path": "src/lib/events/eventOverlayMoveTo.js",
      "fieldKeys": [
        "x",
        "y",
        "speed"
      ]
    },
    "adaptation": null
  },
  "screen.overlay_hide": {
    "title": "Ocultar sobreposição",
    "category": "Tela",
    "section": "Sobreposição",
    "groups": [
      {
        "category": "Tela",
        "section": "Sobreposição"
      }
    ],
    "aliases": [
      "Ocultar sobreposicao",
      "Hide Overlay"
    ],
    "reference": {
      "id": "EVENT_OVERLAY_HIDE",
      "version": "4.3.2",
      "path": "src/lib/events/eventOverlayHide.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "timer.wait": {
    "title": "Aguardar",
    "category": "Temporizador",
    "section": null,
    "groups": [
      {
        "category": "Temporizador",
        "section": null
      }
    ],
    "aliases": [
      "Aguardar",
      "Wait"
    ],
    "reference": {
      "id": "EVENT_WAIT",
      "version": "4.3.2",
      "path": "src/lib/events/eventWait.js",
      "fieldKeys": [
        "time",
        "units",
        "frames"
      ]
    },
    "adaptation": null
  },
  "timer.idle": {
    "title": "Inativo",
    "category": "Temporizador",
    "section": null,
    "groups": [
      {
        "category": "Temporizador",
        "section": null
      }
    ],
    "aliases": [
      "Inativo",
      "Idle"
    ],
    "reference": {
      "id": "EVENT_IDLE",
      "version": "4.3.2",
      "path": "src/lib/events/eventIdle.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "timer.rate_limit": {
    "title": "Rate Limit",
    "category": "Temporizador",
    "section": null,
    "groups": [
      {
        "category": "Temporizador",
        "section": null
      }
    ],
    "aliases": [
      "Rate Limit"
    ],
    "reference": {
      "id": "EVENT_RATE_LIMIT",
      "version": "4.3.2",
      "path": "src/lib/events/eventRateLimit.js",
      "fieldKeys": [
        "variable",
        "time",
        "units",
        "frames",
        "true"
      ]
    },
    "adaptation": null
  },
  "timer.attach": {
    "title": "Anexar script temporizador",
    "category": "Temporizador",
    "section": "Script",
    "groups": [
      {
        "category": "Temporizador",
        "section": "Script"
      }
    ],
    "aliases": [
      "Anexar script temporizador",
      "Attach Timer Script"
    ],
    "reference": {
      "id": "EVENT_SET_TIMER_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventTimerScriptSet.js",
      "fieldKeys": [
        "timer",
        "duration",
        "units",
        "frames",
        "script"
      ]
    },
    "adaptation": null
  },
  "timer.restart": {
    "title": "Reiniciar temporizador",
    "category": "Temporizador",
    "section": "Script",
    "groups": [
      {
        "category": "Temporizador",
        "section": "Script"
      }
    ],
    "aliases": [
      "Reiniciar temporizador",
      "Restart Timer"
    ],
    "reference": {
      "id": "EVENT_TIMER_RESTART",
      "version": "4.3.2",
      "path": "src/lib/events/eventTimerRestart.js",
      "fieldKeys": [
        "timer"
      ]
    },
    "adaptation": null
  },
  "timer.remove": {
    "title": "Remover script temporizador",
    "category": "Temporizador",
    "section": "Script",
    "groups": [
      {
        "category": "Temporizador",
        "section": "Script"
      }
    ],
    "aliases": [
      "Remover script temporizador",
      "Remove Timer Script"
    ],
    "reference": {
      "id": "EVENT_TIMER_DISABLE",
      "version": "4.3.2",
      "path": "src/lib/events/eventTimerDisable.js",
      "fieldKeys": [
        "timer"
      ]
    },
    "adaptation": null
  },
  "variables.set_value": {
    "title": "Definir variável para valor",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      }
    ],
    "aliases": [
      "Definir variavel para valor",
      "Variable Set To Value"
    ],
    "reference": {
      "id": "EVENT_SET_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetToValue.js",
      "fieldKeys": [
        "variable",
        "value"
      ]
    },
    "adaptation": null
  },
  "variables.random_seed": {
    "title": "Definir variável para valor aleatório",
    "category": "Variáveis",
    "section": "Aleatório",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Aleatório"
      }
    ],
    "aliases": [
      "Semente de gerador de numero aleatorio",
      "Variable Set To Value"
    ],
    "reference": {
      "id": "EVENT_SET_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetToValue.js",
      "fieldKeys": [
        "variable",
        "value"
      ]
    },
    "adaptation": "Gera um valor numa faixa; não define a semente do gerador."
  },
  "variables.set_random_seed": {
    "title": "Definir semente aleatória",
    "category": "Variáveis",
    "section": "Aleatório",
    "groups": [
      {
        "category": "Matemática",
        "section": "Aleatório"
      },
      {
        "category": "Variáveis",
        "section": "Aleatório"
      }
    ],
    "aliases": [
      "Definir semente aleatoria",
      "Seed Random Number Generator"
    ],
    "reference": {
      "id": "EVENT_RNG_SEED",
      "version": "4.3.2",
      "path": "src/lib/events/eventSeedRng.js",
      "fieldKeys": []
    },
    "adaptation": "A sintaxe local define a semente a partir de um valor do projeto."
  },
  "variables.actor_direction": {
    "title": "Armazenar direção ator em variáveis",
    "category": "Variáveis",
    "section": "Ator",
    "groups": [
      {
        "category": "Ator",
        "section": "Variáveis"
      },
      {
        "category": "Variáveis",
        "section": "Ator"
      }
    ],
    "aliases": [
      "Armazenar direcao ator em variaveis",
      "Store Actor Direction In Variable"
    ],
    "reference": {
      "id": "EVENT_ACTOR_GET_DIRECTION",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorGetDirection.js",
      "fieldKeys": [
        "actorId",
        "direction"
      ]
    },
    "adaptation": null
  },
  "variables.actor_position": {
    "title": "Armazenar posição ator em variáveis",
    "category": "Variáveis",
    "section": "Ator",
    "groups": [
      {
        "category": "Ator",
        "section": "Variáveis"
      },
      {
        "category": "Variáveis",
        "section": "Ator"
      }
    ],
    "aliases": [
      "Armazenar posicao ator em variaveis",
      "Store Actor Position In Variables"
    ],
    "reference": {
      "id": "EVENT_ACTOR_GET_POSITION",
      "version": "4.3.2",
      "path": "src/lib/events/eventActorGetPosition.js",
      "fieldKeys": [
        "actorId",
        "vectorX",
        "vectorY"
      ]
    },
    "adaptation": null
  },
  "variables.false": {
    "title": "Definir variável para 'Falso'",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      }
    ],
    "aliases": [
      "Definir variavel para 'Falso'",
      "Variable Set To 'False'"
    ],
    "reference": {
      "id": "EVENT_SET_FALSE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetToFalse.js",
      "fieldKeys": [
        "variable"
      ]
    },
    "adaptation": null
  },
  "variables.true": {
    "title": "Definir variável para 'Verdadeiro'",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      }
    ],
    "aliases": [
      "Definir variavel para 'Verdadeiro'",
      "Variable Set To 'True'"
    ],
    "reference": {
      "id": "EVENT_SET_TRUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetToTrue.js",
      "fieldKeys": [
        "variable"
      ]
    },
    "adaptation": null
  },
  "variables.engine_field": {
    "title": "Armazenar campo do motor em variável",
    "category": "Variáveis",
    "section": "Campos do motor",
    "groups": [
      {
        "category": "Campos do motor",
        "section": null
      },
      {
        "category": "Variáveis",
        "section": "Campos do motor"
      }
    ],
    "aliases": [
      "Armazenar campo do motor em variavel",
      "Store Engine Field In Variable"
    ],
    "reference": {
      "id": "EVENT_ENGINE_FIELD_STORE",
      "version": "4.3.2",
      "path": "src/lib/events/eventEngineFieldStore.js",
      "fieldKeys": [
        "engineFieldKey",
        "value"
      ]
    },
    "adaptation": null
  },
  "variables.decrement": {
    "title": "Decréscimo de 1 à variável",
    "category": "Variáveis",
    "section": "Contador",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Contador"
      }
    ],
    "aliases": [
      "Decrescimo de 1 a variavel",
      "Variable Decrement By 1"
    ],
    "reference": {
      "id": "EVENT_DEC_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableDec.js",
      "fieldKeys": [
        "variable"
      ]
    },
    "adaptation": null
  },
  "variables.increment": {
    "title": "Incremento de 1 à variável",
    "category": "Variáveis",
    "section": "Contador",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Contador"
      }
    ],
    "aliases": [
      "Incremento de 1 a variavel",
      "Variable Increment By 1"
    ],
    "reference": {
      "id": "EVENT_INC_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableInc.js",
      "fieldKeys": [
        "variable"
      ]
    },
    "adaptation": null
  },
  "variables.if_value": {
    "title": "Se comparar variável com valor",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      },
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se comparar variavel com valor",
      "If Variable Compare With Value"
    ],
    "reference": {
      "id": "EVENT_IF_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfVariableValue.js",
      "fieldKeys": [
        "variable",
        "operator",
        "comparator",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "variables.if_variable": {
    "title": "Se comparar variável com variável",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      },
      {
        "category": "Fluxo de controle",
        "section": null
      }
    ],
    "aliases": [
      "Se comparar variavel com variavel",
      "If Variable Compare With Variable"
    ],
    "reference": {
      "id": "EVENT_IF_VALUE_COMPARE",
      "version": "4.3.2",
      "path": "src/lib/events/eventIfVariableCompare.js",
      "fieldKeys": [
        "vectorX",
        "operator",
        "vectorY",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "variables.add_flags": {
    "title": "Adicionar marcadores à variável",
    "category": "Variáveis",
    "section": "Marcadores",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Marcadores"
      }
    ],
    "aliases": [
      "Adicionar marcadores a variavel",
      "Variable Flags Add"
    ],
    "reference": {
      "id": "EVENT_ADD_FLAGS",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableAddFlags.js",
      "fieldKeys": [
        "variable",
        "flag${i + 1}"
      ]
    },
    "adaptation": null
  },
  "variables.set_flag": {
    "title": "Definir marcador da variável",
    "category": "Variáveis",
    "section": "Marcadores",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Marcadores"
      }
    ],
    "aliases": [
      "Definir marcador da variavel",
      "Variable Flags Set"
    ],
    "reference": {
      "id": "EVENT_SET_FLAGS",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetFlags.js",
      "fieldKeys": [
        "variable",
        "flag${i + 1}"
      ]
    },
    "adaptation": null
  },
  "variables.clear_flags": {
    "title": "Limpar marcadores da variável",
    "category": "Variáveis",
    "section": "Marcadores",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Marcadores"
      }
    ],
    "aliases": [
      "Limpar marcadores da variavel",
      "Variable Flags Clear"
    ],
    "reference": {
      "id": "EVENT_CLEAR_FLAGS",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableClearFlags.js",
      "fieldKeys": [
        "variable",
        "flag${i + 1}"
      ]
    },
    "adaptation": null
  },
  "variables.evaluate_math": {
    "title": "Definir variável para valor",
    "category": "Variáveis",
    "section": null,
    "groups": [
      {
        "category": "Variáveis",
        "section": null
      }
    ],
    "aliases": [
      "Avaliar expressao matematica",
      "Variable Set To Value"
    ],
    "reference": {
      "id": "EVENT_SET_VALUE",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableSetToValue.js",
      "fieldKeys": [
        "variable",
        "value"
      ]
    },
    "adaptation": "Esta entrada local atribui um valor; não representa o editor de expressão matemática do GB Studio."
  },
  "variables.math_functions": {
    "title": "Multiplicar variável por valor",
    "category": "Variáveis",
    "section": "Matemática",
    "groups": [
      {
        "category": "Matemática",
        "section": "Variáveis"
      },
      {
        "category": "Variáveis",
        "section": "Matemática"
      }
    ],
    "aliases": [
      "Funcoes matematicas",
      "Math Functions"
    ],
    "reference": {
      "id": "EVENT_VARIABLE_MATH",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariableMath.js",
      "fieldKeys": [
        "vectorX",
        "operation",
        "other",
        "vectorY",
        "value",
        "minValue",
        "maxValue",
        "clamp"
      ]
    },
    "adaptation": "Esta entrada local oferece multiplicação por valor, uma parte das operações matemáticas da referência."
  },
  "variables.reset_false": {
    "title": "Redefinir todas as variáveis para 'Falso'",
    "category": "Variáveis",
    "section": "Reiniciar",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Reiniciar"
      }
    ],
    "aliases": [
      "Redefinir todas as variaveis para 'Falso'",
      "Reset All Variables To 'False'"
    ],
    "reference": {
      "id": "EVENT_RESET_VARIABLES",
      "version": "4.3.2",
      "path": "src/lib/events/eventVariablesReset.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "variables.save_data": {
    "title": "Consultar presença do save em variável",
    "category": "Variáveis",
    "section": "Salvar dados",
    "groups": [
      {
        "category": "Variáveis",
        "section": "Salvar dados"
      }
    ],
    "aliases": [
      "Consultar presença do save em variável"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.group": {
    "title": "Agrupar evento",
    "category": "Diversos",
    "section": null,
    "groups": [
      {
        "category": "Diversos",
        "section": null
      }
    ],
    "aliases": [
      "Agrupar evento",
      "Event Group"
    ],
    "reference": {
      "id": "EVENT_GROUP",
      "version": "4.3.2",
      "path": "src/lib/events/eventGroup.js",
      "fieldKeys": [
        "true"
      ]
    },
    "adaptation": null
  },
  "misc.comment": {
    "title": "Comentar",
    "category": "Diversos",
    "section": null,
    "groups": [
      {
        "category": "Diversos",
        "section": null
      }
    ],
    "aliases": [
      "Comentar",
      "Comment"
    ],
    "reference": {
      "id": "EVENT_COMMENT",
      "version": "4.3.2",
      "path": "src/lib/events/eventComment.js",
      "fieldKeys": [
        "text"
      ]
    },
    "adaptation": null
  },
  "misc.gbvm": {
    "title": "Script GBVM",
    "category": "Diversos",
    "section": null,
    "groups": [
      {
        "category": "Diversos",
        "section": null
      }
    ],
    "aliases": [
      "Script GBVM",
      "GBVM Script"
    ],
    "reference": {
      "id": "EVENT_GBVM_SCRIPT",
      "version": "4.3.2",
      "path": "src/lib/events/eventGBVMScript.js",
      "fieldKeys": [
        "script",
        "references"
      ]
    },
    "adaptation": null
  },
  "misc.printer": {
    "title": "Imprimir usando a impressora GB",
    "category": "Diversos",
    "section": "Impressora",
    "groups": [
      {
        "category": "Diversos",
        "section": "Impressora"
      }
    ],
    "aliases": [
      "Imprimir usando a impressora GB",
      "Print Using GB Printer"
    ],
    "reference": {
      "id": "EVENT_PRINT",
      "version": "4.3.2",
      "path": "src/lib/events/eventPrint.js",
      "fieldKeys": [
        "source",
        "margin",
        "y",
        "height",
        "true",
        "false"
      ]
    },
    "adaptation": null
  },
  "misc.multiplayer_join": {
    "title": "Conexão: Entrar",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Conexao: Entrar",
      "Link: Join"
    ],
    "reference": {
      "id": "EVENT_LINK_JOIN",
      "version": "4.3.2",
      "path": "src/lib/events/eventLinkJoin.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "misc.multiplayer_close": {
    "title": "Conexão: Fechar",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Conexao: Fechar",
      "Link: Close"
    ],
    "reference": {
      "id": "EVENT_LINK_CLOSE",
      "version": "4.3.2",
      "path": "src/lib/events/eventLinkClose.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "misc.multiplayer_host": {
    "title": "Conexão: Hospedar",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Conexao: Hospedar",
      "Link: Host"
    ],
    "reference": {
      "id": "EVENT_LINK_HOST",
      "version": "4.3.2",
      "path": "src/lib/events/eventLinkStart.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "misc.multiplayer_transfer": {
    "title": "Conexão: Transferir",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Conexao: Transferir",
      "Link: Transfer"
    ],
    "reference": {
      "id": "EVENT_LINK_TRANSFER",
      "version": "4.3.2",
      "path": "src/lib/events/eventLinkTransfer.js",
      "fieldKeys": [
        "sendVariable",
        "receiveVariable",
        "size"
      ]
    },
    "adaptation": null
  },
  "misc.rumble_on": {
    "title": "Rumble: Ligar",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Rumble: Ligar"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.rumble_on_for": {
    "title": "Rumble: Vibrar por quadros",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Rumble: Vibrar por quadros"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.rumble_off": {
    "title": "Rumble: Desligar",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Rumble: Desligar"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.multiplayer4_open": {
    "title": "Multijogador 4P: Abrir sessão",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Multijogador 4P: Abrir sessao"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.multiplayer4_set": {
    "title": "Multijogador 4P: Definir dado",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Multijogador 4P: Definir dado"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.multiplayer4_sync": {
    "title": "Multijogador 4P: Sincronizar",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Multijogador 4P: Sincronizar"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.multiplayer4_read": {
    "title": "Multijogador 4P: Ler dados",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Multijogador 4P: Ler dados"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.multiplayer4_close": {
    "title": "Multijogador 4P: Fechar sessão",
    "category": "Diversos",
    "section": "Multijogador",
    "groups": [
      {
        "category": "Diversos",
        "section": "Multijogador"
      }
    ],
    "aliases": [
      "Multijogador 4P: Fechar sessao"
    ],
    "reference": null,
    "adaptation": null
  },
  "misc.lock_script": {
    "title": "Bloquear script",
    "category": "Diversos",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Bloquear script",
      "Script Lock"
    ],
    "reference": {
      "id": "EVENT_SCRIPT_LOCK",
      "version": "4.3.2",
      "path": "src/lib/events/eventScriptLock.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "misc.unlock_script": {
    "title": "Desbloquear script",
    "category": "Diversos",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Desbloquear script",
      "Script Unlock"
    ],
    "reference": {
      "id": "EVENT_SCRIPT_UNLOCK",
      "version": "4.3.2",
      "path": "src/lib/events/eventScriptUnlock.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "misc.start_segment": {
    "title": "Iniciar segmento",
    "category": "Diversos",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Iniciar segmento",
      "Thread Start"
    ],
    "reference": {
      "id": "EVENT_THREAD_START",
      "version": "4.3.2",
      "path": "src/lib/events/eventThreadStart.js",
      "fieldKeys": [
        "variable",
        "true"
      ]
    },
    "adaptation": "A referência executa uma sequência em paralelo e guarda um identificador; o contrato local ainda não possui esse consumidor."
  },
  "misc.stop_segment": {
    "title": "Parar segmento",
    "category": "Diversos",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Parar segmento",
      "Stop Thread"
    ],
    "reference": {
      "id": "EVENT_THREAD_STOP",
      "version": "4.3.2",
      "path": "src/lib/events/eventThreadStop.js",
      "fieldKeys": [
        "variable"
      ]
    },
    "adaptation": "A referência interrompe uma sequência pelo identificador; o contrato local ainda não possui esse consumidor."
  },
  "misc.pause_scene_type": {
    "title": "Pausar lógica para o tipo de cena",
    "category": "Diversos",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Cena",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Pausar logica para o tipo de cena",
      "Pause Logic For Scene Type"
    ],
    "reference": {
      "id": "EVENT_SCENE_UPDATE_PAUSE",
      "version": "4.3.2",
      "path": "src/lib/events/eventSceneUpdatePause.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "misc.resume_scene_type": {
    "title": "Retomar lógica para o tipo de cena",
    "category": "Diversos",
    "section": "Segmentos",
    "groups": [
      {
        "category": "Fluxo de controle",
        "section": "Segmentos"
      },
      {
        "category": "Cena",
        "section": "Segmentos"
      },
      {
        "category": "Diversos",
        "section": "Segmentos"
      }
    ],
    "aliases": [
      "Retomar logica para o tipo de cena",
      "Resume Logic For Scene Type"
    ],
    "reference": {
      "id": "EVENT_SCENE_UPDATE_RESUME",
      "version": "4.3.2",
      "path": "src/lib/events/eventSceneUpdateResume.js",
      "fieldKeys": []
    },
    "adaptation": null
  },
  "luta.start_match": {
    "title": "Iniciar partida de luta",
    "category": "Luta",
    "section": "Partida",
    "groups": [
      {
        "category": "Luta",
        "section": "Partida"
      }
    ],
    "aliases": [
      "Iniciar partida de luta"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.end_match": {
    "title": "Finalizar partida de luta",
    "category": "Luta",
    "section": "Partida",
    "groups": [
      {
        "category": "Luta",
        "section": "Partida"
      }
    ],
    "aliases": [
      "Finalizar partida de luta"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.set_super_gauge": {
    "title": "Definir medidor de super",
    "category": "Luta",
    "section": "Mecânicas",
    "groups": [
      {
        "category": "Luta",
        "section": "Mecânicas"
      }
    ],
    "aliases": [
      "Definir medidor de super"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.add_super_gauge": {
    "title": "Adicionar ao medidor de super",
    "category": "Luta",
    "section": "Mecânicas",
    "groups": [
      {
        "category": "Luta",
        "section": "Mecânicas"
      }
    ],
    "aliases": [
      "Adicionar ao medidor de super"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.set_guard_power": {
    "title": "Definir poder de guarda",
    "category": "Luta",
    "section": "Mecânicas",
    "groups": [
      {
        "category": "Luta",
        "section": "Mecânicas"
      }
    ],
    "aliases": [
      "Definir poder de guarda"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.set_ism_style": {
    "title": "Definir estilo ISM",
    "category": "Luta",
    "section": "Mecânicas",
    "groups": [
      {
        "category": "Luta",
        "section": "Mecânicas"
      }
    ],
    "aliases": [
      "Definir estilo ISM"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.trigger_super": {
    "title": "Ativar super ou ultra",
    "category": "Luta",
    "section": "Mecânicas",
    "groups": [
      {
        "category": "Luta",
        "section": "Mecânicas"
      }
    ],
    "aliases": [
      "Ativar super/ultra"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.enable_alpha_counter": {
    "title": "Habilitar Alpha Counter",
    "category": "Luta",
    "section": "Mecânicas",
    "groups": [
      {
        "category": "Luta",
        "section": "Mecânicas"
      }
    ],
    "aliases": [
      "Habilitar Alpha Counter"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.set_round_timer": {
    "title": "Definir tempo do round",
    "category": "Luta",
    "section": "Partida",
    "groups": [
      {
        "category": "Luta",
        "section": "Partida"
      }
    ],
    "aliases": [
      "Definir timer do round"
    ],
    "reference": null,
    "adaptation": null
  },
  "luta.set_rounds_to_win": {
    "title": "Definir rounds para vitória",
    "category": "Luta",
    "section": "Partida",
    "groups": [
      {
        "category": "Luta",
        "section": "Partida"
      }
    ],
    "aliases": [
      "Definir rounds para vitoria"
    ],
    "reference": null,
    "adaptation": null
  }
};
