#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Uses upstream native cores and SIO lockstep. No register/receipt injection.
const [packArg,sourceArg,buildArg,outputArg]=process.argv.slice(2);
assert.ok(outputArg,'usage: verify-multiplayer-linked-rom.mjs ENGINE_PACK MGBA_SOURCE MGBA_NATIVE_BUILD EVIDENCE');
const pack=path.resolve(packArg),source=path.resolve(sourceArg),build=path.resolve(buildArg),output=path.resolve(outputArg);
const fixtures=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures');
const run=(bin,args,options={})=>execFileSync(bin,args,{encoding:'utf8',maxBuffer:16*1024*1024,timeout:60000,...options});
const revision=run('git',['-C',source,'rev-parse','HEAD']).trim();
assert.equal(revision,'26b7884bc25a5933960f3cdcd98bac1ae14d42e2','requires mGBA 0.10.5');
assert.equal(run('git',['-C',source,'status','--porcelain','--untracked-files=no']).trim(),'','requires unmodified mGBA sources');
fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gba-linked-replay-'));
const report={passed:false,revision,scope:'native headless mGBA cores linked by upstream SIO; last peer disconnects/rejoins the same slot; no physical hardware or GUI claim',cases:[]};
try {
  const runner=path.join(temporary,'runner');
  run(process.env.CC??'cc',['-O2','-DNDEBUG','-D_GNU_SOURCE','-I'+path.join(source,'include'),'-I'+path.join(build,'include'),path.join(fixtures,'multiplayer-linked-runner.c'),path.join(build,'libmgba.a'),'-lz','-lpthread','-lm',...(process.platform==='darwin'?['-framework','CoreFoundation']:[]),'-o',runner]);
  for(const players of [2,4])for(const baud of [0,1,2,3]) {
    const project=path.join(temporary,`project-${players}-${baud}`);fs.mkdirSync(project);
    fs.writeFileSync(path.join(project,'main.cpp'),`#define QA_PLAYERS ${players}\n#define QA_BAUD ${baud}\n`+fs.readFileSync(path.join(fixtures,'multiplayer-linked-rom.cpp'),'utf8'));
    fs.writeFileSync(path.join(project,'gbastudio_project.json'),JSON.stringify({schema:1,backend:'gbastudio_engine',kind:'topdown',entry:'main.cpp',build:{target:'linked',make_target:'all'},requires:{features:['link.link_queued_messages','link.link_queued_events']}}));
    fs.writeFileSync(path.join(output,`build-${players}-${baud}.log`),run(process.env.PYTHON??'python3',[path.join(pack,'tools/gbsbuild'),'--engine-pack',pack,'--project-dir',project]));
    const rom=path.join(project,'build/linked.gba'),elf=rom.replace(/\.gba$/,'.elf');
    const nm=path.join(process.env.DEVKITARM??'/opt/devkitpro/devkitARM','bin/arm-none-eabi-nm');
    const address=run(nm,[elf]).split('\n').find(line=>line.endsWith(' link_witness'))?.split(' ')[0];assert.ok(address);
    for(const fault of [0,1])for(const schedule of baud===3?[0,1]:[0]) {
      const name=`${players}-${baud}-${fault}-${schedule}`;
      const item={name,players,baud:[9600,38400,57600,115200][baud],disconnect:Boolean(fault),schedule,romSha256:createHash('sha256').update(fs.readFileSync(rom)).digest('hex'),peers:[],passed:false};
      report.cases.push(item);
      let log;
      try {log=run(runner,[String(players),rom,address,'4096',String(fault),String(schedule)]);}
      catch(error){fs.writeFileSync(path.join(output,`${name}.log`),String(error.stdout??'')+String(error.stderr??''));throw error;}
      fs.writeFileSync(path.join(output,`${name}.log`),log);
      for(const line of log.trim().split('\n')) {
        const match=/^peer (\d+) frame (\d+) regs [0-9a-f]+ [0-9a-f]+ witness (.+)$/.exec(line);assert.ok(match,line);
        const id=Number(match[1]),w=match[3].split(' ').map(Number);assert.equal(w.length,32);
        item.peers.push({id,videoFrames:Number(match[2]),gameFrames:w[1],errors:w[2],enqueued:w[3],fullRejections:w[4],received:w[5],pending:w[6],recoveries:w[7],receivedByPeer:w.slice(10,14),crcRejections:w[14],acked:w[26],completedAtFrame:w[27],meanAckFrames:w[24]/64,maxAckFrames:w[25],broadcastsPerEmulatedSecond:64*59.72750057/(w[29]-w[28]),initialIE:w[30],closedIE:w[31]});
        assert.equal(w[0],0x4C494E4B);assert.equal(w[2],0);assert.equal(w[3],64);assert.ok(w[4]>0);
        assert.equal(w[5],(players-1)*64);assert.equal(w[6],0);assert.equal(w[8],id);assert.equal(w[9],0);
        for(let other=0;other<4;++other)assert.equal(w[10+other],other<players&&other!==id?64:0);
        assert.equal(w[26],64);assert.ok(w[27]>0);assert.equal(w[30],w[31]);
        if(fault&&id===0)assert.ok(w[7]>0,'parent recovered during disconnection');
      }
      assert.equal(item.peers.length,players);item.passed=true;
    }
    fs.rmSync(project,{recursive:true,force:true});
  }
  report.passed=true;
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
  report.temporaryRemoved=!fs.existsSync(temporary);
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(`PASS: ${report.cases.length} native linked-core scenarios`);
