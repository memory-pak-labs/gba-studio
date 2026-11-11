#!/usr/bin/env python3
import importlib.util
import math
import json
import struct
import tempfile
import wave
import subprocess
from pathlib import Path


ASSETC_PATH = Path(__file__).parents[2] / "tools" / "assetc" / "assetc.py"
SPEC = importlib.util.spec_from_file_location("gbs_assetc", ASSETC_PATH)
ASSETC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSETC)


def write_pcm16(path, samples, sample_rate):
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(b"".join(struct.pack("<h", sample) for sample in samples))


def test_wav_smpl_loop_is_preserved_and_resampled():
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "loop.wav"
        write_pcm16(source, [12000] * 128, 16000)
        raw = bytearray(source.read_bytes())
        smpl = bytearray(60)
        struct.pack_into("<I", smpl, 28, 1)
        struct.pack_into("<II", smpl, 44, 16, 111)
        raw += b"smpl" + struct.pack("<I", len(smpl)) + smpl
        struct.pack_into("<I", raw, 4, len(raw) - 8)
        source.write_bytes(raw)
        _, rate, start, end = ASSETC.convert_wav_to_pcm8(source, 8000)
        assert (rate, start, end) == (8000, 8, 56), (rate, start, end)
        struct.pack_into("<I", raw, len(raw) - 16, 200)
        source.write_bytes(raw)
        try:
            ASSETC.convert_wav_to_pcm8(source)
            assert False, "invalid loop must be rejected"
        except SystemExit:
            pass


def test_filtered_downsampling_rejects_aliasing():
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "alias.wav"
        write_pcm16(source, [30000 if index % 2 == 0 else -30000 for index in range(256)], 32768)
        samples, rate, _, _ = ASSETC.convert_wav_to_pcm8(source, 8192)
        assert rate == 8192
        assert max(abs(sample) for sample in samples[4:-4]) <= 4


def test_wav_conversion_keeps_headroom_and_supports_32768_hz():
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "tone.wav"
        samples = [int(math.sin(index * math.tau / 32) * 32767) for index in range(441)]
        write_pcm16(source, samples, 44100)
        converted, rate, _, _ = ASSETC.convert_wav_to_pcm8(source, 32768)
        assert rate == 32768
        assert converted
        assert max(abs(sample) for sample in converted) <= 116


def test_automatic_wav_conversion_matches_native_mixer_clock():
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "tone.wav"
        write_pcm16(source, [int(math.sin(index * math.tau / 32) * 12000) for index in range(32768)], 32768)
        converted, rate, _, _ = ASSETC.convert_wav_to_pcm8(source)
        assert rate == 31536, "automatic exports avoid resampling every native-rate SFX in the IRQ"
        assert len(converted) == 31536, "preserve the source duration"
        explicit, explicit_rate, _, _ = ASSETC.convert_wav_to_pcm8(source, 32768)
        assert explicit_rate == 32768 and len(explicit) == 32768
        write_pcm16(source, [12000] * 800, 8000)
        low, low_rate, _, _ = ASSETC.convert_wav_to_pcm8(source)
        assert low_rate == 8000 and len(low) == 800, "do not enlarge low-rate sources"


def test_wav_tracker_instrument_pitch_loop_and_fingerprint():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "sample.wav"
        write_pcm16(source, [12000] * 128, 32768)
        doc = {"tracker": [{"name": "song", "samples": [{"wav": "sample.wav", "loop": True}], "patterns": [{"steps": [{"channel": 1, "frequency_hz": 524, "duration_frames": 4, "volume": 15, "sample_index": 0, "sample_pitch_ratio": 2, "sample_only": True}]}], "order": [0]}]}
        header = ASSETC.emit_audio_header("music", doc, root)
        assert "music_song_sample_assets" in header
        assert "63072" in header
        assert "true, 0, 123" in header
        doc_path = root / "audio.json"
        doc_path.write_text(json.dumps(doc))
        first = ASSETC.pack_asset_source_fingerprint({"audio_json": "audio.json"}, root)
        write_pcm16(source, [6000] * 128, 32768)
        second = ASSETC.pack_asset_source_fingerprint({"audio_json": "audio.json"}, root)
        assert first != second
        doc["tracker"][0]["samples"][0]["loop"] = False
        assert "false, 0, 0" in ASSETC.emit_audio_header("music", doc, root)
        source.unlink()
        try:
            ASSETC.emit_audio_header("music", doc, root)
            assert False, "missing samples must block generation"
        except SystemExit:
            pass


