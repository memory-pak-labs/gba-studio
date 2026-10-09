#!/usr/bin/env python3

import os
from pathlib import Path
import subprocess
import tempfile


MAX_PLATFORMER_RUNTIME_STACK_BYTES = 1024


def require(source: str, snippet: str, message: str) -> None:
    if snippet not in source:
        raise AssertionError(message)


def reject(source: str, snippet: str, message: str) -> None:
    if snippet in source:
        raise AssertionError(message)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    source = (repo_root / "examples" / "platformer_basic" / "src" / "main.cpp").read_text(
        encoding="utf-8"
    )
    topdown_source = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(
        encoding="utf-8"
    )
    isometric_source = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(
        encoding="utf-8"
    )

    require(
        source,
        "int platformer_npc_wait_frames[max_room_npcs];",
        "o runtime Platformer precisa manter espera independente por NPC",
    )
    physics = source.index("gbs::update_platformer_actor(room.collision, player, player_input")
    require(source, "event_state.actor_condition_tile_size = 8;",
            "condicoes de posicao dos atores usam tiles de 8 pixels, nao pixels")
    require(source, "const bool dialogue_was_visible = dialogue.visible;",
            "A que abre dialogo nao deve avancar a primeira pagina")
    require(source, "const gbs::InputState player_input = player_event_active && !dialogue.visible",
            "interagir com A nao deve disparar salto junto com o dialogo")
    contact = source.index("update_platformer_npc_player_hit_scripts(*room_data, event_state, player.bounds_pixels);")
    rollback = source.index("player.bounds_pixels = player_bounds_before_update;", physics)
    assert physics < contact < rollback, "contato deve observar a posicao tentada antes do rollback"
    require(source, "player.collision_offset_pixels.x * 2 + player.bounds_pixels.width,",
            "espelhamento deve preservar o centro da hitbox do player")
    require(source, "platformer_npc_runtimes[index].actor.direction == 2, // Event direction: left.",
            "NPCs devem refletir a direcao no sprite renderizado")
    require(
        source,
        "platformer_npc_wait_frames[index] = 0;",
        "a espera local de NPC precisa ser reiniciada ao carregar a sala",
    )
    require(
        source,
        "void consume_event_state(gbs::EventState& event_state, int* local_wait_frames = nullptr)",
        "consume_event_state precisa distinguir espera global de espera local",
    )
    require(
        source,
        "*local_wait_frames += event_state.wait_frames;",
        "Wait de runner local precisa permanecer no runner local",
    )
    require(
        source,
        "platformer_event_wait_frames = event_state.wait_frames;",
        "Wait de eventos globais precisa continuar pausando o runtime",
    )
    require(
        source,
        "if (platformer_npc_wait_frames[index] > 0) {\n"
        "            --platformer_npc_wait_frames[index];\n"
        "            continue;\n"
        "        }",
        "cada runner de NPC precisa consumir sua própria espera sem bloquear a física",
    )
    require(
        source,
        "consume_event_state(event_state, &platformer_npc_wait_frames[index]);",
        "saídas do runner de NPC precisam encaminhar Wait ao temporizador local",
    )
    require(
        source,
        "gbs::stream_resource_bank_group_with_uploads(",
        "o Platformer precisa usar o mesmo caminho transacional de upload de paletas e tiles dos demais runtimes",
    )
    require(
        source,
        "gbs::HudState hud;",
        "o Platformer precisa manter o estado da HUD fora da pilha do loop principal",
    )
    require(
        source,
        "configure_platformer_hud(project.rooms[current_room].name, hud, true);",
        "o Platformer precisa aplicar o preset de HUD associado a cada cena",
    )
    require(
        source,
        "gbs::draw_hud(hud);",
        "o Platformer precisa desenhar a HUD depois dos elementos da cena",
    )
    require(
        source,
        "if (stream_result.uploaded_count > 0) {\n            gbs::wait_vblank();\n        }",
        "uploads do grupo ativo precisam ser concluídos antes de executar eventos e desenhar a primeira cena",
    )
    require(
        source,
        "const uint32_t current_flags = gbs::tile_flags_at(\n"
        "        room.collision,\n"
        "        center_tile_x,\n"
        "        center_tile_y\n"
        "    );",
        "a telemetria Platformer deve amostrar um tile em tempo constante, sem varrer uma hitbox possivelmente inválida",
    )
    require(
        source,
        "gbs::ResourceBankPrefetchRequest platformer_prefetch_requests[gbs::max_resource_bank_cache_entries] "
        "__attribute__((section(\".ewram_bss\")));",
        "os pedidos de prefetch do Platformer precisam ficar na EWRAM, fora da pilha limitada do GBA",
    )
    reject(
        source,
        "gbs::ResourceBankPrefetchRequest requests[gbs::max_resource_bank_cache_entries] {};",
        "o Platformer nao pode alocar os 64 pedidos de prefetch na pilha a cada frame",
    )
    require(
        topdown_source,
        "gbs::ResourceBankPrefetchRequest topdown_prefetch_requests[max_project_resource_banks] "
        "__attribute__((section(\".ewram_bss\")));",
        "os pedidos de prefetch do Top-down precisam ficar na EWRAM",
    )
    reject(
        topdown_source,
        "gbs::ResourceBankPrefetchRequest requests[max_project_resource_banks] {};",
        "o Top-down nao pode alocar os pedidos de prefetch na pilha",
    )
    require(
        isometric_source,
        "gbs::ResourceBankPrefetchRequest isometric_prefetch_requests[max_project_resource_banks] "
        "__attribute__((section(\".ewram_bss\")));",
        "os pedidos de prefetch do Isometrico precisam ficar na EWRAM",
    )
    reject(
        isometric_source,
        "gbs::ResourceBankPrefetchRequest requests[max_project_resource_banks] {};",
        "o Isometrico nao pode alocar os pedidos de prefetch na pilha",
    )

    devkitarm = Path(os.environ.get("DEVKITARM", "/opt/devkitpro/devkitARM"))
    compiler = devkitarm / "bin" / "arm-none-eabi-g++"
    if not compiler.is_file():
        raise SystemExit(f"devkitARM nao encontrado em {devkitarm}")
    with tempfile.TemporaryDirectory(prefix="gbs-platformer-runtime-stack-") as temp_dir:
        output = Path(temp_dir) / "platformer_runtime.o"
        subprocess.run(
            [
                str(compiler),
                "-mthumb",
                "-mthumb-interwork",
                "-mcpu=arm7tdmi",
                "-mtune=arm7tdmi",
                "-Os",
                "-ffreestanding",
                "-fdata-sections",
                "-ffunction-sections",
                "-Wall",
                "-Wextra",
                "-std=c++17",
                "-fno-exceptions",
                "-fno-rtti",
                "-fno-threadsafe-statics",
                "-fstack-usage",
                f"-I{repo_root / 'engine' / 'include'}",
                "-c",
                str(repo_root / "examples" / "platformer_basic" / "src" / "main.cpp"),
                "-o",
                str(output),
            ],
            check=True,
        )
        stack_bytes = None
        for line in output.with_suffix(".su").read_text(encoding="utf-8").splitlines():
            fields = line.split("\t")
            if len(fields) >= 2 and "gbs_main()" in fields[0]:
                stack_bytes = int(fields[1])
                break
        if stack_bytes is None:
            raise AssertionError("gbs_main sem medicao de stack ARM")
        if stack_bytes > MAX_PLATFORMER_RUNTIME_STACK_BYTES:
            raise AssertionError(
                "runtime Platformer excede "
                f"{MAX_PLATFORMER_RUNTIME_STACK_BYTES} bytes de stack ARM: {stack_bytes} bytes"
            )
        print(f"platformer runtime ARM stack ok: {stack_bytes} bytes")


if __name__ == "__main__":
    main()
