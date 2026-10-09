#!/usr/bin/env python3
import math
import struct
import wave
from pathlib import Path


def write_mono_u8(path: Path) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(8000)
        frames = bytes([128, 160, 96, 128])
        wav.writeframes(frames)


def write_stereo_s16(path: Path) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        frames = []
        for index in range(8):
            sample = int(math.sin(index / 8 * math.pi * 2) * 12000)
            frames.append(struct.pack("<hh", sample, -sample // 2))
        wav.writeframes(b"".join(frames))


def main() -> int:
    output_dir = Path(__import__("sys").argv[1])
    output_dir.mkdir(parents=True, exist_ok=True)
    write_mono_u8(output_dir / "mono_u8.wav")
    write_stereo_s16(output_dir / "stereo_s16.wav")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