def test_shared_wav_bank_deduplicates_conversion_and_pcm_without_stale_cache():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "sample.wav"
        write_pcm16(source, [12000] * 128, 32768)
        trackers = [{"name": name, "samples": [{"wav": "sample.wav", "loop": loop}],
            "patterns": [{"steps": [{"channel": 1, "frequency_hz": 262, "duration_frames": 4,
                "volume": 15, "sample_index": 0, "sample_only": True}]}], "order": [0]}
            for name, loop in [("first", True), ("second", False)]]
        calls = []
        original = ASSETC.convert_wav_to_pcm8
        def counted(path, *args):
            calls.append(path)
            return original(path, *args)
        ASSETC.convert_wav_to_pcm8 = counted
        try:
            header = ASSETC.emit_audio_header("bank", {"tracker": trackers}, root)
            assert len(calls) == 1, "convert the same WAV once per header"
            assert header.count("constexpr int8_t ") == 1, "store shared PCM bytes once"
            assert "{ bank_first_sample_0_data, 123, 31536, true, 0, 123 }" in header
            assert "{ bank_first_sample_0_data, 123, 31536, false, 0, 0 }" in header
            write_pcm16(source, [6000] * 128, 32768)
            second = ASSETC.emit_audio_header("bank", {"tracker": trackers}, root)
            assert second != header, "conversion cache must not survive a build"
            assert len(calls) == 2
        finally:
            ASSETC.convert_wav_to_pcm8 = original


def test_audio_bank_is_shared_by_linked_cpp_translation_units():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        write_pcm16(root / "sample.wav", [12000] * 128, 32768)
        document = {
            "sfx": [{"name": "hit", "tones": [{"frequency_hz": 262, "duration_frames": 4, "volume": 8}]}],
            "music": [{"name": "cue", "steps": [{"frequency_hz": 262, "duration_frames": 4, "volume": 8}]}],
            "tracker": [{"name": "song", "samples": [{"wav": "sample.wav", "loop": True}],
                "patterns": [{"steps": [{"channel": 1, "frequency_hz": 262, "duration_frames": 4,
                    "volume": 8, "sample_index": 0, "sample_only": True}]}], "order": [0]}],
            "pcm": [{"name": "effect", "samples": [0, 32, -32], "sample_rate_hz": 8000}],
        }
        (root / "bank.hpp").write_text(ASSETC.emit_audio_header("bank", document, root))
        expressions = ["bank_sfx_assets", "bank_sfx_assets[0].tones", "bank_music_assets",
            "bank_music_assets[0].steps", "bank_tracker_assets", "bank_tracker_assets[0].patterns",
            "bank_tracker_assets[0].patterns[0].steps", "bank_tracker_assets[0].order",
            "bank_tracker_assets[0].samples", "bank_tracker_assets[0].samples[0].samples",
            "bank_pcm_assets", "bank_pcm_assets[0].samples"]
        first = '#include "bank.hpp"\n' + "\n".join(
            f'extern "C" const void* from_first_{index}() {{ return {expression}; }}'
            for index, expression in enumerate(expressions))
        second = '#include "bank.hpp"\n#include <cassert>\n' + "\n".join(
            f'extern "C" const void* from_first_{index}();' for index in range(len(expressions)))
        second += "\nint main() {\n" + "\n".join(
            f"assert(from_first_{index}() == {expression});" for index, expression in enumerate(expressions)) + "\n}\n"
        (root / "first.cpp").write_text(first)
        (root / "second.cpp").write_text(second)
        subprocess.run(["c++", "-std=c++17", "-O0", "-I", str(ASSETC_PATH.parents[2] / "engine/include"),
            str(root / "first.cpp"), str(root / "second.cpp"), "-o", str(root / "linked")], check=True)
        subprocess.run([str(root / "linked")], check=True)


def test_pcm_native_cue_alias_compiles_and_rejects_missing_pcm():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        document = {"pcm": [{"name": "click", "samples": [20, -20], "sample_rate_hz": 31536}],
                    "sfx": [{"name": "click", "pcm": "click", "pcm_volume": 11}]}
        header = ASSETC.emit_audio_header("bank", document, root)
        (root / "bank.hpp").write_text(header)
        (root / "test.cpp").write_text('#include "bank.hpp"\nstatic_assert(bank_sfx_assets[0].pcm == &bank_click_asset);\nstatic_assert(bank_sfx_assets[0].pcm_volume == 11);\nint main() {}\n')
        subprocess.run(["c++", "-std=c++17", "-I", str(ASSETC_PATH.parents[2] / "engine/include"), "-I", str(root), str(root / "test.cpp"), "-o", str(root / "test")], check=True)
        document["sfx"][0]["pcm"] = "missing"
        try:
            ASSETC.emit_audio_header("bank", document, root)
            assert False, "dangling native cues must be rejected"
        except SystemExit:
            pass


