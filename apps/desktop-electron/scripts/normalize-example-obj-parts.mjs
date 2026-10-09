const native = new Set(['8x8','16x16','32x32','64x64','16x8','32x8','32x16','64x32','8x16','8x32','16x32','32x64']);
// Same minimum-cost slicing order as the exporter's backing frame layout.
function layout(width,height) {
  const w=width/8,h=height/8,c=Array.from({length:w+1},()=>Array(h+1).fill(Infinity));
  const choice=Array.from({length:w+1},()=>Array(h+1));
  for(let x=0;x<=w;x++)c[x][0]=0;
  for(let y=0;y<=h;y++)c[0][y]=0;
  for(let x=1;x<=w;x++)for(let y=1;y<=h;y++){
    if(native.has(`${x*8}x${y*8}`)){c[x][y]=1;choice[x][y]=['native'];continue;}
    for(let s=x-1;s>=1;s--)if(c[s][y]+c[x-s][y]<c[x][y]){c[x][y]=c[s][y]+c[x-s][y];choice[x][y]=['x',s];}
    for(let s=y-1;s>=1;s--)if(c[x][s]+c[x][y-s]<c[x][y]){c[x][y]=c[x][s]+c[x][y-s];choice[x][y]=['y',s];}
  }
  const parts=[];
  const add=(w,h,x,y)=>{const [axis,s]=choice[w][h];if(axis==='native')parts.push({x:x*8,y:y*8,w:w*8,h:h*8});
    else if(axis==='x'){add(s,h,x,y);add(w-s,h,x+s,y);}else{add(w,s,x,y);add(w,h-s,x,y+s);}};
  add(w,h,0,0);return parts;
}
export function normalizeExampleObjParts(project) {
  const next=structuredClone(project);
  for(const a of next.animations??[])for(const f of a.frames??[]) {
    if(f.tiles?.length!==1)continue;
    const t=f.tiles[0],w=t.tileWidth,h=t.tileHeight;
    // Only exact full-frame, unflipped rectangles. Leave custom compositions alone.
    if(w!==a.frameWidth||h!==a.frameHeight||t.flipX||t.flipY||native.has(`${w}x${h}`)||!w||!h||w%8||h%8)continue;
    f.tiles=layout(w,h).map((p,i)=>({...t,id:`${t.id??f.id??a.id}-native-${i}`,
      x:(t.x??0)+p.x,y:(t.y??0)+h-p.y-p.h,
      sliceX:(t.sliceX??0)+p.x,sliceY:(t.sliceY??0)+p.y,tileWidth:p.w,tileHeight:p.h,
      ...(t.width!==undefined?{width:p.w}:{}),...(t.height!==undefined?{height:p.h}:{})}));
  }
  return next;
}
