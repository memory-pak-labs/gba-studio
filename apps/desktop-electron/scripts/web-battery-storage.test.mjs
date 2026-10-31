import assert from 'node:assert/strict';
import {test} from 'vitest';
import {encodeBattery,decodeBattery,createBatteryPersistence,createWebBatteryStore,createDesktopBatteryStore} from '../static/WebPlayer/player/web-battery-storage.mjs';
const hash='a'.repeat(64), other='b'.repeat(64);
test('desktop battery bridge restores and durably writes the game state across player instances',async()=>{
 let saved=null,bytes=new Uint8Array([1,2]);
 const bridge={identity:()=>hash,read:()=>saved,write:value=>{saved=value;}};
 let p=createBatteryPersistence({romSha256:hash,store:createDesktopBatteryStore(bridge),copy:()=>bytes.slice(),restore:value=>{bytes=value;return true;}});
 await p.initialize();bytes[0]=42;await p.flush();p.destroy();
 bytes=new Uint8Array([0,0]);
 p=createBatteryPersistence({romSha256:hash,store:createDesktopBatteryStore(bridge),copy:()=>bytes.slice(),restore:value=>{bytes=value;return true;}});
 await p.initialize();assert.deepEqual(bytes,new Uint8Array([42,2]));p.destroy();
});
test('desktop writes are committed before a player is immediately closed',async()=>{
 let saved=null,bytes=new Uint8Array([1]);
 const bridge={read:()=>null,write:value=>{saved=value;}};
 const p=createBatteryPersistence({romSha256:hash,store:createDesktopBatteryStore(bridge),copy:()=>bytes.slice(),restore:()=>true});
 await p.initialize();bytes[0]=9;const completion=p.flush();p.destroy();
 assert.deepEqual(decodeBattery(saved,hash),new Uint8Array([9]));await completion;
});
test('battery records preserve bytes and reject another ROM, corrupt base64 and oversized payloads',()=>{
 const bytes=new Uint8Array([1,2,3,255]);const record=encodeBattery(bytes,hash);
 assert.deepEqual(decodeBattery(record,hash),bytes);assert.throws(()=>decodeBattery(record,other));
 assert.throws(()=>decodeBattery('{broken',hash));assert.throws(()=>decodeBattery(JSON.stringify({schema:1,romSha256:hash,data:'?bad'}),hash));
 assert.throws(()=>encodeBattery(new Uint8Array(131073),hash));
});
test('restores battery before running and only persists actual changes, including later updates during an outstanding write',async()=>{
 let bytes=new Uint8Array([4,5]),restored,writes=[],unblock;
 const store={read:()=>encodeBattery(bytes,hash),write:async value=>{writes.push(value);if(writes.length===1)await new Promise(r=>unblock=r);}};
 const p=createBatteryPersistence({romSha256:hash,store,copy:()=>bytes.slice(),restore:b=>{restored=b;return true;}});
 await p.initialize();assert.deepEqual(restored,bytes);await p.flush();assert.equal(writes.length,0);
 bytes[0]=7;const pending=p.flush();await Promise.resolve();bytes[0]=8;void p.flush();unblock();await pending;
 assert.equal(writes.length,2);assert.deepEqual(decodeBattery(writes[1],hash),bytes);p.destroy();
});
test('an unreadable existing save is preserved and storage failures never report success',async()=>{
 let writes=0,status=[];const p=createBatteryPersistence({romSha256:hash,store:{read:()=>'{broken',write:()=>writes++},copy:()=>new Uint8Array([1]),restore:()=>true,onStatus:s=>status.push(s)});
 await p.initialize();await p.flush();assert.equal(writes,0);assert.equal(status.at(-1),'unavailable');p.destroy();
 const bytes=new Uint8Array([1]);const q=createBatteryPersistence({romSha256:hash,store:{read:()=>null,write:()=>{throw new Error('quota');}},copy:()=>bytes.slice(),restore:()=>true,onStatus:s=>status.push(s)});
 await q.initialize();bytes[0]=2;await q.flush();assert.equal(status.at(-1),'unavailable');q.destroy();
});
test('opaque iframe storage requests require a response from the exact parent and a matching request ID',async()=>{
 const listeners=new Set(),messages=[];const parent={postMessage:(data)=>messages.push(data)};
 const win={parent, get localStorage(){throw new Error('opaque origin');},addEventListener:(n,f)=>listeners.add(f),removeEventListener:(n,f)=>listeners.delete(f),setTimeout,clearTimeout};
 const store=createWebBatteryStore({windowObject:win,romSha256:hash,timeoutMs:100});const pending=store.read();
 const request=messages[0];assert.equal(request.operation,'read');
 for(const f of listeners)f({source:{},data:{...request,type:'gbastudio:battery:response',ok:true,value:'foreign'}});
 for(const f of listeners)f({source:parent,data:{...request,type:'gbastudio:battery:response',requestId:'wrong',ok:true,value:'wrong'}});
 for(const f of listeners)f({source:parent,data:{type:'gbastudio:battery:response',requestId:request.requestId,ok:true,value:null}});
 assert.equal(await pending,null);store.destroy();assert.equal(listeners.size,0);
});
