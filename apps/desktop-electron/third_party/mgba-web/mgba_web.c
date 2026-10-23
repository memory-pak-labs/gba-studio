// GBA Studio's minimal browser-facing adapter for the official mGBA libmgba API.
// The mGBA source itself is fetched at the pinned revision by build-mgba-web-core.mjs.
#include <emscripten/emscripten.h>
#include <emscripten/heap.h>
#include <mgba/core/core.h>
#include <mgba/core/blip_buf.h>
#include <mgba/gba/core.h>
#include <mgba/gba/interface.h>
#include <mgba/internal/gba/memory.h>
#include <mgba-util/vfs.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

static struct mCore* core = NULL;
static color_t* video_buffer = NULL;
static uint8_t* rom_buffer = NULL;
static size_t rom_buffer_size = 0;
static int rom_loaded = 0;
static int config_initialized = 0;
static int last_stage = 0;
static uint32_t runtime_telemetry_address = 0;
// Host-side bridge memory only; this does not consume emulated GBA RAM.
enum { RUNTIME_SNAPSHOT_WORD_COUNT = 100 };
static uint32_t runtime_snapshot[RUNTIME_SNAPSHOT_WORD_COUNT];
enum { AUDIO_SAMPLE_RATE = 32768, AUDIO_SAMPLE_CAPACITY = 2048 };
static int16_t audio_buffer[AUDIO_SAMPLE_CAPACITY * 2];
static size_t audio_sample_count = 0;

enum {
	RUNTIME_TELEMETRY_MAGIC = 0x47535452,
	RUNTIME_TELEMETRY_LEGACY_SCHEMA = 2,
	RUNTIME_TELEMETRY_LEGACY_WORD_COUNT = 50,
	RUNTIME_TELEMETRY_PREVIOUS_SCHEMA = 3,
	RUNTIME_TELEMETRY_PREVIOUS_WORD_COUNT = 59,
	RUNTIME_TELEMETRY_SCHEMA = 4,
	RUNTIME_TELEMETRY_WORD_COUNT = 64,
	RUNTIME_TELEMETRY_MAX_WORD_COUNT = 64,
	GBA_EWRAM_START = 0x02000000,
	GBA_EWRAM_END = 0x02040000
};

enum {
	STAGE_IDLE = 0,
	STAGE_VALIDATE_INPUT = 1,
	STAGE_UNLOAD_ROM = 2,
	STAGE_ALLOCATE_ROM_BUFFER = 3,
	STAGE_FILL_ROM_BUFFER = 4,
	STAGE_COPY_ROM_BYTES = 5,
	STAGE_CREATE_VFILE = 6,
	STAGE_LOAD_ROM = 7,
	STAGE_LOAD_SAVE = 8,
	STAGE_RESET_CORE = 9,
	STAGE_READY = 10
};

EMSCRIPTEN_KEEPALIVE int gba_init(void) {
	if (core) {
		return 1;
	}
	core = GBACoreCreate();
	if (core) {
		mCoreInitConfig(core, "GBA Studio Web");
		config_initialized = 1;
	}
	if (!core || !core->init(core)) {
		if (core && config_initialized) {
			mCoreConfigDeinit(&core->config);
			config_initialized = 0;
		}
		return 0;
	}
	struct mCoreOptions options = { 0 };
	options.skipBios = true;
	options.useBios = false;
	options.volume = 0x100;
	options.fpsTarget = 60.0f;
	options.sampleRate = AUDIO_SAMPLE_RATE;
	mCoreConfigLoadDefaults(&core->config, &options);
	mCoreLoadConfig(core);
	video_buffer = calloc(GBA_VIDEO_HORIZONTAL_PIXELS * GBA_VIDEO_VERTICAL_PIXELS, sizeof(color_t));
	if (!video_buffer) {
		if (config_initialized) {
			mCoreConfigDeinit(&core->config);
			config_initialized = 0;
		}
		core->deinit(core);
		core = NULL;
		return 0;
	}
	core->setVideoBuffer(core, video_buffer, GBA_VIDEO_HORIZONTAL_PIXELS);
	core->setAudioBufferSize(core, AUDIO_SAMPLE_CAPACITY);
	// mCoreOptions.sampleRate does not configure libmgba's blip resamplers.
	// Match the samples produced by both channels to gba_audio_sample_rate().
	blip_set_rates(core->getAudioChannel(core, 0), core->frequency(core), AUDIO_SAMPLE_RATE);
	blip_set_rates(core->getAudioChannel(core, 1), core->frequency(core), AUDIO_SAMPLE_RATE);
	return 1;
}

