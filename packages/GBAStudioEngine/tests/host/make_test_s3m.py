#!/usr/bin/env python3
import struct
import sys
from pathlib import Path


def append_row_end(pattern, count=1):
    for _ in range(count):
        pattern.append(0)


def append_note(pattern, channel, note, instrument=1, volume=48, command=0, info=0):
    token = channel | 0x20
    if volume is not None:
        token |= 0x40
    if command:
        token |= 0x80
    pattern.append(token)
    pattern.append(note)
    pattern.append(instrument)
    if volume is not None:
        pattern.append(volume)
    if command:
        pattern.append(command)
        pattern.append(info)


def build_sample_instrument(name, sample_offset, sample_length, sample_rate, flags, loop_begin=0, loop_end=None, volume=48):
    if loop_end is None:
        loop_end = sample_length
    instrument = bytearray(80)
    instrument[0] = 1
    instrument[1:13] = name[:12].ljust(12, b"\0")
    sample_parapointer = sample_offset // 16
    instrument[13] = sample_parapointer & 0xFF
    instrument[14] = (sample_parapointer >> 8) & 0xFF
    instrument[15] = (sample_parapointer >> 16) & 0xFF
    struct.pack_into("<I", instrument, 16, sample_length)
    struct.pack_into("<I", instrument, 20, loop_begin)
    struct.pack_into("<I", instrument, 24, loop_end)
    instrument[28] = volume
    instrument[31] = flags
    struct.pack_into("<I", instrument, 32, sample_rate)
    instrument[48:76] = name[:28].ljust(28, b"\0")
    instrument[76:80] = b"SCRS"
    return instrument


def main():
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)

    header = bytearray(0x60)
    header[0:28] = b"GBS TEST S3M".ljust(28, b"\0")
    header[0x1C] = 0x1A
    header[0x1D] = 0x10
    struct.pack_into("<HHH", header, 0x20, 5, 2, 4)
    struct.pack_into("<HHH", header, 0x26, 0, 0x1320, 1)
    header[0x2C:0x30] = b"SCRM"
    header[0x30] = 64
    header[0x31] = 6
    header[0x32] = 125
    header[0x33] = 64
    for index in range(32):
        header[0x40 + index] = index if index < 4 else 255

    orders = bytes([0, 1, 2, 3, 1])
    instrument_offset = 0x80
    instrument2_offset = 0xD0
    pattern_offset = 0x130
    pattern2_offset = 0x1B0
    pattern3_offset = 0x230
    pattern4_offset = 0x2B0
    sample_offset = 0x330
    sample2_offset = 0x350
    instrument_parapointer = instrument_offset // 16
    instrument2_parapointer = instrument2_offset // 16
    pattern_parapointer = pattern_offset // 16
    pattern2_parapointer = pattern2_offset // 16
    pattern3_parapointer = pattern3_offset // 16
    pattern4_parapointer = pattern4_offset // 16

    data = bytearray(header)
    data.extend(orders)
    data.extend(struct.pack("<H", instrument_parapointer))
    data.extend(struct.pack("<H", instrument2_parapointer))
    data.extend(struct.pack("<H", pattern_parapointer))
    data.extend(struct.pack("<H", pattern2_parapointer))
    data.extend(struct.pack("<H", pattern3_parapointer))
    data.extend(struct.pack("<H", pattern4_parapointer))
    while len(data) < instrument_offset:
        data.append(0)

    data.extend(build_sample_instrument(b"GBSLEAD", sample_offset, 8, 11025, 0x01, 2, 6, 36))
    while len(data) < instrument2_offset:
        data.append(0)
    data.extend(build_sample_instrument(b"GBS16STEREO", sample2_offset, 4, 16000, 0x07, 1, 3))
    while len(data) < pattern_offset:
        data.append(0)

    pattern = bytearray()
    append_note(pattern, 0, 0x30, volume=None)
    append_note(pattern, 2, 0x34, volume=40)
    append_row_end(pattern, 4)
    append_note(pattern, 1, 0x34, volume=24)
    append_row_end(pattern, 4)
    append_note(pattern, 0, 0x37, volume=32, command=1, info=2)
    append_row_end(pattern, 4)
    append_note(pattern, 0, 0x40, volume=48, command=4, info=0x03)
    append_row_end(pattern, 4)
    append_note(pattern, 0, 0x40, volume=48, command=5, info=8)
    append_row_end(pattern, 4)
    append_note(pattern, 0, 0x40, volume=48, command=6, info=8)
    append_row_end(pattern, 4)
    append_note(pattern, 0, 255, volume=None, command=20, info=75)
    append_row_end(pattern, 4)
    append_note(pattern, 0, 0x40, volume=48)
    append_row_end(pattern, 4)
    append_note(pattern, 0, 0x43, volume=48, command=7, info=8)
    append_row_end(pattern, 32)

    data.extend(struct.pack("<H", len(pattern)))
    data.extend(pattern)
    while len(data) < pattern2_offset:
        data.append(0)

    pattern = bytearray()
    append_note(pattern, 0, 0x40, volume=48, command=8, info=0x27)
    append_row_end(pattern, 8)
    append_note(pattern, 1, 255, volume=None, command=3, info=0)
    append_row_end(pattern, 55)

    data.extend(struct.pack("<H", len(pattern)))
    data.extend(pattern)

    while len(data) < pattern3_offset:
        data.append(0)

    pattern = bytearray()
    append_note(pattern, 0, 0x40, volume=48, command=18, info=0x27)
    append_row_end(pattern, 8)
    append_note(pattern, 1, 255, volume=None, command=2, info=4)
    append_row_end(pattern, 55)

    data.extend(struct.pack("<H", len(pattern)))
    data.extend(pattern)

    while len(data) < pattern4_offset:
        data.append(0)

    pattern = bytearray()
    append_note(pattern, 0, 0x43, volume=48)
    append_row_end(pattern, 63)

    data.extend(struct.pack("<H", len(pattern)))
    data.extend(pattern)

    while len(data) < sample_offset:
        data.append(0)
    data.extend(bytes([128, 160, 224, 255, 0, 32, 64, 96]))
    while len(data) < sample2_offset:
        data.append(0)
    stereo16 = [
        (-32768, -32768),
        (16384, 16384),
        (-16384, -8192),
        (0, 32767),
    ]
    for left, right in stereo16:
        data.extend(struct.pack("<hh", left, right))
    output.write_bytes(data)


if __name__ == "__main__":
    main()
