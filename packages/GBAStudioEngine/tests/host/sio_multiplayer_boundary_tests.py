"""Compile the actual MMIO lifecycle against registers owned by this test."""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "engine/src/gbs_hw.c").read_text()
start = source.index('#include "sio_multiplayer_async.h"')
end = source.index('int gbs_hw_sio_multiplayer_init(void)', start)
boundary = source[start:end].replace(
    '((volatile GbsSioMultiplayerRegisters*)0x04000120)', '(&registers)')
program = r'''
#include <assert.h>
#include "sio_multiplayer_async.h"
static uint16_t REG_IME, REG_IE, REG_IF, REG_RCNT, REG_SIOCNT;
static GbsSioMultiplayerRegisters registers;
''' + boundary + r'''
int main(void) {
    REG_IME = 1; REG_IE = 0x12;
    assert(!gbs_hw_sio_multiplayer_async_open(4));
    assert(REG_IME == 1 && REG_IE == 0x12);
    assert(gbs_hw_sio_multiplayer_async_open(3));
    assert(REG_IME == 1 && REG_IE == 0x92 && REG_IF == 0x80);
    REG_IF = 0; // MMIO IF is write-one-to-clear on the device.
    registers.control = 0x600E;
    assert(gbs_hw_sio_multiplayer_async_begin(0x8888));
    uint16_t data[4] = {0}; uint8_t id = 0, mask = 0;
    assert(!gbs_hw_sio_multiplayer_async_poll(data, &id, &mask));
    registers.control = 0x601E;
    registers.multi[0] = 0x1111; registers.multi[1] = 0x8888;
    registers.multi[2] = registers.multi[3] = 0xFFFF;
    capture_multiplayer_async();
    assert(gbs_hw_sio_multiplayer_async_poll(data, &id, &mask) == 1);
    assert(id == 1 && mask == 3 && data[0] == 0x1111);
    assert(!gbs_hw_sio_multiplayer_async_poll(data, &id, &mask));
    // A serial completion between main-loop poll and begin must be retained.
    REG_IME = 0;
    registers.multi[0] = 0xD001;
    REG_IF = 0x80;
    assert(gbs_hw_sio_multiplayer_async_poll(data, &id, &mask) == 2);
    assert(data[0] == 0xD001 && REG_IME == 0 && REG_IE == 0x92);
    REG_IF = 0;
    // Recovery retains original ownership, unrelated IE bits and caller IME.
    REG_IME = 0; REG_IE |= 4;
    assert(gbs_hw_sio_multiplayer_async_open(2));
    assert(REG_IME == 0);
    gbs_hw_sio_multiplayer_async_close();
    assert(REG_IME == 0 && REG_IE == 0x16);
    assert(gbs_hw_sio_multiplayer_async_poll(data, &id, &mask) == -1);
    REG_IME = 1; REG_IE = 0x81;
    assert(gbs_hw_sio_multiplayer_async_open(0));
    gbs_hw_sio_multiplayer_async_close();
    assert(REG_IE == 0x81 && REG_IME == 1);
}
'''
with tempfile.TemporaryDirectory(prefix="gba-sio-boundary-") as tmp:
    test = Path(tmp) / "test.c"
    test.write_text(program)
    binary = Path(tmp) / "test"
    subprocess.run([os.environ.get("CC", "clang"), "-std=c11", "-Wall", "-Wextra",
                    "-Werror", "-I" + str(root / "engine/src"), str(test), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("SIO asynchronous MMIO lifecycle: PASS")
