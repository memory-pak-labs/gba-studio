SHELL := /bin/bash

DEVKITPRO ?= /opt/devkitpro
DEVKITARM ?= $(DEVKITPRO)/devkitARM
TOOLS_BIN := $(DEVKITPRO)/tools/bin

BUILD_DIR := build
GBA_BUILD := $(BUILD_DIR)/gba
HOST_BUILD := $(BUILD_DIR)/host
DIST_DIR := dist/GBAStudioEnginePack

ARM_CC := $(DEVKITARM)/bin/arm-none-eabi-gcc
ARM_CXX := $(DEVKITARM)/bin/arm-none-eabi-g++
ARM_AS := $(DEVKITARM)/bin/arm-none-eabi-gcc
ARM_AR := $(DEVKITARM)/bin/arm-none-eabi-ar
ARM_OBJCOPY := $(DEVKITARM)/bin/arm-none-eabi-objcopy
GBAFIX := $(TOOLS_BIN)/gbafix

HOST_CXX ?= clang++

ENGINE_INCLUDES := -Iengine/include -Iengine/src
GBA_ARCH := -mthumb -mthumb-interwork -mcpu=arm7tdmi -mtune=arm7tdmi
GBA_COMMON := $(GBA_ARCH) -Os -ffreestanding -fdata-sections -ffunction-sections -Wall -Wextra -MMD -MP $(ENGINE_INCLUDES)
GBA_CFLAGS := $(GBA_COMMON) -std=c11
GBA_CXXFLAGS := $(GBA_COMMON) -std=c++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics
# Keep the default engine optimized for ROM size. The CPU compositor is an
# isolated hot path and earns its own throughput-oriented compilation profile.
GBA_ISOMETRIC_CXXFLAGS := $(GBA_CXXFLAGS) -O2
GBA_ASFLAGS := $(GBA_ARCH) -x assembler-with-cpp
GBA_LDFLAGS := $(GBA_ARCH) -nostartfiles -Wl,--gc-sections -T engine/startup/gba.ld

HOST_CXXFLAGS := -std=c++17 -Wall -Wextra -Werror -Iengine/include
HOST_EVENT_RUNTIME_SRCS := engine/src/gbs_runtime.cpp engine/src/gbs_rtc.cpp engine/src/gbs_link.cpp engine/src/rumble.cpp engine/src/deferred_work.cpp engine/src/gbs_engine_global.cpp tests/host/hw_stubs.cpp

ENGINE_C_SRCS := engine/src/gbs_hw.c engine/src/gbs_text.c
ENGINE_CPP_SRCS := engine/src/gbs_core.cpp engine/src/gbs_input.cpp engine/src/gbs_render.cpp engine/src/gbs_math.cpp engine/src/gbs_bios.cpp engine/src/gbs_rtc.cpp engine/src/gbs_random.cpp engine/src/gbs_format.cpp engine/src/gbs_info.cpp engine/src/gbs_tween.cpp engine/src/gbs_visual_effects.cpp engine/src/gbs_topdown.cpp engine/src/gbs_platformer.cpp engine/src/gbs_isometric.cpp engine/src/gbs_dungeon_crawler.cpp engine/src/gbs_racing.cpp engine/src/gbs_battle_rpg.cpp engine/src/gbs_luta.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue.cpp engine/src/gbs_dialogue_locale.cpp engine/src/gbs_ui.cpp engine/src/gbs_audio.cpp engine/src/gbs_animation.cpp engine/src/gbs_compression.cpp engine/src/gbs_dma.cpp engine/src/gbs_timer.cpp engine/src/gbs_interrupt.cpp engine/src/gbs_resource_manager.cpp engine/src/gbs_save.cpp engine/src/gbs_runtime_save_restore.cpp engine/src/gbs_debug.cpp engine/src/gbs_link.cpp engine/src/gbs_runtime.cpp engine/src/hblank_effect.cpp engine/src/action.cpp engine/src/profiler.cpp engine/src/camera.cpp engine/src/palette.cpp engine/src/deferred_work.cpp engine/src/audio_engine.cpp engine/src/containers.cpp engine/src/typewriter.cpp engine/src/input_advanced.cpp engine/src/hbe_presets.cpp engine/src/rumble.cpp engine/src/pseudo_3d.cpp engine/src/gbs_engine_global.cpp
ENGINE_ASM_SRCS := engine/startup/crt0.S engine/startup/irq.S

ENGINE_C_OBJS := $(patsubst engine/src/%.c,$(GBA_BUILD)/engine/%.o,$(ENGINE_C_SRCS))
ENGINE_CPP_OBJS := $(patsubst engine/src/%.cpp,$(GBA_BUILD)/engine/%.o,$(ENGINE_CPP_SRCS))
ENGINE_ASM_OBJS := $(patsubst engine/startup/%.S,$(GBA_BUILD)/startup/%.o,$(ENGINE_ASM_SRCS))
ENGINE_OBJS := $(ENGINE_C_OBJS) $(ENGINE_CPP_OBJS) $(ENGINE_ASM_OBJS)
ENGINE_LIB := $(GBA_BUILD)/lib/libgbastudio_engine.a

EXAMPLE_CPP_SRCS := examples/topdown_basic/src/main.cpp
EXAMPLE_OBJS := $(patsubst examples/topdown_basic/src/%.cpp,$(GBA_BUILD)/examples/topdown_basic/%.o,$(EXAMPLE_CPP_SRCS))
EXAMPLE_ELF := $(GBA_BUILD)/examples/topdown_basic/topdown_basic.elf
EXAMPLE_GBA := $(GBA_BUILD)/examples/topdown_basic/topdown_basic.gba

PLATFORMER_CPP_SRCS := examples/platformer_basic/src/main.cpp
PLATFORMER_OBJS := $(patsubst examples/platformer_basic/src/%.cpp,$(GBA_BUILD)/examples/platformer_basic/%.o,$(PLATFORMER_CPP_SRCS))
PLATFORMER_ELF := $(GBA_BUILD)/examples/platformer_basic/platformer_basic.elf
PLATFORMER_GBA := $(GBA_BUILD)/examples/platformer_basic/platformer_basic.gba

ISOMETRIC_CPP_SRCS := examples/isometric_basic/src/main.cpp
ISOMETRIC_OBJS := $(patsubst examples/isometric_basic/src/%.cpp,$(GBA_BUILD)/examples/isometric_basic/%.o,$(ISOMETRIC_CPP_SRCS))
ISOMETRIC_ELF := $(GBA_BUILD)/examples/isometric_basic/isometric_basic.elf
ISOMETRIC_GBA := $(GBA_BUILD)/examples/isometric_basic/isometric_basic.gba

GBA_DEPFILES := $(ENGINE_OBJS:.o=.d) $(EXAMPLE_OBJS:.o=.d) $(PLATFORMER_OBJS:.o=.d) $(ISOMETRIC_OBJS:.o=.d)

-include $(GBA_DEPFILES)

.PHONY: all clean test host-test shmup-animation-test isometric-turn-flow-test runtime-orchestration-test runtime-capability-test save-test hardware-source-test mixed-runtime-overlay-test stress-projects-contract-test topdown-backdrop-runtime-test topdown-hud-runtime-test platformer-runtime-wait-test resource-manager-stack-test math-test bios-test rtc-test utility-test tween-test assetc-test gbsbuild-host-test gbsbuild-test gbsdoctor-test package verify-package verify-export-fixture verify-production-smoke verify-stress verify-beta-readiness verify-mgba-check verify-mgba-stress-check verify-mgba-review-package verify-mgba-manual-handoff-test verify-cross-platform-local verify-cross-platform-test topdown_basic.gba platformer_basic.gba isometric_basic.gba check-toolchain

all: test topdown_basic.gba platformer_basic.gba isometric_basic.gba

check-toolchain:
	@test -x "$(ARM_CXX)" || (echo "devkitARM nao encontrado em $(DEVKITARM)" >&2; exit 2)
	@test -x "$(GBAFIX)" || (echo "gbafix nao encontrado em $(GBAFIX)" >&2; exit 2)

test: host-test isometric-turn-flow-test gbsbuild-test mixed-runtime-overlay-test platformer-runtime-wait-test resource-manager-stack-test

isometric-turn-flow-test:
	@mkdir -p $(HOST_BUILD)
	$(HOST_CXX) $(HOST_CXXFLAGS) -O2 tests/host/isometric_paged_surface_tests.cpp -o $(HOST_BUILD)/isometric_paged_surface_tests
	$(HOST_BUILD)/isometric_paged_surface_tests
	python3 tests/host/assetc_isometric_paged_surface_tests.py
	python3 tests/host/isometric_turn_flow_tests.py
	python3 tests/host/isometric_cursor_tests.py
	python3 tests/host/isometric_exploration_tests.py

host-test: hud-gauge-test luta-authored-hud-test point-click-animation-test shmup-animation-test $(HOST_BUILD)/topdown_tests $(HOST_BUILD)/topdown_fixture_tests $(HOST_BUILD)/platformer_tests $(HOST_BUILD)/isometric_tests $(HOST_BUILD)/dungeon_crawler_tests $(HOST_BUILD)/racing_tests $(HOST_BUILD)/battle_rpg_tests $(HOST_BUILD)/luta_tests $(HOST_BUILD)/visual_novel_tests $(HOST_BUILD)/point_click_tests $(HOST_BUILD)/shmup_tests $(HOST_BUILD)/menu_tests $(HOST_BUILD)/cutscene_tests $(HOST_BUILD)/world_map_tests $(HOST_BUILD)/world_map_journey_tests $(HOST_BUILD)/hardware_core_tests $(HOST_BUILD)/link_tests $(HOST_BUILD)/hblank_effect_tests $(HOST_BUILD)/action_tests $(HOST_BUILD)/profiler_tests $(HOST_BUILD)/camera_tests $(HOST_BUILD)/audio_engine_tests $(HOST_BUILD)/containers_tests $(HOST_BUILD)/typewriter_tests $(HOST_BUILD)/input_advanced_tests $(HOST_BUILD)/oam_overflow_tests $(HOST_BUILD)/deferred_work_tests $(HOST_BUILD)/hbe_presets_tests $(HOST_BUILD)/rumble_tests $(HOST_BUILD)/multiplayer_tests $(HOST_BUILD)/pseudo_3d_tests $(HOST_BUILD)/palette_tests $(HOST_BUILD)/render_asset_tests $(HOST_BUILD)/render_runtime_tests $(HOST_BUILD)/runtime_orchestration_tests $(HOST_BUILD)/runtime_capability_tests $(HOST_BUILD)/visual_effects_tests $(HOST_BUILD)/project_data_tests $(HOST_BUILD)/event_tests $(HOST_BUILD)/dialogue_tests $(HOST_BUILD)/text_tests $(HOST_BUILD)/ui_tests $(HOST_BUILD)/hud_behavior_tests $(HOST_BUILD)/audio_tests $(HOST_BUILD)/animation_tests $(HOST_BUILD)/resource_manager_tests $(HOST_BUILD)/save_tests $(HOST_BUILD)/runtime_save_restore_tests $(HOST_BUILD)/runtime_checkpoint_tests $(HOST_BUILD)/debug_tests $(HOST_BUILD)/math_tests $(HOST_BUILD)/bios_tests $(HOST_BUILD)/rtc_tests $(HOST_BUILD)/utility_tests $(HOST_BUILD)/tween_tests assetc-test gbsbuild-host-test gbsdoctor-test verify-cross-platform-test hardware-source-test stress-projects-contract-test topdown-backdrop-runtime-test topdown-hud-runtime-test
	$(HOST_BUILD)/topdown_tests
	$(HOST_BUILD)/topdown_fixture_tests
	$(HOST_BUILD)/platformer_tests
	$(HOST_BUILD)/isometric_tests
	$(HOST_BUILD)/dungeon_crawler_tests
	$(HOST_BUILD)/racing_tests
	$(HOST_BUILD)/battle_rpg_tests
	$(HOST_BUILD)/luta_tests
	$(HOST_BUILD)/visual_novel_tests
	$(HOST_BUILD)/point_click_tests
	$(HOST_BUILD)/shmup_tests
	$(HOST_BUILD)/menu_tests
	$(HOST_BUILD)/cutscene_tests
	$(HOST_BUILD)/world_map_tests
	$(HOST_BUILD)/world_map_journey_tests
	$(HOST_BUILD)/hardware_core_tests
	$(HOST_BUILD)/link_tests
	$(HOST_BUILD)/hblank_effect_tests
	$(HOST_BUILD)/action_tests
	$(HOST_BUILD)/profiler_tests
	$(HOST_BUILD)/camera_tests
	$(HOST_BUILD)/audio_engine_tests
	$(HOST_BUILD)/containers_tests
	$(HOST_BUILD)/typewriter_tests
	$(HOST_BUILD)/input_advanced_tests
	$(HOST_BUILD)/oam_overflow_tests
	$(HOST_BUILD)/deferred_work_tests
	$(HOST_BUILD)/hbe_presets_tests
	$(HOST_BUILD)/rumble_tests
	$(HOST_BUILD)/multiplayer_tests
	$(HOST_BUILD)/pseudo_3d_tests
	$(HOST_BUILD)/palette_tests
	$(HOST_BUILD)/render_asset_tests
	$(HOST_BUILD)/render_runtime_tests
	$(HOST_BUILD)/runtime_orchestration_tests
	$(HOST_BUILD)/visual_effects_tests
	$(HOST_BUILD)/project_data_tests
	$(HOST_BUILD)/event_tests
	$(HOST_BUILD)/dialogue_tests
	$(HOST_BUILD)/text_tests
	$(HOST_BUILD)/ui_tests
	$(HOST_BUILD)/hud_behavior_tests
	$(HOST_BUILD)/audio_tests
	$(HOST_BUILD)/animation_tests
	$(HOST_BUILD)/resource_manager_tests
	$(HOST_BUILD)/save_tests
	$(HOST_BUILD)/runtime_save_restore_tests
	$(HOST_BUILD)/runtime_checkpoint_tests
	$(HOST_BUILD)/debug_tests
	$(HOST_BUILD)/math_tests
	$(HOST_BUILD)/bios_tests
	$(HOST_BUILD)/rtc_tests

hardware-source-test:
	python3 tests/host/hardware_source_contract_tests.py
	python3 tests/host/isometric_vram_layout_tests.py

mixed-runtime-overlay-test:
	python3 tests/host/mixed_runtime_overlay_tests.py

stress-projects-contract-test:
	python3 tests/host/stress_projects_tests.py

topdown-backdrop-runtime-test:
	python3 tests/host/topdown_backdrop_runtime_contract_tests.py

topdown-hud-runtime-test:
	python3 tests/host/topdown_hud_runtime_tests.py

platformer-runtime-wait-test: check-toolchain
	python3 tests/host/platformer_runtime_wait_tests.py
	python3 tests/host/runtime_frame_boundary_tests.py

resource-manager-stack-test: check-toolchain
	DEVKITARM="$(DEVKITARM)" python3 tests/host/resource_manager_stack_tests.py

topdown_basic.gba: check-toolchain $(EXAMPLE_GBA)

platformer_basic.gba: check-toolchain $(PLATFORMER_GBA)

isometric_basic.gba: check-toolchain $(ISOMETRIC_GBA)

$(ENGINE_LIB): $(ENGINE_OBJS)
	@mkdir -p $(@D)
	$(ARM_AR) rcs $@ $^

$(GBA_BUILD)/engine/%.o: engine/src/%.c
	@mkdir -p $(@D)
	$(ARM_CC) $(GBA_CFLAGS) -c $< -o $@

$(GBA_BUILD)/engine/%.o: engine/src/%.cpp
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_CXXFLAGS) -c $< -o $@

$(GBA_BUILD)/engine/gbs_isometric.o: engine/src/gbs_isometric.cpp
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_ISOMETRIC_CXXFLAGS) -c $< -o $@

$(GBA_BUILD)/startup/%.o: engine/startup/%.S
	@mkdir -p $(@D)
	$(ARM_AS) $(GBA_ASFLAGS) -c $< -o $@

$(GBA_BUILD)/examples/topdown_basic/%.o: examples/topdown_basic/src/%.cpp
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_CXXFLAGS) -c $< -o $@

$(GBA_BUILD)/examples/platformer_basic/%.o: examples/platformer_basic/src/%.cpp
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_CXXFLAGS) -c $< -o $@

$(GBA_BUILD)/examples/isometric_basic/%.o: examples/isometric_basic/src/%.cpp
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_CXXFLAGS) -c $< -o $@

$(EXAMPLE_ELF): $(ENGINE_LIB) $(EXAMPLE_OBJS)
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_LDFLAGS) -Wl,-Map,$(GBA_BUILD)/examples/topdown_basic/topdown_basic.map $(EXAMPLE_OBJS) $(ENGINE_LIB) -lgcc -o $@

$(EXAMPLE_GBA): $(EXAMPLE_ELF)
	$(ARM_OBJCOPY) -O binary $< $@
	$(GBAFIX) $@ -tGBS_TOPDOWN -cGBS0 -m00 -r00 >/dev/null
	@echo "ROM gerada: $@"

$(PLATFORMER_ELF): $(ENGINE_LIB) $(PLATFORMER_OBJS)
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_LDFLAGS) -Wl,-Map,$(GBA_BUILD)/examples/platformer_basic/platformer_basic.map $(PLATFORMER_OBJS) $(ENGINE_LIB) -lgcc -o $@

$(PLATFORMER_GBA): $(PLATFORMER_ELF)
	$(ARM_OBJCOPY) -O binary $< $@
	$(GBAFIX) $@ -tGBS_PLAT -cGBS0 -m00 -r00 >/dev/null
	@echo "ROM gerada: $@"

$(ISOMETRIC_ELF): $(ENGINE_LIB) $(ISOMETRIC_OBJS)
	@mkdir -p $(@D)
	$(ARM_CXX) $(GBA_LDFLAGS) -Wl,-Map,$(GBA_BUILD)/examples/isometric_basic/isometric_basic.map $(ISOMETRIC_OBJS) $(ENGINE_LIB) -lgcc -o $@

$(ISOMETRIC_GBA): $(ISOMETRIC_ELF)
	$(ARM_OBJCOPY) -O binary $< $@
	$(GBAFIX) $@ -tGBS_ISO -cGBS0 -m00 -r00 >/dev/null
	@echo "ROM gerada: $@"

$(HOST_BUILD)/topdown_tests: tests/host/topdown_tests.cpp engine/src/gbs_topdown.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/topdown_fixture_tests: tests/host/topdown_fixture_tests.cpp engine/src/gbs_resource_manager.cpp engine/src/gbs_dma.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/platformer_tests: tests/host/platformer_tests.cpp engine/src/gbs_platformer.cpp engine/src/gbs_topdown.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/isometric_tests: tests/host/isometric_tests.cpp engine/src/gbs_isometric.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/dungeon_crawler_tests: tests/host/dungeon_crawler_tests.cpp engine/src/gbs_dungeon_crawler.cpp engine/src/gbs_event.cpp engine/src/gbs_save.cpp engine/src/gbs_info.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/racing_tests: tests/host/racing_tests.cpp engine/src/gbs_racing.cpp engine/src/gbs_event.cpp engine/src/gbs_save.cpp engine/src/gbs_info.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/battle_rpg_tests: tests/host/battle_rpg_tests.cpp engine/src/gbs_battle_rpg.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/luta_tests: tests/host/luta_tests.cpp engine/src/gbs_luta.cpp engine/src/gbs_animation.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/visual_novel_tests: tests/host/visual_novel_tests.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/point_click_tests: tests/host/point_click_tests.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

shmup-animation-test: $(HOST_BUILD)/shmup_player_animation_tests
	$(HOST_BUILD)/shmup_player_animation_tests
	python3 tests/host/shmup_animation_export_tests.py

$(HOST_BUILD)/shmup_player_animation_tests: tests/host/shmup_player_animation_tests.cpp engine/src/gbs_animation.cpp engine/include/gbs/shmup.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $(filter %.cpp,$^) -o $@

$(HOST_BUILD)/shmup_tests: tests/host/shmup_tests.cpp engine/include/gbs/shmup.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $(filter %.cpp,$^) -o $@

$(HOST_BUILD)/menu_tests: tests/host/menu_tests.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/cutscene_tests: tests/host/cutscene_tests.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/world_map_journey_tests: tests/host/world_map_journey_tests.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/world_map_tests: tests/host/world_map_tests.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/hardware_core_tests: tests/host/hardware_core_tests.cpp engine/src/gbs_core.cpp engine/src/gbs_runtime.cpp engine/src/gbs_rtc.cpp engine/src/gbs_input.cpp engine/src/gbs_interrupt.cpp engine/src/gbs_dma.cpp engine/src/gbs_debug.cpp engine/src/gbs_timer.cpp engine/src/rumble.cpp engine/src/deferred_work.cpp engine/src/gbs_engine_global.cpp engine/src/input_advanced.cpp tests/host/hw_stubs.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/link_tests: tests/host/link_tests.cpp engine/src/gbs_link.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/hblank_effect_tests: tests/host/hblank_effect_tests.cpp engine/src/hblank_effect.cpp engine/src/gbs_math.cpp engine/src/gbs_tween.cpp engine/src/gbs_bios.cpp engine/src/gbs_compression.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@




$(HOST_BUILD)/palette_tests: tests/host/palette_tests.cpp engine/src/palette.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/camera_tests: tests/host/camera_tests.cpp engine/src/camera.cpp engine/src/gbs_random.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/profiler_tests: tests/host/profiler_tests.cpp engine/src/profiler.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/action_tests: tests/host/action_tests.cpp engine/src/action.cpp engine/src/gbs_tween.cpp engine/src/gbs_math.cpp engine/src/gbs_bios.cpp engine/src/gbs_compression.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/render_asset_tests: tests/host/render_asset_tests.cpp engine/src/gbs_compression.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/render_runtime_tests: tests/host/render_runtime_tests.cpp engine/src/gbs_render.cpp engine/src/gbs_bios.cpp engine/src/gbs_math.cpp engine/src/gbs_compression.cpp engine/src/gbs_interrupt.cpp engine/src/gbs_room_tilemap.h
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) -Iengine/src $(filter %.cpp,$^) -o $@

$(HOST_BUILD)/runtime_orchestration_tests: tests/host/runtime_orchestration_tests.cpp engine/src/gbs_runtime.cpp engine/src/gbs_rtc.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

runtime-orchestration-test: $(HOST_BUILD)/runtime_orchestration_tests
	$(HOST_BUILD)/runtime_orchestration_tests

$(HOST_BUILD)/runtime_capability_tests: tests/host/runtime_capability_tests.cpp engine/src/gbs_runtime.cpp engine/src/gbs_rtc.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

runtime-capability-test: $(HOST_BUILD)/runtime_capability_tests
	$(HOST_BUILD)/runtime_capability_tests

$(HOST_BUILD)/project_data_tests: tests/host/project_data_tests.cpp engine/src/gbs_topdown.cpp engine/src/gbs_platformer.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/event_tests: tests/host/event_tests.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/visual_effects_tests: tests/host/visual_effects_tests.cpp engine/src/gbs_visual_effects.cpp engine/src/gbs_tween.cpp engine/src/gbs_math.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/dialogue_tests: tests/host/dialogue_tests.cpp engine/src/gbs_dialogue.cpp engine/src/gbs_dialogue_locale.cpp engine/src/gbs_text.c
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) -Iengine/src -x c++ $^ -o $@

$(HOST_BUILD)/text_tests: tests/host/text_tests.cpp engine/src/gbs_text.c
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) -x c++ $^ -o $@

$(HOST_BUILD)/hud_behavior_tests: tests/host/hud_behavior_tests.cpp engine/include/gbs/hud_behavior.hpp engine/include/gbs/event.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $< -o $@

$(HOST_BUILD)/ui_tests: tests/host/ui_tests.cpp engine/src/gbs_ui.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) -Iengine/src $^ -o $@

$(HOST_BUILD)/audio_engine_tests: tests/host/audio_engine_tests.cpp engine/src/audio_engine.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/containers_tests: tests/host/containers_tests.cpp engine/src/containers.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/typewriter_tests: tests/host/typewriter_tests.cpp engine/src/typewriter.cpp engine/src/gbs_text.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) -Iengine/include -c engine/src/gbs_text.c -o $(HOST_BUILD)/gbs_text_host.o
	$(HOST_CXX) $(HOST_CXXFLAGS) tests/host/typewriter_tests.cpp engine/src/typewriter.cpp $(HOST_BUILD)/gbs_text_host.o -o $@

$(HOST_BUILD)/input_advanced_tests: tests/host/input_advanced_tests.cpp engine/src/input_advanced.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/oam_overflow_tests: tests/host/oam_overflow_tests.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/deferred_work_tests: tests/host/deferred_work_tests.cpp engine/src/deferred_work.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/hbe_presets_tests: tests/host/hbe_presets_tests.cpp engine/src/hbe_presets.cpp engine/src/hblank_effect.cpp engine/src/gbs_math.cpp engine/src/gbs_tween.cpp engine/src/gbs_interrupt.cpp tests/host/hw_stubs.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/rumble_tests: tests/host/rumble_tests.cpp engine/src/rumble.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/multiplayer_tests: tests/host/multiplayer_tests.cpp engine/src/gbs_link.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) -Iengine/src $^ -o $@

$(HOST_BUILD)/pseudo_3d_tests: tests/host/pseudo_3d_tests.cpp engine/src/pseudo_3d.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/audio_tests: tests/host/audio_tests.cpp engine/src/gbs_audio.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) -Iengine/src $^ -o $@

$(HOST_BUILD)/math_tests: tests/host/math_tests.cpp engine/src/gbs_math.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/bios_tests: tests/host/bios_tests.cpp engine/src/gbs_bios.cpp engine/src/gbs_compression.cpp engine/src/gbs_math.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

bios-test: $(HOST_BUILD)/bios_tests
	$(HOST_BUILD)/bios_tests

$(HOST_BUILD)/rtc_tests: tests/host/rtc_tests.cpp engine/src/gbs_rtc.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

rtc-test: $(HOST_BUILD)/rtc_tests
	$(HOST_BUILD)/rtc_tests

$(HOST_BUILD)/utility_tests: tests/host/utility_tests.cpp engine/src/gbs_random.cpp engine/src/gbs_format.cpp engine/src/gbs_info.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

utility-test: $(HOST_BUILD)/utility_tests
	$(HOST_BUILD)/utility_tests

$(HOST_BUILD)/tween_tests: tests/host/tween_tests.cpp engine/src/gbs_tween.cpp engine/src/gbs_math.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

tween-test: $(HOST_BUILD)/tween_tests
	$(HOST_BUILD)/tween_tests

math-test: $(HOST_BUILD)/math_tests
	$(HOST_BUILD)/math_tests

