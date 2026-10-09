#!/usr/bin/env python3
import sys
from pathlib import Path


def write_event(pattern, row, channel, period, sample=1, effect=0, parameter=0):
    offset = (row * 4 + channel) * 4
    pattern[offset] = ((sample & 0xF0) | ((period >> 8) & 0x0F))
    pattern[offset + 1] = period & 0xFF
    pattern[offset + 2] = ((sample & 0x0F) << 4) | (effect & 0x0F)
    pattern[offset + 3] = parameter & 0xFF


def main():
    output = Path(sys.argv[1])
    output.parent.mkdir(parents=True, exist_ok=True)

    data = bytearray()
    data.extend(b"GBS TEST MOD".ljust(20, b"\0"))
    for index in range(31):
        name = (b"lead" if index == 0 else b"").ljust(22, b"\0")
        data.extend(name)
        data.extend((4 if index == 0 else 0).to_bytes(2, "big"))
        data.append(4 if index == 0 else 0)
        data.append(48 if index == 0 else 0)
        data.extend((1 if index == 0 else 0).to_bytes(2, "big"))
        data.extend((2 if index == 0 else 0).to_bytes(2, "big"))

    data.append(5)
    data.append(0)
    data.extend(bytes([0, 1, 2, 3, 1]) + bytes(123))
    data.extend(b"M.K.")

    pattern = bytearray(64 * 4 * 4)
    write_event(pattern, 0, 0, 428)
    write_event(pattern, 0, 2, 339)
    write_event(pattern, 4, 1, 339, effect=0xC, parameter=24)
    write_event(pattern, 8, 0, 285, effect=0xF, parameter=6)
    write_event(pattern, 12, 0, 1712, effect=0x0, parameter=0x37)
    write_event(pattern, 16, 0, 1712, effect=0x1, parameter=8)
    write_event(pattern, 20, 0, 1712, effect=0x2, parameter=8)
    write_event(pattern, 24, 0, 1712, effect=0xA, parameter=0x03)
    write_event(pattern, 28, 0, 0, effect=0xF, parameter=75)
    write_event(pattern, 32, 0, 1712)
    write_event(pattern, 40, 0, 1356, effect=0x3, parameter=8)
    data.extend(pattern)

    pattern = bytearray(64 * 4 * 4)
    write_event(pattern, 0, 0, 1712, effect=0x4, parameter=0x27)
    write_event(pattern, 8, 1, 0, effect=0xD, parameter=0)
    data.extend(pattern)

    pattern = bytearray(64 * 4 * 4)
    write_event(pattern, 0, 0, 1712, effect=0x7, parameter=0x27)
    write_event(pattern, 8, 1, 0, effect=0xB, parameter=4)
    data.extend(pattern)

    pattern = bytearray(64 * 4 * 4)
    write_event(pattern, 0, 0, 1356)
    data.extend(pattern)

    data.extend(bytes([0, 32, 96, 127, 255, 224, 160, 128]))

    output.write_bytes(data)


if __name__ == "__main__":
    main()
