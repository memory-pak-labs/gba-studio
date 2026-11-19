"""Verify ARM placement of buffers and state that should stay out of IWRAM."""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
cc = os.environ.get('GBA_TEST_CC', 'arm-none-eabi-gcc')
cxx = os.environ.get('GBA_TEST_CXX', 'arm-none-eabi-g++')
objdump = os.environ.get('GBA_TEST_OBJDUMP', 'arm-none-eabi-objdump')
cxx_objects = {
    'gbs_dialogue.cpp': ('choice_page_buffer', 'drawn_dialogue_regions'),
    'gbs_ui.cpp': ('menu_buffer',),
    'gbs_dma.cpp': ('vblank_queue',),
    'gbs_interrupt.cpp': ('internal_callbacks',),
    'profiler.cpp': ('s_subsystems',),
    'gbs_render.cpp': ('paged_affine',),
}
with tempfile.TemporaryDirectory(prefix='gbs-iwram-buffers-') as temp:
    targets = [(cxx, 'c++17', source, symbols) for source, symbols in cxx_objects.items()]
    targets.append((cc, 'c11', 'gbs_hw.c', (
        'paged_affine_staged', 'paged_affine_committed', 'paged_affine_resident'
    )))
    for compiler, standard, source, names in targets:
        output = Path(temp) / (source + '.o')
        subprocess.run([compiler, '-std=' + standard, '-mthumb', '-mcpu=arm7tdmi', '-Os',
                        '-Iengine/include', '-Iengine/src', '-c', str(root/'engine/src'/source), '-o', str(output)],
                       cwd=root, check=True)
        symbols = subprocess.check_output([objdump, '-t', '-C', str(output)], text=True)
        for name in names:
            line = next((line for line in symbols.splitlines() if re.search(r'\b' + name + r'$', line)), None)
            assert line and '.ewram_bss' in line, f'{name} should occupy EWRAM: {line}'
print('ARM text buffers, service queues, profiler and paged affine state occupy EWRAM: PASS')
