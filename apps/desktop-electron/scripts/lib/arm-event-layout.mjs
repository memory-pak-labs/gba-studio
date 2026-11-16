import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The ROM's EventState can evolve independently of an old playtest. Compile
// offsetof for ARM; the resulting object is metadata, never loaded into the GBA.
export function armEventVariablesOffset(temporaryRoot, devkitarm = process.env.DEVKITARM ?? '/opt/devkitpro/devkitARM') {
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'owned-oracle-'));
  try {
    const cpp = path.join(directory, 'offset.cpp'), object = path.join(directory, 'offset.o');
    fs.writeFileSync(cpp, '#include <cstddef>\n#include "gbs/event.hpp"\nextern "C" { char oracle_variables[offsetof(gbs::EventState,variables)+1]; }');
    const include = fileURLToPath(new URL('../../../../packages/GBAStudioEngine/engine/include', import.meta.url));
    execFileSync(path.join(devkitarm, 'bin/arm-none-eabi-g++'), ['-std=c++17', '-mcpu=arm7tdmi', '-mthumb', '-I', include, '-c', cpp, '-o', object]);
    const symbols = execFileSync(path.join(devkitarm, 'bin/arm-none-eabi-nm'), ['-S', object], { encoding: 'utf8' });
    const match = symbols.match(/^[\da-f]+ ([\da-f]+) B oracle_variables$/m);
    if (!match) throw Error('ARM EventState layout is unavailable');
    return parseInt(match[1], 16) - 1;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
