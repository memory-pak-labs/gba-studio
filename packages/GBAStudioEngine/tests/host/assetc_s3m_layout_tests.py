#!/usr/bin/env python3
"""Original S3M fixtures using the native mixed-endian sample parapointer."""
import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("assetc", ROOT / "tools/assetc/assetc.py")
ASSETC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSETC)


def sample_module(sample_offset):
    data = bytearray(sample_offset + 64)
    data[28:30] = bytes([26, 16])
    struct.pack_into("<HHH", data, 32, 1, 1, 1)
    struct.pack_into("<H", data, 42, 1)
    data[44:48] = b"SCRM"
    data[48:52] = bytes([64, 6, 125, 128])
    data[64:96] = bytes([0] + [255] * 31)
    struct.pack_into("<HH", data, 97, 8, 16)
    data[128] = 1
    pointer = sample_offset // 16
    data[141] = pointer >> 16
    struct.pack_into("<H", data, 142, pointer & 65535)
    struct.pack_into("<III", data, 144, 64, 0, 64)
    data[156] = 48
    data[159] = 1
    struct.pack_into("<I", data, 160, 8363)
    data[204:208] = b"SCRS"
    packed = bytes([0x20, 0x40, 1]) + bytes(64)
    struct.pack_into("<H", data, 256, len(packed) + 2)
    data[258:258 + len(packed)] = packed
    data[sample_offset:] = bytes([32] * 32 + [224] * 32)
    return data


class S3mLayoutTests(unittest.TestCase):
    def test_signed_and_unsigned_pcm_decode_to_the_same_wave(self):
        with tempfile.TemporaryDirectory() as directory:
            for bits in (8, 16):
                for signed in (True, False):
                    with self.subTest(bits=bits, signed=signed):
                        data = sample_module(1536)
                        struct.pack_into("<H", data, 42, 1 if signed else 2)
                        data[159] = 1 | (4 if bits == 16 else 0)
                        values = [32] * 32 + [-32] * 32
                        if bits == 16:
                            data[1536:] = b"".join(struct.pack("<h" if signed else "<H", value * 256 + (0 if signed else 32768)) for value in values)
                        else:
                            data[1536:] = bytes((value + (0 if signed else 128)) & 255 for value in values)
                        source = Path(directory) / "encoding.s3m"
                        source.write_bytes(data)
                        self.assertEqual(ASSETC.convert_s3m_sample_to_pcm8(source, 1)[0], values)

    def test_pattern_length_includes_its_two_byte_header_at_end_of_file(self):
        with tempfile.TemporaryDirectory() as directory:
            data = sample_module(1536)
            packed = data[256:325]
            struct.pack_into("<H", data, 99, len(data) // 16)
            data += packed
            source = Path(directory) / "last-pattern.s3m"
            source.write_bytes(data)
            self.assertEqual(ASSETC.parse_s3m_tracker(source)["patterns"][0]["steps"][0]["channel"], 1)

    def test_sample_pointer_keeps_high_byte_first_and_low_word_little_endian(self):
        with tempfile.TemporaryDirectory() as directory:
            for offset in (1536, 0x100100):
                with self.subTest(offset=offset):
                    source = Path(directory) / "native.s3m"
                    source.write_bytes(sample_module(offset))
                    pcm, rate, start, end = ASSETC.convert_s3m_sample_to_pcm8(source, 1)
                    self.assertEqual(rate, 8363)
                    self.assertEqual((start, end), (0, 64))
                    self.assertEqual(pcm, [32] * 32 + [-32] * 32)
                    song = ASSETC.parse_s3m_tracker(source)
                    self.assertEqual(song["patterns"][0]["steps"][0]["sample_index"], 0)


if __name__ == "__main__":
    unittest.main()
