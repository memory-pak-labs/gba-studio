import {expect,it} from 'vitest';
import {buildAssetcAudioPackGeneration} from './engineProjectExport.js';
import type {GBAProjectData} from './projectFile.js';
it('references the actual normalized copy of an imported WAV with punctuation in its filename',()=>{
  const pack=buildAssetcAudioPackGeneration({assets:[{id:'radio',name:'radio-lume-pcm.wav',kind:'SFX',metadata:{source:'Assets/audio/radio-lume-pcm.wav'}}],audioItems:[{id:'radio-audio',name:'radio-lume-pcm.wav',kind:'SFX',format:'WAV',exportID:'radio_lume_pcm'}]} as unknown as GBAProjectData)!;
  expect('assets/audio/'+pack.document.pcm[0].wav).toBe(pack.sourceCopies[0].output);
});
