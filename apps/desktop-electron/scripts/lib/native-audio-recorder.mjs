import fs from 'node:fs';
import path from 'node:path';
/** Captures the emulator's emitted stereo PCM, without changing its audio path. */
export function createNativeAudioRecorder(core,output){
  let label=null,chunks=[];
  return {
    select(name){label=name;chunks=[];},
    frame(){if(!label)return;const frames=core._gba_audio_sample_count();if(frames>0)chunks.push(Buffer.from(core.HEAPU8.slice(core._gba_audio_samples(),core._gba_audio_samples()+frames*4)));},
    stop(){if(!label)return;const pcm=Buffer.concat(chunks),wav=Buffer.alloc(44+pcm.length),rate=core._gba_audio_sample_rate();wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);const file=path.join(output,label+'.wav');fs.writeFileSync(file,wav);label=null;chunks=[];return file;}
  };
}