$(HOST_BUILD)/animation_tests: tests/host/animation_tests.cpp engine/src/gbs_animation.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

.PHONY: animation-streaming-test
host-test: animation-streaming-test
animation-streaming-test: $(HOST_BUILD)/animation_streaming_tests
	$(HOST_BUILD)/animation_streaming_tests
$(HOST_BUILD)/animation_streaming_tests: tests/host/animation_streaming_tests.cpp engine/src/gbs_animation.cpp engine/include/gbs/animation.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $(filter %.cpp,$^) -o $@

$(HOST_BUILD)/resource_manager_tests: tests/host/resource_manager_tests.cpp engine/src/gbs_resource_manager.cpp engine/src/gbs_dma.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/save_tests: tests/host/save_tests.cpp engine/src/gbs_save.cpp engine/src/gbs_info.cpp engine/src/gbs_dialogue_locale.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

save-test: $(HOST_BUILD)/save_tests
	$(HOST_BUILD)/save_tests

$(HOST_BUILD)/runtime_save_restore_tests: tests/host/runtime_save_restore_tests.cpp engine/src/gbs_runtime_save_restore.cpp engine/src/gbs_save.cpp engine/src/gbs_info.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/runtime_checkpoint_tests: tests/host/runtime_checkpoint_tests.cpp engine/src/gbs_runtime_save_restore.cpp engine/src/gbs_save.cpp engine/src/gbs_info.cpp engine/src/gbs_event.cpp engine/src/gbs_dialogue_locale.cpp $(HOST_EVENT_RUNTIME_SRCS)
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

$(HOST_BUILD)/debug_tests: tests/host/debug_tests.cpp engine/src/gbs_debug.cpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $^ -o $@

