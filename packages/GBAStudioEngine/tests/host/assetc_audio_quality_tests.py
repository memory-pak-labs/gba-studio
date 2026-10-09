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


if __name__ == "__main__":
    test_automatic_wav_conversion_matches_native_mixer_clock()
    test_audio_bank_is_shared_by_linked_cpp_translation_units()
    test_shared_wav_bank_deduplicates_conversion_and_pcm_without_stale_cache()
    test_wav_tracker_instrument_pitch_loop_and_fingerprint()
    test_filtered_downsampling_rejects_aliasing()
    test_wav_conversion_keeps_headroom_and_supports_32768_hz()
