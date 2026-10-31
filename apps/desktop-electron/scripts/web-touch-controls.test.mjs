import assert from 'node:assert/strict';
import {test} from 'vitest';
import {createPointerInput,bindTouchControls} from '../static/WebPlayer/player/web-touch-controls.mjs';
import {gamepadKeys} from '../static/WebPlayer/player/mgba-direct-player.mjs';
test('blocked optional Gamepad permission never stops emulation',()=>{
 assert.equal(gamepadKeys({getGamepads(){throw new Error('SecurityError');}}),0);
 assert.equal(gamepadKeys({getGamepads:()=>[{buttons:[{pressed:true}],axes:[0,0]}]}),1);
});
test('simultaneous directional and action contacts combine and quick taps survive at least two frames',()=>{
 const p=createPointerInput();p.press(1,16);p.press(2,1);assert.equal(p.sample(0),17);p.release(2);assert.equal(p.sample(2),17);assert.equal(p.sample(2),16);p.release(1);p.sample(2);assert.equal(p.sample(0),0);
});
test('releasing one of two contacts on the same button does not release the other; cancel clears held input',()=>{
 const p=createPointerInput();p.press(1,1);p.press(2,1);p.sample(3);p.release(1);assert.equal(p.sample(3),1);p.clear();assert.equal(p.sample(0),0);
});
test('pointer cancellation, lost capture and blur release buttons; listeners are removed on cleanup',()=>{
 const listeners=new Map();const target=()=>({addEventListener:(n,f)=>listeners.set(n,[...(listeners.get(n)||[]),f]),removeEventListener:(n,f)=>listeners.set(n,(listeners.get(n)||[]).filter(x=>x!==f))});
 const button={...target(),dataset:{gbaKey:'1'},setPointerCapture(){},setAttribute(){}};const win=target(),p=createPointerInput();
 const cleanup=bindTouchControls({controls:{querySelectorAll:()=>[button]},input:p,windowObject:win});
 const fire=(name,data={})=>(listeners.get(name)||[]).forEach(f=>f({pointerId:1,preventDefault(){},...data}));
 fire('pointerdown');assert.equal(p.sample(3),1);fire('pointercancel');p.sample(3);assert.equal(p.sample(0),0);
 fire('pointerdown');fire('blur');assert.equal(p.sample(0),0);cleanup();assert.ok([...listeners.values()].every(x=>x.length===0));
});
