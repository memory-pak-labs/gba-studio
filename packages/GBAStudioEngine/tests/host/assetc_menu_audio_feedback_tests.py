#!/usr/bin/env python3
"""Menu PCM/PSG cue encoding and rejection of malformed authored feedback."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "assetc"))
import assetc


class MenuAudioFeedbackTests(unittest.TestCase):
    def test_pcm_psg_and_unconfigured_cues(self):
        expression = assetc.emit_menu_audio_feedback({"audio_feedback": {
            "navigate": {"pcm": 2, "volume": 10, "priority": 8},
            "confirm": {"sfx": 0},
        }}, 0)
        self.assertIn("2, true, 10, 8", expression)
        self.assertIn("0, false, 15, 8", expression)
        self.assertEqual(expression.count("gbs::MenuAudioCue {}"), 2)

    def test_rejects_invalid_or_ambiguous_references(self):
        for cue in [{"pcm": -1}, {"pcm": 0, "sfx": 0}, {"pcm": 0, "volume": 16},
                    {"pcm": True}, {"pcm": 0, "priority": 256}, {"tracker": 0}]:
            with self.subTest(cue=cue), self.assertRaises(SystemExit):
                assetc.emit_menu_audio_feedback({"audio_feedback": {"confirm": cue}}, 0)
        with self.assertRaises(SystemExit):
            assetc.emit_menu_audio_feedback({"audio_feedback": {"typo": {"pcm": 0}}}, 0)


if __name__ == "__main__":
    unittest.main()
