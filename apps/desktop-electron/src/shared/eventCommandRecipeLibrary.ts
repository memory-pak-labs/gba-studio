// Generated from the legacy Swift event command references. Keep edits deliberate; this is the Electron registry source of truth.

export interface EventCommandRecipeStepDefinition {
  commandTemplate: string;
  category: string;
  detail: string;
}

export interface EventCommandRecipeDefinition {
  id: string;
  title: string;
  category: string;
  steps: EventCommandRecipeStepDefinition[];
}

export const eventCommandRecipeLibrary: EventCommandRecipeDefinition[] = [
  {
    "id": "npcTalk",
    "title": "NPC falar",
    "category": "Dialogo",
    "steps": [
      {
        "commandTemplate": "show_dialogue {dialogue}",
        "category": "Dialogo",
        "detail": "NPC falar"
      }
    ]
  },
  {
    "id": "dialogueChoiceBranch",
    "title": "Dialogo com escolha",
    "category": "Dialogo",
    "steps": [
      {
        "commandTemplate": "show_choice {choiceDialogue}",
        "category": "Dialogo",
        "detail": "Mostra as escolhas do dialogo"
      },
      {
        "commandTemplate": "choice_event {choiceDialogue} 0 {event}",
        "category": "Fluxo de controle",
        "detail": "Liga a primeira escolha a um evento"
      }
    ]
  },
  {
    "id": "battleEncounter",
    "title": "Encontro de batalha",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "fade_out 15",
        "category": "Cena",
        "detail": "Inicia a transicao do encontro"
      },
      {
        "commandTemplate": "set_flag battle.active true",
        "category": "Fluxo de controle",
        "detail": "Marca o encontro como ativo"
      },
      {
        "commandTemplate": "change_scene {room} 1 1",
        "category": "Cena",
        "detail": "Entra na sala de batalha"
      },
      {
        "commandTemplate": "fade_in 15",
        "category": "Cena",
        "detail": "Conclui a transicao"
      }
    ]
  },
  {
    "id": "roomIntro",
    "title": "Entrada de sala",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "play_music {music}",
        "category": "Audio",
        "detail": "Inicia a musica da sala"
      },
      {
        "commandTemplate": "fade_in 20",
        "category": "Cena",
        "detail": "Revela a sala"
      }
    ]
  },
  {
    "id": "doorChangeScene",
    "title": "Porta trocar de cena",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "fade_out 20",
        "category": "Cena",
        "detail": "Porta trocar de cena"
      },
      {
        "commandTemplate": "change_scene {room} 1 1",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "fade_in 20",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "chestGiveItem",
    "title": "Bau dar item",
    "category": "Inventario",
    "steps": [
      {
        "commandTemplate": "has_item chest_key 1",
        "category": "Inventario",
        "detail": "Bau dar item"
      },
      {
        "commandTemplate": "add_item chest_key 1",
        "category": "Inventario",
        "detail": ""
      },
      {
        "commandTemplate": "set_flag chest.opened true",
        "category": "Inventario",
        "detail": ""
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Inventario",
        "detail": ""
      }
    ]
  },
  {
    "id": "triggerPlayMusic",
    "title": "Trigger tocar musica",
    "category": "Audio",
    "steps": [
      {
        "commandTemplate": "play_music {music}",
        "category": "Audio",
        "detail": "Trigger tocar musica"
      }
    ]
  },
  {
    "id": "savePoint",
    "title": "Save point",
    "category": "Salvar dados",
    "steps": [
      {
        "commandTemplate": "save_game 0",
        "category": "Salvar dados",
        "detail": "Save point"
      },
      {
        "commandTemplate": "store_save_variable 0 save.exists",
        "category": "Salvar dados",
        "detail": ""
      },
      {
        "commandTemplate": "show_dialogue {dialogue}",
        "category": "Salvar dados",
        "detail": ""
      }
    ]
  },
  {
    "id": "simpleCutscene",
    "title": "Cutscene simples",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "fade_out 15",
        "category": "Cena",
        "detail": "Cutscene simples"
      },
      {
        "commandTemplate": "show_dialogue {dialogue}",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "camera_follow_player",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "fade_in 15",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "bootSplash",
    "title": "Splash de abertura",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "fade_in 20",
        "category": "Cena",
        "detail": "Splash de abertura"
      },
      {
        "commandTemplate": "wait 60",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "show_dialogue {dialogue}",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "fade_out 20",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "change_scene {room} 1 1",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "shop",
    "title": "Loja",
    "category": "Ator",
    "steps": [
      {
        "commandTemplate": "open_shop {actor}",
        "category": "Ator",
        "detail": "Loja"
      }
    ]
  },
  {
    "id": "buttonCallEvent",
    "title": "Botao chamar evento",
    "category": "Dialogo",
    "steps": [
      {
        "commandTemplate": "if_button a",
        "category": "Dialogo",
        "detail": "Botao chamar evento"
      },
      {
        "commandTemplate": "call_event {event}",
        "category": "Dialogo",
        "detail": ""
      }
    ]
  },
  {
    "id": "moveActorAndWait",
    "title": "Mover ator e esperar",
    "category": "Ator",
    "steps": [
      {
        "commandTemplate": "move_actor {actor} 1 0",
        "category": "Ator",
        "detail": "Mover ator e esperar"
      },
      {
        "commandTemplate": "wait 20",
        "category": "Ator",
        "detail": ""
      }
    ]
  },
  {
    "id": "questJournal",
    "title": "Quest com progresso",
    "category": "Quest",
    "steps": [
      {
        "commandTemplate": "group quest_main",
        "category": "Quest",
        "detail": "Quest com progresso"
      },
      {
        "commandTemplate": "set_flag quest.main.started true",
        "category": "Quest",
        "detail": ""
      },
      {
        "commandTemplate": "set_variable quest.main.step 1",
        "category": "Quest",
        "detail": ""
      },
      {
        "commandTemplate": "show_dialogue {dialogue}",
        "category": "Quest",
        "detail": ""
      },
      {
        "commandTemplate": "add_item quest_log 1",
        "category": "Quest",
        "detail": ""
      }
    ]
  },
  {
    "id": "tileSwapSequence",
    "title": "Tile swap animado",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "replace_tile 2 2 1 bg2",
        "category": "Cena",
        "detail": "Tile swap animado"
      },
      {
        "commandTemplate": "wait 8",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "replace_tile_sequence 2 2 1 3 bg2",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "replace_tile 2 2 0 bg2",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "doorTileSwap",
    "title": "Porta por tile swap",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "replace_tile 4 6 17 bg2",
        "category": "Cena",
        "detail": "Porta por tile swap"
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "wait 8",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "replace_tile_sequence 4 6 18 3 bg2",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "animatedWaterTiles",
    "title": "Agua animada por tiles",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "replace_tile_sequence 2 2 32 4 bg2",
        "category": "Cena",
        "detail": "Agua animada por tiles"
      },
      {
        "commandTemplate": "wait 8",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "replace_tile_sequence 2 2 36 4 bg2",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "hudTileReveal",
    "title": "HUD reveal por tiles",
    "category": "HUD",
    "steps": [
      {
        "commandTemplate": "replace_tile_sequence 0 0 64 4 bg0",
        "category": "HUD",
        "detail": "HUD reveal por tiles"
      },
      {
        "commandTemplate": "wait 12",
        "category": "HUD",
        "detail": ""
      }
    ]
  },
  {
    "id": "backgroundTileLoop",
    "title": "Loop de tiles no BG",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "group background_loop",
        "category": "Cena",
        "detail": "Loop de tiles no BG"
      },
      {
        "commandTemplate": "replace_tile_sequence 4 6 16 4 bg2",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "wait 18",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "replace_tile 4 6 0 bg2",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "runnerSpawnLoop",
    "title": "Loop de runner",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "group runner_loop",
        "category": "Cena",
        "detail": "Loop de runner"
      },
      {
        "commandTemplate": "camera_move 1 0",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "rate_limit 30",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "timer_attach 60 {event}",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "call_event {event}",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "shmupWave",
    "title": "Onda SHMUP",
    "category": "Ator",
    "steps": [
      {
        "commandTemplate": "projectile_load_slot 0 {sprite} 1 100",
        "category": "Ator",
        "detail": "Onda SHMUP"
      },
      {
        "commandTemplate": "launch_projectile_slot {actor} 0 up",
        "category": "Ator",
        "detail": ""
      },
      {
        "commandTemplate": "wait 8",
        "category": "Ator",
        "detail": ""
      },
      {
        "commandTemplate": "launch_projectile_slot {actor} 0 up",
        "category": "Ator",
        "detail": ""
      }
    ]
  },
  {
    "id": "projectileSpreadWave",
    "title": "Spread de projeteis",
    "category": "Ator",
    "steps": [
      {
        "commandTemplate": "projectile_load_slot 0 {sprite} 1 100",
        "category": "Ator",
        "detail": "Spread de projeteis"
      },
      {
        "commandTemplate": "launch_projectile_slot {actor} 0 up",
        "category": "Ator",
        "detail": ""
      },
      {
        "commandTemplate": "launch_projectile_slot {actor} 0 up_left",
        "category": "Ator",
        "detail": ""
      },
      {
        "commandTemplate": "launch_projectile_slot {actor} 0 up_right",
        "category": "Ator",
        "detail": ""
      }
    ]
  },
  {
    "id": "cooperativeSegmentLoop",
    "title": "Segmento cooperativo",
    "category": "Controle",
    "steps": [
      {
        "commandTemplate": "group runtime_loop",
        "category": "Controle",
        "detail": "Segmento cooperativo"
      },
      {
        "commandTemplate": "start_segment runtime_loop",
        "category": "Controle",
        "detail": ""
      },
      {
        "commandTemplate": "rate_limit 30",
        "category": "Controle",
        "detail": ""
      },
      {
        "commandTemplate": "timer_attach 90 {event}",
        "category": "Controle",
        "detail": ""
      },
      {
        "commandTemplate": "call_event {event}",
        "category": "Controle",
        "detail": ""
      },
      {
        "commandTemplate": "stop_segment runtime_loop",
        "category": "Controle",
        "detail": ""
      }
    ]
  },
  {
    "id": "scenePulseLoop",
    "title": "Pulso de cena",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "group scene_pulse",
        "category": "Cena",
        "detail": "Pulso de cena"
      },
      {
        "commandTemplate": "start_segment scene_pulse",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "visual_effect palette_flash bg0 18 70",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "timer_attach 90 {event}",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "stockedShop",
    "title": "Loja com estoque",
    "category": "Loja",
    "steps": [
      {
        "commandTemplate": "group shop_stock",
        "category": "Loja",
        "detail": "Loja com estoque"
      },
      {
        "commandTemplate": "set_variable shop.stock.potion 3",
        "category": "Loja",
        "detail": ""
      },
      {
        "commandTemplate": "set_variable shop.price.potion 10",
        "category": "Loja",
        "detail": ""
      },
      {
        "commandTemplate": "open_shop {actor}",
        "category": "Loja",
        "detail": ""
      }
    ]
  },
  {
    "id": "walletHUD",
    "title": "Wallet e HUD",
    "category": "HUD",
    "steps": [
      {
        "commandTemplate": "group wallet_hud",
        "category": "HUD",
        "detail": "Wallet e HUD"
      },
      {
        "commandTemplate": "set_variable wallet.gold 0",
        "category": "HUD",
        "detail": ""
      },
      {
        "commandTemplate": "add_variable wallet.gold 5",
        "category": "HUD",
        "detail": ""
      },
      {
        "commandTemplate": "set_variable hud.gold.visible 1",
        "category": "HUD",
        "detail": ""
      }
    ]
  },
  {
    "id": "rewardBundle",
    "title": "Recompensa pronta",
    "category": "Recompensa",
    "steps": [
      {
        "commandTemplate": "group reward_bundle",
        "category": "Recompensa",
        "detail": "Recompensa pronta"
      },
      {
        "commandTemplate": "add_item potion 1",
        "category": "Recompensa",
        "detail": ""
      },
      {
        "commandTemplate": "add_variable wallet.gold 25",
        "category": "Recompensa",
        "detail": ""
      },
      {
        "commandTemplate": "set_flag reward.bundle.claimed true",
        "category": "Recompensa",
        "detail": ""
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Recompensa",
        "detail": ""
      }
    ]
  },
  {
    "id": "buttonMenu",
    "title": "Menu no botao",
    "category": "Menu",
    "steps": [
      {
        "commandTemplate": "if_button start",
        "category": "Menu",
        "detail": "Menu no botao"
      },
      {
        "commandTemplate": "open_menu",
        "category": "Menu",
        "detail": ""
      }
    ]
  },
  {
    "id": "variableCursorMenu",
    "title": "Menu com cursor variavel",
    "category": "Menu",
    "steps": [
      {
        "commandTemplate": "group variable_cursor_menu",
        "category": "Menu",
        "detail": "Menu com cursor variavel"
      },
      {
        "commandTemplate": "if_button down",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "add_variable menu.index 1",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "mod_variable menu.index 3",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "if_button up",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "add_variable menu.index -1",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "mod_variable menu.index 3",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "if_button a",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "if_variable menu.index 0",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "call_event {event}",
        "category": "Menu",
        "detail": ""
      }
    ]
  },
  {
    "id": "declarativeChoiceMenu",
    "title": "Menu declarativo",
    "category": "Menu",
    "steps": [
      {
        "commandTemplate": "group declarative_choice_menu",
        "category": "Menu",
        "detail": "Menu declarativo"
      },
      {
        "commandTemplate": "show_choice {dialogue}",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "choice_event {dialogue} 0 {event}",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "choice_event {dialogue} 1 {event}",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "choice_event {dialogue} 2 {event}",
        "category": "Menu",
        "detail": ""
      }
    ]
  },
  {
    "id": "advancedDialogMenu",
    "title": "Dialogo/menu avancado",
    "category": "Menu",
    "steps": [
      {
        "commandTemplate": "group advanced_dialog_menu",
        "category": "Menu",
        "detail": "Dialogo/menu avancado"
      },
      {
        "commandTemplate": "show_dialogue_speaker {dialogue} {actor}",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "show_choice {dialogue}",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "choice_event {dialogue} 0 {event}",
        "category": "Menu",
        "detail": ""
      },
      {
        "commandTemplate": "choice_event {dialogue} 1 {event}",
        "category": "Menu",
        "detail": ""
      }
    ]
  },
  {
    "id": "scheduledRoutine",
    "title": "Rotina agendada",
    "category": "Controle",
    "steps": [
      {
        "commandTemplate": "group scheduled_routine",
        "category": "Controle",
        "detail": "Rotina agendada"
      },
      {
        "commandTemplate": "rate_limit 30",
        "category": "Controle",
        "detail": ""
      },
      {
        "commandTemplate": "timer_attach 60 {event}",
        "category": "Controle",
        "detail": ""
      },
      {
        "commandTemplate": "call_event {event}",
        "category": "Controle",
        "detail": ""
      },
      {
        "commandTemplate": "timer_remove {event}",
        "category": "Controle",
        "detail": ""
      }
    ]
  },
  {
    "id": "compactVariableFlags",
    "title": "Flags compactas",
    "category": "Variavel",
    "steps": [
      {
        "commandTemplate": "group compact_variable_flags",
        "category": "Variavel",
        "detail": "Flags compactas"
      },
      {
        "commandTemplate": "set_variable_flags story.flags 1",
        "category": "Variavel",
        "detail": ""
      },
      {
        "commandTemplate": "add_variable_flags story.flags 2",
        "category": "Variavel",
        "detail": ""
      },
      {
        "commandTemplate": "clear_variable_flags story.flags 1",
        "category": "Variavel",
        "detail": ""
      },
      {
        "commandTemplate": "if_variable story.flags 2",
        "category": "Variavel",
        "detail": ""
      }
    ]
  },
  {
    "id": "sceneByVariable",
    "title": "Cena por variavel",
    "category": "Cena",
    "steps": [
      {
        "commandTemplate": "group scene_by_variable",
        "category": "Cena",
        "detail": "Cena por variavel"
      },
      {
        "commandTemplate": "if_variable story.scene_index 0",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "change_scene {room} 1 1",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "if_variable story.scene_index 1",
        "category": "Cena",
        "detail": ""
      },
      {
        "commandTemplate": "change_scene {room} 1 1",
        "category": "Cena",
        "detail": ""
      }
    ]
  },
  {
    "id": "platformerJumpAssist",
    "title": "Pulo plataforma",
    "category": "Plataforma",
    "steps": [
      {
        "commandTemplate": "group platformer_jump_assist",
        "category": "Plataforma",
        "detail": "Pulo plataforma"
      },
      {
        "commandTemplate": "set_platform_state platform.coyote_time 6",
        "category": "Plataforma",
        "detail": ""
      },
      {
        "commandTemplate": "set_platform_state platform.jump_buffer 6",
        "category": "Plataforma",
        "detail": ""
      },
      {
        "commandTemplate": "set_platform_state platform.air_control 1",
        "category": "Plataforma",
        "detail": ""
      },
      {
        "commandTemplate": "set_platform_state platform.variable_jump 1",
        "category": "Plataforma",
        "detail": ""
      }
    ]
  },
  {
    "id": "platformerSlopePlatform",
    "title": "Slopes e plataforma",
    "category": "Plataforma",
    "steps": [
      {
        "commandTemplate": "group platformer_surfaces",
        "category": "Plataforma",
        "detail": "Slopes e plataforma"
      },
      {
        "commandTemplate": "set_platform_state platform.slopes 1",
        "category": "Plataforma",
        "detail": ""
      },
      {
        "commandTemplate": "set_platform_state platform.drop_through 1",
        "category": "Plataforma",
        "detail": ""
      },
      {
        "commandTemplate": "attach_platform_callback on_land {event}",
        "category": "Plataforma",
        "detail": ""
      },
      {
        "commandTemplate": "attach_platform_callback on_leave_ground {event}",
        "category": "Plataforma",
        "detail": ""
      }
    ]
  },
  {
    "id": "cutsceneImpactFX",
    "title": "Cutscene impacto",
    "category": "Cutscene FX",
    "steps": [
      {
        "commandTemplate": "group cutscene_impact_fx",
        "category": "Cutscene FX",
        "detail": "Cutscene impacto"
      },
      {
        "commandTemplate": "fade_out 8",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "shake_screen 12",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "overlay_show 0 104 160 32",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "visual_effect palette_flash bg0 18 70",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "fade_in 12",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "overlay_hide 12",
        "category": "Cutscene FX",
        "detail": ""
      }
    ]
  },
  {
    "id": "cutsceneParallaxBGTrick",
    "title": "Parallax e BG trick",
    "category": "Cutscene FX",
    "steps": [
      {
        "commandTemplate": "group cutscene_bg_trick",
        "category": "Cutscene FX",
        "detail": "Parallax e BG trick"
      },
      {
        "commandTemplate": "visual_effect parallax_line_scroll bg2 90 35",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "visual_effect wave bg1 60 24",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "set_camera_property shake 4",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "replace_tile_sequence 4 6 16 4 bg2",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "wait 18",
        "category": "Cutscene FX",
        "detail": ""
      },
      {
        "commandTemplate": "replace_tile 4 6 0 bg2",
        "category": "Cutscene FX",
        "detail": ""
      }
    ]
  },
  {
    "id": "audioRoutinePattern",
    "title": "Rotina de audio",
    "category": "Audio",
    "steps": [
      {
        "commandTemplate": "group music.loop_a",
        "category": "Audio",
        "detail": "Rotina de audio"
      },
      {
        "commandTemplate": "mute_audio_channel music false",
        "category": "Audio",
        "detail": ""
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Audio",
        "detail": ""
      },
      {
        "commandTemplate": "run_audio_routine {music}",
        "category": "Audio",
        "detail": ""
      }
    ]
  },
  {
    "id": "textInputPlayerName",
    "title": "Input de nome",
    "category": "Dialogo",
    "steps": [
      {
        "commandTemplate": "group text_input_name",
        "category": "Dialogo",
        "detail": "Input de nome"
      },
      {
        "commandTemplate": "open_text_input player.name 8 latin_upper",
        "category": "Dialogo",
        "detail": ""
      },
      {
        "commandTemplate": "show_dialogue {dialogue}",
        "category": "Dialogo",
        "detail": ""
      }
    ]
  },
  {
    "id": "equipMenuFiveSlots",
    "title": "Equipamento 5 slots",
    "category": "Inventario",
    "steps": [
      {
        "commandTemplate": "group equip_menu",
        "category": "Inventario",
        "detail": "Equipamento 5 slots"
      },
      {
        "commandTemplate": "set_equipped_item 0 sword",
        "category": "Inventario",
        "detail": ""
      },
      {
        "commandTemplate": "set_equipped_item 1 pickaxe",
        "category": "Inventario",
        "detail": ""
      },
      {
        "commandTemplate": "open_equip_menu 5 true",
        "category": "Inventario",
        "detail": ""
      }
    ]
  },
  {
    "id": "fishingSpotBasic",
    "title": "Ponto de pesca",
    "category": "Minigame",
    "steps": [
      {
        "commandTemplate": "group fishing_spot",
        "category": "Minigame",
        "detail": "Ponto de pesca"
      },
      {
        "commandTemplate": "random_variable fishing.wait 180 600",
        "category": "Minigame",
        "detail": ""
      },
      {
        "commandTemplate": "wait 30",
        "category": "Minigame",
        "detail": ""
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Minigame",
        "detail": ""
      },
      {
        "commandTemplate": "add_item fish 1",
        "category": "Minigame",
        "detail": ""
      },
      {
        "commandTemplate": "show_dialogue {dialogue}",
        "category": "Minigame",
        "detail": ""
      }
    ]
  },
  {
    "id": "pushBlockPuzzle",
    "title": "Bloco empurravel",
    "category": "Puzzle",
    "steps": [
      {
        "commandTemplate": "group push_block_puzzle",
        "category": "Puzzle",
        "detail": "Bloco empurravel"
      },
      {
        "commandTemplate": "push_actor {actor} tile hole",
        "category": "Puzzle",
        "detail": ""
      },
      {
        "commandTemplate": "if_actor_at_position {actor} 4 4",
        "category": "Puzzle",
        "detail": ""
      },
      {
        "commandTemplate": "set_flag puzzle.push_block.solved true",
        "category": "Puzzle",
        "detail": ""
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Puzzle",
        "detail": ""
      }
    ]
  },
  {
    "id": "holdToRun",
    "title": "Segurar para correr",
    "category": "Movimento",
    "steps": [
      {
        "commandTemplate": "group hold_to_run",
        "category": "Movimento",
        "detail": "Segurar para correr"
      },
      {
        "commandTemplate": "set_player_speed_profile 100 160 a 0",
        "category": "Movimento",
        "detail": ""
      }
    ]
  },
  {
    "id": "swimFromDock",
    "title": "Nadar a partir do dock",
    "category": "Movimento",
    "steps": [
      {
        "commandTemplate": "group swim_from_dock",
        "category": "Movimento",
        "detail": "Nadar a partir do dock"
      },
      {
        "commandTemplate": "set_player_movement_state swimming water",
        "category": "Movimento",
        "detail": ""
      },
      {
        "commandTemplate": "play_sfx {sfx}",
        "category": "Movimento",
        "detail": ""
      }
    ]
  },
  {
    "id": "padlockFourDigits",
    "title": "Cadeado 4 digitos",
    "category": "Puzzle",
    "steps": [
      {
        "commandTemplate": "group padlock_4_digits",
        "category": "Puzzle",
        "detail": "Cadeado 4 digitos"
      },
      {
        "commandTemplate": "open_code_lock story.padlock 4 4321",
        "category": "Puzzle",
        "detail": ""
      },
      {
        "commandTemplate": "if_variable story.padlock 4321",
        "category": "Puzzle",
        "detail": ""
      },
      {
        "commandTemplate": "set_flag puzzle.padlock.open true",
        "category": "Puzzle",
        "detail": ""
      }
    ]
  },
  {
    "id": "digitalClockHUD",
    "title": "Relogio digital",
    "category": "Tempo",
    "steps": [
      {
        "commandTemplate": "group digital_clock_hud",
        "category": "Tempo",
        "detail": "Relogio digital"
      },
      {
        "commandTemplate": "set_variable clock.hour 6",
        "category": "Tempo",
        "detail": ""
      },
      {
        "commandTemplate": "set_variable clock.minute 0",
        "category": "Tempo",
        "detail": ""
      },
      {
        "commandTemplate": "start_game_clock 10 180 hud",
        "category": "Tempo",
        "detail": ""
      }
    ]
  },
  {
    "id": "currencyCounterHUD",
    "title": "Contador de moeda",
    "category": "HUD",
    "steps": [
      {
        "commandTemplate": "group currency_counter_hud",
        "category": "HUD",
        "detail": "Contador de moeda"
      },
      {
        "commandTemplate": "modify_wallet wallet.gold 0 999",
        "category": "HUD",
        "detail": ""
      },
      {
        "commandTemplate": "show_number_hud wallet.gold 200 8 3",
        "category": "HUD",
        "detail": ""
      }
    ]
  },
  {
    "id": "hpBarHUD",
    "title": "Barra de HP",
    "category": "HUD",
    "steps": [
      {
        "commandTemplate": "group hp_bar_hud",
        "category": "HUD",
        "detail": "Barra de HP"
      },
      {
        "commandTemplate": "set_stat hp 16 16",
        "category": "HUD",
        "detail": ""
      },
      {
        "commandTemplate": "show_stat_bar hp 8 8 64 horizontal",
        "category": "HUD",
        "detail": ""
      }
    ]
  },
  {
    "id": "energyDrainLoop",
    "title": "Energia ao andar",
    "category": "HUD",
    "steps": [
      {
        "commandTemplate": "group energy_drain_loop",
        "category": "HUD",
        "detail": "Energia ao andar"
      },
      {
        "commandTemplate": "set_stat energy 10 10",
        "category": "HUD",
        "detail": ""
      },
      {
        "commandTemplate": "rate_limit 30",
        "category": "HUD",
        "detail": ""
      },
      {
        "commandTemplate": "modify_stat energy -1",
        "category": "HUD",
        "detail": ""
      }
    ]
  },
  {
    "id": "heartHPHUD",
    "title": "HP por coracoes",
    "category": "HUD",
    "steps": [
      {
        "commandTemplate": "group hp_hearts_hud",
        "category": "HUD",
        "detail": "HP por coracoes"
      },
      {
        "commandTemplate": "set_stat hp 16 16",
        "category": "HUD",
        "detail": ""
      },
      {
        "commandTemplate": "show_hearts hp 4 4",
        "category": "HUD",
        "detail": ""
      }
    ]
  },
  {
    "id": "dialogueNameTag",
    "title": "Nome no dialogo",
    "category": "Dialogo",
    "steps": [
      {
        "commandTemplate": "group dialogue_name_tag",
        "category": "Dialogo",
        "detail": "Nome no dialogo"
      },
      {
        "commandTemplate": "show_dialogue_speaker {dialogue} Narrador",
        "category": "Dialogo",
        "detail": ""
      }
    ]
  },
  {
    "id": "weekdayClockHUD",
    "title": "Relogio com semana",
    "category": "Tempo",
    "steps": [
      {
        "commandTemplate": "group weekday_clock_hud",
        "category": "Tempo",
        "detail": "Relogio com semana"
      },
      {
        "commandTemplate": "set_variable calendar.weekday 0",
        "category": "Tempo",
        "detail": ""
      },
      {
        "commandTemplate": "start_game_clock 10 180 hud",
        "category": "Tempo",
        "detail": ""
      },
      {
        "commandTemplate": "if_variable clock.hour 24",
        "category": "Tempo",
        "detail": ""
      },
      {
        "commandTemplate": "add_variable calendar.weekday 1",
        "category": "Tempo",
        "detail": ""
      },
      {
        "commandTemplate": "mod_variable calendar.weekday 7",
        "category": "Tempo",
        "detail": ""
      }
    ]
  },
  {
    "id": "lutaMatch",
    "title": "Partida de Luta Completa",
    "category": "Luta",
    "steps": [
      {
        "commandTemplate": "fade_out 15",
        "category": "Cena",
        "detail": "Inicia a transicao para a arena"
      },
      {
        "commandTemplate": "luta_start_match {stage}",
        "category": "Luta",
        "detail": "Inicia a partida na arena especificada"
      },
      {
        "commandTemplate": "fade_in 15",
        "category": "Cena",
        "detail": "Revela a arena"
      }
    ]
  },
  {
    "id": "lutaRoundEnd",
    "title": "Final de Round de Luta",
    "category": "Luta",
    "steps": [
      {
        "commandTemplate": "luta_end_match {winner}",
        "category": "Luta",
        "detail": "Finaliza a partida declarando o vencedor"
      },
      {
        "commandTemplate": "fade_out 20",
        "category": "Cena",
        "detail": "Transicao para resultado"
      }
    ]
  },
  {
    "id": "lutaSuperActivation",
    "title": "Ativacao de Super/Ultra",
    "category": "Luta",
    "steps": [
      {
        "commandTemplate": "play_sfx super_activation.wav",
        "category": "Audio",
        "detail": "Som de ativacao do super"
      },
      {
        "commandTemplate": "luta_trigger_super {actor} {move_id}",
        "category": "Luta",
        "detail": "Ativa o movimento super/ultra"
      },
      {
        "commandTemplate": "shake_screen 8 4",
        "category": "Cena",
        "detail": "Efeito de tela tremendo"
      }
    ]
  },
  {
    "id": "lutaAlphaCounter",
    "title": "Alpha Counter",
    "category": "Luta",
    "steps": [
      {
        "commandTemplate": "if_flag luta.guard_active",
        "category": "Fluxo de controle",
        "detail": "Verifica se esta em guarda"
      },
      {
        "commandTemplate": "luta_enable_alpha_counter {actor} true",
        "category": "Luta",
        "detail": "Habilita o Alpha Counter"
      },
      {
        "commandTemplate": "luta_add_super_gauge {actor} -10",
        "category": "Luta",
        "detail": "Consome medidor de super"
      }
    ]
  }
];

export const eventCommandRecipeRuntimeVerbs = new Set(
  eventCommandRecipeLibrary.flatMap((recipe) => (
    recipe.steps.map((step) => step.commandTemplate.split(/\s+/).filter(Boolean)[0] ?? "noop")
  ))
);
