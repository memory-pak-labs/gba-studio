"""Execute the actual v1.2 register sequence on a recording bus, not a cart."""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "engine/src/gbs_hw.c").read_text()
start = source.index("static uint8_t chisflash_rumble_prepared;")
end = source.index("void gbs_hw_set_backdrop", start)
driver = source[start:end].replace('__attribute__((section(".iwram.chisflash_rumble"), long_call))', '')
driver = re.sub(r'REG16\((0x[0-9A-Fa-f]+)\) = (0x[0-9A-Fa-f]+);', r'write_bus(\1, \2, 16);', driver)
driver = driver.replace('*(volatile uint8_t*)0x08001000 = 0;', 'write_bus(0x08001000, 0, 8);')
driver = driver.replace('*(volatile uint8_t*)0x08001000 = enabled ? 2 : 0;', 'write_bus(0x08001000, enabled ? 2 : 0, 8);')
program = r'''
#include <stdint.h>
#include <assert.h>
static uint16_t REG_IME=1;
static unsigned count;
static uint32_t addresses[16];
static unsigned values[16],widths[16];
static void write_bus(uint32_t address,unsigned value,unsigned width) {
 addresses[count]=address;values[count]=value;widths[count]=width;++count;
}
''' + driver + r'''
int main(void) {
 gbs_hw_chisflash_rumble_set(1);assert(count==0);
 assert(gbs_hw_chisflash_rumble_prepare());assert(count==7 && REG_IME==1);
 const uint32_t a[]={0x09FE0000,0x08000000,0x08020000,0x08040000,0x09E20000,0x09FC0000,0x08001000};
 const unsigned v[]={0xD200,0x1500,0xD200,0x1500,0xF1,0x1500,0};
 for(unsigned i=0;i<7;++i){assert(addresses[i]==a[i]);assert(values[i]==v[i]);assert(widths[i]==(i<6?16:8));}
 gbs_hw_chisflash_rumble_set(1);gbs_hw_chisflash_rumble_set(0);
 assert(count==9 && values[7]==2 && values[8]==0 && widths[7]==8 && widths[8]==8);
 REG_IME=0;count=0;assert(gbs_hw_chisflash_rumble_prepare());assert(REG_IME==0);
}
'''
with tempfile.TemporaryDirectory(prefix="gba-rumble-boundary-") as tmp:
    test = Path(tmp) / "test.c"
    test.write_text(program)
    binary = Path(tmp) / "test"
    subprocess.run([os.environ.get("CC", "clang"), "-std=c11", "-Wall", "-Wextra", "-Werror",
                    str(test), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("ChisFlash v1.2 recording bus sequence: PASS (not physical hardware)")
