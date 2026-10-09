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
    sprite_width = int(sys.argv[2]) if len(sys.argv) > 2 else 16
    sprite_height = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    frames = int(sys.argv[4]) if len(sys.argv) > 4 else 2
    width = sprite_width * frames
    height = sprite_height
    palette = bytes([
        0, 0, 0,
        255, 255, 255,
        255, 0, 0,
        0, 0, 255,
    ])
    rows = []
    for y in range(height):
        row = []
        for x in range(width):
            frame = x // sprite_width
            local_x = x % sprite_width
            if local_x in (0, sprite_width - 1) or y in (0, sprite_height - 1):
                row.append(2 + (frame % 2))
            else:
                row.append(1 + (frame % 3))
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
