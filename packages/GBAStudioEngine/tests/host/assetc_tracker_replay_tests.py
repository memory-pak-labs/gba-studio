#!/usr/bin/env python3
"""Native authored modules and analytical tick expectations, no external assets."""
import math
import struct
import tempfile
import unittest
from pathlib import Path
from assetc_extended_tracker_tests import ASSETC, xm_fixture, it_fixture


def xm_song(events, rows=8, volume_env=None, pan_env=None, fadeout=0):
    data, instrument, _ = xm_fixture(channels=1, rows=rows)
    data[345:345 + rows * 5] = bytes(rows * 5)
    for row, cell in events.items():
        data[345 + row * 5:350 + row * 5] = bytes(cell)
    for spec, offset, count, flags, sustain in [(volume_env, 129, 225, 233, 227), (pan_env, 177, 226, 234, 230)]:
        if spec:
            points = spec["points"]
            data[instrument + count] = len(points)
            data[instrument + flags] = 1 | (2 if "sustain" in spec else 0) | (4 if "loop" in spec else 0)
            data[instrument + sustain] = spec.get("sustain", 0)
            if "loop" in spec: data[instrument + sustain + 1:instrument + sustain + 3] = bytes(spec["loop"])
            for i, point in enumerate(points): struct.pack_into("<HH", data, instrument + offset + i * 4, *point)
    struct.pack_into("<H", data, instrument + 239, fadeout)
    return data


def it_song(events, rows=8, volume_env=None, pan_env=None, pitch_env=None, fadeout=0):
    data, sample, pattern = it_fixture((0,), rows)
    pcm = bytes(data[-128:]); packed = bytearray()
    for row in range(rows):
        if row in events:
            note, instrument, volume, effect, parameter = events[row]
            mask = (1 if note is not None else 0) | (2 if instrument else 0) | (4 if volume is not None else 0) | (8 if effect or parameter else 0)
            packed.extend([129, mask])
            if mask & 1: packed.append(note)
            if mask & 2: packed.append(instrument)
            if mask & 4: packed.append(volume)
            if mask & 8: packed.extend([effect, parameter])
        packed.append(0)
    data = data[:pattern] + struct.pack("<HHI", len(packed), rows, 0) + packed + pcm
    struct.pack_into("<I", data, sample + 72, pattern + 8 + len(packed))
    instrument = len(data); data.extend(bytes(554)); data[instrument:instrument + 4] = b"IMPI"
    data[instrument + 24:instrument + 26] = bytes([128, 128])
    struct.pack_into("<H", data, 34, 1); struct.pack_into("<H", data, 44, 13)
    struct.pack_into("<III", data, 193, instrument, sample, pattern)
    struct.pack_into("<H", data, instrument + 20, fadeout)
    for note in range(120): data[instrument + 64 + note * 2:instrument + 66 + note * 2] = bytes([note, 1])
    for spec, offset in [(volume_env, 304), (pan_env, 386), (pitch_env, 468)]:
        if spec:
            points = spec["points"]; loc = instrument + offset
            data[loc] = 1 | (2 if "loop" in spec else 0) | (4 if "sustain" in spec else 0)
            data[loc + 1] = len(points)
            if "loop" in spec: data[loc + 2:loc + 4] = bytes(spec["loop"])
            if "sustain" in spec: data[loc + 4:loc + 6] = bytes(spec["sustain"])
            for i, (tick, value) in enumerate(points): struct.pack_into("<bH", data, loc + 6 + i * 3, value, tick)
    return data


def convert(format, data):
    with tempfile.TemporaryDirectory(prefix="gba-envelope-unit-") as directory:
        path = Path(directory) / f"authored.{format}"; path.write_bytes(data)
        result = getattr(ASSETC, f"parse_{format}_tracker")(path)
        assert path.read_bytes() == data
        return result


def notes(song):
    return [s for p in song["patterns"] for s in p["steps"] if s.get("sample_only")]


def tick_controls(format, data):
    class Capture(ASSETC.ExtendedTrackerReplay):
        def emit(self, channel, index, *args):
            channel.trigger = True  # capture every tick, including unchanged controls
            result = super().emit(channel, index, *args)
            if index == 0 and result:
                controls.append(result)
            return result
    with tempfile.TemporaryDirectory(prefix="gba-tick-test-") as directory:
        file = Path(directory) / ("song." + format); file.write_bytes(data)
        reader, song = getattr(ASSETC, "read_" + format + "_tracker")(file)
        controls = []; Capture(reader, song, 2).compile()
        return controls


