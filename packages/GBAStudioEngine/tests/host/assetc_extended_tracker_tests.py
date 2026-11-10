#!/usr/bin/env python3
"""Authored XM/IT fixtures; tests the native PCM profile, never external music."""
import importlib.util
import math
import struct
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("assetc", ROOT / "tools/assetc/assetc.py")
ASSETC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSETC)


def xm_fixture(channels=16, rows=5, pcm16=False):
    pattern = bytearray(rows * channels * 5)
    for channel in range(channels):
        pattern[channel * 5:channel * 5 + 5] = bytes([49, 1, 0x40, 0, 0])
        pattern[((rows - 1) * channels + channel) * 5] = 97
    instrument = 345 + len(pattern)
    sample = instrument + 263
    count = 128 * (2 if pcm16 else 1)
    out = bytearray(sample + 40 + count)
    out[:17] = b"Extended Module: "
    out[37] = 26
    struct.pack_into("<HIHHHHHHHH", out, 58, 0x104, 276, 1, 0, channels, 1, 1, 1, 6, 125)
    struct.pack_into("<IBHH", out, 336, 9, 0, rows, len(pattern))
    out[345:instrument] = pattern
    struct.pack_into("<I", out, instrument, 263)
    struct.pack_into("<HI", out, instrument + 27, 1, 40)
    struct.pack_into("<III", out, sample, count, 0, count)
    out[sample + 12], out[sample + 14], out[sample + 15] = 64, 17 if pcm16 else 1, 128
    previous = 0
    for i in range(128):
        value = round(math.sin(i * math.pi / 16) * (20480 if pcm16 else 80))
        if pcm16:
            struct.pack_into("<H", out, sample + 40 + i * 2, (value - previous) & 65535)
        else:
            out[sample + 40 + i] = (value - previous) & 255
        previous = value
    return out, instrument, sample


def it_fixture(channels=(0, 4, 63), rows=7, pcm16=False):
    packed = bytearray()
    for channel in channels:
        packed.extend([128 | (channel + 1), 15, 60, 1, 48, 20, 125])
    packed.append(0)
    for channel in channels:
        packed.extend([128 | (channel + 1), 0xf0])
    packed.extend(bytes(rows - 1))
    sample, pattern = 208, 288
    pcm = pattern + 8 + len(packed)
    out = bytearray(pcm + 128 * (2 if pcm16 else 1))
    out[:4] = b"IMPM"
    struct.pack_into("<HHHHHHH", out, 32, 1, 0, 1, 1, 0x214, 0x214, 9)
    out[48:53] = bytes([128, 48, 6, 125, 128])
    out[64:128] = bytes([160] * 64)
    out[128:192] = bytes([64] * 64)
    for channel in channels:
        out[64 + channel] = 32
    struct.pack_into("<II", out, 193, sample, pattern)
    out[sample:sample + 4] = b"IMPS"
    out[sample + 17:sample + 20] = bytes([64, 19 if pcm16 else 17, 64])
    out[sample + 46] = 1
    struct.pack_into("<IIIIIII", out, sample + 48, 128, 0, 128, 8363, 0, 0, pcm)
    struct.pack_into("<HH", out, pattern, len(packed), rows)
    out[pattern + 8:pcm] = packed
    for i in range(128):
        value = round(math.sin(i * math.pi / 16) * (20480 if pcm16 else 80))
        if pcm16:
            struct.pack_into("<h", out, pcm + i * 2, value)
        else:
            out[pcm + i] = value & 255
    return out, sample, pattern


