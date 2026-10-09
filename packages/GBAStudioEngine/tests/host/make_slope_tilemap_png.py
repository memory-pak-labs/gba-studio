#!/usr/bin/env python3
import struct
import sys
import zlib
from pathlib import Path


def chunk(kind, payload):
    return (
        struct.pack(">I", len(payload)) +
        kind +
        payload +
        struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def main():
    output = Path(sys.argv[1])
    width = 32
    height = 8
    palette = bytes([
        0, 0, 0,
        255, 0, 0,
        0, 255, 0,
        0, 0, 255,
        255, 255, 0,
    ])

    rows = []
    for _ in range(height):
        row = []
        for color_index in (1, 2, 3, 4):
            row.extend([color_index] * 8)
        rows.append(bytes([0]) + bytes(row))
    raw = b"".join(rows)

    data = (
        b"\x89PNG\r\n\x1a\n" +
        chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0)) +
        chunk(b"PLTE", palette) +
        chunk(b"IDAT", zlib.compress(raw)) +
        chunk(b"IEND", b"")
    )
    output.write_bytes(data)


if __name__ == "__main__":
    main()