assetc-test:
	python3 tests/host/hud_behavior_export_tests.py
	python3 tests/host/background_event_tests.py
	python3 tests/host/dialogue_font_contract_tests.py
	python3 tests/host/assetc_paged_background_tests.py
	python3 tests/host/assetc_actor_condition_tests.py
	python3 tests/host/assetc_menu_focus_tests.py
	@mkdir -p $(HOST_BUILD)/assetc
	python3 tests/host/assetc_palette_quantization_tests.py
	python3 tests/host/assetc_color_lookup_tests.py
	python3 tests/host/assetc_derived_cache_tests.py
	python3 tests/host/make_test_png.py $(HOST_BUILD)/assetc/tiny.png
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tiny.png -o $(HOST_BUILD)/assetc/tiny.hpp -n tiny
	grep -q "gbs::PaletteAsset tiny_palette_asset" $(HOST_BUILD)/assetc/tiny.hpp
	grep -q "const gbs::TileAsset tiny_tile_asset" $(HOST_BUILD)/assetc/tiny.hpp
	grep -q "constexpr gbs::TileMapAsset tiny_tilemap_asset" $(HOST_BUILD)/assetc/tiny.hpp
	printf '#include "tiny.hpp"\nint main() { return tiny_tile_count == 1 && tiny_tilemap_width == 1 && tiny_tilemap_height == 1 && tiny_tilemap_entries[0] == 0 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/tiny_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/tiny_compile.cpp -o $(HOST_BUILD)/assetc/tiny_compile
	$(HOST_BUILD)/assetc/tiny_compile
	python3 tests/host/make_assetc_tilemap_png.py $(HOST_BUILD)/assetc/tilemap.png
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/tilemap.hpp -n tilemap --destination-tile 7 --palette-bank 2 --object-tiles
	grep -q "constexpr int tilemap_tile_count = 1;" $(HOST_BUILD)/assetc/tilemap.hpp
	grep -q "constexpr uint16_t tilemap_tilemap_entries\\[2\\] = { 0x2007, 0x2007 }" $(HOST_BUILD)/assetc/tilemap.hpp
	grep -q "constexpr gbs::PaletteAsset tilemap_palette_asset = { tilemap_palette, 16, 32 }" $(HOST_BUILD)/assetc/tilemap.hpp
	grep -Fq "const gbs::TileAsset tilemap_tile_asset = { reinterpret_cast<const uint8_t*>(tilemap_tiles), tilemap_tile_count, 7, true }" $(HOST_BUILD)/assetc/tilemap.hpp
	printf '#include "tilemap.hpp"\nint main() { return tilemap_tilemap_width == 2 && tilemap_tilemap_height == 1 && tilemap_tile_asset.destination_tile == 7 && tilemap_tile_asset.object_tiles && tilemap_tilemap_entries[1] == 0x2007 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/tilemap_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/tilemap_compile.cpp -o $(HOST_BUILD)/assetc/tilemap_compile
	$(HOST_BUILD)/assetc/tilemap_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/tilemap_rle.hpp -n tilemap_rle --destination-tile 7 --palette-bank 2 --rle-tilemap
	grep -q "constexpr gbs::Rle16TileMapAsset tilemap_rle_tilemap_rle_asset" $(HOST_BUILD)/assetc/tilemap_rle.hpp
	grep -q "constexpr int tilemap_rle_tilemap_rle_run_count = 1;" $(HOST_BUILD)/assetc/tilemap_rle.hpp
	printf '#include "tilemap_rle.hpp"\nint main() { return tilemap_rle_tilemap_rle_runs[0].value == 0x2007 && tilemap_rle_tilemap_rle_runs[0].count == 2 && tilemap_rle_tilemap_rle_asset.data.decoded_count == 2 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/tilemap_rle_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/tilemap_rle_compile.cpp -o $(HOST_BUILD)/assetc/tilemap_rle_compile
	$(HOST_BUILD)/assetc/tilemap_rle_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/tilemap_lz77.hpp -n tilemap_lz77 --destination-tile 7 --palette-bank 2 --lz77-tilemap
	grep -q "constexpr gbs::Lz77TileMapAsset tilemap_lz77_tilemap_lz77_asset" $(HOST_BUILD)/assetc/tilemap_lz77.hpp
	grep -q "constexpr int tilemap_lz77_tilemap_lz77_size" $(HOST_BUILD)/assetc/tilemap_lz77.hpp
	printf '#include "tilemap_lz77.hpp"\nint main() { return tilemap_lz77_tilemap_lz77_asset.width == 2 && tilemap_lz77_tilemap_lz77_asset.height == 1 && tilemap_lz77_tilemap_lz77_asset.data.decoded_count == 4 && tilemap_lz77_tilemap_lz77_data[0] == 0x10 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/tilemap_lz77_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/tilemap_lz77_compile.cpp -o $(HOST_BUILD)/assetc/tilemap_lz77_compile
	$(HOST_BUILD)/assetc/tilemap_lz77_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/tilemap_lz77_tiles.hpp -n tilemap_lz77_tiles --destination-tile 7 --palette-bank 2 --lz77-tiles
	grep -q "constexpr gbs::Lz77TileAsset tilemap_lz77_tiles_lz77_tile_asset" $(HOST_BUILD)/assetc/tilemap_lz77_tiles.hpp
	grep -q "constexpr int tilemap_lz77_tiles_lz77_tile_size" $(HOST_BUILD)/assetc/tilemap_lz77_tiles.hpp
	printf '#include "tilemap_lz77_tiles.hpp"\nint main() { return tilemap_lz77_tiles_lz77_tile_asset.tile_count == 1 && tilemap_lz77_tiles_lz77_tile_asset.destination_tile == 7 && tilemap_lz77_tiles_lz77_tile_asset.data.decoded_count == 32 && tilemap_lz77_tiles_lz77_tile_data[0] == 0x10 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/tilemap_lz77_tiles_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/tilemap_lz77_tiles_compile.cpp -o $(HOST_BUILD)/assetc/tilemap_lz77_tiles_compile
	$(HOST_BUILD)/assetc/tilemap_lz77_tiles_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/tilemap_lz77_palette.hpp -n tilemap_lz77_palette --destination-tile 7 --palette-bank 2 --lz77-palette
	grep -q "constexpr gbs::Lz77PaletteAsset tilemap_lz77_palette_lz77_palette_asset" $(HOST_BUILD)/assetc/tilemap_lz77_palette.hpp
	grep -q "constexpr int tilemap_lz77_palette_lz77_palette_size" $(HOST_BUILD)/assetc/tilemap_lz77_palette.hpp
	printf '#include "tilemap_lz77_palette.hpp"\nint main() { return tilemap_lz77_palette_lz77_palette_asset.color_count == 16 && tilemap_lz77_palette_lz77_palette_asset.start_index == 32 && tilemap_lz77_palette_lz77_palette_asset.data.decoded_count == 32 && tilemap_lz77_palette_lz77_palette_data[0] == 0x10 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/tilemap_lz77_palette_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/tilemap_lz77_palette_compile.cpp -o $(HOST_BUILD)/assetc/tilemap_lz77_palette_compile
	$(HOST_BUILD)/assetc/tilemap_lz77_palette_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/bitmap3.hpp -n bitmap3 --bitmap-mode 3
	grep -q "constexpr gbs::Bitmap16Asset bitmap3_bitmap_asset" $(HOST_BUILD)/assetc/bitmap3.hpp
	printf '#include "bitmap3.hpp"\nint main() { return bitmap3_display_mode == gbs::DisplayMode::Mode3Bitmap && bitmap3_bitmap_asset.width == 16 && bitmap3_bitmap_asset.height == 8 && bitmap3_bitmap_pixels[1] == 0x7fff ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/bitmap3_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/bitmap3_compile.cpp -o $(HOST_BUILD)/assetc/bitmap3_compile
	$(HOST_BUILD)/assetc/bitmap3_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/bitmap4.hpp -n bitmap4 --bitmap-mode 4 --palette-bank 2
	grep -q "constexpr gbs::Bitmap8Asset bitmap4_bitmap_asset" $(HOST_BUILD)/assetc/bitmap4.hpp
	grep -q "constexpr gbs::PaletteAsset bitmap4_palette_asset" $(HOST_BUILD)/assetc/bitmap4.hpp
	printf '#include "bitmap4.hpp"\nint main() { return bitmap4_display_mode == gbs::DisplayMode::Mode4Bitmap && bitmap4_palette_asset.start_index == 32 && bitmap4_bitmap_pixels[1] == 1 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/bitmap4_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/bitmap4_compile.cpp -o $(HOST_BUILD)/assetc/bitmap4_compile
	$(HOST_BUILD)/assetc/bitmap4_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/bitmap5.hpp -n bitmap5 --bitmap-mode 5
	grep -q "constexpr gbs::Bitmap16Asset bitmap5_bitmap_asset" $(HOST_BUILD)/assetc/bitmap5.hpp
	printf '#include "bitmap5.hpp"\nint main() { return bitmap5_display_mode == gbs::DisplayMode::Mode5Bitmap && bitmap5_bitmap_asset.width == 16 && bitmap5_bitmap_asset.height == 8 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/bitmap5_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/bitmap5_compile.cpp -o $(HOST_BUILD)/assetc/bitmap5_compile
	$(HOST_BUILD)/assetc/bitmap5_compile
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/tilemap.png -o $(HOST_BUILD)/assetc/tilemap_collision.hpp -n tilemap_collision --destination-tile 7 --palette-bank 2 --collision-color-index 3
	grep -q "constexpr uint8_t tilemap_collision_collision_flags\\[2\\] = { 0x1, 0x1 }" $(HOST_BUILD)/assetc/tilemap_collision.hpp
	grep -q "constexpr gbs::TileMap tilemap_collision_collision_map" $(HOST_BUILD)/assetc/tilemap_collision.hpp
	printf '#include "tilemap_collision.hpp"\nint main() { return tilemap_collision_collision_map.width == 2 && tilemap_collision_collision_map.height == 1 && tilemap_collision_collision_flags[0] == 1 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/tilemap_collision_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/tilemap_collision_compile.cpp -o $(HOST_BUILD)/assetc/tilemap_collision_compile
	$(HOST_BUILD)/assetc/tilemap_collision_compile
	python3 tests/host/make_slope_tilemap_png.py $(HOST_BUILD)/assetc/slopes.png
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/slopes.png -o $(HOST_BUILD)/assetc/slopes.hpp -n slopes --slope-color-indexes 1,2,3,4
	grep -q "constexpr gbs::TileSlope slopes_slope_tiles\\[4\\]" $(HOST_BUILD)/assetc/slopes.hpp
	grep -q "gbs::TileSlope::BlockBelowFalling" $(HOST_BUILD)/assetc/slopes.hpp
	printf '#include "slopes.hpp"\nint main() { return slopes_slope_tiles[0] == gbs::TileSlope::BlockAboveRising && slopes_slope_tiles[3] == gbs::TileSlope::BlockBelowFalling && slopes_collision_map.slopes == slopes_slope_tiles ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/slopes_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/slopes_compile.cpp -o $(HOST_BUILD)/assetc/slopes_compile
	$(HOST_BUILD)/assetc/slopes_compile
	python3 tests/host/make_assetc_tilemap_png.py $(HOST_BUILD)/assetc/large_tilemap.png 64 64
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/large_tilemap.png -o $(HOST_BUILD)/assetc/large_tilemap.hpp -n large_tilemap --destination-tile 4 --palette-bank 1
	grep -q "constexpr int large_tilemap_tilemap_width = 64;" $(HOST_BUILD)/assetc/large_tilemap.hpp
	grep -q "constexpr int large_tilemap_tilemap_height = 64;" $(HOST_BUILD)/assetc/large_tilemap.hpp
	grep -q "constexpr int large_tilemap_tile_count = 1;" $(HOST_BUILD)/assetc/large_tilemap.hpp
	printf '#include "large_tilemap.hpp"\nint main() { return large_tilemap_tilemap_width == 64 && large_tilemap_tilemap_height == 64 && large_tilemap_tilemap_entries[4095] >= 0x1004 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/large_tilemap_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/large_tilemap_compile.cpp -o $(HOST_BUILD)/assetc/large_tilemap_compile
	$(HOST_BUILD)/assetc/large_tilemap_compile
	python3 tests/host/make_assetc_tilemap_png.py $(HOST_BUILD)/assetc/affine_tilemap.png 16 16
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/affine_tilemap.png -o $(HOST_BUILD)/assetc/affine_tilemap.hpp -n affine_tilemap --destination-tile 4 --affine-tilemap
	grep -q "constexpr gbs::AffineTileMapAsset affine_tilemap_tilemap_asset" $(HOST_BUILD)/assetc/affine_tilemap.hpp
	grep -q "const gbs::AffineTileAsset affine_tilemap_tile_asset" $(HOST_BUILD)/assetc/affine_tilemap.hpp
	printf '#include "affine_tilemap.hpp"\nint main() { return affine_tilemap_tilemap_width == 16 && affine_tilemap_tilemap_height == 16 && affine_tilemap_tile_asset.destination_tile == 4 && affine_tilemap_tilemap_entries[255] == 4 && affine_tilemap_map_size == gbs::AffineBackgroundMapSize::Size16x16 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/affine_tilemap_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/affine_tilemap_compile.cpp -o $(HOST_BUILD)/assetc/affine_tilemap_compile
	$(HOST_BUILD)/assetc/affine_tilemap_compile
	python3 tests/host/make_sprite_sheet_png.py $(HOST_BUILD)/assetc/sprite16.png 16 16 2
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/sprite16.png -o $(HOST_BUILD)/assetc/sprite16.hpp -n sprite16 --destination-tile 16 --palette-bank 1 --sprite-width 16 --sprite-height 16 --frame-duration 5
	grep -q "constexpr int sprite16_frame_count = 2;" $(HOST_BUILD)/assetc/sprite16.hpp
	grep -q "constexpr gbs::SpriteAnimation sprite16_animation" $(HOST_BUILD)/assetc/sprite16.hpp
	printf '#include "sprite16.hpp"\nint main() { return sprite16_sprite_width == 16 && sprite16_sprite_height == 16 && sprite16_tile_count == 8 && sprite16_animation.frame_count == 2 && sprite16_metasprites[1].parts[0].tile_index == 20 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/sprite16_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/sprite16_compile.cpp -o $(HOST_BUILD)/assetc/sprite16_compile
	$(HOST_BUILD)/assetc/sprite16_compile
	python3 tests/host/make_sprite_sheet_png.py $(HOST_BUILD)/assetc/sprite16x32.png 16 32 2
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/sprite16x32.png -o $(HOST_BUILD)/assetc/sprite16x32.hpp -n sprite16x32 --destination-tile 32 --palette-bank 2 --sprite-width 16 --sprite-height 32 --frame-duration 7
	grep -q "constexpr int sprite16x32_sprite_height = 32;" $(HOST_BUILD)/assetc/sprite16x32.hpp
	printf '#include "sprite16x32.hpp"\nint main() { return sprite16x32_tile_count == 16 && sprite16x32_metasprites[0].part_count == 1 && sprite16x32_metasprites[0].parts[0].width == 16 && sprite16x32_metasprites[0].parts[0].height == 32 && sprite16x32_metasprites[1].parts[0].tile_index == 40 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/sprite16x32_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/sprite16x32_compile.cpp -o $(HOST_BUILD)/assetc/sprite16x32_compile
	$(HOST_BUILD)/assetc/sprite16x32_compile
	python3 tests/host/make_sprite_sheet_png.py $(HOST_BUILD)/assetc/sprite32.png 32 32 2
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/sprite32.png -o $(HOST_BUILD)/assetc/sprite32.hpp -n sprite32 --destination-tile 48 --palette-bank 3 --sprite-width 32 --sprite-height 32 --frame-duration 6
	printf '#include "sprite32.hpp"\nint main() { return sprite32_tile_count == 32 && sprite32_metasprites[0].part_count == 1 && sprite32_metasprites[0].parts[0].width == 32 && sprite32_metasprites[0].parts[0].height == 32 && sprite32_metasprites[1].parts[0].tile_index == 64 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/sprite32_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/sprite32_compile.cpp -o $(HOST_BUILD)/assetc/sprite32_compile
	$(HOST_BUILD)/assetc/sprite32_compile
	python3 tests/host/make_sprite_sheet_png.py $(HOST_BUILD)/assetc/sprite24.png 24 24 1
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/sprite24.png -o $(HOST_BUILD)/assetc/sprite24.hpp -n sprite24 --sprite-width 24 --sprite-height 24
	printf '#include "sprite24.hpp"\nint main() { return sprite24_metasprites[0].part_count == 4 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/sprite24_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/sprite24_compile.cpp -o $(HOST_BUILD)/assetc/sprite24_compile
	$(HOST_BUILD)/assetc/sprite24_compile
	python3 tests/host/make_sprite_sheet_png.py $(HOST_BUILD)/assetc/sprite96x64.png 96 64 2
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/sprite96x64.png -o $(HOST_BUILD)/assetc/sprite96x64.hpp -n sprite96x64 --destination-tile 80 --sprite-width 96 --sprite-height 64
	printf '#include "sprite96x64.hpp"\nint main() { return sprite96x64_frame_count == 2 && sprite96x64_metasprites[0].part_count == 2 && sprite96x64_metasprites[0].parts[0].width == 64 && sprite96x64_metasprites[0].parts[0].height == 64 && sprite96x64_metasprites[0].parts[0].tile_index == 80 && sprite96x64_metasprites[0].parts[1].x == 64 && sprite96x64_metasprites[0].parts[1].width == 32 && sprite96x64_metasprites[0].parts[1].height == 64 && sprite96x64_metasprites[0].parts[1].tile_index == 144 && sprite96x64_metasprites[1].parts[0].tile_index == 176 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/sprite96x64_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/sprite96x64_compile.cpp -o $(HOST_BUILD)/assetc/sprite96x64_compile
	$(HOST_BUILD)/assetc/sprite96x64_compile
	printf '{"assets":[{"name":"room_bg","bank_group":"room_0","kind":"bg","png":"tilemap.png","placement":{"bg_tiles":{"alignment":4},"bg_palette_colors":{"alignment":16}}},{"name":"player","bank_group":"actors","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16,"placement":{"obj_palette_colors":{"alignment":16}}},{"name":"affine_room","bank_group":"room_1","kind":"affine_bg","png":"affine_tilemap.png"}]}\n' > $(HOST_BUILD)/assetc/pack.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/pack.json -o $(HOST_BUILD)/assetc/pack_report.json --pack-json
	python3 -m json.tool $(HOST_BUILD)/assetc/pack_report.json >/tmp/gbs_assetc_pack_report_check
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/assetc/pack_report.json --json > $(HOST_BUILD)/assetc/pack_report_schema_validation.json
	grep -q '"schema": "asset_pack_report"' $(HOST_BUILD)/assetc/pack_report_schema_validation.json
	grep -q '"detected_schema": "asset_pack_report"' $(HOST_BUILD)/assetc/pack_report_schema_validation.json
	grep -q '"ok": true' $(HOST_BUILD)/assetc/pack_report_schema_validation.json
	grep -q '"kind": "GBAStudioAssetPackReport"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"ok": true' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"schema": 11' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"production_summary"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"production_profile"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"asset_reports"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"pool_reports"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"room_pressure_report"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"template_pressure_report"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"split_recommendations"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"compression_candidates"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"stress_profile": "default"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"fingerprint"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"budgets"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"budget_summary"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"bank_usage_by_group"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"group_pressure_report"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"percent_of_pool"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"remaining_after_group"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"fragmentation_report"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"overflow_report"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"fallback_applied": false' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"diagnostics"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"banks"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"resource_bank_plan"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"resource_bank_groups"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"incremental"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"rebuild_plan"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"export_plan"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"header_count": 3' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"header": "room_bg.hpp"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"assetc_args"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"status": "new"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"change_reason": "new_asset"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"crc32"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"bg_tiles"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"name": "room_bg_bg_tiles"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"kind": "bg_palette"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"group": "room_0"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"name": "actors"' $(HOST_BUILD)/assetc/pack_report.json
	grep -q '"affine_bg_tiles"' $(HOST_BUILD)/assetc/pack_report.json
	printf '{"assets":[{"name":"near_full_bg","resources":{"bg_tiles":720}}]}\n' > $(HOST_BUILD)/assetc/pack_warning.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/pack_warning.json -o $(HOST_BUILD)/assetc/pack_warning_report.json --pack-json
	python3 -m json.tool $(HOST_BUILD)/assetc/pack_warning_report.json >/tmp/gbs_assetc_pack_warning_report_check
	grep -q '"ok": true' $(HOST_BUILD)/assetc/pack_warning_report.json
	grep -q '"severity": "warning"' $(HOST_BUILD)/assetc/pack_warning_report.json
	grep -q '"code": "GBS_ASSET_PACK_BUDGET_NEAR_LIMIT"' $(HOST_BUILD)/assetc/pack_warning_report.json
	grep -q '"percent_used": 80' $(HOST_BUILD)/assetc/pack_warning_report.json
	printf '{"assets":[{"name":"room_bg","id":"room_bg","bank_group":"room_0","kind":"bg","png":"tilemap.png"},{"name":"player","id":"player","bank_group":"actors","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16},{"name":"new_room","id":"new_room","bank_group":"room_1","kind":"affine_bg","png":"affine_tilemap.png"}]}\n' > $(HOST_BUILD)/assetc/pack_incremental.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/pack_incremental.json -o $(HOST_BUILD)/assetc/pack_incremental_report.json --pack-json --previous-pack-report $(HOST_BUILD)/assetc/pack_report.json
	python3 -m json.tool $(HOST_BUILD)/assetc/pack_incremental_report.json >/tmp/gbs_assetc_pack_incremental_report_check
	grep -q '"unchanged": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"changed": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"new": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"removed": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"status": "unchanged"' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"status": "changed"' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"status": "new"' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"skip": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"generate": 2' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"remove": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"generate_count": 2' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"skip_count": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"remove_count": 1' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"removed_headers":' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"change_reason": "fingerprint_match"' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"change_reason": "allocation_changed"' $(HOST_BUILD)/assetc/pack_incremental_report.json
	grep -q '"affine_room"' $(HOST_BUILD)/assetc/pack_incremental_report.json
	printf '{"assets":[{"name":"room_bg","id":"room_bg","bank_group":"room_0","kind":"bg","png":"tilemap.png","resources":{"bg_tiles":1}},{"name":"player","id":"player","bank_group":"actors","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16},{"name":"affine_room","id":"affine_room","bank_group":"room_1","kind":"affine_bg","png":"affine_tilemap.png"}]}\n' > $(HOST_BUILD)/assetc/pack_changed.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/pack_changed.json -o $(HOST_BUILD)/assetc/pack_changed_report.json --pack-json --previous-pack-report $(HOST_BUILD)/assetc/pack_report.json
	python3 -m json.tool $(HOST_BUILD)/assetc/pack_changed_report.json >/tmp/gbs_assetc_pack_changed_report_check
	grep -q '"changed": 1' $(HOST_BUILD)/assetc/pack_changed_report.json
	grep -q '"status": "changed"' $(HOST_BUILD)/assetc/pack_changed_report.json
	grep -q '"change_reason": "resources_changed"' $(HOST_BUILD)/assetc/pack_changed_report.json
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"topdown","template_dir":"../../../templates/exported_topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"build":{"target":"assetc_export","make_target":"all"},"requires":{"engine_pack":">=1.17.0","features":["topdown_project_data","dialogue","asset-export-topdown-project-data","asset_export_resource_bank_upload_sources","asset_export_semantic_asset_refs"]},"topdown_project":{"assets":{"bg_palettes":["room_bg"],"tile_assets":["room_bg"]},"backgrounds":[{"layer":"bg1","tilemap":"room_bg","scroll":{"x":0,"y":0},"parallax":{"x":128,"y":128}}],"resource_banks":"asset_pack","save":{"enabled":true,"signature":"GBTD","offset":0,"slot_capacity":512,"slot_count":3,"version":1},"rooms":[{"name":"generated_room","resource_bank_group":"room_0","width_tiles":2,"height_tiles":2,"visual_tiles":[0,1,1,0],"collision_flags":[0,0,1,1],"metadata":{"camera_mode":"fixed","camera_position":{"x":4,"y":5},"player_start":{"x":8,"y":8},"music_index":0,"backdrop_color":31,"camera_bounds":{"x":0,"y":0,"width":64,"height":64}},"on_enter":[{"op":"show_choice","group":0}],"on_interact":[{"op":"set_variable","variable":2,"value":9}],"interactions":[{"area":{"x":0,"y":0,"width":8,"height":8},"script":[{"op":"show_dialogue","line":1}]}],"npcs":[{"name":"guide","position":{"x":8,"y":8},"size":{"x":16,"y":16},"direction":"left","collision_group":1,"collision_mask":9,"push_priority":12,"pushable":true,"movement":{"kind":"patrol_horizontal","bounds":{"x":0,"y":0,"width":32,"height":16},"step_interval_frames":6},"on_interact":[{"op":"show_dialogue","line":1},{"op":"play_sfx","index":0}]}],"triggers":[{"area":{"x":0,"y":8,"width":8,"height":8},"kind":"damage","run_once":true,"cooldown_frames":20,"on_enter":[{"op":"set_variable","variable":3,"value":1}]}],"portals":[{"area":{"x":8,"y":0,"width":8,"height":8},"target_room":0,"target_position":{"x":8,"y":8},"script":[{"op":"play_sfx","index":0},{"op":"warp","room":0,"x":8,"y":8}]}]}],"player":{"position":{"x":8,"y":8},"size":{"x":16,"y":16},"speed":1,"collision_group":2,"collision_mask":9,"push_priority":20,"pushable":false,"emit_animation_fallback":true},"camera":{"position":{"x":0,"y":0},"follow_player":true},"dialogue_lines":["Generated hello","Generated hotspot"],"choice_groups":[{"line":0,"variable":4,"choices":[{"text":"YES","value":1,"script":[{"op":"set_variable","variable":5,"value":1}]},{"text":"NO","value":2}]}]},"asset_pack":{"assets":[{"name":"room_bg","id":"room_bg","bank_group":"room_0","kind":"bg","png":"tilemap.png","header":"generated_room_bg.hpp","symbol":"generated_room_bg"}]}}\n' > $(HOST_BUILD)/assetc/export_project.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_project.json -o $(HOST_BUILD)/assetc/exported_project --export-project-json
	python3 -m json.tool $(HOST_BUILD)/assetc/exported_project/gbastudio_project.json >/tmp/gbs_assetc_export_project_manifest_check
	grep -q '"backend": "gbastudio_engine"' $(HOST_BUILD)/assetc/exported_project/gbastudio_project.json
	grep -q '"target": "assetc_export"' $(HOST_BUILD)/assetc/exported_project/gbastudio_project.json
	grep -q '"generated_room_bg.hpp"' $(HOST_BUILD)/assetc/exported_project/gbastudio_project.json
	grep -q "constexpr uint16_t generated_room_visual_tiles" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "const gbs::TopDownProjectData project" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "project_bg_palette_assets" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "project_tile_assets" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::SpriteAnimation player_sprite_animation" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "generated_room_portal_events" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::EventOp::Warp" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::EventOp::SetVariable" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "generated_room_interactions" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::TopDownCameraMode::Fixed" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "static_cast<uint16_t>(31)" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "generated_room_npcs" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::TopDownNpcMovementKind::PatrolHorizontal" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "generated_room_triggers" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::TopDownTriggerKind::Damage" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "dialogue_choices" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::EventOp::ShowChoice" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::EventScript project_scripts" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "constexpr bool save_enabled = true" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::make_save_signature('G', 'B', 'T', 'D')" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::TopDownBackgroundData backgrounds" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q '#include "generated_room_bg.hpp"' $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::BackgroundLayer::BG1" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "generated_room_bg_tilemap_asset" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::ResourceBank resource_banks" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::ResourceBankGroup resource_bank_groups" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::ResourceBankUploadSource resource_bank_upload_sources" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "generated_room_bg_tiles" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "generated_room_bg_palette" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "\"room_0\"" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q "gbs::ResourcePoolKind::BgTiles" $(HOST_BUILD)/assetc/exported_project/gbastudio_project_data.hpp
	grep -q '"resource_bank_groups"' $(HOST_BUILD)/assetc/exported_project/asset_pack_report.json
	grep -q '"group": "room_0"' $(HOST_BUILD)/assetc/exported_project/asset_pack_report.json
	grep -q "constexpr gbs::TileMapAsset generated_room_bg_tilemap_asset" $(HOST_BUILD)/assetc/exported_project/generated_room_bg.hpp
	printf '#include "gbastudio_project_data.hpp"\nint main() { return gbs::is_valid_topdown_project_data(gbastudio_project::project) && gbastudio_project::save_enabled && gbs::is_valid_save_bank(gbastudio_project::save_bank) && gbastudio_project::save_bank.slot_count == 3 && gbastudio_project::project.background_count == 1 && gbastudio_project::project.backgrounds[0].parallax_256.x == 128 && gbastudio_project::project.resource_bank_count == 2 && gbastudio_project::resource_bank_upload_source_count == 2 && gbastudio_project::project.room_count == 1 && gbastudio_project::project.rooms[0].npcs[0].collision_mask == 9 && gbastudio_project::project.rooms[0].npcs[0].push_priority == 12 && gbastudio_project::project.rooms[0].npcs[0].pushable && gbastudio_project::project.player.collision_group == 2 && gbastudio_project::project.player.push_priority == 20 && !gbastudio_project::project.player.pushable && gbastudio_project::project.rooms[0].resource_bank_group_name != nullptr && gbs::find_topdown_room_resource_bank_group_index(gbastudio_project::project, gbastudio_project::project.rooms[0]) == 0 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_project_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_project $(HOST_BUILD)/assetc/exported_project_compile.cpp -o $(HOST_BUILD)/assetc/exported_project_compile
	$(HOST_BUILD)/assetc/exported_project_compile
	printf '{"sfx":[{"name":"portal","tones":[{"frequency_hz":880,"duration_frames":5,"volume":12,"duty":2,"noise":false}]}],"music":[{"name":"room","loop":true,"steps":[{"frequency_hz":262,"duration_frames":8,"volume":4,"duty":1}]}],"tracker":[{"name":"cue","loop":false,"order":[0],"patterns":[{"steps":[{"channel":2,"frequency_hz":330,"duration_frames":4,"volume":5,"duty":1}]}]}],"pcm":[{"name":"hit","sample_rate_hz":8000,"loop":false,"samples":[0,12,-12,0]}]}\n' > $(HOST_BUILD)/assetc/semantic_audio.json
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"topdown","template_dir":"../../../templates/exported_topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"build":{"target":"assetc_semantic_audio_export","make_target":"all"},"requires":{"engine_pack":">=1.82.0","features":["topdown_project_data","asset_export_semantic_audio_refs"]},"topdown_project":{"assets":{"bg_palettes":["room_bg"],"tile_assets":["room_bg"],"sfx_assets":[{"asset":"audio_pack","index":0}],"music_assets":["audio_pack"],"pcm_assets":[{"asset":"audio_pack","index":0}],"tracker_assets":[{"asset":"audio_pack","index":0}]},"resource_banks":"asset_pack","rooms":[{"name":"audio_room","width_tiles":2,"height_tiles":2,"visual_tiles":[0,1,1,0],"collision_flags":[0,0,0,0],"metadata":{"music_index":0},"portals":[{"area":{"x":8,"y":0,"width":8,"height":8},"target_room":0,"target_position":{"x":8,"y":8},"script":[{"op":"play_sfx","index":0},{"op":"play_music","index":0}]}]}],"player":{"position":{"x":8,"y":8},"size":{"x":16,"y":16},"speed":1},"camera":{"position":{"x":0,"y":0},"follow_player":true},"dialogue_lines":[]},"asset_pack":{"assets":[{"name":"room_bg","id":"room_bg","bank_group":"room_0","kind":"bg","png":"tilemap.png","header":"semantic_room_bg.hpp","symbol":"semantic_room_bg"},{"name":"audio","id":"audio_pack","kind":"audio","audio_json":"semantic_audio.json","header":"semantic_audio.hpp","symbol":"semantic_audio"}]}}\n' > $(HOST_BUILD)/assetc/export_project_semantic_audio.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_project_semantic_audio.json -o $(HOST_BUILD)/assetc/exported_project_semantic_audio --export-project-json
	grep -q '#include "semantic_audio.hpp"' $(HOST_BUILD)/assetc/exported_project_semantic_audio/gbastudio_project_data.hpp
	grep -q "semantic_audio_sfx_assets\\[0\\]" $(HOST_BUILD)/assetc/exported_project_semantic_audio/gbastudio_project_data.hpp
	grep -q "semantic_audio_music_assets\\[0\\]" $(HOST_BUILD)/assetc/exported_project_semantic_audio/gbastudio_project_data.hpp
	grep -q "semantic_audio_pcm_assets\\[0\\]" $(HOST_BUILD)/assetc/exported_project_semantic_audio/gbastudio_project_data.hpp
	grep -q "semantic_audio_tracker_assets\\[0\\]" $(HOST_BUILD)/assetc/exported_project_semantic_audio/gbastudio_project_data.hpp
	grep -q "constexpr gbs::SfxAsset semantic_audio_sfx_assets" $(HOST_BUILD)/assetc/exported_project_semantic_audio/semantic_audio.hpp
	printf '#include "gbastudio_project_data.hpp"\nint main() { return gbastudio_project::project.sfx_asset_count == 1 && gbastudio_project::project.music_asset_count == 1 && gbastudio_project::project.pcm_asset_count == 1 && gbastudio_project::project.tracker_asset_count == 1 && gbastudio_project::project.rooms[0].metadata.music_index == 0 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_project_semantic_audio_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_project_semantic_audio $(HOST_BUILD)/assetc/exported_project_semantic_audio_compile.cpp -o $(HOST_BUILD)/assetc/exported_project_semantic_audio_compile
	$(HOST_BUILD)/assetc/exported_project_semantic_audio_compile
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"topdown","template_dir":"../../../templates/exported_topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"build":{"target":"assetc_semantic_actor_export","make_target":"all"},"requires":{"engine_pack":">=1.83.0","features":["topdown_project_data","asset_export_semantic_actor_refs"]},"topdown_project":{"assets":{"bg_palettes":["room_bg"],"obj_palettes":["player_sprite"],"tile_assets":["room_bg","player_sprite"]},"resource_banks":"asset_pack","rooms":[{"name":"actor_room","width_tiles":2,"height_tiles":2,"visual_tiles":[0,1,1,0],"collision_flags":[0,0,0,0],"npcs":[{"name":"guide","position":{"x":8,"y":8},"size":{"x":16,"y":16},"metasprite":{"asset":"player_sprite","index":0},"animation":{"asset":"player_sprite"},"on_interact":[{"op":"show_dialogue","line":0}]}]}],"player":{"position":{"x":8,"y":8},"size":{"x":16,"y":16},"speed":1,"metasprite":{"asset":"player_sprite","index":1},"animation":{"asset":"player_sprite"}},"camera":{"position":{"x":0,"y":0},"follow_player":true},"dialogue_lines":["Actor hello"]},"asset_pack":{"assets":[{"name":"room_bg","id":"room_bg","bank_group":"room_0","kind":"bg","png":"tilemap.png","header":"semantic_actor_room_bg.hpp","symbol":"semantic_actor_room_bg"},{"name":"player","id":"player_sprite","bank_group":"actors","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16,"frame_duration":5,"header":"semantic_player.hpp","symbol":"semantic_player"}]}}\n' > $(HOST_BUILD)/assetc/export_project_semantic_actor.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_project_semantic_actor.json -o $(HOST_BUILD)/assetc/exported_project_semantic_actor --export-project-json
	grep -q '#include "semantic_player.hpp"' $(HOST_BUILD)/assetc/exported_project_semantic_actor/gbastudio_project_data.hpp
	grep -q "&semantic_player_metasprites\\[1\\]" $(HOST_BUILD)/assetc/exported_project_semantic_actor/gbastudio_project_data.hpp
	grep -q "&semantic_player_metasprites\\[0\\]" $(HOST_BUILD)/assetc/exported_project_semantic_actor/gbastudio_project_data.hpp
	grep -q "&semantic_player_animation" $(HOST_BUILD)/assetc/exported_project_semantic_actor/gbastudio_project_data.hpp
	grep -q "const gbs::TileAsset project_tile_assets" $(HOST_BUILD)/assetc/exported_project_semantic_actor/gbastudio_project_data.hpp
	grep -q "semantic_player_tile_asset" $(HOST_BUILD)/assetc/exported_project_semantic_actor/gbastudio_project_data.hpp
	printf '#include "gbastudio_project_data.hpp"\nint main() { return gbs::is_valid_topdown_project_data(gbastudio_project::project) && gbastudio_project::project.player.metasprite == &semantic_player_metasprites[1] && gbastudio_project::project.rooms[0].npcs[0].metasprite == &semantic_player_metasprites[0] && gbastudio_project::project.rooms[0].npcs[0].animation == &semantic_player_animation ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_project_semantic_actor_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_project_semantic_actor $(HOST_BUILD)/assetc/exported_project_semantic_actor_compile.cpp -o $(HOST_BUILD)/assetc/exported_project_semantic_actor_compile
	$(HOST_BUILD)/assetc/exported_project_semantic_actor_compile
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"platformer","template_dir":"../../../templates/exported_platformer","entry":"main.cpp","project_data":"platformer_project_data.hpp","generated_assets":[],"build":{"target":"assetc_platformer_export","make_target":"all"},"requires":{"engine_pack":">=1.16.0","features":["platformer_runtime","engine_sdk.platformer_project_data_contract"]},"platformer_project":{"includes":["../tilemap.hpp"],"assets":{"bg_palettes":["tilemap_palette_asset"],"tile_assets":["tilemap_tile_asset"]},"initial_room":0,"backdrop_color":99,"config":{"gravity_x256":56,"jump_speed_x256":1280,"ladders_enabled":true},"rooms":[{"name":"generated_platformer_room","width_tiles":4,"height_tiles":3,"visual_tiles":[0,0,0,0,0,1,0,0,2,2,2,2],"collision_flags":[0,0,0,0,0,4,0,0,1,1,1,1],"player_start":{"x":8,"y":8,"width":16,"height":16},"camera":{"position":{"x":2,"y":4},"follow_player":true},"on_enter":[{"op":"set_variable","variable":1,"value":7}],"on_update":[{"op":"show_dialogue_if","line":0,"variable":1,"value":7}],"hazards":[{"area":{"x":16,"y":16,"width":8,"height":8},"damage":2,"respawn":true,"on_hit":[{"op":"play_sfx","index":0}]}],"checkpoints":[{"area":{"x":8,"y":8,"width":16,"height":16},"respawn_position":{"x":8,"y":8},"id":7,"on_activate":[{"op":"set_variable","variable":2,"value":3}]}],"camera_zones":[{"area":{"x":0,"y":0,"width":32,"height":24},"bounds":{"x":0,"y":0,"width":64,"height":48},"offset":{"x":1,"y":2},"lock_x":false,"lock_y":true,"on_enter":[{"op":"set_camera_position","x":1,"y":2}]}]}]}}\n' > $(HOST_BUILD)/assetc/export_platformer_project.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_platformer_project.json -o $(HOST_BUILD)/assetc/exported_platformer_project --export-project-json
	python3 -m json.tool $(HOST_BUILD)/assetc/exported_platformer_project/gbastudio_project.json >/tmp/gbs_assetc_export_platformer_manifest_check
	grep -q '"kind": "platformer"' $(HOST_BUILD)/assetc/exported_platformer_project/gbastudio_project.json
	grep -q '"target": "assetc_platformer_export"' $(HOST_BUILD)/assetc/exported_platformer_project/gbastudio_project.json
	grep -q "const gbs::PlatformerProjectData project" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "project_bg_palette_assets" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "project_tile_assets" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "generated_platformer_room_hazards" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "generated_platformer_room_checkpoints" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "generated_platformer_room_camera_zones" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "generated_platformer_room_hazard_events" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "generated_platformer_room_checkpoint_events" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "generated_platformer_room_camera_zone_events" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "gbs::EventOp::SetVariable" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	grep -q "static_cast<uint16_t>(99)" $(HOST_BUILD)/assetc/exported_platformer_project/platformer_project_data.hpp
	printf '#include "platformer_project_data.hpp"\nint main() { return gbs::is_valid_platformer_project_data(gbastudio_platformer_project::project) && gbastudio_platformer_project::project.rooms[0].hazard_count == 1 && gbastudio_platformer_project::project.rooms[0].checkpoint_count == 1 && gbastudio_platformer_project::project.rooms[0].camera_zone_count == 1 && gbastudio_platformer_project::project.rooms[0].hazard_event_count == 1 && gbastudio_platformer_project::project.rooms[0].checkpoint_event_count == 1 && gbastudio_platformer_project::project.rooms[0].camera_zone_event_count == 1 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_platformer_project_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_platformer_project $(HOST_BUILD)/assetc/exported_platformer_project_compile.cpp -o $(HOST_BUILD)/assetc/exported_platformer_project_compile
	$(HOST_BUILD)/assetc/exported_platformer_project_compile
	cp tests/fixtures/export_platformer_project_multiroom.json $(HOST_BUILD)/assetc/export_platformer_project_multiroom.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_platformer_project_multiroom.json -o $(HOST_BUILD)/assetc/exported_platformer_project_multiroom --export-project-json
	grep -q "generated_platformer_warp_room" $(HOST_BUILD)/assetc/exported_platformer_project_multiroom/platformer_project_data.hpp
	grep -q "gbs::EventOp::Warp" $(HOST_BUILD)/assetc/exported_platformer_project_multiroom/platformer_project_data.hpp
	grep -q "constexpr gbs::ResourceBank resource_banks" $(HOST_BUILD)/assetc/exported_platformer_project_multiroom/platformer_project_data.hpp
	grep -q "constexpr bool save_enabled = true" $(HOST_BUILD)/assetc/exported_platformer_project_multiroom/platformer_project_data.hpp
	grep -q "gbs::make_save_signature('G', 'B', 'P', 'F')" $(HOST_BUILD)/assetc/exported_platformer_project_multiroom/platformer_project_data.hpp
	grep -q "constexpr gbs::PlatformerEnemy generated_platformer_room_enemies" $(HOST_BUILD)/assetc/exported_platformer_project_multiroom/platformer_project_data.hpp
	grep -q "constexpr gbs::PlatformerMovingPlatform generated_platformer_room_moving_platforms" $(HOST_BUILD)/assetc/exported_platformer_project_multiroom/platformer_project_data.hpp
	printf '#include "platformer_project_data.hpp"\nint main() { return gbs::is_valid_platformer_project_data(gbastudio_platformer_project::project) && gbastudio_platformer_project::save_enabled && gbs::is_valid_save_bank(gbastudio_platformer_project::save_bank) && gbastudio_platformer_project::project.resource_bank_count == 3 && gbastudio_platformer_project::project.room_count == 2 && gbastudio_platformer_project::project.rooms[0].hazard_event_count == 1 && gbastudio_platformer_project::project.rooms[0].enemy_count == 1 && gbastudio_platformer_project::project.rooms[0].moving_platform_count == 1 && gbastudio_platformer_project::project.rooms[1].on_enter.command_count == 2 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_platformer_project_multiroom_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_platformer_project_multiroom $(HOST_BUILD)/assetc/exported_platformer_project_multiroom_compile.cpp -o $(HOST_BUILD)/assetc/exported_platformer_project_multiroom_compile
	$(HOST_BUILD)/assetc/exported_platformer_project_multiroom_compile
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"platformer","template_dir":"../../../templates/exported_platformer","entry":"main.cpp","project_data":"platformer_project_data.hpp","generated_assets":[],"build":{"target":"assetc_platformer_semantic_enemy_export","make_target":"all"},"requires":{"engine_pack":">=1.87.0","features":["platformer_runtime","engine_sdk.platformer_project_data_contract","asset_export_semantic_platformer_enemy_refs","platformer_runtime.enemy_event_scripts"]},"platformer_project":{"assets":{"obj_palettes":["enemy_sprite"],"tile_assets":["enemy_sprite"]},"initial_room":0,"backdrop_color":99,"rooms":[{"name":"generated_platformer_semantic_room","width_tiles":4,"height_tiles":3,"visual_tiles":[0,0,0,0,0,1,0,0,2,2,2,2],"collision_flags":[0,0,0,0,0,4,0,0,1,1,1,1],"player_start":{"x":8,"y":8,"width":16,"height":16},"camera":{"position":{"x":0,"y":0},"follow_player":true},"enemies":[{"bounds":{"x":16,"y":16,"width":16,"height":16},"patrol_bounds":{"x":8,"y":16,"width":32,"height":16},"velocity":{"x":256,"y":0},"metasprite":{"asset":"enemy_sprite","index":1},"damage":2,"on_hit":[{"op":"set_variable","variable":5,"value":9}]}]}]},"asset_pack":{"assets":[{"name":"enemy","id":"enemy_sprite","bank_group":"platform_room","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16,"frame_duration":5,"header":"semantic_platform_enemy.hpp","symbol":"semantic_platform_enemy"}]}}\n' > $(HOST_BUILD)/assetc/export_platformer_project_semantic_enemy.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_platformer_project_semantic_enemy.json -o $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy --export-project-json
	grep -q '#include "semantic_platform_enemy.hpp"' $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy/platformer_project_data.hpp
	grep -q "semantic_platform_enemy_metasprites\\[1\\].parts\\[0\\].tile_index" $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy/platformer_project_data.hpp
	grep -q "semantic_platform_enemy_metasprites\\[1\\].parts\\[0\\].palette" $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy/platformer_project_data.hpp
	grep -q "generated_platformer_semantic_room_enemy_events" $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy/platformer_project_data.hpp
	printf '#include "platformer_project_data.hpp"\nint main() { const gbs::EventScript script = gbs::platformer_enemy_event_script_for(gbastudio_platformer_project::project.rooms[0], 0); return gbs::is_valid_platformer_project_data(gbastudio_platformer_project::project) && gbastudio_platformer_project::project.rooms[0].enemy_count == 1 && gbastudio_platformer_project::project.rooms[0].enemy_event_count == 1 && script.command_count == 2 && script.commands[0].op == gbs::EventOp::SetVariable && script.commands[0].a == 5 && script.commands[0].b == 9 && gbastudio_platformer_project::project.rooms[0].enemies[0].tile_index == semantic_platform_enemy_metasprites[1].parts[0].tile_index && gbastudio_platformer_project::project.rooms[0].enemies[0].palette == semantic_platform_enemy_metasprites[1].parts[0].palette ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy_compile.cpp -o $(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy_compile
	$(HOST_BUILD)/assetc/exported_platformer_project_semantic_enemy_compile
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"platformer","template_dir":"../../../templates/exported_platformer","entry":"main.cpp","project_data":"platformer_project_data.hpp","generated_assets":[],"build":{"target":"assetc_platformer_semantic_platform_export","make_target":"all"},"requires":{"engine_pack":">=1.88.0","features":["platformer_runtime","engine_sdk.platformer_project_data_contract","asset_export_semantic_platformer_platform_refs","platformer_runtime.moving_platform_event_scripts"]},"platformer_project":{"assets":{"obj_palettes":["platform_sprite"],"tile_assets":["platform_sprite"]},"initial_room":0,"backdrop_color":99,"rooms":[{"name":"generated_platformer_semantic_platform_room","width_tiles":4,"height_tiles":3,"visual_tiles":[0,0,0,0,0,1,0,0,2,2,2,2],"collision_flags":[0,0,0,0,0,4,0,0,1,1,1,1],"player_start":{"x":8,"y":8,"width":16,"height":16},"camera":{"position":{"x":0,"y":0},"follow_player":true},"moving_platforms":[{"bounds":{"x":16,"y":16,"width":16,"height":16},"start":{"x":8,"y":16},"end":{"x":32,"y":16},"velocity":{"x":256,"y":0},"metasprite":{"asset":"platform_sprite","index":1},"on_stand":[{"op":"set_variable","variable":6,"value":13}]}]}]},"asset_pack":{"assets":[{"name":"platform","id":"platform_sprite","bank_group":"platform_room","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16,"frame_duration":5,"header":"semantic_platform_platform.hpp","symbol":"semantic_platform_platform"}]}}\n' > $(HOST_BUILD)/assetc/export_platformer_project_semantic_platform.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_platformer_project_semantic_platform.json -o $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform --export-project-json
	grep -q '#include "semantic_platform_platform.hpp"' $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform/platformer_project_data.hpp
	grep -q "semantic_platform_platform_metasprites\\[1\\].parts\\[0\\].tile_index" $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform/platformer_project_data.hpp
	grep -q "semantic_platform_platform_metasprites\\[1\\].parts\\[0\\].palette" $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform/platformer_project_data.hpp
	grep -q "generated_platformer_semantic_platform_room_moving_platform_events" $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform/platformer_project_data.hpp
	printf '#include "platformer_project_data.hpp"\nint main() { const gbs::EventScript script = gbs::platformer_moving_platform_event_script_for(gbastudio_platformer_project::project.rooms[0], 0); return gbs::is_valid_platformer_project_data(gbastudio_platformer_project::project) && gbastudio_platformer_project::project.rooms[0].moving_platform_count == 1 && gbastudio_platformer_project::project.rooms[0].moving_platform_event_count == 1 && script.command_count == 2 && script.commands[0].op == gbs::EventOp::SetVariable && script.commands[0].a == 6 && script.commands[0].b == 13 && gbastudio_platformer_project::project.rooms[0].moving_platforms[0].tile_index == semantic_platform_platform_metasprites[1].parts[0].tile_index && gbastudio_platformer_project::project.rooms[0].moving_platforms[0].palette == semantic_platform_platform_metasprites[1].parts[0].palette ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform_compile.cpp -o $(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform_compile
	$(HOST_BUILD)/assetc/exported_platformer_project_semantic_platform_compile
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"isometric","template_dir":"../../../templates/exported_isometric","entry":"main.cpp","project_data":"isometric_project_data.hpp","generated_assets":[],"build":{"target":"assetc_isometric_export","make_target":"all"},"requires":{"engine_pack":">=1.94.0","features":["isometric_runtime","engine_sdk.isometric_project_data_contract","isometric_runtime.tile_event_scripts","isometric_runtime.tile_event_areas","isometric_runtime.cursor_selection","isometric_runtime.cursor_actor_interaction","isometric_runtime.actor_command_apply","isometric_runtime.room_cursor_start"]},"isometric_project":{"includes":["../tilemap.hpp"],"assets":{"bg_palettes":["tilemap_palette_asset"],"tile_assets":["tilemap_tile_asset"]},"initial_room":0,"backdrop_color":123,"grid":{"tile_width_pixels":32,"tile_height_pixels":16,"origin":{"x":120,"y":24}},"rooms":[{"name":"generated_iso_room","width_tiles":3,"height_tiles":3,"visual_tiles":[1,1,1,1,2,1,1,1,1],"collision_flags":[1,1,1,1,0,1,1,1,1],"camera":{"position":{"x":0,"y":0},"bounds":{"x":0,"y":0,"width":96,"height":48},"bounds_enabled":true},"on_enter":[{"op":"set_variable","variable":1,"value":4}],"tile_events":[{"area":{"x":1,"y":1,"z":0,"width":2,"height":1},"on_interact":[{"op":"set_variable","variable":4,"value":11}]}],"cursor_start":{"x":2,"y":1,"z":0},"actors":[{"tile":{"x":1,"y":1,"z":0},"screen_offset":{"x":-8,"y":-16},"tile_index":0,"palette":0,"visible":true,"hflip":false,"priority":0},{"tile":{"x":1,"y":0,"z":0},"screen_offset":{"x":-8,"y":-16},"tile_index":0,"palette":0,"visible":true,"hflip":true,"priority":1,"on_interact":[{"op":"show_dialogue","line":0}],"on_start":[{"op":"set_actor_visible","actor":1,"visible":1}],"on_update":[{"op":"set_camera_position","x":0,"y":0}]}]}]}}\n' > $(HOST_BUILD)/assetc/export_isometric_project.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_isometric_project.json -o $(HOST_BUILD)/assetc/exported_isometric_project --export-project-json
	python3 -m json.tool $(HOST_BUILD)/assetc/exported_isometric_project/gbastudio_project.json >/tmp/gbs_assetc_export_isometric_manifest_check
	grep -q '"kind": "isometric"' $(HOST_BUILD)/assetc/exported_isometric_project/gbastudio_project.json
	grep -q '"target": "assetc_isometric_export"' $(HOST_BUILD)/assetc/exported_isometric_project/gbastudio_project.json
	grep -q "const gbs::IsometricProjectData project" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "project_bg_palette_assets" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "project_tile_assets" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "generated_iso_room_actors" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "generated_iso_room_actor_interact_events" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "generated_iso_room_actor_start_events" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "generated_iso_room_actor_update_events" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "generated_iso_room_tile_events" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "gbs::EventOp::SetActorVisible" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "gbs::IsoGridConfig" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	grep -q "static_cast<uint16_t>(123)" $(HOST_BUILD)/assetc/exported_isometric_project/isometric_project_data.hpp
	printf '#include "isometric_project_data.hpp"\nint main() { const gbs::EventScript script = gbs::iso_tile_event_script_for(gbastudio_isometric_project::project.rooms[0], gbs::IsoCoord { 2, 1, 0 }); return gbs::is_valid_isometric_project_data(gbastudio_isometric_project::project) && gbastudio_isometric_project::project.rooms[0].actor_count == 2 && gbastudio_isometric_project::project.rooms[0].grid.tile_width_pixels == 32 && gbastudio_isometric_project::project.rooms[0].actor_interact_event_count == 1 && gbastudio_isometric_project::project.rooms[0].actor_start_event_count == 1 && gbastudio_isometric_project::project.rooms[0].actor_update_event_count == 1 && gbastudio_isometric_project::project.rooms[0].tile_event_count == 1 && gbastudio_isometric_project::project.rooms[0].tile_events[0].width_tiles == 2 && gbastudio_isometric_project::project.rooms[0].tile_events[0].height_tiles == 1 && gbastudio_isometric_project::project.rooms[0].cursor_start_enabled && gbastudio_isometric_project::project.rooms[0].cursor_start.x == 2 && gbs::iso_room_cursor_start(gbastudio_isometric_project::project.rooms[0]).y == 1 && script.command_count == 2 && script.commands[0].op == gbs::EventOp::SetVariable && script.commands[0].a == 4 && script.commands[0].b == 11 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_isometric_project_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_isometric_project $(HOST_BUILD)/assetc/exported_isometric_project_compile.cpp -o $(HOST_BUILD)/assetc/exported_isometric_project_compile
	$(HOST_BUILD)/assetc/exported_isometric_project_compile
	tools/assetc/assetc.py tests/fixtures/export_isometric_project_tactical.json -o $(HOST_BUILD)/assetc/exported_isometric_project_tactical --export-project-json
	grep -q '"isometric_runtime.tactical_core"' $(HOST_BUILD)/assetc/exported_isometric_project_tactical/gbastudio_project.json
	grep -q "gbs::IsoGameplayMode::Tactical" $(HOST_BUILD)/assetc/exported_isometric_project_tactical/isometric_project_data.hpp
	grep -q "generated_iso_tactical_room_tactical_units" $(HOST_BUILD)/assetc/exported_isometric_project_tactical/isometric_project_data.hpp
	grep -q "gbs::IsoTacticalRoomData" $(HOST_BUILD)/assetc/exported_isometric_project_tactical/isometric_project_data.hpp
	printf '#include "isometric_project_data.hpp"\nint main() { const auto& room = gbastudio_isometric_project::project.rooms[0]; return gbs::is_valid_isometric_project_data(gbastudio_isometric_project::project) && gbs::is_tactical_isometric_room(room) && room.gameplay_mode == gbs::IsoGameplayMode::Tactical && room.tactical != nullptr && room.tactical->unit_count == 2 && room.tactical->units[1].team == 1 && room.tactical->units[0].attack_range == 2 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_isometric_project_tactical_compile.cpp
	clang++ $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc/exported_isometric_project_tactical $(HOST_BUILD)/assetc/exported_isometric_project_tactical_compile.cpp -o $(HOST_BUILD)/assetc/exported_isometric_project_tactical_compile
	$(HOST_BUILD)/assetc/exported_isometric_project_tactical_compile
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"isometric","template_dir":"../../../templates/exported_isometric","entry":"main.cpp","project_data":"isometric_project_data.hpp","generated_assets":[],"build":{"target":"assetc_isometric_semantic_actor_export","make_target":"all"},"requires":{"engine_pack":">=1.84.0","features":["isometric_runtime","engine_sdk.isometric_project_data_contract","asset_export_semantic_isometric_actor_refs"]},"isometric_project":{"assets":{"obj_palettes":["iso_actor"],"tile_assets":["iso_actor"]},"initial_room":0,"backdrop_color":123,"grid":{"tile_width_pixels":32,"tile_height_pixels":16,"origin":{"x":120,"y":24}},"rooms":[{"name":"generated_iso_semantic_room","width_tiles":3,"height_tiles":3,"visual_tiles":[1,1,1,1,2,1,1,1,1],"collision_flags":[1,1,1,1,0,1,1,1,1],"camera":{"position":{"x":0,"y":0},"bounds":{"x":0,"y":0,"width":96,"height":48},"bounds_enabled":true},"actors":[{"tile":{"x":1,"y":1,"z":0},"screen_offset":{"x":-8,"y":-16},"metasprite":{"asset":"iso_actor","index":1},"visible":true,"priority":1}]}]},"asset_pack":{"assets":[{"name":"iso actor","id":"iso_actor","bank_group":"iso_room","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16,"frame_duration":5,"header":"semantic_iso_actor.hpp","symbol":"semantic_iso_actor"}]}}\n' > $(HOST_BUILD)/assetc/export_isometric_project_semantic_actor.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_isometric_project_semantic_actor.json -o $(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor --export-project-json
	grep -q '#include "semantic_iso_actor.hpp"' $(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor/isometric_project_data.hpp
	grep -q "semantic_iso_actor_metasprites\\[1\\].parts\\[0\\].tile_index" $(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor/isometric_project_data.hpp
	grep -q "semantic_iso_actor_metasprites\\[1\\].parts\\[0\\].palette" $(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor/isometric_project_data.hpp
	printf '#include "isometric_project_data.hpp"\nint main() { return gbs::is_valid_isometric_project_data(gbastudio_isometric_project::project) && gbastudio_isometric_project::project.rooms[0].actors[0].tile_index == semantic_iso_actor_metasprites[1].parts[0].tile_index && gbastudio_isometric_project::project.rooms[0].actors[0].palette == semantic_iso_actor_metasprites[1].parts[0].palette ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor $(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor_compile.cpp -o $(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor_compile
	$(HOST_BUILD)/assetc/exported_isometric_project_semantic_actor_compile
	cp tests/fixtures/export_isometric_project_multiroom.json $(HOST_BUILD)/assetc/export_isometric_project_multiroom.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/export_isometric_project_multiroom.json -o $(HOST_BUILD)/assetc/exported_isometric_project_multiroom --export-project-json
	grep -q "generated_iso_warp_room" $(HOST_BUILD)/assetc/exported_isometric_project_multiroom/isometric_project_data.hpp
	grep -q "gbs::EventOp::Warp" $(HOST_BUILD)/assetc/exported_isometric_project_multiroom/isometric_project_data.hpp
	grep -q "constexpr gbs::ResourceBank resource_banks" $(HOST_BUILD)/assetc/exported_isometric_project_multiroom/isometric_project_data.hpp
	grep -q "constexpr bool save_enabled = true" $(HOST_BUILD)/assetc/exported_isometric_project_multiroom/isometric_project_data.hpp
	grep -q "gbs::make_save_signature('G', 'B', 'I', 'S')" $(HOST_BUILD)/assetc/exported_isometric_project_multiroom/isometric_project_data.hpp
	printf '#include "isometric_project_data.hpp"\nint main() { return gbs::is_valid_isometric_project_data(gbastudio_isometric_project::project) && gbastudio_isometric_project::save_enabled && gbs::is_valid_save_bank(gbastudio_isometric_project::save_bank) && gbastudio_isometric_project::project.resource_bank_count == 3 && gbastudio_isometric_project::project.room_count == 2 && gbastudio_isometric_project::project.rooms[0].actor_interact_event_count == 1 && gbastudio_isometric_project::project.rooms[1].on_enter.command_count == 2 ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/exported_isometric_project_multiroom_compile.cpp
	clang++ -std=c++17 -Wall -Wextra -Werror -Iengine/include -I$(HOST_BUILD)/assetc/exported_isometric_project_multiroom $(HOST_BUILD)/assetc/exported_isometric_project_multiroom_compile.cpp -o $(HOST_BUILD)/assetc/exported_isometric_project_multiroom_compile
	$(HOST_BUILD)/assetc/exported_isometric_project_multiroom_compile
	python3 tests/host/export_runtime_profile_tests.py $(HOST_BUILD)/assetc/runtime_profiles
	printf '{"assets":[{"name":"room_bg","id":"same","kind":"bg","png":"tilemap.png"},{"name":"player","id":"same","kind":"obj","png":"sprite16.png","sprite_width":16,"sprite_height":16}]}\n' > $(HOST_BUILD)/assetc/pack_duplicate_id.json
	if tools/assetc/assetc.py $(HOST_BUILD)/assetc/pack_duplicate_id.json -o $(HOST_BUILD)/assetc/pack_duplicate_id_report.json --pack-json 2>$(HOST_BUILD)/assetc/pack_duplicate_id.err; then exit 1; fi
	grep -q 'asset.id duplicado no pack: same' $(HOST_BUILD)/assetc/pack_duplicate_id.err
	printf '{"assets":[{"name":"too_many_tiles","resources":{"bg_tiles":2000}}]}\n' > $(HOST_BUILD)/assetc/pack_overflow.json
	if tools/assetc/assetc.py $(HOST_BUILD)/assetc/pack_overflow.json -o $(HOST_BUILD)/assetc/pack_overflow_report.json --pack-json; then exit 1; fi
	python3 -m json.tool $(HOST_BUILD)/assetc/pack_overflow_report.json >/tmp/gbs_assetc_pack_overflow_report_check
	grep -q '"ok": false' $(HOST_BUILD)/assetc/pack_overflow_report.json
	grep -q '"severity": "error"' $(HOST_BUILD)/assetc/pack_overflow_report.json
	grep -q '"code": "GBS_ASSET_PACK_RESOURCE_OVERFLOW"' $(HOST_BUILD)/assetc/pack_overflow_report.json
	grep -q 'overflow em bg_tiles' $(HOST_BUILD)/assetc/pack_overflow_report.json
	printf '{"stress_profile":"optional_overflow","assets":[{"name":"must_fit","resources":{"bg_tiles":8}},{"name":"optional_big","optional":true,"resources":{"bg_tiles":2000}}]}\n' > $(HOST_BUILD)/assetc/pack_optional_overflow.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/pack_optional_overflow.json -o $(HOST_BUILD)/assetc/pack_optional_overflow_report.json --pack-json
	python3 -m json.tool $(HOST_BUILD)/assetc/pack_optional_overflow_report.json >/tmp/gbs_assetc_pack_optional_overflow_report_check
	grep -q '"ok": true' $(HOST_BUILD)/assetc/pack_optional_overflow_report.json
	grep -q '"fallback_applied": true' $(HOST_BUILD)/assetc/pack_optional_overflow_report.json
	grep -q '"omitted": true' $(HOST_BUILD)/assetc/pack_optional_overflow_report.json
	grep -q '"code": "GBS_ASSET_PACK_OPTIONAL_RESOURCE_OMITTED"' $(HOST_BUILD)/assetc/pack_optional_overflow_report.json
	python3 tests/host/make_test_mod.py $(HOST_BUILD)/assetc/test.mod
	python3 tests/host/make_test_s3m.py $(HOST_BUILD)/assetc/test.s3m
	python3 tests/host/make_test_vgm.py $(HOST_BUILD)/assetc/test.vgm
	printf '{"sfx":[{"name":"portal","tones":[{"frequency_hz":880,"duration_frames":5,"volume":12,"duty":2,"noise":false}]}],"music":[{"name":"main","loop":true,"steps":[{"frequency_hz":262,"duration_frames":8,"volume":3,"duty":1}]}],"tracker":[{"name":"theme","loop":true,"order":[0],"patterns":[{"steps":[{"channel":2,"frequency_hz":262,"duration_frames":4,"volume":4,"duty":1},{"channel":3,"frequency_hz":900,"duration_frames":2,"volume":5,"duty":0}]}]},{"name":"modtheme","mod":"test.mod","row_duration_frames":3,"volume":6,"duty":1},{"name":"s3mtheme","s3m":"test.s3m","row_duration_frames":3,"volume":5,"duty":2},{"name":"vgmtheme","vgm":"test.vgm","duty":1}],"pcm":[{"name":"hit","sample_rate_hz":8000,"loop":false,"samples":[0,12,-12,0]},{"name":"modlead","mod_sample":"test.mod","sample_index":1,"sample_rate_hz":11025},{"name":"s3mlead","s3m_sample":"test.s3m","instrument_index":1},{"name":"s3mstereo","s3m_sample":"test.s3m","instrument_index":2}]}\n' > $(HOST_BUILD)/assetc/audio.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/audio.json -o $(HOST_BUILD)/assetc/audio.hpp -n audio --audio-json
	grep -q "constexpr gbs::SfxAsset audio_portal_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::MusicAsset audio_main_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::TrackerAsset audio_theme_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::TrackerAsset audio_modtheme_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::TrackerAsset audio_s3mtheme_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::TrackerAsset audio_vgmtheme_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::PcmAsset audio_hit_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::PcmAsset audio_modlead_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::PcmAsset audio_s3mlead_asset" $(HOST_BUILD)/assetc/audio.hpp
	grep -q "constexpr gbs::PcmAsset audio_s3mstereo_asset" $(HOST_BUILD)/assetc/audio.hpp
	cp tests/host/assetc_audio_compile.cpp $(HOST_BUILD)/assetc/audio_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/audio_compile.cpp -o $(HOST_BUILD)/assetc/audio_compile
	$(HOST_BUILD)/assetc/audio_compile
	python3 tests/host/make_test_wav.py $(HOST_BUILD)/assetc/wav
	printf '{"pcm":[{"name":"mono","wav":"wav/mono_u8.wav"},{"name":"stereo","wav":"wav/stereo_s16.wav","sample_rate_hz":8000,"loop":true}]}\n' > $(HOST_BUILD)/assetc/audio_wav.json
	tools/assetc/assetc.py $(HOST_BUILD)/assetc/audio_wav.json -o $(HOST_BUILD)/assetc/audio_wav.hpp -n audio_wav --audio-json
	grep -q "constexpr gbs::PcmAsset audio_wav_mono_asset" $(HOST_BUILD)/assetc/audio_wav.hpp
	grep -q "constexpr gbs::PcmAsset audio_wav_stereo_asset" $(HOST_BUILD)/assetc/audio_wav.hpp
	printf '#include "audio_wav.hpp"\nint main() { return audio_wav_pcm_asset_count == 2 && audio_wav_pcm_assets[0].sample_rate_hz == 8000 && audio_wav_pcm_assets[0].sample_count == 4 && audio_wav_pcm_assets[0].samples[1] > 0 && audio_wav_pcm_assets[1].sample_rate_hz == 8000 && audio_wav_pcm_assets[1].loop ? 0 : 1; }\n' > $(HOST_BUILD)/assetc/audio_wav_compile.cpp
	$(HOST_CXX) $(HOST_CXXFLAGS) -I$(HOST_BUILD)/assetc $(HOST_BUILD)/assetc/audio_wav_compile.cpp -o $(HOST_BUILD)/assetc/audio_wav_compile
	$(HOST_BUILD)/assetc/audio_wav_compile
	python3 tests/host/assetc_production_contract_tests.py
	python3 tests/host/assetc_audio_quality_tests.py
	python3 tests/host/assetc_sprite_dedup_tests.py
	python3 tests/host/assetc_obj_palette_tests.py

gbsbuild-host-test:
	python3 tests/host/gbsbuild_incremental_tests.py
	grep -q 'MAP := $$(BUILD_DIR_ESC)/$$(TARGET).map' templates/Makefile.gba
	grep -q -- '-Wl,-Map,$$(BUILD_DIR)/$$(TARGET).map' templates/Makefile.gba
	@mkdir -p $(HOST_BUILD)/gbsbuild/pack/templates $(HOST_BUILD)/gbsbuild/pack/lib "$(HOST_BUILD)/gbsbuild/project with space" "$(HOST_BUILD)/gbsbuild/output dir"
	cp templates/Makefile.gba $(HOST_BUILD)/gbsbuild/pack/templates/Makefile.gba
	touch $(HOST_BUILD)/gbsbuild/pack/lib/libgbastudio_engine.a
	printf 'extern "C" int gbs_main() { return 0; }\n' > "$(HOST_BUILD)/gbsbuild/project with space/main.cpp"
	printf '{"backend":"gbastudio_engine","kind":"topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"build":{"target":"manifest_target","make_target":"all","rom_title":"TEST ROM","game_code":"TST1","maker_code":"GS","rom_version":"07"}}\n' > "$(HOST_BUILD)/gbsbuild/project with space/gbastudio_project.json"
	tools/gbsbuild/gbsbuild.py --version | grep -q "gbsbuild"
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/project with space"; build_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/output dir"; tools/gbsbuild/gbsbuild.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --build-dir "$$build_dir" --target dryrun --dry-run --json > $(HOST_BUILD)/gbsbuild/dry_run.json
	grep -q '"TARGET=dryrun"' $(HOST_BUILD)/gbsbuild/dry_run.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/project with space"; build_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/output dir"; tools/gbsbuild/gbsbuild.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --build-dir "$$build_dir" --dry-run --json > $(HOST_BUILD)/gbsbuild/manifest_dry_run.json
	grep -q '"TARGET=manifest_target"' $(HOST_BUILD)/gbsbuild/manifest_dry_run.json
	grep -q '"ROM_TITLE=TEST ROM"' $(HOST_BUILD)/gbsbuild/manifest_dry_run.json
	grep -q '"GAME_CODE=TST1"' $(HOST_BUILD)/gbsbuild/manifest_dry_run.json
	grep -q '"MAKER_CODE=GS"' $(HOST_BUILD)/gbsbuild/manifest_dry_run.json
	grep -q '"ROM_VERSION=07"' $(HOST_BUILD)/gbsbuild/manifest_dry_run.json
	grep -q 'project with space' $(HOST_BUILD)/gbsbuild/dry_run.json
	grep -q 'output dir' $(HOST_BUILD)/gbsbuild/dry_run.json

gbsbuild-test: gbsbuild-host-test check-toolchain
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/project with space"; build_dir="$$(pwd)/$(HOST_BUILD)/gbsbuild/output dir"; tools/gbsbuild/gbsbuild.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --build-dir "$$build_dir" --target path_space --make-target objects
	test -f "$(HOST_BUILD)/gbsbuild/output dir/main.o"

gbsdoctor-test:
	@mkdir -p $(HOST_BUILD)/gbsdoctor/pack/include/gbs $(HOST_BUILD)/gbsdoctor/pack/lib $(HOST_BUILD)/gbsdoctor/pack/templates $(HOST_BUILD)/gbsdoctor/pack/tools $(HOST_BUILD)/gbsdoctor/pack/schemas "$(HOST_BUILD)/gbsdoctor/project with space"
	cp enginepack.json $(HOST_BUILD)/gbsdoctor/pack/enginepack.json
	cp VERSION LICENSE CHANGELOG.md $(HOST_BUILD)/gbsdoctor/pack/
	cp schemas/*.schema.json $(HOST_BUILD)/gbsdoctor/pack/schemas/
	cp engine/include/gbs/engine.hpp $(HOST_BUILD)/gbsdoctor/pack/include/gbs/engine.hpp
	cp engine/include/gbs/dialogue_font.json $(HOST_BUILD)/gbsdoctor/pack/include/gbs/dialogue_font.json
	cp -R templates/* $(HOST_BUILD)/gbsdoctor/pack/templates/
	mkdir -p $(HOST_BUILD)/gbsdoctor/pack/templates/topdown_basic $(HOST_BUILD)/gbsdoctor/pack/templates/platformer_basic $(HOST_BUILD)/gbsdoctor/pack/templates/isometric_basic
	cp examples/topdown_basic/src/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/topdown_basic/main.cpp
	cp examples/topdown_basic/src/gbastudio_project_data.hpp $(HOST_BUILD)/gbsdoctor/pack/templates/topdown_basic/gbastudio_project_data.hpp
	cp examples/platformer_basic/src/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/platformer_basic/main.cpp
	cp examples/platformer_basic/src/platformer_project_data.hpp $(HOST_BUILD)/gbsdoctor/pack/templates/platformer_basic/platformer_project_data.hpp
	cp examples/isometric_basic/src/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/isometric_basic/main.cpp
	cp examples/isometric_basic/src/isometric_project_data.hpp $(HOST_BUILD)/gbsdoctor/pack/templates/isometric_basic/isometric_project_data.hpp
	cp examples/topdown_basic/src/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/topdown_runtime.inc
	cp examples/platformer_basic/src/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/platformer_runtime.inc
	cp examples/isometric_basic/src/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/isometric_runtime.inc
	cp templates/exported_menu/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/menu_runtime.inc
	cp templates/exported_mixed/menu_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/menu_runtime.cpp
	cp templates/exported_shmup/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/shmup_runtime.inc
	cp templates/exported_mixed/shmup_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/shmup_runtime.cpp
	cp templates/exported_point_click/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/point_click_runtime.inc
	cp templates/exported_mixed/point_click_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/point_click_runtime.cpp
	cp templates/exported_dungeon_crawler/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/dungeon_crawler_runtime.inc
	cp templates/exported_mixed/dungeon_crawler_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/dungeon_crawler_runtime.cpp
	cp templates/exported_racing/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/racing_runtime.inc
	cp templates/exported_mixed/racing_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/racing_runtime.cpp
	cp templates/exported_cutscene/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/cutscene_runtime.inc
	cp templates/exported_mixed/cutscene_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/cutscene_runtime.cpp
	cp templates/exported_visual_novel/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/visual_novel_runtime.inc
	cp templates/exported_mixed/visual_novel_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/visual_novel_runtime.cpp
	cp templates/exported_world_map/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/world_map_runtime.inc
	cp templates/exported_mixed/world_map_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/world_map_runtime.cpp
	cp templates/exported_battle_rpg/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/battle_rpg_runtime.inc
	cp templates/exported_mixed/battle_rpg_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/battle_rpg_runtime.cpp
	cp templates/exported_luta/main.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/luta_runtime.inc
	cp templates/exported_mixed/luta_runtime.cpp $(HOST_BUILD)/gbsdoctor/pack/templates/exported_mixed/luta_runtime.cpp
	cp templates/Makefile.gba $(HOST_BUILD)/gbsdoctor/pack/templates/Makefile.gba
	cp engine/startup/gba.ld $(HOST_BUILD)/gbsdoctor/pack/templates/gba.ld
	touch $(HOST_BUILD)/gbsdoctor/pack/lib/libgbastudio_engine.a
	cp tools/assetc/assetc.py $(HOST_BUILD)/gbsdoctor/pack/tools/assetc
	cp tools/gbsbuild/gbsbuild.py $(HOST_BUILD)/gbsdoctor/pack/tools/gbsbuild
	cp tools/gbsdoctor/gbsdoctor.py $(HOST_BUILD)/gbsdoctor/pack/tools/gbsdoctor
	cp scripts/smoke_mgba.sh $(HOST_BUILD)/gbsdoctor/pack/tools/smoke_mgba
	cp scripts/production_smoke.py $(HOST_BUILD)/gbsdoctor/pack/tools/production_smoke
	cp scripts/stress_projects.py $(HOST_BUILD)/gbsdoctor/pack/tools/stress_projects
	cp scripts/verify_cross_platform.py $(HOST_BUILD)/gbsdoctor/pack/tools/verify_cross_platform
	cp scripts/write_mgba_manual_handoff.py $(HOST_BUILD)/gbsdoctor/pack/tools/write_mgba_manual_handoff
	cp scripts/write_engine_primary_handoff.py $(HOST_BUILD)/gbsdoctor/pack/tools/write_engine_primary_handoff
	chmod +x $(HOST_BUILD)/gbsdoctor/pack/tools/assetc $(HOST_BUILD)/gbsdoctor/pack/tools/gbsbuild $(HOST_BUILD)/gbsdoctor/pack/tools/gbsdoctor $(HOST_BUILD)/gbsdoctor/pack/tools/smoke_mgba $(HOST_BUILD)/gbsdoctor/pack/tools/production_smoke $(HOST_BUILD)/gbsdoctor/pack/tools/stress_projects $(HOST_BUILD)/gbsdoctor/pack/tools/verify_cross_platform $(HOST_BUILD)/gbsdoctor/pack/tools/write_mgba_manual_handoff $(HOST_BUILD)/gbsdoctor/pack/tools/write_engine_primary_handoff
	printf 'extern "C" int gbs_main() { return 0; }\n' > "$(HOST_BUILD)/gbsdoctor/project with space/main.cpp"
	printf '#pragma once\n' > "$(HOST_BUILD)/gbsdoctor/project with space/gbastudio_project_data.hpp"
	printf '#pragma once\n' > "$(HOST_BUILD)/gbsdoctor/project with space/player_sprite_asset.hpp"
	printf '{"backend":"gbastudio_engine","kind":"topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":["player_sprite_asset.hpp"],"requires":{"engine_pack":">=0.36.0","features":["topdown_project_data","dialogue","tilemap-slope-flags","actor_command_batch_apply"]}}\n' > "$(HOST_BUILD)/gbsdoctor/project with space/gbastudio_project.json"
	tools/gbsdoctor/gbsdoctor.py --version | grep -q "gbsdoctor"
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --json > $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "manifest"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "project_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "asset_pack_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "export_project_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "readiness_evidence_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "readiness_report_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "asset_pack_report_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "promotion_bundle_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "promotion_bundle_validation_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "promotion_summary_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "public_schema_catalog_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "project_manifest_backend"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "project_manifest_kind"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"value": "topdown"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "project_generated_asset"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "production_smoke"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "stress_projects"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "smoke_mgba"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"key": "verify_cross_platform"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"platform"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"candidates"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"engine_manifest"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"schemas"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'gbastudio_project.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'export_project.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'readiness_evidence.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'readiness_report.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'asset_pack_report.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'promotion_bundle.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'promotion_bundle_validation.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'promotion_summary.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'public_schema_catalog.schema.json' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"readiness_evidence": "schemas/readiness_evidence.schema.json"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"readiness_report": "schemas/readiness_report.schema.json"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"asset_pack_report": "schemas/asset_pack_report.schema.json"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"promotion_bundle": "schemas/promotion_bundle.schema.json"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"promotion_bundle_validation": "schemas/promotion_bundle_validation.schema.json"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"promotion_summary": "schemas/promotion_summary.schema.json"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"public_schema_catalog": "schemas/public_schema_catalog.schema.json"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"capability_count"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"sdk_templates"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"genre": "platformer"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"genre": "isometric"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"asset-pack-duplicate-id-validation"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"version": "$(shell cat VERSION)"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"diagnostics"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"genres"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"genre": "topdown"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"template_ids"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"asset_banking"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"render_cost"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"audio_cost"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"stress_readiness"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"resource_pool_readiness"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"butano_replacement_readiness"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_resource_pool_readiness"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_schema_validation"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_schema_auto_detection"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_asset_pack_report_schema_validation"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_project_schema_validation"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_schema_catalog_integrity"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_schema_catalog_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_schema_catalog_writer"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_public_schema_catalog_verifier"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_readiness_evidence_merge"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_readiness_evidence_provenance"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"cross_platform_readiness_evidence"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"production_smoke_readiness_evidence"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_promotion_summary_schema"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_promotion_bundle_promotion_summary_summary"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"stage": "beta_candidate"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"backend_policy": "parallel_until_manual_promotion"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"required_before_primary_backend"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"missing_manual_gates"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"next_actions"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"update_manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'gbsdoctor --update-readiness-evidence readiness_evidence.json --readiness-gate manual_mgba_stress_smoke' $(HOST_BUILD)/gbsdoctor/report.json
	python3 tests/host/gbsdoctor_production_contract_tests.py
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --list-public-schemas --json > $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"kind": "public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"schema_count": 10' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"id": "asset_pack_report"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"id": "gbastudio_project"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"id": "promotion_summary"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"id": "public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"schema_path": "schemas/export_project.schema.json"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"exists": true' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"size_bytes":' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"sha256":' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -Fq '"missing_schemas": []' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	grep -q '"auto"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema public_schema_catalog --schema-document $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_catalog_validation.json
	grep -q '"schema": "public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_validation.json
	grep -q '"schema_path": "schemas/public_schema_catalog.schema.json"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_validation.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_validation.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/gbsdoctor/public_schema_catalog.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_catalog_validation_auto.json
	grep -q '"detected_schema": "public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_validation_auto.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_validation_auto.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --write-public-schema-catalog $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written.json --json > $(HOST_BUILD)/gbsdoctor/write_public_schema_catalog.json
	grep -q '"kind": "public_schema_catalog_write"' $(HOST_BUILD)/gbsdoctor/write_public_schema_catalog.json
	grep -q '"schema_count": 10' $(HOST_BUILD)/gbsdoctor/write_public_schema_catalog.json
	grep -Fq '"missing_schemas": []' $(HOST_BUILD)/gbsdoctor/write_public_schema_catalog.json
	grep -q '"kind": "public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema public_schema_catalog --schema-document $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written_validation.json
	grep -q '"schema": "public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written_validation.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written_validation.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --verify-public-schema-catalog $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_catalog_verification.json
	grep -q '"kind": "public_schema_catalog_verification"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_verification.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_verification.json
	cp $(HOST_BUILD)/gbsdoctor/public_schema_catalog_written.json $(HOST_BUILD)/gbsdoctor/public_schema_catalog_tampered.json
	python3 -c 'import json; p="$(HOST_BUILD)/gbsdoctor/public_schema_catalog_tampered.json"; d=json.load(open(p)); d["schemas"][0]["sha256"]="0000000000000000000000000000000000000000000000000000000000000000"; json.dump(d, open(p, "w"), indent=2)'
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --verify-public-schema-catalog $(HOST_BUILD)/gbsdoctor/public_schema_catalog_tampered.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_catalog_tampered_verification.json; then exit 1; fi
	grep -q '"kind": "public_schema_catalog_verification"' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_tampered_verification.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_tampered_verification.json
	grep -q 'sha256' $(HOST_BUILD)/gbsdoctor/public_schema_catalog_tampered_verification.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-only --json > $(HOST_BUILD)/gbsdoctor/readiness_only_report.json
	grep -q '"kind": "butano_replacement_readiness"' $(HOST_BUILD)/gbsdoctor/readiness_only_report.json
	grep -q '"butano_replacement_readiness"' $(HOST_BUILD)/gbsdoctor/readiness_only_report.json
	grep -q '"stage": "beta_candidate"' $(HOST_BUILD)/gbsdoctor/readiness_only_report.json
	grep -q '"missing_manual_gates"' $(HOST_BUILD)/gbsdoctor/readiness_only_report.json
	grep -q '"next_actions"' $(HOST_BUILD)/gbsdoctor/readiness_only_report.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-only > $(HOST_BUILD)/gbsdoctor/readiness_only.txt
	grep -q 'stage: beta_candidate' $(HOST_BUILD)/gbsdoctor/readiness_only.txt
	grep -q 'ready_for_primary_backend: false' $(HOST_BUILD)/gbsdoctor/readiness_only.txt
	grep -q 'missing_manual_gates:' $(HOST_BUILD)/gbsdoctor/readiness_only.txt
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/require_primary_ready_blocked.json; then exit 1; fi
	grep -q '"kind": "butano_replacement_readiness"' $(HOST_BUILD)/gbsdoctor/require_primary_ready_blocked.json
	grep -q '"ready_for_primary_backend": false' $(HOST_BUILD)/gbsdoctor/require_primary_ready_blocked.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --write-readiness-report $(HOST_BUILD)/gbsdoctor/readiness_decision.json --json > $(HOST_BUILD)/gbsdoctor/write_readiness_report.json
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/readiness_decision.json >/tmp/gbs_write_readiness_report_check
	python3 -c 'import json; schema=json.load(open("schemas/readiness_report.schema.json")); report=json.load(open("$(HOST_BUILD)/gbsdoctor/readiness_decision.json")); assert schema["properties"]["kind"]["const"] == "butano_replacement_readiness"; assert set(schema["required"]) == {"ok","version","engine_pack","kind","butano_replacement_readiness"}; assert report["kind"] == "butano_replacement_readiness"; readiness=report["butano_replacement_readiness"]; required=set(schema["$$defs"]["readiness"]["required"]); assert required <= set(readiness.keys()); assert readiness["stage"] in schema["$$defs"]["readiness"]["properties"]["stage"]["enum"]; assert readiness["backend_policy"] == "parallel_until_manual_promotion"'
	grep -q '"kind": "readiness_report"' $(HOST_BUILD)/gbsdoctor/write_readiness_report.json
	grep -q '"kind": "butano_replacement_readiness"' $(HOST_BUILD)/gbsdoctor/readiness_decision.json
	grep -q '"stage": "beta_candidate"' $(HOST_BUILD)/gbsdoctor/readiness_decision.json
	tools/gbsdoctor/gbsdoctor.py --validate-readiness-report $(HOST_BUILD)/gbsdoctor/readiness_decision.json --json > $(HOST_BUILD)/gbsdoctor/validate_readiness_report.json
	grep -q '"kind": "readiness_report_validation"' $(HOST_BUILD)/gbsdoctor/validate_readiness_report.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/validate_readiness_report.json
	grep -q '"stage": "beta_candidate"' $(HOST_BUILD)/gbsdoctor/validate_readiness_report.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema readiness_report --schema-document $(HOST_BUILD)/gbsdoctor/readiness_decision.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report.json
	grep -q '"schema": "readiness_report"' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report.json
	grep -q '"schema_path": "schemas/readiness_report.schema.json"' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/gbsdoctor/readiness_decision.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report_auto.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report_auto.json
	grep -q '"schema": "readiness_report"' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report_auto.json
	grep -q '"requested_schema": "auto"' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report_auto.json
	grep -q '"detected_schema": "readiness_report"' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report_auto.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_readiness_report_auto.json
	printf '{"assets":[{"name":"room_bg","id":"room_bg","kind":"bg","png":"room.png","bank_group":"room_0"},{"name":"player","kind":"obj","sprite_width":16,"sprite_height":32,"optional":true}]}\n' > $(HOST_BUILD)/gbsdoctor/asset_pack_input.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/gbsdoctor/asset_pack_input.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_asset_pack_auto.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_asset_pack_auto.json
	grep -q '"schema": "asset_pack"' $(HOST_BUILD)/gbsdoctor/public_schema_asset_pack_auto.json
	grep -q '"detected_schema": "asset_pack"' $(HOST_BUILD)/gbsdoctor/public_schema_asset_pack_auto.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_asset_pack_auto.json
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"requires":{"engine_pack":">=1.70.0","features":["topdown_project_data"]},"build":{"target":"schema_check","make_target":"all"}}\n' > $(HOST_BUILD)/gbsdoctor/gbastudio_project_manifest.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/gbsdoctor/gbastudio_project_manifest.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_auto.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_auto.json
	grep -q '"schema": "gbastudio_project"' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_auto.json
	grep -q '"detected_schema": "gbastudio_project"' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_auto.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_auto.json
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"visualNovel","template_dir":"templates/exported_visual_novel","entry":"main.cpp","project_data":"visual_novel_project_data.hpp","generated_assets":[],"runtime_profile":"visualNovel","capability_manifest":{"schema":1,"registry":"gba-studio-scene-capabilities","scenes":[]},"asset_pack":{"assets":[{"name":"vn_bg","kind":"bitmap4"}]},"visual_novel_project":{}}\n' > $(HOST_BUILD)/gbsdoctor/export_project_input.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/gbsdoctor/export_project_input.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_export_project_auto.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_export_project_auto.json
	grep -q '"schema": "export_project"' $(HOST_BUILD)/gbsdoctor/public_schema_export_project_auto.json
	grep -q '"detected_schema": "export_project"' $(HOST_BUILD)/gbsdoctor/public_schema_export_project_auto.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_export_project_auto.json
	printf '{"schema":0,"backend":"butano","kind":"unknown","entry":"","project_data":false,"generated_assets":["a.hpp","a.hpp"],"requires":[]}\n' > $(HOST_BUILD)/gbsdoctor/gbastudio_project_manifest_invalid.json
	if tools/gbsdoctor/gbsdoctor.py --validate-public-schema gbastudio_project --schema-document $(HOST_BUILD)/gbsdoctor/gbastudio_project_manifest_invalid.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_invalid.json; then exit 1; fi
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_invalid.json
	grep -q '"schema": "gbastudio_project"' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_invalid.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_invalid.json
	grep -q 'valor esperado: gbastudio_engine' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_invalid.json
	grep -q 'item duplicado' $(HOST_BUILD)/gbsdoctor/public_schema_gbastudio_project_invalid.json
	printf '{"kind":"wrong","butano_replacement_readiness":{"stage":"invalid"}}\n' > $(HOST_BUILD)/gbsdoctor/readiness_decision_invalid.json
	if tools/gbsdoctor/gbsdoctor.py --validate-readiness-report $(HOST_BUILD)/gbsdoctor/readiness_decision_invalid.json --json > $(HOST_BUILD)/gbsdoctor/validate_readiness_report_invalid.json; then exit 1; fi
	grep -q '"kind": "readiness_report_validation"' $(HOST_BUILD)/gbsdoctor/validate_readiness_report_invalid.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/validate_readiness_report_invalid.json
	grep -q '"path": "$$.ok"' $(HOST_BUILD)/gbsdoctor/validate_readiness_report_invalid.json
	grep -q 'valor esperado: butano_replacement_readiness' $(HOST_BUILD)/gbsdoctor/validate_readiness_report_invalid.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --write-promotion-bundle $(HOST_BUILD)/gbsdoctor/promotion_bundle --json > $(HOST_BUILD)/gbsdoctor/write_promotion_bundle.json
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json >/tmp/gbs_promotion_bundle_manifest_check
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle/readiness_decision.json >/tmp/gbs_promotion_bundle_decision_check
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle/readiness_validation.json >/tmp/gbs_promotion_bundle_validation_check
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle/readiness_evidence_template.json >/tmp/gbs_promotion_bundle_evidence_check
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle/public_schema_catalog.json >/tmp/gbs_promotion_bundle_public_schema_catalog_check
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_summary.json >/tmp/gbs_promotion_bundle_summary_json_check
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle/gbsdoctor_report.json >/tmp/gbs_promotion_bundle_doctor_report_check
	grep -q '"kind": "promotion_bundle"' $(HOST_BUILD)/gbsdoctor/write_promotion_bundle.json
	grep -q '"kind": "promotion_bundle"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"readiness_decision"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"promotion_summary_json"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"gbsdoctor_report"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"file_integrity"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"sha256"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"size_bytes"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json
	grep -q '"kind": "readiness_report_validation"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/readiness_validation.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/promotion_bundle/readiness_validation.json
	grep -q '"diagnostics"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/gbsdoctor_report.json
	grep -q '"engine_manifest"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/gbsdoctor_report.json
	grep -q '"checks"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/gbsdoctor_report.json
	python3 -c 'import hashlib,json,pathlib; manifest=json.load(open("$(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json")); key="gbsdoctor_report"; path=pathlib.Path(manifest["files"][key]); data=path.read_bytes(); assert manifest["file_integrity"][key]["sha256"] == hashlib.sha256(data).hexdigest(); assert manifest["file_integrity"][key]["size_bytes"] == len(data)'
	python3 -c 'import hashlib,json,pathlib; manifest=json.load(open("$(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json")); key="public_schema_catalog"; path=pathlib.Path(manifest["files"][key]); data=path.read_bytes(); assert manifest["file_integrity"][key]["sha256"] == hashlib.sha256(data).hexdigest(); assert manifest["file_integrity"][key]["size_bytes"] == len(data)'
	python3 -c 'import hashlib,json,pathlib; manifest=json.load(open("$(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json")); key="promotion_summary_json"; path=pathlib.Path(manifest["files"][key]); data=path.read_bytes(); assert manifest["file_integrity"][key]["sha256"] == hashlib.sha256(data).hexdigest(); assert manifest["file_integrity"][key]["size_bytes"] == len(data)'
	grep -q 'stage: beta_candidate' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_summary.txt
	grep -q '"kind": "promotion_summary"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_summary.json
	grep -q '"public_schema_catalog_summary"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_summary.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema promotion_summary --schema-document $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_summary.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_promotion_summary.json
	grep -q '"schema": "promotion_summary"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_summary.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_summary.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_summary.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_promotion_summary_auto.json
	grep -q '"detected_schema": "promotion_summary"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_summary_auto.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_summary_auto.json
	grep -q '"manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/readiness_evidence_template.json
	grep -q '"kind": "public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/promotion_bundle/public_schema_catalog.json
	grep -Fq '"missing_schemas": []' $(HOST_BUILD)/gbsdoctor/promotion_bundle/public_schema_catalog.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema promotion_bundle --schema-document $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_bundle.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle.json
	grep -q '"schema": "promotion_bundle"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle.json
	tools/gbsdoctor/gbsdoctor.py --validate-promotion-bundle $(HOST_BUILD)/gbsdoctor/promotion_bundle --json > $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"kind": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"stage": "beta_candidate"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"primary_ready_required": false' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"readiness_summary"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"public_schema_catalog"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"public_schema_catalog_summary"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"promotion_summary_summary"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"schema_count": 10' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"missing_manual_gates"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"next_actions"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	grep -q '"manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json
	python3 -c 'import json; schema=json.load(open("schemas/promotion_bundle_validation.schema.json")); report=json.load(open("$(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json")); assert schema["properties"]["kind"]["const"] == "promotion_bundle_validation"; assert set(schema["required"]) == {"ok","version","kind","path","stage","ready_for_primary_backend","primary_ready_required","readiness_summary","public_schema_catalog_summary","promotion_summary_summary","files","errors"}; assert report["kind"] == "promotion_bundle_validation"; assert set(schema["required"]) <= set(report.keys()); assert report["readiness_summary"]["stage"] == "beta_candidate"; assert report["public_schema_catalog_summary"]["schema_count"] == 10; assert report["promotion_summary_summary"]["stage"] == "beta_candidate"; assert report["promotion_summary_summary"]["public_schema_catalog_summary"]["schema_count"] == 10; assert report["public_schema_catalog_summary"]["missing_schemas"] == []; assert "manual_mgba_stress_smoke" in report["readiness_summary"]["missing_manual_gates"]'
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema promotion_bundle_validation --schema-document $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation.json
	grep -q '"schema": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation.json
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema auto --schema-document $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation_auto.json
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation_auto.json
	grep -q '"schema": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation_auto.json
	grep -q '"detected_schema": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation_auto.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_validation_auto.json
	if tools/gbsdoctor/gbsdoctor.py --validate-promotion-bundle $(HOST_BUILD)/gbsdoctor/promotion_bundle --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary_blocked.json; then exit 1; fi
	grep -q '"kind": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary_blocked.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary_blocked.json
	grep -q '"primary_ready_required": true' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary_blocked.json
	grep -q 'bundle ainda nao esta liberado para backend principal' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary_blocked.json
	printf '\ntampered\n' >> $(HOST_BUILD)/gbsdoctor/promotion_bundle/promotion_summary.txt
	if tools/gbsdoctor/gbsdoctor.py --validate-promotion-bundle $(HOST_BUILD)/gbsdoctor/promotion_bundle --json > $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_tampered.json; then exit 1; fi
	grep -q '"kind": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_tampered.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_tampered.json
	grep -q 'sha256 nao confere' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_tampered.json
	printf '{"kind":"wrong","files":{}}\n' > $(HOST_BUILD)/gbsdoctor/promotion_bundle_invalid.json
	if tools/gbsdoctor/gbsdoctor.py --validate-promotion-bundle $(HOST_BUILD)/gbsdoctor/promotion_bundle_invalid.json --json > $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_invalid.json; then exit 1; fi
	grep -q '"kind": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_invalid.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_invalid.json
	grep -q 'valor esperado: promotion_bundle' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_invalid.json
	if tools/gbsdoctor/gbsdoctor.py --validate-public-schema promotion_bundle --schema-document $(HOST_BUILD)/gbsdoctor/promotion_bundle_invalid.json --json > $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_invalid.json; then exit 1; fi
	grep -q '"kind": "public_schema_validation"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_invalid.json
	grep -q '"schema": "promotion_bundle"' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_invalid.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_invalid.json
	grep -q 'valor esperado: promotion_bundle' $(HOST_BUILD)/gbsdoctor/public_schema_promotion_bundle_invalid.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --write-readiness-report $(HOST_BUILD)/gbsdoctor/readiness_decision_blocked.json --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/write_readiness_report_blocked.json; then exit 1; fi
	grep -q '"ready_for_primary_backend": false' $(HOST_BUILD)/gbsdoctor/write_readiness_report_blocked.json
	grep -q '"stage": "beta_candidate"' $(HOST_BUILD)/gbsdoctor/readiness_decision_blocked.json
	grep -q '"target": "topdown_large"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"target": "audio_heavy"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"toolchain"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"skipped": true' $(HOST_BUILD)/gbsdoctor/report.json
	grep -Fq '"actionable_messages": []' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"render_asset_cost_diagnostics"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"audio_mix_cost_diagnostics"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q '"doctor_actionable_messages"' $(HOST_BUILD)/gbsdoctor/report.json
	grep -q 'project with space' $(HOST_BUILD)/gbsdoctor/report.json
	printf '{"manual_mgba_stress_smoke":{"ok":true,"source":"local smoke log"},"hardware_or_ci_validation":{"ok":true,"source":"ci run 42"},"gba_studio_engine_primary_rollout":{"ok":true,"source":"private engine-primary rollout smoke"}}\n' > $(HOST_BUILD)/gbsdoctor/readiness_evidence_missing_provenance.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-evidence $(HOST_BUILD)/gbsdoctor/readiness_evidence_missing_provenance.json --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/readiness_missing_provenance_report.json; then exit 1; fi
	grep -q '"ready_for_primary_backend": false' $(HOST_BUILD)/gbsdoctor/readiness_missing_provenance_report.json
	grep -q 'evidence_type obrigatorio' $(HOST_BUILD)/gbsdoctor/readiness_missing_provenance_report.json
	printf '{"manual_mgba_stress_smoke":{"ok":true,"evidence_type":"manual_mgba_stress_smoke","source":"local smoke log","checked_at":"2026-06-11T12:00:00Z","review_environment":"mGBA fixture"},"hardware_or_ci_validation":{"ok":true,"evidence_type":"cross_platform_ci","source":"ci run 42","checked_at":"2026-06-11T12:10:00Z","validated_platforms":["macos","windows","linux"]},"gba_studio_engine_primary_rollout":{"ok":true,"evidence_type":"gba_studio_engine_primary_rollout","source":"private engine-primary rollout smoke","checked_at":"2026-06-11T12:20:00Z"}}\n' > $(HOST_BUILD)/gbsdoctor/readiness_evidence.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-evidence $(HOST_BUILD)/gbsdoctor/readiness_evidence.json --json > $(HOST_BUILD)/gbsdoctor/primary_ready_report.json
	grep -q '"stage": "primary_ready"' $(HOST_BUILD)/gbsdoctor/primary_ready_report.json
	grep -q '"ready_for_primary_backend": true' $(HOST_BUILD)/gbsdoctor/primary_ready_report.json
	grep -q '"evidence_type": "cross_platform_ci"' $(HOST_BUILD)/gbsdoctor/primary_ready_report.json
	grep -q '"source": "ci run 42"' $(HOST_BUILD)/gbsdoctor/primary_ready_report.json
	python3 -c 'import json; r=json.load(open("$(HOST_BUILD)/gbsdoctor/primary_ready_report.json"))["diagnostics"]["butano_replacement_readiness"]; assert r["missing_manual_gates"] == [] and r["next_actions"] == []'
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-evidence $(HOST_BUILD)/gbsdoctor/readiness_evidence.json --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/require_primary_ready_ok.json
	grep -q '"ready_for_primary_backend": true' $(HOST_BUILD)/gbsdoctor/require_primary_ready_ok.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-evidence $(HOST_BUILD)/gbsdoctor/readiness_evidence.json --write-readiness-report $(HOST_BUILD)/gbsdoctor/readiness_decision_primary.json --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/write_readiness_report_primary.json
	grep -q '"ready_for_primary_backend": true' $(HOST_BUILD)/gbsdoctor/write_readiness_report_primary.json
	grep -q '"stage": "primary_ready"' $(HOST_BUILD)/gbsdoctor/readiness_decision_primary.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-evidence $(HOST_BUILD)/gbsdoctor/readiness_evidence.json --write-promotion-bundle $(HOST_BUILD)/gbsdoctor/promotion_bundle_primary --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/write_promotion_bundle_primary.json
	grep -q '"ready_for_primary_backend": true' $(HOST_BUILD)/gbsdoctor/write_promotion_bundle_primary.json
	grep -q '"readiness_evidence"' $(HOST_BUILD)/gbsdoctor/promotion_bundle_primary/promotion_bundle.json
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/promotion_bundle_primary/readiness_evidence.json >/tmp/gbs_promotion_bundle_primary_evidence_check
	grep -q '"source": "ci run 42"' $(HOST_BUILD)/gbsdoctor/promotion_bundle_primary/readiness_evidence.json
	python3 -c 'import hashlib,json,pathlib; manifest=json.load(open("$(HOST_BUILD)/gbsdoctor/promotion_bundle_primary/promotion_bundle.json")); key="readiness_evidence"; path=pathlib.Path(manifest["files"][key]); data=path.read_bytes(); assert manifest["file_integrity"][key]["sha256"] == hashlib.sha256(data).hexdigest(); assert manifest["file_integrity"][key]["size_bytes"] == len(data)'
	tools/gbsdoctor/gbsdoctor.py --validate-promotion-bundle $(HOST_BUILD)/gbsdoctor/promotion_bundle_primary --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -q '"kind": "promotion_bundle_validation"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -q '"primary_ready_required": true' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -q '"ready_for_primary_backend": true' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -q '"readiness_summary"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -q '"readiness_evidence"' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -Fq '"missing_manual_gates": []' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	grep -Fq '"next_actions": []' $(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json
	python3 -c 'import json; report=json.load(open("$(HOST_BUILD)/gbsdoctor/validate_promotion_bundle_primary.json")); assert report["readiness_summary"]["stage"] == "primary_ready"; assert report["readiness_summary"]["missing_manual_gates"] == []; assert report["readiness_summary"]["next_actions"] == []'
	printf '{"manual_mgba_stress_smoke":{"ok":true}}\n' > $(HOST_BUILD)/gbsdoctor/readiness_evidence_invalid.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-evidence $(HOST_BUILD)/gbsdoctor/readiness_evidence_invalid.json --json > $(HOST_BUILD)/gbsdoctor/readiness_invalid_report.json; then exit 1; fi
	grep -q '"key": "readiness_evidence_gate"' $(HOST_BUILD)/gbsdoctor/readiness_invalid_report.json
	grep -q '"value": "hardware_or_ci_validation"' $(HOST_BUILD)/gbsdoctor/readiness_invalid_report.json
	grep -q '"code": "GBS_DOCTOR_READINESS_EVIDENCE_GATE"' $(HOST_BUILD)/gbsdoctor/readiness_invalid_report.json
	tools/gbsdoctor/gbsdoctor.py --print-readiness-evidence-template > $(HOST_BUILD)/gbsdoctor/readiness_evidence_template.json
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/readiness_evidence_template.json >/tmp/gbs_readiness_evidence_template_check
	grep -q '"manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/readiness_evidence_template.json
	grep -q '"hardware_or_ci_validation"' $(HOST_BUILD)/gbsdoctor/readiness_evidence_template.json
	grep -q '"gba_studio_engine_primary_rollout"' $(HOST_BUILD)/gbsdoctor/readiness_evidence_template.json
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/readiness_evidence_template.json
	tools/gbsdoctor/gbsdoctor.py --write-readiness-evidence-template $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json --json > $(HOST_BUILD)/gbsdoctor/write_readiness_evidence_template_report.json
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json >/tmp/gbs_write_readiness_evidence_template_check
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/write_readiness_evidence_template_report.json
	grep -q '"kind": "readiness_evidence_template"' $(HOST_BUILD)/gbsdoctor/write_readiness_evidence_template_report.json
	grep -q '"path":' $(HOST_BUILD)/gbsdoctor/write_readiness_evidence_template_report.json
	grep -q '"manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json
	grep -q '"hardware_or_ci_validation"' $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json
	grep -q '"gba_studio_engine_primary_rollout"' $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json
	tools/gbsdoctor/gbsdoctor.py --update-readiness-evidence $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json --readiness-gate manual_mgba_stress_smoke --readiness-gate-ok true --readiness-gate-evidence-type manual_mgba_stress_smoke --readiness-gate-source "manual smoke log" --readiness-gate-checked-at "2026-06-11T12:00:00Z" --readiness-gate-message "stress ROMs ok" --readiness-gate-review-environment "mGBA fixture" --json > $(HOST_BUILD)/gbsdoctor/update_readiness_evidence_report.json
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json >/tmp/gbs_update_readiness_evidence_check
	grep -q '"kind": "readiness_evidence_update"' $(HOST_BUILD)/gbsdoctor/update_readiness_evidence_report.json
	grep -q '"gate": "manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/update_readiness_evidence_report.json
	grep -q '"evidence_type": "manual_mgba_stress_smoke"' $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json
	grep -q '"source": "manual smoke log"' $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json
	grep -q '"checked_at": "2026-06-11T12:00:00Z"' $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json
	grep -q '"message": "stress ROMs ok"' $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json
	if tools/gbsdoctor/gbsdoctor.py --update-readiness-evidence $(HOST_BUILD)/gbsdoctor/generated/readiness_evidence.json --readiness-gate unknown_gate --json > $(HOST_BUILD)/gbsdoctor/update_readiness_evidence_invalid_report.json; then exit 1; fi
	grep -q '"ok": false' $(HOST_BUILD)/gbsdoctor/update_readiness_evidence_invalid_report.json
	grep -q 'gate desconhecido' $(HOST_BUILD)/gbsdoctor/update_readiness_evidence_invalid_report.json
	printf '{"manual_mgba_stress_smoke":{"ok":true,"evidence_type":"manual_mgba_stress_smoke","source":"mGBA stress log","checked_at":"2026-06-11T13:00:00Z","review_environment":"mGBA fixture"},"hardware_or_ci_validation":{"ok":false},"gba_studio_engine_primary_rollout":{"ok":false}}\n' > $(HOST_BUILD)/gbsdoctor/partial_mgba_evidence.json
	printf '{"manual_mgba_stress_smoke":{"ok":false},"hardware_or_ci_validation":{"ok":true,"evidence_type":"cross_platform_ci","source":"CI macOS run","checked_at":"2026-06-11T13:10:00Z","validated_platforms":["macos"]},"gba_studio_engine_primary_rollout":{"ok":false}}\n' > $(HOST_BUILD)/gbsdoctor/partial_ci_macos_evidence.json
	printf '{"manual_mgba_stress_smoke":{"ok":false},"hardware_or_ci_validation":{"ok":true,"evidence_type":"cross_platform_ci","source":"CI Windows run","checked_at":"2026-06-11T13:11:00Z","validated_platforms":["windows"]},"gba_studio_engine_primary_rollout":{"ok":false}}\n' > $(HOST_BUILD)/gbsdoctor/partial_ci_windows_evidence.json
	printf '{"manual_mgba_stress_smoke":{"ok":false},"hardware_or_ci_validation":{"ok":true,"evidence_type":"cross_platform_ci","source":"CI Linux run","checked_at":"2026-06-11T13:12:00Z","validated_platforms":["linux"]},"gba_studio_engine_primary_rollout":{"ok":false}}\n' > $(HOST_BUILD)/gbsdoctor/partial_ci_linux_evidence.json
	printf '{"manual_mgba_stress_smoke":{"ok":false},"hardware_or_ci_validation":{"ok":false},"gba_studio_engine_primary_rollout":{"ok":true,"evidence_type":"gba_studio_engine_primary_rollout","source":"private engine-primary rollout smoke","checked_at":"2026-06-11T13:20:00Z"}}\n' > $(HOST_BUILD)/gbsdoctor/partial_rollout_evidence.json
	tools/gbsdoctor/gbsdoctor.py --merge-readiness-evidence $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json --readiness-evidence-input $(HOST_BUILD)/gbsdoctor/partial_mgba_evidence.json --readiness-evidence-input $(HOST_BUILD)/gbsdoctor/partial_ci_macos_evidence.json --readiness-evidence-input $(HOST_BUILD)/gbsdoctor/partial_ci_windows_evidence.json --readiness-evidence-input $(HOST_BUILD)/gbsdoctor/partial_ci_linux_evidence.json --readiness-evidence-input $(HOST_BUILD)/gbsdoctor/partial_rollout_evidence.json --json > $(HOST_BUILD)/gbsdoctor/merge_readiness_evidence_report.json
	python3 -m json.tool $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json >/tmp/gbs_merge_readiness_evidence_check
	grep -q '"kind": "readiness_evidence_merge"' $(HOST_BUILD)/gbsdoctor/merge_readiness_evidence_report.json
	grep -q '"input_count": 5' $(HOST_BUILD)/gbsdoctor/merge_readiness_evidence_report.json
	grep -q '"source": "mGBA stress log"' $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json
	grep -q '"source": "GitHub Actions cross-platform CI inputs"' $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json
	grep -q '"source": "private engine-primary rollout smoke"' $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json
	grep -q '"evidence_type": "cross_platform_ci"' $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json
	python3 -c 'import json; e=json.load(open("$(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json")); assert set(e["hardware_or_ci_validation"]["validated_platforms"]) == {"macos","windows","linux"}'
	tools/gbsdoctor/gbsdoctor.py --validate-public-schema readiness_evidence --schema-document $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json --json > $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence_validation.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence_validation.json
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --readiness-evidence $(HOST_BUILD)/gbsdoctor/merged_readiness_evidence.json --require-primary-ready --json > $(HOST_BUILD)/gbsdoctor/merged_primary_ready_report.json
	grep -q '"stage": "primary_ready"' $(HOST_BUILD)/gbsdoctor/merged_primary_ready_report.json
	printf '{"backend":"gbastudio_engine","kind":"pointAndClick","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[]}\n' > "$(HOST_BUILD)/gbsdoctor/project with space/gbastudio_project.json"
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --json > $(HOST_BUILD)/gbsdoctor/point_click_alias_report.json
	grep -q '"ok": true' $(HOST_BUILD)/gbsdoctor/point_click_alias_report.json
	grep -q '"value": "pointAndClick"' $(HOST_BUILD)/gbsdoctor/point_click_alias_report.json
	printf '{"backend":"gbastudio_engine","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"requires":{"features":["missing_feature"]}}\n' > "$(HOST_BUILD)/gbsdoctor/project with space/gbastudio_project.json"
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --json > $(HOST_BUILD)/gbsdoctor/unsupported_report.json; then exit 1; fi
	grep -q '"key": "project_required_feature"' $(HOST_BUILD)/gbsdoctor/unsupported_report.json
	grep -q 'missing_feature' $(HOST_BUILD)/gbsdoctor/unsupported_report.json
	grep -q '"actionable_messages"' $(HOST_BUILD)/gbsdoctor/unsupported_report.json
	grep -q '"code": "GBS_DOCTOR_PROJECT_REQUIRED_FEATURE"' $(HOST_BUILD)/gbsdoctor/unsupported_report.json
	printf '{"backend":"gbastudio_engine","kind":"unknown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[]}\n' > "$(HOST_BUILD)/gbsdoctor/project with space/gbastudio_project.json"
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --json > $(HOST_BUILD)/gbsdoctor/unsupported_kind_report.json; then exit 1; fi
	grep -q '"key": "project_manifest_kind"' $(HOST_BUILD)/gbsdoctor/unsupported_kind_report.json
	grep -q 'unknown' $(HOST_BUILD)/gbsdoctor/unsupported_kind_report.json
	grep -q '"code": "GBS_DOCTOR_PROJECT_MANIFEST_KIND"' $(HOST_BUILD)/gbsdoctor/unsupported_kind_report.json
	printf '{"backend":"gbastudio_engine","kind":"topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"build":{"target":"bad target"}}\n' > "$(HOST_BUILD)/gbsdoctor/project with space/gbastudio_project.json"
	pack_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/pack"; project_dir="$$(pwd)/$(HOST_BUILD)/gbsdoctor/project with space"; if tools/gbsdoctor/gbsdoctor.py --engine-pack "$$pack_dir" --project-dir "$$project_dir" --skip-toolchain --json > $(HOST_BUILD)/gbsdoctor/unsupported_build_report.json; then exit 1; fi
	grep -q '"key": "project_build_target"' $(HOST_BUILD)/gbsdoctor/unsupported_build_report.json
	grep -q '"code": "GBS_DOCTOR_PROJECT_BUILD_TARGET"' $(HOST_BUILD)/gbsdoctor/unsupported_build_report.json

package: test topdown_basic.gba platformer_basic.gba isometric_basic.gba
	rm -rf $(DIST_DIR)
	mkdir -p $(DIST_DIR)/include $(DIST_DIR)/lib $(DIST_DIR)/templates/topdown_basic $(DIST_DIR)/templates/platformer_basic $(DIST_DIR)/templates/isometric_basic $(DIST_DIR)/templates/exported_topdown $(DIST_DIR)/templates/exported_platformer $(DIST_DIR)/templates/exported_isometric $(DIST_DIR)/templates/exported_dungeon_crawler $(DIST_DIR)/templates/exported_racing $(DIST_DIR)/templates/exported_battle_rpg $(DIST_DIR)/templates/exported_mixed $(DIST_DIR)/templates/exported_point_click $(DIST_DIR)/templates/exported_shmup $(DIST_DIR)/templates/exported_visual_novel $(DIST_DIR)/templates/exported_menu $(DIST_DIR)/templates/exported_cutscene $(DIST_DIR)/templates/exported_world_map $(DIST_DIR)/templates/exported_luta $(DIST_DIR)/schemas $(DIST_DIR)/tools
	cp -R engine/include/gbs $(DIST_DIR)/include/
	cp $(ENGINE_LIB) $(DIST_DIR)/lib/
	cp engine/startup/gba.ld $(DIST_DIR)/templates/gba.ld
	cp templates/Makefile.gba $(DIST_DIR)/templates/Makefile.gba
	cp tools/assetc/assetc.py $(DIST_DIR)/tools/assetc
	cp tools/gbsbuild/gbsbuild.py $(DIST_DIR)/tools/gbsbuild
	cp tools/gbsdoctor/gbsdoctor.py $(DIST_DIR)/tools/gbsdoctor
	cp scripts/smoke_mgba.sh $(DIST_DIR)/tools/smoke_mgba
	cp scripts/production_smoke.py $(DIST_DIR)/tools/production_smoke
	cp scripts/stress_projects.py $(DIST_DIR)/tools/stress_projects
	cp scripts/verify_cross_platform.py $(DIST_DIR)/tools/verify_cross_platform
	cp scripts/write_mgba_manual_handoff.py $(DIST_DIR)/tools/write_mgba_manual_handoff
	cp scripts/write_engine_primary_handoff.py $(DIST_DIR)/tools/write_engine_primary_handoff
	chmod +x $(DIST_DIR)/tools/assetc
	chmod +x $(DIST_DIR)/tools/gbsbuild
	chmod +x $(DIST_DIR)/tools/gbsdoctor
	chmod +x $(DIST_DIR)/tools/smoke_mgba
	chmod +x $(DIST_DIR)/tools/production_smoke
	chmod +x $(DIST_DIR)/tools/stress_projects
	chmod +x $(DIST_DIR)/tools/verify_cross_platform
	chmod +x $(DIST_DIR)/tools/write_mgba_manual_handoff
	chmod +x $(DIST_DIR)/tools/write_engine_primary_handoff
	cp VERSION LICENSE README.md CHANGELOG.md enginepack.json $(DIST_DIR)/
	cp schemas/*.schema.json $(DIST_DIR)/schemas/
	cp -R tests/stress $(DIST_DIR)/stress
	cp -R docs $(DIST_DIR)/
	cp examples/topdown_basic/src/main.cpp $(DIST_DIR)/templates/topdown_basic/main.cpp
	cp examples/topdown_basic/src/gbastudio_project_data.hpp $(DIST_DIR)/templates/topdown_basic/gbastudio_project_data.hpp
	cp examples/topdown_basic/src/player_sprite_asset.hpp $(DIST_DIR)/templates/topdown_basic/player_sprite_asset.hpp
	cp examples/platformer_basic/src/main.cpp $(DIST_DIR)/templates/platformer_basic/main.cpp
	cp examples/platformer_basic/src/platformer_project_data.hpp $(DIST_DIR)/templates/platformer_basic/platformer_project_data.hpp
	cp examples/isometric_basic/src/main.cpp $(DIST_DIR)/templates/isometric_basic/main.cpp
	cp examples/isometric_basic/src/isometric_project_data.hpp $(DIST_DIR)/templates/isometric_basic/isometric_project_data.hpp
	cp templates/exported_topdown/README.md $(DIST_DIR)/templates/exported_topdown/README.md
	cp templates/exported_topdown/gbastudio_project.json $(DIST_DIR)/templates/exported_topdown/gbastudio_project.json
	cp examples/topdown_basic/src/main.cpp $(DIST_DIR)/templates/exported_topdown/main.cpp
	cp examples/topdown_basic/src/gbastudio_project_data.hpp $(DIST_DIR)/templates/exported_topdown/gbastudio_project_data.hpp
	cp examples/topdown_basic/src/player_sprite_asset.hpp $(DIST_DIR)/templates/exported_topdown/player_sprite_asset.hpp
	cp templates/exported_platformer/README.md $(DIST_DIR)/templates/exported_platformer/README.md
	cp templates/exported_platformer/gbastudio_project.json $(DIST_DIR)/templates/exported_platformer/gbastudio_project.json
	cp examples/platformer_basic/src/main.cpp $(DIST_DIR)/templates/exported_platformer/main.cpp
	cp examples/platformer_basic/src/platformer_project_data.hpp $(DIST_DIR)/templates/exported_platformer/platformer_project_data.hpp
	cp templates/exported_isometric/README.md $(DIST_DIR)/templates/exported_isometric/README.md
	cp templates/exported_isometric/gbastudio_project.json $(DIST_DIR)/templates/exported_isometric/gbastudio_project.json
	cp examples/isometric_basic/src/main.cpp $(DIST_DIR)/templates/exported_isometric/main.cpp
	cp examples/isometric_basic/src/isometric_project_data.hpp $(DIST_DIR)/templates/exported_isometric/isometric_project_data.hpp
	cp templates/exported_dungeon_crawler/README.md $(DIST_DIR)/templates/exported_dungeon_crawler/README.md
	cp templates/exported_dungeon_crawler/gbastudio_project.json $(DIST_DIR)/templates/exported_dungeon_crawler/gbastudio_project.json
	cp templates/exported_dungeon_crawler/main.cpp $(DIST_DIR)/templates/exported_dungeon_crawler/main.cpp
	cp templates/exported_dungeon_crawler/dungeon_crawler_project_data.hpp $(DIST_DIR)/templates/exported_dungeon_crawler/dungeon_crawler_project_data.hpp
	cp templates/exported_racing/README.md $(DIST_DIR)/templates/exported_racing/README.md
	cp templates/exported_racing/gbastudio_project.json $(DIST_DIR)/templates/exported_racing/gbastudio_project.json
	cp templates/exported_racing/main.cpp $(DIST_DIR)/templates/exported_racing/main.cpp
	cp templates/exported_racing/racing_project_data.hpp $(DIST_DIR)/templates/exported_racing/racing_project_data.hpp
	cp templates/exported_battle_rpg/README.md $(DIST_DIR)/templates/exported_battle_rpg/README.md
	cp templates/exported_battle_rpg/gbastudio_project.json $(DIST_DIR)/templates/exported_battle_rpg/gbastudio_project.json
	cp templates/exported_battle_rpg/main.cpp $(DIST_DIR)/templates/exported_battle_rpg/main.cpp
	cp templates/exported_battle_rpg/battle_rpg_project_data.hpp $(DIST_DIR)/templates/exported_battle_rpg/battle_rpg_project_data.hpp
	cp templates/exported_mixed/README.md $(DIST_DIR)/templates/exported_mixed/README.md
	cp templates/exported_mixed/gbastudio_project.json $(DIST_DIR)/templates/exported_mixed/gbastudio_project.json
	cp templates/exported_mixed/main.cpp $(DIST_DIR)/templates/exported_mixed/main.cpp
	cp templates/exported_mixed/topdown_runtime.cpp $(DIST_DIR)/templates/exported_mixed/topdown_runtime.cpp
	cp templates/exported_mixed/platformer_runtime.cpp $(DIST_DIR)/templates/exported_mixed/platformer_runtime.cpp
	cp templates/exported_mixed/isometric_runtime.cpp $(DIST_DIR)/templates/exported_mixed/isometric_runtime.cpp
	cp examples/topdown_basic/src/main.cpp $(DIST_DIR)/templates/exported_mixed/topdown_runtime.inc
	cp examples/platformer_basic/src/main.cpp $(DIST_DIR)/templates/exported_mixed/platformer_runtime.inc
	cp examples/isometric_basic/src/main.cpp $(DIST_DIR)/templates/exported_mixed/isometric_runtime.inc
	cp templates/exported_menu/main.cpp $(DIST_DIR)/templates/exported_mixed/menu_runtime.inc
	cp templates/exported_mixed/menu_runtime.cpp $(DIST_DIR)/templates/exported_mixed/menu_runtime.cpp
	cp templates/exported_shmup/main.cpp $(DIST_DIR)/templates/exported_mixed/shmup_runtime.inc
	cp templates/exported_mixed/shmup_runtime.cpp $(DIST_DIR)/templates/exported_mixed/shmup_runtime.cpp
	cp templates/exported_point_click/main.cpp $(DIST_DIR)/templates/exported_mixed/point_click_runtime.inc
	cp templates/exported_mixed/point_click_runtime.cpp $(DIST_DIR)/templates/exported_mixed/point_click_runtime.cpp
	cp templates/exported_dungeon_crawler/main.cpp $(DIST_DIR)/templates/exported_mixed/dungeon_crawler_runtime.inc
	cp templates/exported_mixed/dungeon_crawler_runtime.cpp $(DIST_DIR)/templates/exported_mixed/dungeon_crawler_runtime.cpp
	cp templates/exported_racing/main.cpp $(DIST_DIR)/templates/exported_mixed/racing_runtime.inc
	cp templates/exported_mixed/racing_runtime.cpp $(DIST_DIR)/templates/exported_mixed/racing_runtime.cpp
	cp templates/exported_cutscene/main.cpp $(DIST_DIR)/templates/exported_mixed/cutscene_runtime.inc
	cp templates/exported_mixed/cutscene_runtime.cpp $(DIST_DIR)/templates/exported_mixed/cutscene_runtime.cpp
	cp templates/exported_visual_novel/main.cpp $(DIST_DIR)/templates/exported_mixed/visual_novel_runtime.inc
	cp templates/exported_mixed/visual_novel_runtime.cpp $(DIST_DIR)/templates/exported_mixed/visual_novel_runtime.cpp
	cp templates/exported_world_map/main.cpp $(DIST_DIR)/templates/exported_mixed/world_map_runtime.inc
	cp templates/exported_mixed/world_map_runtime.cpp $(DIST_DIR)/templates/exported_mixed/world_map_runtime.cpp
	cp templates/exported_battle_rpg/main.cpp $(DIST_DIR)/templates/exported_mixed/battle_rpg_runtime.inc
	cp templates/exported_mixed/battle_rpg_runtime.cpp $(DIST_DIR)/templates/exported_mixed/battle_rpg_runtime.cpp
	cp templates/exported_luta/main.cpp $(DIST_DIR)/templates/exported_mixed/luta_runtime.inc
	cp templates/exported_mixed/luta_runtime.cpp $(DIST_DIR)/templates/exported_mixed/luta_runtime.cpp
	cp templates/exported_point_click/README.md $(DIST_DIR)/templates/exported_point_click/README.md
	cp templates/exported_point_click/gbastudio_project.json $(DIST_DIR)/templates/exported_point_click/gbastudio_project.json
	cp templates/exported_point_click/main.cpp $(DIST_DIR)/templates/exported_point_click/main.cpp
	cp templates/exported_point_click/point_click_project_data.hpp $(DIST_DIR)/templates/exported_point_click/point_click_project_data.hpp
	cp templates/exported_shmup/README.md $(DIST_DIR)/templates/exported_shmup/README.md
	cp templates/exported_shmup/gbastudio_project.json $(DIST_DIR)/templates/exported_shmup/gbastudio_project.json
	cp templates/exported_shmup/main.cpp $(DIST_DIR)/templates/exported_shmup/main.cpp
	cp templates/exported_shmup/shmup_project_data.hpp $(DIST_DIR)/templates/exported_shmup/shmup_project_data.hpp
	cp templates/exported_visual_novel/README.md $(DIST_DIR)/templates/exported_visual_novel/README.md
	cp templates/exported_visual_novel/gbastudio_project.json $(DIST_DIR)/templates/exported_visual_novel/gbastudio_project.json
	cp templates/exported_visual_novel/main.cpp $(DIST_DIR)/templates/exported_visual_novel/main.cpp
	cp templates/exported_visual_novel/visual_novel_project_data.hpp $(DIST_DIR)/templates/exported_visual_novel/visual_novel_project_data.hpp
	cp templates/exported_menu/README.md $(DIST_DIR)/templates/exported_menu/README.md
	cp templates/exported_menu/gbastudio_project.json $(DIST_DIR)/templates/exported_menu/gbastudio_project.json
	cp templates/exported_menu/main.cpp $(DIST_DIR)/templates/exported_menu/main.cpp
	cp templates/exported_menu/menu_project_data.hpp $(DIST_DIR)/templates/exported_menu/menu_project_data.hpp
	cp templates/exported_cutscene/README.md $(DIST_DIR)/templates/exported_cutscene/README.md
	cp templates/exported_cutscene/gbastudio_project.json $(DIST_DIR)/templates/exported_cutscene/gbastudio_project.json
	cp templates/exported_cutscene/main.cpp $(DIST_DIR)/templates/exported_cutscene/main.cpp
	cp templates/exported_cutscene/cutscene_project_data.hpp $(DIST_DIR)/templates/exported_cutscene/cutscene_project_data.hpp
	cp templates/exported_world_map/README.md $(DIST_DIR)/templates/exported_world_map/README.md
	cp templates/exported_world_map/gbastudio_project.json $(DIST_DIR)/templates/exported_world_map/gbastudio_project.json
	cp templates/exported_world_map/main.cpp $(DIST_DIR)/templates/exported_world_map/main.cpp
	cp templates/exported_world_map/world_map_project_data.hpp $(DIST_DIR)/templates/exported_world_map/world_map_project_data.hpp
	cp templates/exported_luta/README.md $(DIST_DIR)/templates/exported_luta/README.md
	cp templates/exported_luta/gbastudio_project.json $(DIST_DIR)/templates/exported_luta/gbastudio_project.json
	cp templates/exported_luta/main.cpp $(DIST_DIR)/templates/exported_luta/main.cpp
	cp templates/exported_luta/luta_project_data.hpp $(DIST_DIR)/templates/exported_luta/luta_project_data.hpp
	@echo "Engine Pack gerado em $(DIST_DIR)"

verify-export-fixture: package
	rm -rf $(BUILD_DIR)/verify-export-fixture
	mkdir -p $(BUILD_DIR)/verify-export-fixture/topdown $(BUILD_DIR)/verify-export-fixture/platformer $(BUILD_DIR)/verify-export-fixture/isometric $(BUILD_DIR)/verify-export-fixture/shmup $(BUILD_DIR)/verify-export-fixture/menu $(BUILD_DIR)/verify-export-fixture/cutscene $(BUILD_DIR)/verify-export-fixture/world_map
	cp $(DIST_DIR)/templates/exported_topdown/main.cpp $(BUILD_DIR)/verify-export-fixture/topdown/main.cpp
	cp $(DIST_DIR)/templates/exported_topdown/gbastudio_project_data.hpp $(BUILD_DIR)/verify-export-fixture/topdown/gbastudio_project_data.hpp
	cp $(DIST_DIR)/templates/exported_topdown/player_sprite_asset.hpp $(BUILD_DIR)/verify-export-fixture/topdown/player_sprite_asset.hpp
	cp $(DIST_DIR)/templates/exported_topdown/gbastudio_project.json $(BUILD_DIR)/verify-export-fixture/topdown/gbastudio_project.json
	python3 -m json.tool $(BUILD_DIR)/verify-export-fixture/topdown/gbastudio_project.json >/tmp/gbs_export_fixture_topdown_manifest_check
	grep -q '"backend": "gbastudio_engine"' $(BUILD_DIR)/verify-export-fixture/topdown/gbastudio_project.json
	grep -q '"kind": "topdown"' $(BUILD_DIR)/verify-export-fixture/topdown/gbastudio_project.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/topdown)" --json > $(BUILD_DIR)/verify-export-fixture/topdown_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-export-fixture/topdown_doctor.json
	grep -q '"key": "project_manifest"' $(BUILD_DIR)/verify-export-fixture/topdown_doctor.json
	grep -q '"key": "project_manifest_backend"' $(BUILD_DIR)/verify-export-fixture/topdown_doctor.json
	grep -q '"key": "project_generated_asset"' $(BUILD_DIR)/verify-export-fixture/topdown_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/topdown)" --dry-run --json > $(BUILD_DIR)/verify-export-fixture/topdown_build_dry_run.json
	grep -q '"TARGET=exported_topdown"' $(BUILD_DIR)/verify-export-fixture/topdown_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/topdown)"
	test -f $(BUILD_DIR)/verify-export-fixture/topdown/build/exported_topdown.gba
	cp $(DIST_DIR)/templates/exported_platformer/main.cpp $(BUILD_DIR)/verify-export-fixture/platformer/main.cpp
	cp $(DIST_DIR)/templates/exported_platformer/platformer_project_data.hpp $(BUILD_DIR)/verify-export-fixture/platformer/platformer_project_data.hpp
	cp $(DIST_DIR)/templates/exported_platformer/gbastudio_project.json $(BUILD_DIR)/verify-export-fixture/platformer/gbastudio_project.json
	python3 -m json.tool $(BUILD_DIR)/verify-export-fixture/platformer/gbastudio_project.json >/tmp/gbs_export_fixture_platformer_manifest_check
	grep -q '"kind": "platformer"' $(BUILD_DIR)/verify-export-fixture/platformer/gbastudio_project.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/platformer)" --json > $(BUILD_DIR)/verify-export-fixture/platformer_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-export-fixture/platformer_doctor.json
	grep -q '"key": "project_manifest"' $(BUILD_DIR)/verify-export-fixture/platformer_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/platformer)" --dry-run --json > $(BUILD_DIR)/verify-export-fixture/platformer_build_dry_run.json
	grep -q '"TARGET=exported_platformer"' $(BUILD_DIR)/verify-export-fixture/platformer_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/platformer)"
	test -f $(BUILD_DIR)/verify-export-fixture/platformer/build/exported_platformer.gba
	cp $(DIST_DIR)/templates/exported_isometric/main.cpp $(BUILD_DIR)/verify-export-fixture/isometric/main.cpp
	cp $(DIST_DIR)/templates/exported_isometric/isometric_project_data.hpp $(BUILD_DIR)/verify-export-fixture/isometric/isometric_project_data.hpp
	cp $(DIST_DIR)/templates/exported_isometric/gbastudio_project.json $(BUILD_DIR)/verify-export-fixture/isometric/gbastudio_project.json
	python3 -m json.tool $(BUILD_DIR)/verify-export-fixture/isometric/gbastudio_project.json >/tmp/gbs_export_fixture_isometric_manifest_check
	grep -q '"kind": "isometric"' $(BUILD_DIR)/verify-export-fixture/isometric/gbastudio_project.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/isometric)" --json > $(BUILD_DIR)/verify-export-fixture/isometric_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-export-fixture/isometric_doctor.json
	grep -q '"key": "project_manifest"' $(BUILD_DIR)/verify-export-fixture/isometric_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/isometric)" --dry-run --json > $(BUILD_DIR)/verify-export-fixture/isometric_build_dry_run.json
	grep -q '"TARGET=exported_isometric"' $(BUILD_DIR)/verify-export-fixture/isometric_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/isometric)"
	test -f $(BUILD_DIR)/verify-export-fixture/isometric/build/exported_isometric.gba
	cp $(DIST_DIR)/templates/exported_shmup/main.cpp $(BUILD_DIR)/verify-export-fixture/shmup/main.cpp
	cp $(DIST_DIR)/templates/exported_shmup/shmup_project_data.hpp $(BUILD_DIR)/verify-export-fixture/shmup/shmup_project_data.hpp
	cp $(DIST_DIR)/templates/exported_shmup/gbastudio_project.json $(BUILD_DIR)/verify-export-fixture/shmup/gbastudio_project.json
	python3 -m json.tool $(BUILD_DIR)/verify-export-fixture/shmup/gbastudio_project.json >/tmp/gbs_export_fixture_shmup_manifest_check
	grep -q '"kind": "shmup"' $(BUILD_DIR)/verify-export-fixture/shmup/gbastudio_project.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/shmup)" --json > $(BUILD_DIR)/verify-export-fixture/shmup_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-export-fixture/shmup_doctor.json
	grep -q '"key": "project_manifest"' $(BUILD_DIR)/verify-export-fixture/shmup_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/shmup)" --dry-run --json > $(BUILD_DIR)/verify-export-fixture/shmup_build_dry_run.json
	grep -q '"TARGET=exported_shmup"' $(BUILD_DIR)/verify-export-fixture/shmup_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/shmup)"
	test -f $(BUILD_DIR)/verify-export-fixture/shmup/build/exported_shmup.gba
	cp $(DIST_DIR)/templates/exported_menu/main.cpp $(BUILD_DIR)/verify-export-fixture/menu/main.cpp
	cp $(DIST_DIR)/templates/exported_menu/menu_project_data.hpp $(BUILD_DIR)/verify-export-fixture/menu/menu_project_data.hpp
	cp $(DIST_DIR)/templates/exported_menu/gbastudio_project.json $(BUILD_DIR)/verify-export-fixture/menu/gbastudio_project.json
	python3 -m json.tool $(BUILD_DIR)/verify-export-fixture/menu/gbastudio_project.json >/tmp/gbs_export_fixture_menu_manifest_check
	grep -q '"kind": "menu"' $(BUILD_DIR)/verify-export-fixture/menu/gbastudio_project.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/menu)" --json > $(BUILD_DIR)/verify-export-fixture/menu_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-export-fixture/menu_doctor.json
	grep -q '"key": "project_manifest"' $(BUILD_DIR)/verify-export-fixture/menu_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/menu)" --dry-run --json > $(BUILD_DIR)/verify-export-fixture/menu_build_dry_run.json
	grep -q '"TARGET=exported_menu"' $(BUILD_DIR)/verify-export-fixture/menu_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/menu)"
	test -f $(BUILD_DIR)/verify-export-fixture/menu/build/exported_menu.gba
	cp $(DIST_DIR)/templates/exported_cutscene/main.cpp $(BUILD_DIR)/verify-export-fixture/cutscene/main.cpp
	cp $(DIST_DIR)/templates/exported_cutscene/cutscene_project_data.hpp $(BUILD_DIR)/verify-export-fixture/cutscene/cutscene_project_data.hpp
	cp $(DIST_DIR)/templates/exported_cutscene/gbastudio_project.json $(BUILD_DIR)/verify-export-fixture/cutscene/gbastudio_project.json
	python3 -m json.tool $(BUILD_DIR)/verify-export-fixture/cutscene/gbastudio_project.json >/tmp/gbs_export_fixture_cutscene_manifest_check
	grep -q '"kind": "cutscene"' $(BUILD_DIR)/verify-export-fixture/cutscene/gbastudio_project.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/cutscene)" --json > $(BUILD_DIR)/verify-export-fixture/cutscene_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-export-fixture/cutscene_doctor.json
	grep -q '"key": "project_manifest"' $(BUILD_DIR)/verify-export-fixture/cutscene_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/cutscene)" --dry-run --json > $(BUILD_DIR)/verify-export-fixture/cutscene_build_dry_run.json
	grep -q '"TARGET=exported_cutscene"' $(BUILD_DIR)/verify-export-fixture/cutscene_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/cutscene)"
	test -f $(BUILD_DIR)/verify-export-fixture/cutscene/build/exported_cutscene.gba
	cp $(DIST_DIR)/templates/exported_world_map/main.cpp $(BUILD_DIR)/verify-export-fixture/world_map/main.cpp
	cp $(DIST_DIR)/templates/exported_world_map/world_map_project_data.hpp $(BUILD_DIR)/verify-export-fixture/world_map/world_map_project_data.hpp
	cp $(DIST_DIR)/templates/exported_world_map/gbastudio_project.json $(BUILD_DIR)/verify-export-fixture/world_map/gbastudio_project.json
	python3 -m json.tool $(BUILD_DIR)/verify-export-fixture/world_map/gbastudio_project.json >/tmp/gbs_export_fixture_world_map_manifest_check
	grep -q '"kind": "world_map"' $(BUILD_DIR)/verify-export-fixture/world_map/gbastudio_project.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/world_map)" --json > $(BUILD_DIR)/verify-export-fixture/world_map_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-export-fixture/world_map_doctor.json
	grep -q '"key": "project_manifest"' $(BUILD_DIR)/verify-export-fixture/world_map_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/world_map)" --dry-run --json > $(BUILD_DIR)/verify-export-fixture/world_map_build_dry_run.json
	grep -q '"TARGET=exported_world_map"' $(BUILD_DIR)/verify-export-fixture/world_map_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-export-fixture/world_map)"
	test -f $(BUILD_DIR)/verify-export-fixture/world_map/build/exported_world_map.gba
	@echo "Fixture exportado verificado em $(BUILD_DIR)/verify-export-fixture"

verify-package: package verify-export-fixture
	rm -rf $(BUILD_DIR)/verify-package
	mkdir -p $(BUILD_DIR)/verify-package/project $(BUILD_DIR)/verify-package/assets
	cp $(DIST_DIR)/templates/topdown_basic/main.cpp $(BUILD_DIR)/verify-package/project/main.cpp
	cp $(DIST_DIR)/templates/topdown_basic/gbastudio_project_data.hpp $(BUILD_DIR)/verify-package/project/gbastudio_project_data.hpp
	cp $(DIST_DIR)/templates/topdown_basic/player_sprite_asset.hpp $(BUILD_DIR)/verify-package/project/player_sprite_asset.hpp
	python3 tests/host/make_test_png.py $(BUILD_DIR)/verify-package/assets/tiny.png
	$(DIST_DIR)/tools/assetc $(BUILD_DIR)/verify-package/assets/tiny.png -o $(BUILD_DIR)/verify-package/assets/tiny.hpp -n verify_asset
	test -x $(DIST_DIR)/tools/smoke_mgba
	test -x $(DIST_DIR)/tools/production_smoke
	test -x $(DIST_DIR)/tools/stress_projects
	test -x $(DIST_DIR)/tools/verify_cross_platform
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/project)" --json > $(BUILD_DIR)/verify-package/doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/project)" --target verify_package --dry-run --json > $(BUILD_DIR)/verify-package/build_dry_run.json
	grep -q '"TARGET=verify_package"' $(BUILD_DIR)/verify-package/build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/project)" --target verify_package
	test -f $(BUILD_DIR)/verify-package/project/build/verify_package.gba
	mkdir -p $(BUILD_DIR)/verify-package/generated_project
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"topdown","template_dir":"../../../dist/GBAStudioEnginePack/templates/exported_topdown","entry":"main.cpp","project_data":"gbastudio_project_data.hpp","generated_assets":[],"build":{"target":"verify_generated_project","make_target":"all"},"requires":{"engine_pack":">=1.17.0","features":["topdown_project_data","dialogue","asset-export-topdown-project-data","asset_export_resource_bank_upload_sources","asset_export_semantic_asset_refs"]},"topdown_project":{"assets":{"bg_palettes":["room_bg"],"tile_assets":["room_bg"]},"backgrounds":[{"layer":"bg1","tilemap":"room_bg","scroll":{"x":0,"y":0},"parallax":{"x":256,"y":256}}],"resource_banks":"asset_pack","rooms":[{"name":"verify_room","resource_bank_group":"room_0","width_tiles":2,"height_tiles":2,"visual_tiles":[0,1,1,0],"collision_flags":[0,0,1,1],"metadata":{"camera_mode":"follow","player_start":{"x":8,"y":8},"backdrop_color":31},"on_enter":[{"op":"show_choice","group":0}],"interactions":[{"area":{"x":0,"y":0,"width":8,"height":8},"script":[{"op":"set_variable","variable":1,"value":4}]}],"npcs":[{"name":"verify_npc","position":{"x":8,"y":8},"size":{"x":16,"y":16},"on_interact":[{"op":"show_dialogue","line":0}]}],"triggers":[{"area":{"x":0,"y":8,"width":8,"height":8},"on_enter":[{"op":"set_variable","variable":3,"value":1}]}],"portals":[{"area":{"x":8,"y":0,"width":8,"height":8},"target_room":0,"target_position":{"x":8,"y":8},"script":[{"op":"play_sfx","index":0},{"op":"warp","room":0,"x":8,"y":8}]}]}],"player":{"position":{"x":8,"y":8},"size":{"x":16,"y":16},"speed":1,"emit_animation_fallback":true},"camera":{"position":{"x":0,"y":0},"follow_player":true},"dialogue_lines":["Verify hello"],"choice_groups":[{"line":0,"variable":4,"choices":[{"text":"OK","value":1}]}]},"asset_pack":{"assets":[{"name":"room_bg","id":"room_bg","bank_group":"room_0","kind":"bg","png":"tiny.png","header":"generated_room_bg.hpp","symbol":"generated_room_bg"}]}}\n' > $(BUILD_DIR)/verify-package/assets/export_project.json
	$(DIST_DIR)/tools/assetc $(BUILD_DIR)/verify-package/assets/export_project.json -o $(BUILD_DIR)/verify-package/generated_project --export-project-json
	grep -q "constexpr gbs::TopDownBackgroundData backgrounds" $(BUILD_DIR)/verify-package/generated_project/gbastudio_project_data.hpp
	grep -q '#include "generated_room_bg.hpp"' $(BUILD_DIR)/verify-package/generated_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::ResourceBank resource_banks" $(BUILD_DIR)/verify-package/generated_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::ResourceBankGroup resource_bank_groups" $(BUILD_DIR)/verify-package/generated_project/gbastudio_project_data.hpp
	grep -q "constexpr gbs::ResourceBankUploadSource resource_bank_upload_sources" $(BUILD_DIR)/verify-package/generated_project/gbastudio_project_data.hpp
	grep -q "generated_room_bg_tiles" $(BUILD_DIR)/verify-package/generated_project/gbastudio_project_data.hpp
	grep -q "\"room_0\"" $(BUILD_DIR)/verify-package/generated_project/gbastudio_project_data.hpp
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_project)" --json > $(BUILD_DIR)/verify-package/generated_project_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/generated_project_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_project)" --dry-run --json > $(BUILD_DIR)/verify-package/generated_project_build_dry_run.json
	grep -q '"TARGET=verify_generated_project"' $(BUILD_DIR)/verify-package/generated_project_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_project)"
	test -f $(BUILD_DIR)/verify-package/generated_project/build/verify_generated_project.gba
	mkdir -p $(BUILD_DIR)/verify-package/generated_platformer_project
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"platformer","template_dir":"../../../dist/GBAStudioEnginePack/templates/exported_platformer","entry":"main.cpp","project_data":"platformer_project_data.hpp","generated_assets":[],"build":{"target":"verify_generated_platformer","make_target":"all"},"requires":{"engine_pack":">=1.16.0","features":["platformer_runtime","engine_sdk.platformer_project_data_contract","asset-export-platformer-project-data"]},"platformer_project":{"includes":["../assets/tiny.hpp"],"assets":{"bg_palettes":["verify_asset_palette_asset"],"tile_assets":["verify_asset_tile_asset"]},"initial_room":0,"backdrop_color":99,"rooms":[{"name":"verify_platformer_room","width_tiles":4,"height_tiles":3,"visual_tiles":[0,0,0,0,0,1,0,0,2,2,2,2],"collision_flags":[0,0,0,0,0,4,0,0,1,1,1,1],"player_start":{"x":8,"y":8,"width":16,"height":16},"camera":{"position":{"x":0,"y":0},"follow_player":true},"on_enter":[{"op":"set_variable","variable":1,"value":7}],"hazards":[{"area":{"x":16,"y":16,"width":8,"height":8},"damage":1,"respawn":true,"on_hit":[{"op":"play_sfx","index":0}]}],"checkpoints":[{"area":{"x":8,"y":8,"width":16,"height":16},"respawn_position":{"x":8,"y":8},"id":1,"on_activate":[{"op":"set_variable","variable":2,"value":3}]}],"camera_zones":[{"area":{"x":0,"y":0,"width":32,"height":24},"bounds":{"x":0,"y":0,"width":64,"height":48},"offset":{"x":0,"y":0},"lock_x":false,"lock_y":false,"on_enter":[{"op":"set_camera_position","x":0,"y":0}]}]}]}}\n' > $(BUILD_DIR)/verify-package/assets/export_platformer_project.json
	$(DIST_DIR)/tools/assetc $(BUILD_DIR)/verify-package/assets/export_platformer_project.json -o $(BUILD_DIR)/verify-package/generated_platformer_project --export-project-json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_platformer_project)" --json > $(BUILD_DIR)/verify-package/generated_platformer_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/generated_platformer_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_platformer_project)" --dry-run --json > $(BUILD_DIR)/verify-package/generated_platformer_build_dry_run.json
	grep -q '"TARGET=verify_generated_platformer"' $(BUILD_DIR)/verify-package/generated_platformer_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_platformer_project)"
	test -f $(BUILD_DIR)/verify-package/generated_platformer_project/build/verify_generated_platformer.gba
	mkdir -p $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project
	cp tests/fixtures/export_platformer_project_multiroom_pack.json $(BUILD_DIR)/verify-package/assets/export_platformer_project_multiroom.json
	$(DIST_DIR)/tools/assetc $(BUILD_DIR)/verify-package/assets/export_platformer_project_multiroom.json -o $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project --export-project-json
	grep -q "gbs::EventOp::Warp" $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project/platformer_project_data.hpp
	grep -q "constexpr gbs::ResourceBank resource_banks" $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project/platformer_project_data.hpp
	grep -q "constexpr gbs::ResourceBankUploadSource resource_bank_upload_sources" $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project/platformer_project_data.hpp
	grep -q "verify_platformer_room_bg_tiles" $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project/platformer_project_data.hpp
	grep -q "constexpr gbs::PlatformerEnemy verify_platformer_room_enemies" $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project/platformer_project_data.hpp
	grep -q "constexpr gbs::PlatformerMovingPlatform verify_platformer_room_moving_platforms" $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project/platformer_project_data.hpp
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project)" --json > $(BUILD_DIR)/verify-package/generated_platformer_multiroom_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/generated_platformer_multiroom_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project)" --dry-run --json > $(BUILD_DIR)/verify-package/generated_platformer_multiroom_build_dry_run.json
	grep -q '"TARGET=verify_generated_platformer"' $(BUILD_DIR)/verify-package/generated_platformer_multiroom_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project)"
	test -f $(BUILD_DIR)/verify-package/generated_platformer_multiroom_project/build/verify_generated_platformer.gba
	mkdir -p $(BUILD_DIR)/verify-package/generated_isometric_project
	printf '{"schema":1,"backend":"gbastudio_engine","kind":"isometric","template_dir":"../../../dist/GBAStudioEnginePack/templates/exported_isometric","entry":"main.cpp","project_data":"isometric_project_data.hpp","generated_assets":[],"build":{"target":"verify_generated_isometric","make_target":"all"},"requires":{"engine_pack":">=1.16.0","features":["isometric_runtime","engine_sdk.isometric_project_data_contract","asset-export-isometric-project-data"]},"isometric_project":{"includes":["../assets/tiny.hpp"],"assets":{"bg_palettes":["verify_asset_palette_asset"],"tile_assets":["verify_asset_tile_asset"]},"initial_room":0,"backdrop_color":123,"grid":{"tile_width_pixels":32,"tile_height_pixels":16,"origin":{"x":120,"y":24}},"rooms":[{"name":"verify_iso_room","width_tiles":3,"height_tiles":3,"visual_tiles":[1,1,1,1,2,1,1,1,1],"collision_flags":[1,1,1,1,0,1,1,1,1],"camera":{"position":{"x":0,"y":0},"bounds":{"x":0,"y":0,"width":96,"height":48},"bounds_enabled":true},"on_enter":[{"op":"set_variable","variable":1,"value":4}],"actors":[{"tile":{"x":1,"y":1,"z":0},"screen_offset":{"x":-8,"y":-16},"tile_index":0,"palette":0,"visible":true},{"tile":{"x":1,"y":0,"z":0},"screen_offset":{"x":-8,"y":-16},"tile_index":0,"palette":0,"visible":true,"hflip":true,"on_interact":[{"op":"show_dialogue","line":0}],"on_start":[{"op":"set_actor_visible","actor":1,"visible":1}],"on_update":[{"op":"set_camera_position","x":0,"y":0}]}]}]}}\n' > $(BUILD_DIR)/verify-package/assets/export_isometric_project.json
	$(DIST_DIR)/tools/assetc $(BUILD_DIR)/verify-package/assets/export_isometric_project.json -o $(BUILD_DIR)/verify-package/generated_isometric_project --export-project-json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_isometric_project)" --json > $(BUILD_DIR)/verify-package/generated_isometric_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/generated_isometric_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_isometric_project)" --dry-run --json > $(BUILD_DIR)/verify-package/generated_isometric_build_dry_run.json
	grep -q '"TARGET=verify_generated_isometric"' $(BUILD_DIR)/verify-package/generated_isometric_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_isometric_project)"
	test -f $(BUILD_DIR)/verify-package/generated_isometric_project/build/verify_generated_isometric.gba
	mkdir -p $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project
	cp tests/fixtures/export_isometric_project_multiroom_pack.json $(BUILD_DIR)/verify-package/assets/export_isometric_project_multiroom.json
	$(DIST_DIR)/tools/assetc $(BUILD_DIR)/verify-package/assets/export_isometric_project_multiroom.json -o $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project --export-project-json
	grep -q "gbs::EventOp::Warp" $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project/isometric_project_data.hpp
	grep -q "constexpr gbs::ResourceBank resource_banks" $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project/isometric_project_data.hpp
	grep -q "constexpr gbs::ResourceBankUploadSource resource_bank_upload_sources" $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project/isometric_project_data.hpp
	grep -q "verify_isometric_room_bg_tiles" $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project/isometric_project_data.hpp
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project)" --json > $(BUILD_DIR)/verify-package/generated_isometric_multiroom_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/generated_isometric_multiroom_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project)" --dry-run --json > $(BUILD_DIR)/verify-package/generated_isometric_multiroom_build_dry_run.json
	grep -q '"TARGET=verify_generated_isometric"' $(BUILD_DIR)/verify-package/generated_isometric_multiroom_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project)"
	test -f $(BUILD_DIR)/verify-package/generated_isometric_multiroom_project/build/verify_generated_isometric.gba
	mkdir -p $(BUILD_DIR)/verify-package/platformer_project
	cp $(DIST_DIR)/templates/platformer_basic/main.cpp $(BUILD_DIR)/verify-package/platformer_project/main.cpp
	cp $(DIST_DIR)/templates/platformer_basic/platformer_project_data.hpp $(BUILD_DIR)/verify-package/platformer_project/platformer_project_data.hpp
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/platformer_project)" --json > $(BUILD_DIR)/verify-package/platformer_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/platformer_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/platformer_project)" --target verify_platformer --dry-run --json > $(BUILD_DIR)/verify-package/platformer_build_dry_run.json
	grep -q '"TARGET=verify_platformer"' $(BUILD_DIR)/verify-package/platformer_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/platformer_project)" --target verify_platformer
	test -f $(BUILD_DIR)/verify-package/platformer_project/build/verify_platformer.gba
	mkdir -p $(BUILD_DIR)/verify-package/isometric_project
	cp $(DIST_DIR)/templates/isometric_basic/main.cpp $(BUILD_DIR)/verify-package/isometric_project/main.cpp
	cp $(DIST_DIR)/templates/isometric_basic/isometric_project_data.hpp $(BUILD_DIR)/verify-package/isometric_project/isometric_project_data.hpp
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/isometric_project)" --json > $(BUILD_DIR)/verify-package/isometric_doctor.json
	grep -q '"ok": true' $(BUILD_DIR)/verify-package/isometric_doctor.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/isometric_project)" --target verify_isometric --dry-run --json > $(BUILD_DIR)/verify-package/isometric_build_dry_run.json
	grep -q '"TARGET=verify_isometric"' $(BUILD_DIR)/verify-package/isometric_build_dry_run.json
	$(DIST_DIR)/tools/gbsbuild --engine-pack "$(abspath $(DIST_DIR))" --project-dir "$(abspath $(BUILD_DIR)/verify-package/isometric_project)" --target verify_isometric
	test -f $(BUILD_DIR)/verify-package/isometric_project/build/verify_isometric.gba
	@echo "Engine Pack verificado em $(BUILD_DIR)/verify-package"

verify-production-smoke: verify-package
	$(DIST_DIR)/tools/production_smoke --engine-pack "$(abspath $(DIST_DIR))" --build-root "$(abspath $(BUILD_DIR)/production-smoke)" --json > $(BUILD_DIR)/production-smoke-report.json
	grep -q '"ok": true' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "topdown"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "platformer"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "isometric"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "exported"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "point_click"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "shmup"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "visual_novel"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "menu"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "cutscene"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"target": "world_map"' $(BUILD_DIR)/production-smoke-report.json
	grep -q '"assetc_export_ok": true' $(BUILD_DIR)/production-smoke-report.json
	$(DIST_DIR)/tools/production_smoke --engine-pack "$(abspath $(DIST_DIR))" --build-root "$(abspath $(BUILD_DIR)/production-smoke-rollout)" --json --engine-primary-rollout-pass --write-readiness-evidence $(BUILD_DIR)/production-smoke-readiness-evidence.json --evidence-source "$(BUILD_DIR)/production-smoke-report.json" > $(BUILD_DIR)/production-smoke-rollout-report.json
	python3 -m json.tool $(BUILD_DIR)/production-smoke-readiness-evidence.json >/tmp/gbs_production_smoke_readiness_evidence_check
	grep -q '"manual_mgba_stress_smoke"' $(BUILD_DIR)/production-smoke-readiness-evidence.json
	grep -q '"hardware_or_ci_validation"' $(BUILD_DIR)/production-smoke-readiness-evidence.json
	grep -q '"gba_studio_engine_primary_rollout"' $(BUILD_DIR)/production-smoke-readiness-evidence.json
	python3 -c 'import json; evidence=json.load(open("$(BUILD_DIR)/production-smoke-readiness-evidence.json")); assert evidence["manual_mgba_stress_smoke"]["ok"] is False; assert evidence["hardware_or_ci_validation"]["ok"] is False; assert evidence["gba_studio_engine_primary_rollout"]["ok"] is True'
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema readiness_evidence --schema-document $(BUILD_DIR)/production-smoke-readiness-evidence.json --json > $(BUILD_DIR)/production-smoke-readiness-evidence-validation.json
	grep -q '"ok": true' $(BUILD_DIR)/production-smoke-readiness-evidence-validation.json

verify-stress: verify-package
	$(DIST_DIR)/tools/stress_projects --engine-pack "$(abspath $(DIST_DIR))" --build-root "$(abspath $(BUILD_DIR)/stress-projects)" --json > $(BUILD_DIR)/stress-projects-report.json
	grep -q '"ok": true' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "topdown_large"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "platformer_large"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "isometric_large"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "sprites_oam_heavy"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "tilesets_vram_heavy"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "audio_heavy"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "shmup_large"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "point_click_large"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "dungeon_crawler_large"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "racing_large"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"target": "hardware_contention"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"build_ok": true' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"rom_exists": true' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"bank_usage_by_group"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"group_pressure_report"' $(BUILD_DIR)/stress-projects-report.json
	grep -q '"fragmentation_report"' $(BUILD_DIR)/stress-projects-report.json
	REPORT_PATH="$(abspath $(BUILD_DIR)/smoke/mgba_packaged_stress_smoke_report.md)" $(DIST_DIR)/tools/smoke_mgba --check-only --stress
	grep -q 'Alvo: stress' $(BUILD_DIR)/smoke/mgba_packaged_stress_smoke_report.md
	grep -q 'stress_hardware_contention.gba' $(BUILD_DIR)/smoke/mgba_packaged_stress_smoke_report.md

verify-beta-readiness: verify-package
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --skip-toolchain --json > $(BUILD_DIR)/beta-readiness.json
	python3 -m json.tool $(BUILD_DIR)/beta-readiness.json >/tmp/gbs_beta_readiness_report_check
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --skip-toolchain --readiness-only --json > $(BUILD_DIR)/beta-readiness-only.json
	python3 -m json.tool $(BUILD_DIR)/beta-readiness-only.json >/tmp/gbs_beta_readiness_only_report_check
	if $(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --skip-toolchain --require-primary-ready --json > $(BUILD_DIR)/beta-require-primary-ready.json; then exit 1; fi
	grep -q '"ready_for_primary_backend": false' $(BUILD_DIR)/beta-require-primary-ready.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --skip-toolchain --write-readiness-report $(BUILD_DIR)/beta-readiness-decision.json --json > $(BUILD_DIR)/beta-readiness-decision-write.json
	python3 -m json.tool $(BUILD_DIR)/beta-readiness-decision.json >/tmp/gbs_beta_readiness_decision_check
	python3 -c 'import json; schema=json.load(open("$(DIST_DIR)/schemas/readiness_report.schema.json")); report=json.load(open("$(BUILD_DIR)/beta-readiness-decision.json")); assert set(schema["required"]) == {"ok","version","engine_pack","kind","butano_replacement_readiness"}; assert report["kind"] == "butano_replacement_readiness"; readiness=report["butano_replacement_readiness"]; assert set(schema["$$defs"]["readiness"]["required"]) <= set(readiness.keys()); assert readiness["backend_policy"] == "parallel_until_manual_promotion"'
	grep -q '"readiness_report": "schemas/readiness_report.schema.json"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"promotion_bundle": "schemas/promotion_bundle.schema.json"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"promotion_bundle_validation": "schemas/promotion_bundle_validation.schema.json"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"promotion_summary": "schemas/promotion_summary.schema.json"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"public_schema_catalog": "schemas/public_schema_catalog.schema.json"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_readiness_report_schema"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_readiness_report_validator"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_writer"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_schema"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_validator"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_audit_report"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_file_integrity"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_public_schema_catalog"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_public_schema_summary"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_json_summary"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_summary_schema"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_promotion_summary_summary"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_primary_gate"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_readiness_summary"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_promotion_bundle_validation_schema"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_schema_validation"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_schema_auto_detection"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_asset_pack_report_schema_validation"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_project_schema_validation"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_schema_catalog"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_schema_catalog_integrity"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_schema_catalog_schema"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_schema_catalog_writer"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"doctor_public_schema_catalog_verifier"' $(BUILD_DIR)/beta-readiness.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --list-public-schemas --json > $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"kind": "public_schema_catalog"' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"schema_count": 10' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"id": "asset_pack_report"' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"id": "export_project"' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"id": "promotion_summary"' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"id": "public_schema_catalog"' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"exists": true' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"size_bytes":' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -q '"sha256":' $(BUILD_DIR)/beta-public-schema-catalog.json
	grep -Fq '"missing_schemas": []' $(BUILD_DIR)/beta-public-schema-catalog.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema public_schema_catalog --schema-document $(BUILD_DIR)/beta-public-schema-catalog.json --json > $(BUILD_DIR)/beta-public-schema-catalog-validation.json
	grep -q '"schema": "public_schema_catalog"' $(BUILD_DIR)/beta-public-schema-catalog-validation.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-catalog-validation.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema auto --schema-document $(BUILD_DIR)/beta-public-schema-catalog.json --json > $(BUILD_DIR)/beta-public-schema-catalog-validation-auto.json
	grep -q '"detected_schema": "public_schema_catalog"' $(BUILD_DIR)/beta-public-schema-catalog-validation-auto.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-catalog-validation-auto.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --write-public-schema-catalog $(BUILD_DIR)/beta-public-schema-catalog-written.json --json > $(BUILD_DIR)/beta-public-schema-catalog-write.json
	grep -q '"kind": "public_schema_catalog_write"' $(BUILD_DIR)/beta-public-schema-catalog-write.json
	grep -q '"schema_count": 10' $(BUILD_DIR)/beta-public-schema-catalog-write.json
	grep -Fq '"missing_schemas": []' $(BUILD_DIR)/beta-public-schema-catalog-write.json
	grep -q '"id": "asset_pack_report"' $(BUILD_DIR)/beta-public-schema-catalog-written.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema auto --schema-document $(BUILD_DIR)/beta-public-schema-catalog-written.json --json > $(BUILD_DIR)/beta-public-schema-catalog-written-validation-auto.json
	grep -q '"detected_schema": "public_schema_catalog"' $(BUILD_DIR)/beta-public-schema-catalog-written-validation-auto.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-catalog-written-validation-auto.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --verify-public-schema-catalog $(BUILD_DIR)/beta-public-schema-catalog-written.json --json > $(BUILD_DIR)/beta-public-schema-catalog-verification.json
	grep -q '"kind": "public_schema_catalog_verification"' $(BUILD_DIR)/beta-public-schema-catalog-verification.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-catalog-verification.json
	cp $(BUILD_DIR)/beta-public-schema-catalog-written.json $(BUILD_DIR)/beta-public-schema-catalog-tampered.json
	python3 -c 'import json; p="$(BUILD_DIR)/beta-public-schema-catalog-tampered.json"; d=json.load(open(p)); d["schemas"][0]["size_bytes"]=0; json.dump(d, open(p, "w"), indent=2)'
	if $(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --verify-public-schema-catalog $(BUILD_DIR)/beta-public-schema-catalog-tampered.json --json > $(BUILD_DIR)/beta-public-schema-catalog-tampered-verification.json; then exit 1; fi
	grep -q '"kind": "public_schema_catalog_verification"' $(BUILD_DIR)/beta-public-schema-catalog-tampered-verification.json
	grep -q '"ok": false' $(BUILD_DIR)/beta-public-schema-catalog-tampered-verification.json
	grep -q 'size_bytes' $(BUILD_DIR)/beta-public-schema-catalog-tampered-verification.json
	$(DIST_DIR)/tools/gbsdoctor --validate-readiness-report $(BUILD_DIR)/beta-readiness-decision.json --json > $(BUILD_DIR)/beta-readiness-decision-validate.json
	grep -q '"kind": "readiness_report_validation"' $(BUILD_DIR)/beta-readiness-decision-validate.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-readiness-decision-validate.json
	$(DIST_DIR)/tools/gbsdoctor --engine-pack "$(abspath $(DIST_DIR))" --skip-toolchain --write-promotion-bundle $(BUILD_DIR)/beta-promotion-bundle --json > $(BUILD_DIR)/beta-promotion-bundle-write.json
	grep -q '"kind": "promotion_bundle"' $(BUILD_DIR)/beta-promotion-bundle-write.json
	grep -q '"kind": "promotion_bundle"' $(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json
	grep -q '"public_schema_catalog"' $(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json
	grep -q '"promotion_summary_json"' $(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json
	grep -q '"gbsdoctor_report"' $(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json
	grep -q '"file_integrity"' $(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json
	grep -q '"sha256"' $(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json
	grep -q '"diagnostics"' $(BUILD_DIR)/beta-promotion-bundle/gbsdoctor_report.json
	grep -q '"kind": "public_schema_catalog"' $(BUILD_DIR)/beta-promotion-bundle/public_schema_catalog.json
	grep -Fq '"missing_schemas": []' $(BUILD_DIR)/beta-promotion-bundle/public_schema_catalog.json
	python3 -c 'import hashlib,json,pathlib; manifest=json.load(open("$(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json")); key="gbsdoctor_report"; path=pathlib.Path(manifest["files"][key]); data=path.read_bytes(); assert manifest["file_integrity"][key]["sha256"] == hashlib.sha256(data).hexdigest(); assert manifest["file_integrity"][key]["size_bytes"] == len(data)'
	python3 -c 'import hashlib,json,pathlib; manifest=json.load(open("$(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json")); key="public_schema_catalog"; path=pathlib.Path(manifest["files"][key]); data=path.read_bytes(); assert manifest["file_integrity"][key]["sha256"] == hashlib.sha256(data).hexdigest(); assert manifest["file_integrity"][key]["size_bytes"] == len(data)'
	python3 -c 'import hashlib,json,pathlib; manifest=json.load(open("$(BUILD_DIR)/beta-promotion-bundle/promotion_bundle.json")); key="promotion_summary_json"; path=pathlib.Path(manifest["files"][key]); data=path.read_bytes(); assert manifest["file_integrity"][key]["sha256"] == hashlib.sha256(data).hexdigest(); assert manifest["file_integrity"][key]["size_bytes"] == len(data)'
	grep -q '"kind": "readiness_report_validation"' $(BUILD_DIR)/beta-promotion-bundle/readiness_validation.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-promotion-bundle/readiness_validation.json
	grep -q 'stage: beta_candidate' $(BUILD_DIR)/beta-promotion-bundle/promotion_summary.txt
	grep -q '"kind": "promotion_summary"' $(BUILD_DIR)/beta-promotion-bundle/promotion_summary.json
	grep -q '"public_schema_catalog_summary"' $(BUILD_DIR)/beta-promotion-bundle/promotion_summary.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema promotion_summary --schema-document $(BUILD_DIR)/beta-promotion-bundle/promotion_summary.json --json > $(BUILD_DIR)/beta-public-schema-promotion-summary.json
	grep -q '"schema": "promotion_summary"' $(BUILD_DIR)/beta-public-schema-promotion-summary.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-promotion-summary.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema auto --schema-document $(BUILD_DIR)/beta-promotion-bundle/promotion_summary.json --json > $(BUILD_DIR)/beta-public-schema-promotion-summary-auto.json
	grep -q '"detected_schema": "promotion_summary"' $(BUILD_DIR)/beta-public-schema-promotion-summary-auto.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-promotion-summary-auto.json
	$(DIST_DIR)/tools/gbsdoctor --validate-promotion-bundle $(BUILD_DIR)/beta-promotion-bundle --json > $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"kind": "promotion_bundle_validation"' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"readiness_summary"' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"public_schema_catalog"' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"public_schema_catalog_summary"' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"promotion_summary_summary"' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"schema_count": 10' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	grep -q '"missing_manual_gates"' $(BUILD_DIR)/beta-promotion-bundle-validate.json
	python3 -c 'import json; schema=json.load(open("$(DIST_DIR)/schemas/promotion_bundle_validation.schema.json")); report=json.load(open("$(BUILD_DIR)/beta-promotion-bundle-validate.json")); assert schema["properties"]["kind"]["const"] == "promotion_bundle_validation"; assert set(schema["required"]) <= set(report.keys()); assert report["readiness_summary"]["stage"] == "beta_candidate"; assert report["public_schema_catalog_summary"]["schema_count"] == 10; assert report["promotion_summary_summary"]["stage"] == "beta_candidate"; assert report["promotion_summary_summary"]["public_schema_catalog_summary"]["schema_count"] == 10; assert report["public_schema_catalog_summary"]["missing_schemas"] == []; assert "manual_mgba_stress_smoke" in report["readiness_summary"]["missing_manual_gates"]'
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema promotion_bundle_validation --schema-document $(BUILD_DIR)/beta-promotion-bundle-validate.json --json > $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation.json
	grep -q '"kind": "public_schema_validation"' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation.json
	grep -q '"schema": "promotion_bundle_validation"' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema auto --schema-document $(BUILD_DIR)/beta-promotion-bundle-validate.json --json > $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation-auto.json
	grep -q '"kind": "public_schema_validation"' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation-auto.json
	grep -q '"schema": "promotion_bundle_validation"' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation-auto.json
	grep -q '"requested_schema": "auto"' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation-auto.json
	grep -q '"detected_schema": "promotion_bundle_validation"' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation-auto.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-promotion-bundle-validation-auto.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema auto --schema-document $(DIST_DIR)/templates/exported_topdown/gbastudio_project.json --json > $(BUILD_DIR)/beta-public-schema-gbastudio-project-auto.json
	grep -q '"kind": "public_schema_validation"' $(BUILD_DIR)/beta-public-schema-gbastudio-project-auto.json
	grep -q '"schema": "gbastudio_project"' $(BUILD_DIR)/beta-public-schema-gbastudio-project-auto.json
	grep -q '"detected_schema": "gbastudio_project"' $(BUILD_DIR)/beta-public-schema-gbastudio-project-auto.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-gbastudio-project-auto.json
	printf '{"assets":[{"name":"room_bg","kind":"bg"},{"name":"player","kind":"obj","sprite_width":16,"sprite_height":16}]}\n' > $(BUILD_DIR)/beta-asset-pack-input.json
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema auto --schema-document $(BUILD_DIR)/beta-asset-pack-input.json --json > $(BUILD_DIR)/beta-public-schema-asset-pack-auto.json
	grep -q '"schema": "asset_pack"' $(BUILD_DIR)/beta-public-schema-asset-pack-auto.json
	grep -q '"ok": true' $(BUILD_DIR)/beta-public-schema-asset-pack-auto.json
	if $(DIST_DIR)/tools/gbsdoctor --validate-promotion-bundle $(BUILD_DIR)/beta-promotion-bundle --require-primary-ready --json > $(BUILD_DIR)/beta-promotion-bundle-primary-validate.json; then exit 1; fi
	grep -q '"kind": "promotion_bundle_validation"' $(BUILD_DIR)/beta-promotion-bundle-primary-validate.json
	grep -q '"ok": false' $(BUILD_DIR)/beta-promotion-bundle-primary-validate.json
	grep -q '"primary_ready_required": true' $(BUILD_DIR)/beta-promotion-bundle-primary-validate.json
	grep -q '"kind": "butano_replacement_readiness"' $(BUILD_DIR)/beta-readiness-decision.json
	grep -q '"stage": "beta_candidate"' $(BUILD_DIR)/beta-readiness-decision.json
	grep -q '"butano_replacement_readiness"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"kind": "butano_replacement_readiness"' $(BUILD_DIR)/beta-readiness-only.json
	grep -q '"stage": "beta_candidate"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"stage": "beta_candidate"' $(BUILD_DIR)/beta-readiness-only.json
	grep -q '"backend_policy": "parallel_until_manual_promotion"' $(BUILD_DIR)/beta-readiness.json
	grep -q '"ready_for_primary_backend": false' $(BUILD_DIR)/beta-readiness.json
	grep -q '"required_before_primary_backend"' $(BUILD_DIR)/beta-readiness.json

verify-mgba-check: all verify-package
	scripts/smoke_mgba.sh --check-only --all

verify-mgba-stress-check: verify-stress
	REPORT_PATH=$(BUILD_DIR)/smoke/mgba_stress_smoke_report.md scripts/smoke_mgba.sh --check-only --stress
	grep -q 'Alvo: stress' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_topdown_large.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_platformer_large.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_isometric_large.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_sprites_oam_heavy.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_tilesets_vram_heavy.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_audio_heavy.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_shmup_large.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_point_click_large.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_dungeon_crawler_large.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_racing_large.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	grep -q 'stress_hardware_contention.gba' $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	if REPORT_PATH=$(BUILD_DIR)/smoke/mgba_stress_manual_report.md MGBA_APP=/tmp/gbs-no-mgba.app MGBA_BIN=/usr/bin/true scripts/smoke_mgba.sh --stress --manual-pass --write-readiness-evidence $(BUILD_DIR)/smoke/readiness_evidence_mgba_missing_note.json --evidence-source "$(BUILD_DIR)/smoke/mgba_stress_manual_report.md"; then exit 1; fi
	printf 'Status: aprovado\nstress_topdown_large.gba: boot, input, camera, collision, portal, audio, save OK\nstress_platformer_large.gba: boot, jump, hazards, checkpoint, camera, audio OK\nstress_isometric_large.gba: boot, depth, grid movement, actor collision, audio OK\nstress_sprites_oam_heavy.gba: boot, sprites, OAM pressure, input OK\nstress_tilesets_vram_heavy.gba: boot, VRAM pressure, backgrounds, scrolling OK\nstress_audio_heavy.gba: boot, music, sfx, mixer, no audio dropouts OK\nstress_shmup_large.gba: boot, waves, projectiles, OAM, input OK\nstress_point_click_large.gba: boot, cursor, hotspots, transitions, save OK\nstress_dungeon_crawler_large.gba: boot, grid, turns, view distance, collision OK\nstress_racing_large.gba: boot, steering, acceleration, long track, camera OK\nstress_hardware_contention.gba: boot, audio, IRQ, HDMA, VRAM, telemetry, no dropouts OK\n' > $(BUILD_DIR)/smoke/mgba_manual_approval_note.md
	REPORT_PATH=$(BUILD_DIR)/smoke/mgba_stress_manual_report.md MGBA_APP=/tmp/gbs-no-mgba.app MGBA_BIN=/usr/bin/true scripts/smoke_mgba.sh --stress --manual-pass --manual-evidence-note $(BUILD_DIR)/smoke/mgba_manual_approval_note.md --write-readiness-evidence $(BUILD_DIR)/smoke/readiness_evidence_mgba.json --evidence-source "$(BUILD_DIR)/smoke/mgba_stress_manual_report.md"
	python3 -m json.tool $(BUILD_DIR)/smoke/readiness_evidence_mgba.json >/tmp/gbs_mgba_readiness_evidence_check
	grep -q '"manual_mgba_stress_smoke"' $(BUILD_DIR)/smoke/readiness_evidence_mgba.json
	grep -q '"hardware_or_ci_validation"' $(BUILD_DIR)/smoke/readiness_evidence_mgba.json
	grep -q '"gba_studio_engine_primary_rollout"' $(BUILD_DIR)/smoke/readiness_evidence_mgba.json
	python3 -c 'import json; evidence=json.load(open("$(BUILD_DIR)/smoke/readiness_evidence_mgba.json")); assert evidence["manual_mgba_stress_smoke"]["ok"] is True; assert evidence["hardware_or_ci_validation"]["ok"] is False; assert evidence["gba_studio_engine_primary_rollout"]["ok"] is False'
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema readiness_evidence --schema-document $(BUILD_DIR)/smoke/readiness_evidence_mgba.json --json > $(BUILD_DIR)/smoke/readiness_evidence_mgba_validation.json
	grep -q '"ok": true' $(BUILD_DIR)/smoke/readiness_evidence_mgba_validation.json

verify-mgba-review-package: verify-mgba-stress-check
	scripts/package_mgba_review.sh --output $(BUILD_DIR)/mgba-review --source-report $(BUILD_DIR)/smoke/mgba_stress_smoke_report.md
	python3 -m json.tool $(BUILD_DIR)/mgba-review/mgba_review_manifest.json >/tmp/gbs_mgba_review_manifest_check
	grep -q '"kind": "mgba_stress_review_package"' $(BUILD_DIR)/mgba-review/mgba_review_manifest.json
	grep -q '"manual_gate_status": "pending"' $(BUILD_DIR)/mgba-review/mgba_review_manifest.json
	grep -q 'stress_topdown_large.gba' $(BUILD_DIR)/mgba-review/SHA256SUMS.txt
	grep -q 'stress_audio_heavy.gba' $(BUILD_DIR)/mgba-review/SHA256SUMS.txt
	grep -q 'stress_hardware_contention.gba' $(BUILD_DIR)/mgba-review/SHA256SUMS.txt
	test -x $(BUILD_DIR)/mgba-review/open_all_mgba.command
	test -f $(BUILD_DIR)/mgba-review/mgba_manual_approval_note.md
	test -f $(BUILD_DIR)/mgba-review/roms/stress_topdown_large.gba
	test -f $(BUILD_DIR)/mgba-review/roms/stress_audio_heavy.gba
	test -f $(BUILD_DIR)/mgba-review/roms/stress_hardware_contention.gba

verify-mgba-manual-handoff-test: verify-mgba-stress-check
	scripts/write_mgba_manual_handoff.py --readiness-evidence $(BUILD_DIR)/smoke/readiness_evidence_mgba.json --output-dir $(BUILD_DIR)/smoke/mgba-manual-handoff --gbsdoctor $(DIST_DIR)/tools/gbsdoctor
	python3 -m json.tool $(BUILD_DIR)/smoke/mgba-manual-handoff/readiness_evidence_mgba_manual.json >/tmp/gbs_mgba_manual_handoff_evidence_check
	python3 -m json.tool $(BUILD_DIR)/smoke/mgba-manual-handoff/readiness_evidence_mgba_manual_validation.json >/tmp/gbs_mgba_manual_handoff_validation_check
	python3 -m json.tool $(BUILD_DIR)/smoke/mgba-manual-handoff/mgba_manual_handoff_summary.json >/tmp/gbs_mgba_manual_handoff_summary_check
	grep -q '"kind": "mgba_manual_readiness_evidence_handoff"' $(BUILD_DIR)/smoke/mgba-manual-handoff/mgba_manual_handoff_summary.json
	grep -q '"engine_workflow_input": "manual_mgba_readiness_evidence_base64"' $(BUILD_DIR)/smoke/mgba-manual-handoff/mgba_manual_handoff_summary.json
	test -s $(BUILD_DIR)/smoke/mgba-manual-handoff/readiness_evidence_mgba_manual_base64.txt
	python3 -c 'import base64,json,pathlib; root=pathlib.Path("$(BUILD_DIR)/smoke/mgba-manual-handoff"); decoded=json.loads(base64.b64decode(root.joinpath("readiness_evidence_mgba_manual_base64.txt").read_text().strip())); assert decoded["manual_mgba_stress_smoke"]["ok"] is True'

verify-cross-platform-test:
	python3 tests/host/verify_cross_platform_tests.py

verify-cross-platform-local: verify-package
	$(DIST_DIR)/tools/verify_cross_platform --engine-pack $(DIST_DIR) --project-dir $(BUILD_DIR)/verify-package/generated_project --output $(BUILD_DIR)/cross-platform-report.json
	$(DIST_DIR)/tools/verify_cross_platform --engine-pack $(DIST_DIR) --project-dir $(BUILD_DIR)/verify-package/generated_project --output $(BUILD_DIR)/cross-platform-report-evidence.json --hardware-ci-pass --evidence-type local_cross_platform_dry_run --write-readiness-evidence $(BUILD_DIR)/cross-platform-readiness-evidence.json --evidence-source "$(BUILD_DIR)/cross-platform-report-evidence.json"
	python3 -m json.tool $(BUILD_DIR)/cross-platform-readiness-evidence.json >/tmp/gbs_cross_platform_readiness_evidence_check
	grep -q '"manual_mgba_stress_smoke"' $(BUILD_DIR)/cross-platform-readiness-evidence.json
	grep -q '"hardware_or_ci_validation"' $(BUILD_DIR)/cross-platform-readiness-evidence.json
	grep -q '"gba_studio_engine_primary_rollout"' $(BUILD_DIR)/cross-platform-readiness-evidence.json
	python3 -c 'import json; evidence=json.load(open("$(BUILD_DIR)/cross-platform-readiness-evidence.json")); gate=evidence["hardware_or_ci_validation"]; assert evidence["manual_mgba_stress_smoke"]["ok"] is False; assert gate["ok"] is True; assert gate["evidence_type"] == "local_cross_platform_dry_run"; assert len(gate["validated_platforms"]) == 1; assert evidence["gba_studio_engine_primary_rollout"]["ok"] is False'
	$(DIST_DIR)/tools/gbsdoctor --validate-public-schema readiness_evidence --schema-document $(BUILD_DIR)/cross-platform-readiness-evidence.json --json > $(BUILD_DIR)/cross-platform-readiness-evidence-validation.json
	grep -q '"ok": true' $(BUILD_DIR)/cross-platform-readiness-evidence-validation.json
	if $(DIST_DIR)/tools/gbsdoctor --engine-pack $(DIST_DIR) --skip-toolchain --readiness-evidence $(BUILD_DIR)/cross-platform-readiness-evidence.json --require-primary-ready --json > $(BUILD_DIR)/cross-platform-readiness-primary-blocked.json; then exit 1; fi
	grep -q '"ready_for_primary_backend": false' $(BUILD_DIR)/cross-platform-readiness-primary-blocked.json
	grep -q 'dry-run local nao libera promocao principal' $(BUILD_DIR)/cross-platform-readiness-primary-blocked.json

clean:
	rm -rf $(BUILD_DIR) dist

.PHONY: point-click-animation-test
point-click-animation-test: $(HOST_BUILD)/point_click_animation_tests
	$(HOST_BUILD)/point_click_animation_tests
	python3 tests/host/point_click_animation_export_tests.py

$(HOST_BUILD)/point_click_animation_tests: tests/host/point_click_animation_tests.cpp engine/src/gbs_animation.cpp engine/include/gbs/point_click.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $(filter %.cpp,$^) -o $@

.PHONY: hud-gauge-test luta-authored-hud-test
hud-gauge-test: $(HOST_BUILD)/hud_gauge_tests $(HOST_BUILD)/hud_gauge_layout_tests
	$(HOST_BUILD)/hud_gauge_tests
	$(HOST_BUILD)/hud_gauge_layout_tests
$(HOST_BUILD)/hud_gauge_layout_tests: tests/host/hud_gauge_layout_tests.cpp engine/include/gbs/hud_gauge.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $< -o $@
$(HOST_BUILD)/hud_gauge_tests: tests/host/hud_gauge_tests.cpp engine/include/gbs/hud_gauge.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $< -o $@
luta-authored-hud-test:
	python3 tests/host/luta_authored_hud_tests.py

.PHONY: hud-racing-test
host-test: hud-racing-test
hud-racing-test: $(HOST_BUILD)/hud_racing_tests
	$(HOST_BUILD)/hud_racing_tests
	python3 tests/host/hud_racing_render_tests.py
	python3 tests/host/hud_dungeon_layer_tests.py
	python3 tests/host/hud_battle_meters_tests.py
	python3 tests/host/hud_battle_status_tests.py
	python3 tests/host/hud_battle_menu_frame_tests.py
	python3 tests/host/hud_bar_surface_tests.py
	python3 tests/host/hud_image_slots_tests.py
	python3 tests/host/hud_behavior_export_tests.py
$(HOST_BUILD)/hud_racing_tests: tests/host/hud_racing_tests.cpp engine/include/gbs/hud_racing.hpp
	@mkdir -p $(@D)
	$(HOST_CXX) $(HOST_CXXFLAGS) $< -o $@

.PHONY: racing-perspective-test
host-test: racing-perspective-test
racing-perspective-test:
	@mkdir -p $(HOST_BUILD)
	$(HOST_CXX) $(HOST_CXXFLAGS) tests/host/racing_perspective_tests.cpp engine/src/gbs_racing.cpp -o $(HOST_BUILD)/racing_perspective_tests
	$(HOST_BUILD)/racing_perspective_tests
	$(HOST_CXX) $(HOST_CXXFLAGS) tests/host/racing_animation_tests.cpp engine/src/gbs_animation.cpp -o $(HOST_BUILD)/racing_animation_tests
	$(HOST_BUILD)/racing_animation_tests
	python3 tests/host/racing_authoring_export_tests.py
