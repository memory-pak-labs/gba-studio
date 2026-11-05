import {describe,it,expect} from 'vitest';
import {createPreviewRuntime,previewRuntimeSceneMenuItems} from './previewRuntime.js';
it('uses the sorted native inventory registry and item labels, independent of acquisition order',()=>{
 const state=createPreviewRuntime({scenas:[{id:'bag',name:'bag',sceneType:'menu',width:30,height:20,runtime:{type:'menu',config:{screenType:'menu',items:[{id:'tool',label:'Tool',binding:{source:'inventory',index:1,format:'count'}},{id:'equipment',label:'Equipment',binding:{source:'equipped',index:0,format:'number'},valueLabels:['NONE','CHART','TOOL']}]}}}],events:[{name:'items',steps:[{command:'add_item tool 1'},{command:'add_item chart 1'}]}],settings:{general:{startScene:'bag'}}});
 state.inventory={tool:2,chart:1};state.equippedItems={'0':'tool'};
 expect(previewRuntimeSceneMenuItems(state).map(i=>i.detail)).toEqual(['x2','TOOL']);
});
