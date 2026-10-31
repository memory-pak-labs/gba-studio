import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Original coded radio call, synthesized without third-party recordings. */
export function generateRadioPCM(sampleRate = 15768) {
  const duration = 4, samples = Math.round(duration * sampleRate);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(sampleRate,24); wav.writeUInt32LE(sampleRate * 2,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(samples * 2,40);
  // Call sign L U M E in Morse, with soft attacks and a short receiver tail.
  const pulses=[]; let cursor=.42;
  for (const letter of ['.-..','..-','--','.']) {
    for (const symbol of letter) { const length = symbol === '.' ? .07 : .21; pulses.push([cursor,cursor+length]); cursor += length + .07; }
    cursor += .14;
  }
  let seed=0x4c554d45, previous=0;
  for(let i=0;i<samples;i++) {
    const t=i/sampleRate, envelope=Math.min(1,t/.035,(duration-t)/.12);
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const white=seed/0xffffffff*2-1, noise=(white-previous)*.027; previous=white;
    const pulse=pulses.find(([a,b])=>t>=a&&t<b);
    const tone=pulse?Math.sin(2*Math.PI*880*t)*.46*Math.min(1,(t-pulse[0])/.008,(pulse[1]-t)/.008):0;
    const tuning=t<.3?Math.sin(2*Math.PI*(520*t+780*t*t))*.12*(1-t/.3):0;
    wav.writeInt16LE(Math.round(Math.max(-.98,Math.min(.98,(noise+tone+tuning)*envelope))*32767),44+i*2);
  }
  return wav;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const target=path.resolve(process.argv[2]); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,generateRadioPCM());
}
