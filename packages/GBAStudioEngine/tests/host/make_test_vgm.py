#!/usr/bin/env python3
import struct
import sys
from pathlib import Path


def write_tone(commands, channel, period):
    commands.append(0x50)
    commands.append(0x80 | ((channel & 3) << 5) | (period & 0x0F))
    commands.append(0x50)
    commands.append((period >> 4) & 0x3F)


def write_volume(commands, channel, attenuation):
    commands.append(0x50)
    commands.append(0x90 | ((channel & 3) << 5) | (attenuation & 0x0F))


def write_noise(commands, control):
    commands.append(0x50)
    commands.append(0xE0 | (control & 0x07))


def wait_frame(commands):
    commands.append(0x62)


def write_stereo(commands, value):
    commands.append(0x4F)
    commands.append(value & 0xFF)


def write_data_block(commands, block_type, payload):
    commands.append(0x67)
    commands.append(0x66)
    commands.append(block_type & 0xFF)
    commands.extend(struct.pack("<I", len(payload)))
    commands.extend(payload)


def main():
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)

    commands = bytearray()
    write_stereo(commands, 0xFF)
    write_volume(commands, 0, 3)
    write_tone(commands, 0, 127)
    wait_frame(commands)
    wait_frame(commands)
    write_data_block(commands, 0x00, b"GBS")
    write_volume(commands, 1, 7)
    write_tone(commands, 1, 95)
    wait_frame(commands)
    write_volume(commands, 1, 2)
    wait_frame(commands)
    wait_frame(commands)
    write_noise(commands, 0)
    write_volume(commands, 3, 5)
    wait_frame(commands)
    wait_frame(commands)
    wait_frame(commands)
    wait_frame(commands)
    commands.append(0x66)

    header = bytearray(0x40)
    header[0:4] = b"Vgm "
    struct.pack_into("<I", header, 0x04, len(header) + len(commands) - 4)
    struct.pack_into("<I", header, 0x08, 0x00000150)
    struct.pack_into("<I", header, 0x0C, 3579545)
    struct.pack_into("<I", header, 0x18, 735 * 9)
    struct.pack_into("<I", header, 0x34, 0x0C)

    output.write_bytes(header + commands)


if __name__ == "__main__":
    main()
