#!/usr/bin/env python3
"""Verify the shared glyph table, atlas order, normalization and pack layout."""
import json
import runpy
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
assetc = runpy.run_path(str(root / 'tools/assetc/assetc.py'))
generator = runpy.run_path(str(root / 'tools/assetc/generate_font_contract.py'))
helpers = runpy.run_path(str(root / 'tests/host/export_runtime_profile_tests.py'))
contract = json.loads((root / 'engine/include/gbs/dialogue_font.json').read_text())
assert generator['generate'](root) == (root / 'engine/include/gbs/text_font_data.h').read_text()
chars = [g['character'] for g in contract['glyphs']]
assert len(chars) == len(set(chars)) == 128
assert all(len(g['rows']) == 8 and all(0 <= row <= 255 for row in g['rows']) for g in contract['glyphs'])
for phrase in ['Ação, manutenção, Às três!', 'The lighthouse needs repair.', '¡Sí! ¿Qué pasó? Mañana, pingüino.']:
    assert set(phrase) <= set(chars)
assert assetc['normalize_dialogue_font_text']('Ac\u0327a\u0303o… “Sí” — ‘yes’') == 'Ação... "Sí" - \'yes\''
lines = assetc['dialogue_line_entries_from_json']([{'text': 'Ac\u0327a\u0303o', 'speaker': 'Jose\u0301', 'translations': [{'locale': 'es', 'text': '¡Si\u0301!'}]}], 'test')
assert lines[0]['text'] == 'Ação' and lines[0]['speaker'] == 'José'
assert lines[0]['translations'][0]['text'] == '¡Sí!'
# Give each consumed Unicode cell its own bit signature; verify every packed
# glyph, including lowercase accents and the final symbol, not just ASCII A.
with tempfile.TemporaryDirectory() as temporary:
    directory = Path(temporary)
    pixels = [0] * (128 * 112)
    for index, character in enumerate(chars):
        cell = ord(character) - 32
        for bit in range(7):
            pixels[((cell // 16) * 8 + 1) * 128 + (cell % 16) * 8 + bit] = (index >> bit) & 1
    helpers['write_indexed_png'](directory / 'font.png', 128, 112, [(0, 0, 0), (255, 255, 255)], pixels)
    font = assetc['dialogue_font_from_json']('font.png', directory, 'test')
    assert len(font['tiles']) == 128
    for index, tile in enumerate(font['tiles']):
        for bit in range(7):
            value = (tile[4 + bit // 2] >> ((bit % 2) * 4)) & 15
            assert value == (4 if index & (1 << bit) else 0), (index, bit)
# A packaged standalone assetc must resolve the same contract from include/gbs.
with tempfile.TemporaryDirectory() as temporary:
    directory = Path(temporary)
    (directory / 'tools').mkdir()
    (directory / 'include/gbs').mkdir(parents=True)
    (directory / 'tools/assetc').write_bytes((root / 'tools/assetc/assetc.py').read_bytes())
    (directory / 'include/gbs/dialogue_font.json').write_text(json.dumps(contract))
    packaged = runpy.run_path(str(directory / 'tools/assetc'))
    assert packaged['DIALOGUE_FONT_CODEPOINTS'] == assetc['DIALOGUE_FONT_CODEPOINTS']
print('dialogue font contract: 128 glyphs, 3 locales, atlas packing and packaged tool passed')
