#!/usr/bin/env python3
"""Synthetic MOD/S3M sources for channel-identity and ARM playback regressions."""
import struct
import sys
from pathlib import Path

def write_mod(path, channels=16, varied_volume=False):
    data = bytearray(1084)
    data[:20] = b"Channel identity".ljust(20, b"\0")
    struct.pack_into(">H", data, 42, 32)
    data[45] = 32
    struct.pack_into(">HH", data, 46, 0, 32)
    data[950] = 1
    data[1080:1084] = (f"{channels}CH" if channels >= 10 else f"{channels}CHN").encode()
    pattern = bytearray(64 * channels * 4)
    for channel in range(channels):
        period = 428 + channel * 8
        pattern[channel * 4:channel * 4 + 4] = bytes([period >> 8, period & 255, 0x1c if varied_volume else 0x10, 16 + channel * 3 if varied_volume else 0])
    data += pattern + bytes([4] * 32 + [252] * 32)
    path.write_bytes(data)


def write_s3m(path, channels=tuple(range(16)), disabled=(), varied_volume=False):
    data = bytearray(0x100)
    data[0x1c:0x1e] = b"\x1a\x10"
    struct.pack_into("<HHH", data, 0x20, 1, 1, 1)
    struct.pack_into("<H", data, 0x2a, 1)
    data[0x2c:0x30] = b"SCRM"
    data[0x30:0x34] = bytes([64, 6, 125, 64])
    data[0x40:0x60] = bytes([255] * 32)
    for index, channel in enumerate(channels):
        data[0x40 + channel] = index % 16
    data[0x60] = 0
    struct.pack_into("<HH", data, 0x61, 8, 16)
    instrument = memoryview(data)[0x80:0xd0]
    instrument[0] = 1
    instrument[13] = 32  # sample at 0x200
    struct.pack_into("<III", instrument, 16, 64, 0, 64)
    instrument[28] = 32
    instrument[31] = 1  # forward loop
    struct.pack_into("<I", instrument, 32, 8363)
    instrument[76:80] = b"SCRS"
    del instrument
    packed = bytearray()
    for index, channel in enumerate((*channels, *disabled)):
        packed += bytes([0x60 | channel, ((4 + index // 12) << 4) | (index % 12), 1, 16 + index * 3 if varied_volume else 32])
    packed += bytes(64)
    data += struct.pack("<H", len(packed)) + packed
    data += bytes(0x200 - len(data))
    data += bytes([4] * 32 + [252] * 32)
    path.write_bytes(data)


if __name__ == "__main__":
    root = Path(sys.argv[1])
    root.mkdir(parents=True, exist_ok=True)
    write_mod(root / "channels.mod", varied_volume=True)
    write_s3m(root / "channels.s3m", varied_volume=True)