EMSCRIPTEN_KEEPALIVE int gba_load_rom(const uint8_t* bytes, size_t size) {
	last_stage = STAGE_VALIDATE_INPUT;
	runtime_telemetry_address = 0;
	if (!core || !bytes || size == 0) {
		return 0;
	}
	if (rom_loaded) {
		last_stage = STAGE_UNLOAD_ROM;
		core->unloadROM(core);
		rom_loaded = 0;
	}
	free(rom_buffer);
	last_stage = STAGE_ALLOCATE_ROM_BUFFER;
	rom_buffer_size = SIZE_CART0;
	if (size > rom_buffer_size) {
		rom_buffer_size = size;
	}
	rom_buffer = malloc(rom_buffer_size);
	if (!rom_buffer) {
		return 0;
	}
	last_stage = STAGE_FILL_ROM_BUFFER;
	memset(rom_buffer, 0xFF, rom_buffer_size);
	last_stage = STAGE_COPY_ROM_BYTES;
	memcpy(rom_buffer, bytes, size);
	last_stage = STAGE_CREATE_VFILE;
	struct VFile* rom = VFileFromMemory(rom_buffer, rom_buffer_size);
	last_stage = STAGE_LOAD_ROM;
	if (!rom || !core->loadROM(core, rom)) {
		if (rom) {
			rom->close(rom);
		}
		free(rom_buffer);
		rom_buffer = NULL;
		rom_buffer_size = 0;
		return 0;
	}
	last_stage = STAGE_LOAD_SAVE;
	struct VFile* save = VFileMemChunk(NULL, 0);
	if (!save || !core->loadSave(core, save)) {
		if (save) {
			save->close(save);
		}
		core->unloadROM(core);
		free(rom_buffer);
		rom_buffer = NULL;
		rom_buffer_size = 0;
		return 0;
	}
	last_stage = STAGE_RESET_CORE;
	core->reset(core);
	audio_sample_count = 0;
	last_stage = STAGE_READY;
	rom_loaded = 1;
	return 1;
}

EMSCRIPTEN_KEEPALIVE int gba_last_stage(void) {
	return last_stage;
}

EMSCRIPTEN_KEEPALIVE void gba_run_frame(void) {
	audio_sample_count = 0;
	if (core && rom_loaded) {
		core->runFrame(core);
		blip_t* left = core->getAudioChannel(core, 0);
		blip_t* right = core->getAudioChannel(core, 1);
		if (left && right) {
			int available = blip_samples_avail(left);
			const int right_available = blip_samples_avail(right);
			if (right_available < available) available = right_available;
			if (available > AUDIO_SAMPLE_CAPACITY) available = AUDIO_SAMPLE_CAPACITY;
			if (available > 0) {
				const int left_read = blip_read_samples(left, audio_buffer, available, true);
				const int right_read = blip_read_samples(right, audio_buffer + 1, available, true);
				audio_sample_count = left_read < right_read ? (size_t) left_read : (size_t) right_read;
			}
		}
	}
}

EMSCRIPTEN_KEEPALIVE uintptr_t gba_audio_samples(void) {
	return (uintptr_t) audio_buffer;
}

EMSCRIPTEN_KEEPALIVE size_t gba_audio_sample_count(void) {
	return audio_sample_count;
}