def test_authored_pcm_instruments_keep_all_sixteen_lanes_and_pitch():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        sample = [int(math.sin(i * math.tau / 64) * 64) for i in range(64)]
        steps = [{"channel": i + 1, "frequency_hz": 524, "duration_frames": 6 if i == 15 else 0,
                  "volume": 5, "sample_only": True, "sample_index": 0, "sample_pitch_ratio": 2,
                  "pan": -127 if i % 2 else 127} for i in range(16)]
        doc = {"tracker": [{"name": "song", "samples": [{"samples": sample, "sample_rate_hz": 16768, "loop": True}],
                "patterns": [{"steps": steps}], "order": [0]}]}
        audio_json = root / "audio.json"
        audio_json.write_text(json.dumps(doc))
        first = ASSETC.pack_asset_source_fingerprint({"audio_json": "audio.json"}, root)
        doc["tracker"][0]["samples"][0]["samples"][0] = 1
        audio_json.write_text(json.dumps(doc))
        assert first != ASSETC.pack_asset_source_fingerprint({"audio_json": "audio.json"}, root)
        header = ASSETC.emit_audio_header("bank", doc, root)
        assert "{ 16, 524, 6," in header, "lane 16 must remain PCM lane 16"
        assert "31536" in header, "multichannel sources are prepared for the native mixer clock"
        (root / "bank.hpp").write_text(header)
        (root / "test.cpp").write_text('#include "bank.hpp"\n#include <cassert>\nint main(){ auto &step=bank_song_patterns[0].steps[15]; assert(step.channel==16 && step.sample_only); auto &sample=bank_song_asset.samples[step.sample_index]; assert(sample.sample_rate_hz==31536); assert(sample.loop_end_sample>0); }\n')
        subprocess.run(["c++", "-std=c++17", "-I", str(ASSETC_PATH.parents[2] / "engine/include"), "-I", str(root), str(root / "test.cpp"), "-o", str(root / "test")], check=True)
        subprocess.run([str(root / "test")], check=True)
        doc["tracker"][0]["patterns"][0]["steps"][0]["channel"] = 17
        try:
            ASSETC.emit_audio_header("bank", doc, root)
            assert False, "a seventeenth PCM lane must be rejected"
        except SystemExit:
            pass


def test_authored_sample_sfx_trim_pitch_and_envelope():
    rate = 31536
    samples = [int(math.sin(i * math.tau * 220 / rate) * 90) for i in range(rate)]
    config = {"duration_ms": 200, "trim_start_ms": 100, "pitch_semitones": 12, "attack_ms": 5, "release_ms": 20}
    converted = ASSETC.transform_pcm_samples(samples, rate, config)
    assert len(converted) == round(rate * .2)
    assert converted[0] == converted[-1] == 0
    assert max(converted) > 50 and min(converted) < -50
    middle = converted[800:4800]
    crossings = sum(a <= 0 < b for a, b in zip(middle, middle[1:]))
    assert abs(crossings * rate / len(middle) - 440) < 12, crossings
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        write_pcm16(root / "input.wav", [v * 256 for v in samples], rate)
        header = ASSETC.emit_audio_header("bank", {"pcm": [{"name": "hit", "wav": "input.wav", "sample_rate_hz": rate, "transform": config}], "sfx": [{"name": "hit", "pcm": "hit"}]}, root)
        assert "bank_hit_samples[6307]" in header
        assert "&bank_hit_asset" in header
    try:
        ASSETC.transform_pcm_samples(samples, rate, {**config, "duration_ms": 60000})
        assert False, "unbounded authored SFX must be rejected"
    except SystemExit:
        pass


def test_transformed_sfx_keeps_wav_loop_after_trim_pitch_and_resampling():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "loop.wav"
        write_pcm16(source, [12000] * 128, 16000)
        raw = bytearray(source.read_bytes())
        smpl = bytearray(60)
        struct.pack_into("<I", smpl, 28, 1)
        struct.pack_into("<II", smpl, 44, 16, 111)
        raw += b"smpl" + struct.pack("<I", len(smpl)) + smpl
        struct.pack_into("<I", raw, 4, len(raw) - 8)
        source.write_bytes(raw)
        config = {"duration_ms": 10, "trim_start_ms": 1, "pitch_semitones": 12}
        doc = {"pcm": [{"name": "hit", "wav": "loop.wav", "sample_rate_hz": 8000, "loop": True, "transform": config}]}
        header = ASSETC.emit_audio_header("bank", doc, root)
        assert "bank_hit_samples, 28, 8000, true, 0, 24 }" in header, "trim/pitch discarded the smpl region"
        assert ASSETC.transform_pcm_loop(16, 100, 8000, {"trim_start_ms": 0, "pitch_semitones": 0}, 80) == (16, 80)
        assert ASSETC.transform_pcm_loop(16, 100, 8000, {"trim_start_ms": 1, "pitch_semitones": -12}, 200) == (16, 184)
        try:
            ASSETC.transform_pcm_loop(16, 100, 8000, {"trim_start_ms": 15}, 80)
            assert False, "a cut that removes the entire loop must be rejected"
        except SystemExit:
            pass


if __name__ == "__main__":
    test_transformed_sfx_keeps_wav_loop_after_trim_pitch_and_resampling()
    test_authored_pcm_instruments_keep_all_sixteen_lanes_and_pitch()
    test_authored_sample_sfx_trim_pitch_and_envelope()
    test_pcm_native_cue_alias_compiles_and_rejects_missing_pcm()
    test_automatic_wav_conversion_matches_native_mixer_clock()
    test_audio_bank_is_shared_by_linked_cpp_translation_units()
    test_shared_wav_bank_deduplicates_conversion_and_pcm_without_stale_cache()
    test_wav_tracker_instrument_pitch_loop_and_fingerprint()
    test_filtered_downsampling_rejects_aliasing()
    test_wav_conversion_keeps_headroom_and_supports_32768_hz()