class TrackerReplayTests(unittest.TestCase):
    def test_xm_volume_sustain_releases_without_restarting_the_sample(self):
        song = convert("xm", xm_song({0: [49, 1, 0, 0, 0], 2: [97, 0, 0, 0, 0]}, volume_env={"points": [(0, 0), (2, 64), (4, 32), (8, 0)], "sustain": 1}, fadeout=256))
        steps = notes(song)
        self.assertEqual(steps[0]["sample_gain"], 0)
        self.assertEqual(max(s["sample_gain"] for s in steps), 255)
        self.assertEqual(sum(not s.get("sample_continue", False) for s in steps), 1)
        self.assertEqual(steps[-1]["sample_gain"], 0)

    def test_it_volume_pan_and_pitch_envelopes(self):
        song = convert("it", it_song({0: [60, 1, None, 0, 0], 2: [255, 0, None, 0, 0]}, volume_env={"points": [(0, 64), (4, 32), (20, 0)], "sustain": (1, 1)}, pan_env={"points": [(0, -32), (8, 32)]}, pitch_env={"points": [(0, 0), (8, 4)]}, fadeout=16))
        steps = notes(song)
        self.assertEqual(steps[0]["pan"], -127)
        self.assertGreater(max(s["pan"] for s in steps), 100)
        self.assertGreater(max(s["sample_rate_hz"] for s in steps), 8363)
        self.assertEqual(sum(not s.get("sample_continue", False) for s in steps), 1)

    def test_arpeggio_keeps_phase_and_uses_semitones(self):
        for format, data in [("xm", xm_song({0: [49, 1, 0, 0, 0x37]}, rows=1)), ("it", it_song({0: [60, 1, None, 10, 0x37]}, rows=1))]:
            with self.subTest(format=format):
                steps = notes(convert(format, data))
                semitones = [0, 7, 3] if format == "xm" else [0, 3, 7]
                self.assertEqual([s["sample_rate_hz"] for s in steps[:3]], [round(8363 * 2 ** (n / 12)) for n in semitones])
                self.assertTrue(all(s.get("sample_continue") for s in steps[1:]))

    def test_volume_slide_without_note_and_memory(self):
        steps = notes(convert("xm", xm_song({0: [49, 1, 0x50, 0, 0], 1: [0, 0, 0, 10, 2], 2: [0, 0, 0, 10, 0]}, rows=3)))
        self.assertEqual(steps[0]["sample_gain"], 255)
        self.assertLess(steps[-1]["sample_gain"], 200)
        self.assertEqual(sum(not s.get("sample_continue", False) for s in steps), 1)

    def test_portamento_reaches_target_without_a_new_note_trigger(self):
        steps = notes(convert("xm", xm_song({0: [49, 1, 0, 0, 0], 1: [51, 0, 0, 3, 8], 2: [0, 0, 0, 3, 0]}, rows=3)))
        self.assertEqual(steps[-1]["sample_rate_hz"], round(8363 * 2 ** (2 / 12)))
        self.assertEqual(sum(not s.get("sample_continue", False) for s in steps), 1)

    def test_vibrato_and_panning_slide_change_controls_without_retrigger(self):
        steps = notes(convert("xm", xm_song({0: [49, 1, 0, 4, 0x47], 1: [0, 0, 0, 4, 0], 2: [0, 0, 0, 25, 0x10]}, rows=3)))
        self.assertGreater(max(s["sample_rate_hz"] for s in steps), 8363)
        self.assertLess(min(s["sample_rate_hz"] for s in steps), 8363)
        self.assertLess(steps[-1]["pan"], 0)
        self.assertEqual(sum(not s.get("sample_continue", False) for s in steps), 1)

    def test_bad_envelope_nodes_fail_instead_of_hanging_export(self):
        with self.assertRaisesRegex(SystemExit, "envelope"):
            convert("xm", xm_song({0: [49, 1, 0, 0, 0]}, volume_env={"points": [(0, 64), (0, 32)]}))

    def test_instrument_only_does_not_clear_an_inherited_it_pan(self):
        steps = notes(convert("it", it_song({0: [60, 1, None, 0, 0], 1: [None, 1, None, 0, 0]}, rows=2)))
        self.assertEqual(steps[0]["pan"], 0)
        self.assertEqual(sum(not s.get("sample_continue", False) for s in steps), 1)

    def test_delayed_note_applies_its_volume_at_the_delayed_tick(self):
        steps = notes(convert("xm", xm_song({0: [49, 1, 0x20, 14, 0xD3]}, rows=1)))
        self.assertEqual(steps[0]["sample_gain"], 64)

    def test_invalid_extra_fine_slide_is_rejected(self):
        with self.assertRaisesRegex(SystemExit, "extra"):
            convert("xm", xm_song({0: [49, 1, 0, 33, 0x31]}, rows=1))

    def test_fine_slides_use_their_own_parameter_memory(self):
        song = convert("xm", xm_song({0: [49, 1, 0, 14, 0x11], 1: [0, 0, 0, 14, 0x10]}, rows=2))
        steps = notes(song)
        self.assertEqual(steps[-1]["sample_rate_hz"], round(8363 * 2 ** (2 / 192)))

    def test_envelope_sustain_loop_and_release_are_separate(self):
        envelope = {"points": [(0, 0), (2, 64), (4, 32), (6, 0)], "sustain": (1, 1), "loop": (0, 2)}
        self.assertEqual(ASSETC.advance_tracker_envelope(envelope, 2, True), 2)
        self.assertEqual(ASSETC.advance_tracker_envelope(envelope, 2, False), 3)
        self.assertEqual(ASSETC.advance_tracker_envelope(envelope, 4, False), 0)

    def test_vibrato_matches_independent_ft2_and_it_tick_vectors(self):
        # Independent libxmp 4.7.4 vectors, in 1/16 semitone units.
        # FT2 skips phase advance at tick zero; modern IT advances every tick.
        for fmt, data, expected in [
            ("xm", xm_song({0: [49, 1, 0, 4, 0x47]}, rows=1), [0, 0, -5, -9, -12, -13]),
            ("it", it_song({0: [60, 1, None, 8, 0x47]}, rows=1), [0, 2, 4, 6, 6, 6]),
        ]:
            with tempfile.TemporaryDirectory() as directory:
                file = Path(directory) / ("song." + fmt); file.write_bytes(data)
                reader, song = getattr(ASSETC, "read_" + fmt + "_tracker")(file)
                replay = ASSETC.ExtendedTrackerReplay(reader, song, 2)
                channel = replay.channels[0]; key, parameter = replay.effect(channel, 4 if fmt == "xm" else 8, 0x47)
                replay.note(channel, 48 if fmt == "xm" else 60, 1, False)
                for tick, units in enumerate(expected):
                    replay.tick = tick; channel.trigger = True
                    self.assertEqual(replay.emit(channel, 0, key, parameter, None)["sample_rate_hz"], round(8363 * 2 ** (units / 192)))

    def test_ft2_tremolo_and_tremor_skip_the_first_tick(self):
        tremolo = tick_controls("xm", xm_song({0: [49, 1, 0x30, 7, 0x47]}, rows=1))
        expected = [32, 32, 42, 51, 57, 59]
        self.assertEqual([s["sample_gain"] for s in tremolo], [round(v * 255 / 64) for v in expected])
        tremor = tick_controls("xm", xm_song({0: [49, 1, 0, 29, 0x23], 1: [0, 0, 0, 29, 0x23]}, rows=2))
        self.assertEqual([s["sample_gain"] for s in tremor], [255] * 4 + [0] * 5 + [255] * 3)

    def test_it_fine_volume_slide_runs_only_on_tick_zero(self):
        controls = tick_controls("it", it_song({0: [60, 1, None, 4, 0xF3]}, rows=1))
        self.assertEqual([s["sample_gain"] for s in controls], [round(61 / 64 * 255)] * 6)

    def test_it_portamento_shares_pitch_memory_only_when_compatible_gxx_is_off(self):
        data = it_song({0: [60, 1, None, 6, 4], 1: [64, 0, None, 7, 0], 2: [None, 0, None, 7, 0]}, rows=3)
        controls = tick_controls("it", data)
        self.assertEqual(controls[-1]["sample_rate_hz"], round(8363 * 2 ** (60 / 192)))
        struct.pack_into("<H", data, 44, 13 | 32)
        separate = tick_controls("it", data)
        self.assertEqual(separate[-1]["sample_rate_hz"], separate[5]["sample_rate_hz"])

    def test_global_volume_slide_precedes_voice_gain(self):
        controls = tick_controls("xm", xm_song({0: [49, 1, 0, 17, 1]}, rows=1))
        self.assertEqual([s["sample_gain"] for s in controls], [round((64 - i) / 64 * 255) for i in range(6)])

    def test_note_retrigger_and_cut_have_different_sample_controls(self):
        song = convert("xm", xm_song({0: [49, 1, 0, 14, 0x92], 1: [0, 0, 0, 14, 0xC3]}, rows=2))
        controls = notes(song)
        self.assertEqual(sum(not s.get("sample_continue", False) and s["volume"] > 0 for s in controls), 3)
        self.assertEqual(controls[-1]["volume"], 0)

    def test_it_muted_channel_effects_are_not_silently_lost(self):
        data = it_song({0: [60, 1, None, 1, 3]}, rows=1); data[64] |= 128
        with self.assertRaisesRegex(SystemExit, "canal desativado"):
            convert("it", data)

    def test_unsupported_it_filter_and_pitch_pan_fail_explicitly(self):
        for offset, value in [(22, 1), (468, 129)]:
            data = it_song({0: [60, 1, None, 0, 0]}, rows=1)
            instrument = struct.unpack_from("<I", data, 193)[0]; data[instrument + offset] = value
            with self.assertRaises(SystemExit):
                convert("it", data)


if __name__ == "__main__": unittest.main()
