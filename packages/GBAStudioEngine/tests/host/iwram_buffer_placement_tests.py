"""Verify ARM object placement for non-interrupt menu/dialogue text buffers."""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
compiler = os.environ.get('GBA_TEST_CXX', 'arm-none-eabi-g++')
objdump = os.environ.get('GBA_TEST_OBJDUMP', 'arm-none-eabi-objdump')
with tempfile.TemporaryDirectory(prefix='gbs-iwram-buffers-') as temp:
    for source, symbol in [('gbs_dialogue.cpp', 'choice_page_buffer'), ('gbs_ui.cpp', 'menu_buffer')]:
        output = Path(temp) / (source + '.o')
        subprocess.run([compiler, '-std=c++17', '-mthumb', '-mcpu=arm7tdmi', '-Os',
                        '-Iengine/include', '-Iengine/src', '-c', str(root/'engine/src'/source), '-o', str(output)],
                       cwd=root, check=True)
        symbols = subprocess.check_output([objdump, '-t', '-C', str(output)], text=True)
        line = next((line for line in symbols.splitlines() if re.search(r'\b'+symbol+r'$', line)), None)
        assert line and '.ewram_bss' in line, f'{symbol} should occupy EWRAM: {line}'
print('ARM menu and dialogue text buffers occupy EWRAM: PASS')
