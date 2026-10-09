#!/usr/bin/env python3
"""Repair the recorded three-color font without resizing or inferred erasure.

Produces a candidate only. The two non-ink colors are explicitly discarded;
all authored dark glyph pixels, including accents, remain at their coordinates.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
ASSETC = ROOT / "packages/GBAStudioEngine/tools/assetc/assetc.py"
sys.path.insert(0, str(ASSETC.parent))
spec = importlib.util.spec_from_file_location("font_assetc", ASSETC)
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
SOURCE_SHA256 = "152a3ceb41377a18ba916297adc6ed53f565cecf2d11ccfc7f7379d5ecbe5f95"


def write_png(path, width, height, pixels):
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    rows = b"".join(b"\x00" + bytes(v for rgb in pixels[y * width:(y + 1) * width] for v in (*rgb, 255)) for y in range(height))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def prepare(source, output):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA256:
        raise ValueError("Source differs from the recorded three-color precursor; inspect it before converting.")
    width, height, palette, indices = assetc.read_png(source, max_colors=3)
    assert (width, height) == (128, 112)
    output.parent.mkdir(parents=True, exist_ok=True)
    preserved = output.parent / "source-gba-variable-font.png"
    if not preserved.exists(): shutil.copyfile(source, preserved)
    ink = (16, 28, 48)
    background, foreground = (16, 28, 48), (244, 234, 190)
    pixels = [foreground if palette[i] == ink else background for i in indices]
    write_png(output, width, height, pixels)
    font = assetc.dialogue_font_from_json(str(output), ROOT, "candidate")
    report = {
        "status": "candidate", "source": str(source), "source_sha256": SOURCE_SHA256,
        "output": str(output), "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "size": [width, height], "glyph_count": len(font["tiles"]), "font_bytes": len(font["tiles"]) * 32,
        "locales": ["pt-BR", "en", "es"], "preserved_ink_pixels": sum(palette[i] == ink for i in indices),
        "transform": "Exact ink selection; discard background and width-marker color; recolor ink. No resizing.",
        "provenance": "Existing project font at dbf38e24; initial author not independently established."
    }
    output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output), ensure_ascii=False, indent=2))