EMSCRIPTEN_KEEPALIVE int gba_audio_sample_rate(void) {
	return AUDIO_SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE void gba_set_keys(uint32_t keys) {
	if (core) {
		core->setKeys(core, keys);
	}
}

EMSCRIPTEN_KEEPALIVE void gba_reset(void) {
	if (core && rom_loaded) {
		runtime_telemetry_address = 0;
		audio_sample_count = 0;
		core->reset(core);
	}
}

static int runtime_telemetry_header_is_valid(uint32_t address) {
	if (!core || !core->busRead32 || core->busRead32(core, address) != RUNTIME_TELEMETRY_MAGIC) {
		return 0;
	}
	const uint32_t schema = core->busRead32(core, address + sizeof(uint32_t));
	const uint32_t word_count = core->busRead32(core, address + (2 * sizeof(uint32_t)));
	return (schema == RUNTIME_TELEMETRY_LEGACY_SCHEMA && word_count == RUNTIME_TELEMETRY_LEGACY_WORD_COUNT) ||
		(schema == RUNTIME_TELEMETRY_PREVIOUS_SCHEMA && word_count == RUNTIME_TELEMETRY_PREVIOUS_WORD_COUNT) ||
		(schema == RUNTIME_TELEMETRY_SCHEMA && word_count == RUNTIME_TELEMETRY_WORD_COUNT);
}

static int runtime_telemetry_header_is_current(uint32_t address) {
	return core && core->busRead32 &&
		core->busRead32(core, address) == RUNTIME_TELEMETRY_MAGIC &&
		core->busRead32(core, address + sizeof(uint32_t)) == RUNTIME_TELEMETRY_SCHEMA &&
		core->busRead32(core, address + (2 * sizeof(uint32_t))) == RUNTIME_TELEMETRY_WORD_COUNT;
}

EMSCRIPTEN_KEEPALIVE uint32_t gba_audio_register(uint32_t address) {
	if (!core || !rom_loaded || !core->busRead16) {
		return 0;
	}
	return core->busRead16(core, address);
}

EMSCRIPTEN_KEEPALIVE uintptr_t gba_find_runtime_telemetry(void) {
	if (!core || !rom_loaded || !core->busRead32) {
		return 0;
	}
	if (runtime_telemetry_address != 0 &&
		runtime_telemetry_header_is_valid(runtime_telemetry_address)) {
		return runtime_telemetry_address;
	}
	uint32_t legacy_address = 0;
	for (uint32_t address = GBA_EWRAM_START;
		address + (RUNTIME_TELEMETRY_MAX_WORD_COUNT * sizeof(uint32_t)) <= GBA_EWRAM_END;
		address += sizeof(uint32_t)) {
		if (!runtime_telemetry_header_is_valid(address)) {
			continue;
		}
		if (runtime_telemetry_header_is_current(address)) {
			runtime_telemetry_address = address;
			return address;
		}
		if (legacy_address == 0) legacy_address = address;
	}
	if (legacy_address != 0) {
		runtime_telemetry_address = legacy_address;
		return legacy_address;
	}
	return 0;
}

EMSCRIPTEN_KEEPALIVE uint32_t gba_runtime_telemetry_word(uint32_t index) {
	if (index >= RUNTIME_TELEMETRY_MAX_WORD_COUNT) {
		return 0;
	}
	const uint32_t address = (uint32_t) gba_find_runtime_telemetry();
	if (address == 0) {
		return 0;
	}
	const uint32_t word_count = core->busRead32(core, address + (2 * sizeof(uint32_t)));
	if (index >= word_count) {
		return 0;
	}
	return core->busRead32(core, address + (index * sizeof(uint32_t)));
}

EMSCRIPTEN_KEEPALIVE uintptr_t gba_runtime_telemetry_snapshot(void) {
	const uint32_t address = (uint32_t) gba_find_runtime_telemetry();
	if (address == 0) return 0;
	const uint32_t word_count = core->busRead32(core, address + (2 * sizeof(uint32_t)));
	const uint32_t snapshot_words = word_count == RUNTIME_TELEMETRY_WORD_COUNT &&
		address + sizeof(runtime_snapshot) <= GBA_EWRAM_END
		? RUNTIME_SNAPSHOT_WORD_COUNT : word_count;
	memset(runtime_snapshot, 0, sizeof(runtime_snapshot));
	for (uint32_t index = 0; index < snapshot_words; ++index) {
		runtime_snapshot[index] = core->busRead32(core, address + (index * sizeof(uint32_t)));
	}
	return (uintptr_t) runtime_snapshot;
}

EMSCRIPTEN_KEEPALIVE uintptr_t gba_framebuffer(void) {
	return (uintptr_t) video_buffer;
}

// Debug inspection uses host Wasm storage, never emulated GBA RAM. Keep the
// complete RGB888 histogram and FNV signature; only move the pixel loop out of JS.
enum { FRAME_PIXEL_CAPACITY = 240 * 160, FRAME_COLOR_BUCKETS = 65536 };
struct FrameColorCount { uint32_t color, count; };
static struct FrameColorCount frame_color_buckets[FRAME_COLOR_BUCKETS];
static struct {
	uint32_t magic, version, pixels, non_black, dominant, signature, colors, reserved;
	struct FrameColorCount histogram[FRAME_PIXEL_CAPACITY];
} frame_analysis;

static int compare_frame_colors(const void* left, const void* right) {
	const struct FrameColorCount* a = left;
	const struct FrameColorCount* b = right;
	if (a->count != b->count) return a->count > b->count ? -1 : 1;
	return a->color < b->color ? -1 : a->color > b->color;
}

EMSCRIPTEN_KEEPALIVE uintptr_t gba_analyze_rgba(uintptr_t source, uint32_t pixels) {
	const size_t heap_size = emscripten_get_heap_size();
	if (!source || !pixels || pixels > FRAME_PIXEL_CAPACITY || source >= heap_size ||
		(size_t) pixels * 4 > heap_size - source) return 0;
	const uint8_t* rgba = (const uint8_t*) source;
	memset(frame_color_buckets, 0, sizeof(frame_color_buckets));
	frame_analysis.magic = 0x47465241;
	frame_analysis.version = 1;
	frame_analysis.pixels = pixels;
	frame_analysis.non_black = frame_analysis.dominant = frame_analysis.colors = 0;
	uint32_t signature = 0x811c9dc5;
	for (uint32_t pixel = 0; pixel < pixels; ++pixel) {
		const uint8_t* rgb = rgba + pixel * 4;
		if (rgb[0] > 4 || rgb[1] > 4 || rgb[2] > 4) ++frame_analysis.non_black;
		const uint32_t color = ((uint32_t) rgb[0] << 16) | ((uint32_t) rgb[1] << 8) | rgb[2];
		for (unsigned channel = 0; channel < 3; ++channel) signature = (signature ^ rgb[channel]) * 0x01000193;
		unsigned bucket = (color * 2654435761u) >> 16;
		while (frame_color_buckets[bucket].count && frame_color_buckets[bucket].color != color)
			bucket = (bucket + 1) & (FRAME_COLOR_BUCKETS - 1);
		struct FrameColorCount* entry = &frame_color_buckets[bucket];
		if (!entry->count) entry->color = color;
		if (++entry->count > frame_analysis.dominant) frame_analysis.dominant = entry->count;
	}
	for (unsigned bucket = 0; bucket < FRAME_COLOR_BUCKETS; ++bucket) {
		if (frame_color_buckets[bucket].count)
			frame_analysis.histogram[frame_analysis.colors++] = frame_color_buckets[bucket];
	}
	frame_analysis.signature = signature;
	qsort(frame_analysis.histogram, frame_analysis.colors, sizeof(struct FrameColorCount), compare_frame_colors);
	return (uintptr_t) &frame_analysis;
}

EMSCRIPTEN_KEEPALIVE size_t gba_framebuffer_size(void) {
	return GBA_VIDEO_HORIZONTAL_PIXELS * GBA_VIDEO_VERTICAL_PIXELS * sizeof(color_t);
}

EMSCRIPTEN_KEEPALIVE size_t gba_state_size(void) {
	return core && rom_loaded ? core->stateSize(core) : 0;
}

EMSCRIPTEN_KEEPALIVE int gba_save_state(uint8_t* destination, size_t size) {
	if (!core || !rom_loaded || !destination || size != core->stateSize(core)) {
		return 0;
	}
	return core->saveState(core, destination) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int gba_load_state(const uint8_t* source, size_t size) {
	if (!core || !rom_loaded || !source || size != core->stateSize(core)) {
		return 0;
	}
	if (!core->loadState(core, source)) {
		return 0;
	}
	// The exported PCM block belongs to the previous emulation timeline.
	audio_sample_count = 0;
	blip_clear(core->getAudioChannel(core, 0));
	blip_clear(core->getAudioChannel(core, 1));
	return 1;
}

EMSCRIPTEN_KEEPALIVE size_t gba_savedata_size(void) {
	if (!core || !rom_loaded || !core->savedataClone) {
		return 0;
	}
	void* savedata = NULL;
	const size_t size = core->savedataClone(core, &savedata);
	free(savedata);
	return size;
}

EMSCRIPTEN_KEEPALIVE size_t gba_savedata_copy(uint8_t* destination, size_t capacity) {
	if (!core || !rom_loaded || !core->savedataClone || !destination) {
		return 0;
	}
	void* savedata = NULL;
	const size_t size = core->savedataClone(core, &savedata);
	if (!savedata || size == 0 || size > capacity) {
		free(savedata);
		return 0;
	}
	memcpy(destination, savedata, size);
	free(savedata);
	return size;
}

EMSCRIPTEN_KEEPALIVE int gba_savedata_restore(const uint8_t* source, size_t size) {
	if (!core || !rom_loaded || !core->savedataRestore || !source || size == 0) {
		return 0;
	}
	return core->savedataRestore(core, source, size, true) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void gba_destroy(void) {
	if (!core) {
		return;
	}
	if (rom_loaded) {
		core->unloadROM(core);
	}
	if (config_initialized) {
		mCoreConfigDeinit(&core->config);
	}
	core->deinit(core);
	free(video_buffer);
	free(rom_buffer);
	video_buffer = NULL;
	rom_buffer = NULL;
	rom_buffer_size = 0;
	core = NULL;
	rom_loaded = 0;
	config_initialized = 0;
	runtime_telemetry_address = 0;
	audio_sample_count = 0;
}