class ExtendedTrackerTests(unittest.TestCase):
    def convert(self, format, data):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / f"authored.{format}"
            source.write_bytes(data)
            song = getattr(ASSETC, f"parse_{format}_tracker")(source)
            header = ASSETC.emit_audio_header("extended", {"tracker": [{"name": "song", format: source.name}]}, source.parent)
            self.assertIn(", true };", header, "PCM tails must survive empty rows")
            self.assertEqual(source.read_bytes(), data)
            return song

    def test_xm_sixteen_channels_variable_rows_and_delta_pcm(self):
        for pcm16 in (False, True):
            with self.subTest(pcm16=pcm16):
                data, _, _ = xm_fixture(pcm16=pcm16)
                song = self.convert("xm", data)
                steps = song["patterns"][0]["steps"]
                self.assertEqual([s["channel"] for s in steps[:16]], list(range(1, 17)))
                self.assertTrue(all(s["sample_only"] for s in steps[:16]))
                self.assertEqual(sum(s["duration_frames"] for s in steps), 36)
                self.assertEqual(steps[0]["sample_rate_hz"], 8363)
                self.assertEqual(song["samples"][0]["loop_end_sample"], 128)
                self.assertGreater(max(song["samples"][0]["samples"]), 50)

    def test_it_sparse_channels_masks_and_pcm16(self):
        for pcm16 in (False, True):
            data, _, _ = it_fixture(pcm16=pcm16)
            song = self.convert("it", data)
            self.assertEqual([s["channel"] for s in song["patterns"][0]["steps"][:3]], [1, 2, 3])
            self.assertEqual(sum(s["duration_frames"] for s in song["patterns"][0]["steps"]), 50)
            self.assertGreater(max(song["samples"][0]["samples"]), 50)

    def test_long_empty_rows_are_not_truncated_to_255_frames(self):
        data, _, _ = xm_fixture(channels=1, rows=100)
        song = self.convert("xm", data)
        self.assertEqual(sum(s["duration_frames"] for s in song["patterns"][0]["steps"]), 720)
        self.assertTrue(all(s["duration_frames"] <= 255 for s in song["patterns"][0]["steps"]))

    def test_unsupported_features_fail_with_location_instead_of_disappearing(self):
        data, instrument, _ = xm_fixture()
        data[instrument + 233] = 1
        with self.assertRaisesRegex(SystemExit, "XM.*instrumento 1.*envelope"):
            self.convert("xm", data)
        data, _, _ = xm_fixture()
        data[348:350] = bytes([4, 0x47])
        with self.assertRaisesRegex(SystemExit, "XM.*padrão 1.*linha 1.*canal 1.*04"):
            self.convert("xm", data)
        data, sample, _ = it_fixture()
        data[sample + 18] |= 8
        with self.assertRaisesRegex(SystemExit, "IT.*sample 1.*compress"):
            self.convert("it", data)

    def test_truncated_payload_is_rejected_before_conversion(self):
        for format, data in (("xm", xm_fixture()[0]), ("it", it_fixture()[0])):
            with self.assertRaisesRegex(SystemExit, "truncado|ponteiro"):
                self.convert(format, data[:-1])

    def test_initial_silence_tempo_change_and_fractional_timing(self):
        data, _, _ = xm_fixture(channels=1, rows=100)
        data[345:350], data[355:360] = bytes(5), bytes([49, 1, 0x40, 15, 150])
        song = self.convert("xm", data)
        steps = song["patterns"][0]["steps"]
        self.assertEqual(steps[0]["volume"], 0)
        self.assertEqual(steps[0]["duration_frames"], 14)
        self.assertEqual(sum(s["duration_frames"] for s in steps), 602)

    def test_sample_state_survives_order_boundaries(self):
        data, instrument, _ = xm_fixture(channels=1, rows=5)
        second = bytearray(data[336:instrument])
        second[9:14] = bytes([51, 0, 0, 0, 0])
        data[instrument:instrument] = second
        struct.pack_into("<H", data, 64, 2)
        struct.pack_into("<H", data, 70, 2)
        data[81] = 1
        song = self.convert("xm", data)
        self.assertEqual(len(song["patterns"]), 2)
        self.assertEqual(song["patterns"][1]["steps"][0]["sample_index"], 0)
        self.assertEqual(sum(s["duration_frames"] for p in song["patterns"] for s in p["steps"]), 72)

    def test_pingpong_loop_converts_without_changing_source(self):
        data, _, sample = xm_fixture(channels=1)
        data[sample + 14] = 2
        converted = self.convert("xm", data)["samples"][0]
        self.assertEqual(converted["loop_end_sample"], 254)
        self.assertEqual(converted["samples"][128:], converted["samples"][1:127][::-1])

    def test_it_sixteen_voices_and_seventeenth_voice_error(self):
        song = self.convert("it", it_fixture(tuple(range(16)))[0])
        self.assertEqual([s["channel"] for s in song["patterns"][0]["steps"][:16]], list(range(1, 17)))
        with self.assertRaisesRegex(SystemExit, "16 canais"):
            self.convert("it", it_fixture(tuple(range(17)))[0])

    def test_volume_without_note_and_f00_are_not_silently_lost(self):
        data, _, _ = xm_fixture(channels=1)
        data[350:355] = bytes([0, 0, 0x30, 0, 0])
        with self.assertRaisesRegex(SystemExit, "linha 2.*sem nota"):
            self.convert("xm", data)
        data[350:355] = bytes([0, 0, 0, 15, 0])
        with self.assertRaisesRegex(SystemExit, "linha 2.*0F00"):
            self.convert("xm", data)

    def test_note_without_instrument_inherits_volume_and_pan(self):
        data, _, _ = xm_fixture(channels=1)
        data[345:350] = bytes([49, 1, 0x30, 8, 0])
        data[350:355] = bytes([51, 0, 0, 0, 0])
        steps = self.convert("xm", data)["patterns"][0]["steps"]
        self.assertEqual([s["volume"] for s in steps[:2]], [8, 8])
        self.assertEqual([s["pan"] for s in steps[:2]], [-127, -127])

    def test_simple_it_instrument_mapping_and_control_memory(self):
        data, sample, pattern = it_fixture((0,))
        instrument = len(data)
        data.extend(bytes(554))
        data[instrument:instrument + 4] = b"IMPI"
        data[instrument + 24], data[instrument + 25] = 128, 128
        for note in range(120):
            data[instrument + 64 + note * 2:instrument + 66 + note * 2] = bytes([note, 1])
        struct.pack_into("<H", data, 34, 1)
        struct.pack_into("<H", data, 44, 13)
        struct.pack_into("<III", data, 193, instrument, sample, pattern)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "instrument.it"
            source.write_bytes(data)
            reader, song = ASSETC.read_it_tracker(source)
            song["patterns"][0][1][0] = (62, 0, None, 0, 0)
            song["pans"][0] = -127
            steps = ASSETC.compile_extended_tracker(reader, song)["patterns"][0]["steps"]
            self.assertEqual([s["volume"] for s in steps[:2]], [11, 11])
            self.assertEqual([s["pan"] for s in steps[:2]], [-127, -127])
        data[instrument + 304] = 1
        with self.assertRaisesRegex(SystemExit, "instrumento 1.*envelope"):
            self.convert("it", data)


if __name__ == "__main__":
    unittest.main()
