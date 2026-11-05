import type { MenuTextInputConfig, MenuTextInputKeyboardGeometry } from "./menuScene.js";
export interface MenuTextInputKeyGeometry { index:number; label:string; x:number; y:number; width:number; height:number; glyphX:number; glyphY:number; }
export type MenuTextInputPart = "field" | "keyboard" | `key:${number}`;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const integer=(value:unknown,fallback:number)=>typeof value==="number"&&Number.isFinite(value)?Math.round(value):fallback;
export const DEFAULT_NAME_KEYBOARD_GEOMETRY: MenuTextInputKeyboardGeometry = {columns:8,rows:4,columnGap:0,rowGap:0};

export function menuTextInputLayout(input:MenuTextInputConfig) {
  const keyboard=input.keyboard;
  if(keyboard?.layout!=="grid"||keyboard.controlLayout!=="bottom_grid")return null;
  const geometry=keyboard.geometry??DEFAULT_NAME_KEYBOARD_GEOMETRY;
  const x=keyboard.x*8,y=keyboard.y*8;
  const keys:MenuTextInputKeyGeometry[]=Array.from({length:29},(_,index)=>{
    const control=index-26;
    const position=geometry.keys?.[index]??(index<26
      ?{x:index%geometry.columns*(2+geometry.columnGap),y:Math.floor(index/geometry.columns)*(2+geometry.rowGap)}
      :{x:control*6,y:geometry.rows*(2+geometry.rowGap)});
    const px=x+position.x*8,py=y+position.y*8;
    return {index,label:index<26?String.fromCharCode(65+index):["DEL","Aa","OK"][control],
      x:px,y:py,width:index<26?16:40,height:16,glyphX:px+(index<26?4:control===0?8:12),glyphY:py+4};
  });
  const left=Math.min(...keys.map(k=>k.x)),top=Math.min(...keys.map(k=>k.y));
  return {keys,nameField:{x:input.x*8,y:input.y*8,width:input.width*8,height:8},keyboardBounds:{x:left,y:top,
    width:Math.max(...keys.map(k=>k.x+k.width))-left,height:Math.max(...keys.map(k=>k.y+k.height))-top}};
}

export function moveMenuTextInput(input:MenuTextInputConfig,part:MenuTextInputPart,dx:number,dy:number):MenuTextInputConfig {
  const keyboard=input.keyboard,layout=menuTextInputLayout(input);
  const sx=Math.round(dx/8),sy=Math.round(dy/8);
  if(part==="field"){
    const x=clamp(input.x+sx,0,30-input.width),y=clamp(input.y+sy,0,19);
    return x===input.x&&y===input.y?input:{...input,x,y};
  }
  if(!keyboard||!layout)return input;
  if(part==="keyboard"){
    const bounds=layout.keyboardBounds;
    const stepX=clamp(sx,-bounds.x/8,(240-bounds.x-bounds.width)/8);
    const stepY=clamp(sy,-bounds.y/8,(160-bounds.y-bounds.height)/8);
    return stepX===0&&stepY===0?input:{...input,keyboard:{...keyboard,x:keyboard.x+stepX,y:keyboard.y+stepY}};
  }
  const index=Number(part.slice(4)),key=layout.keys[index],positions=keyboard.geometry?.keys;
  if(!key||!positions)return input;
  const stepX=clamp(sx,-key.x/8,(240-key.x-key.width)/8),stepY=clamp(sy,-key.y/8,(160-key.y-key.height)/8);
  if(!stepX&&!stepY)return input;
  return rebaseCustomKeyboard({...input,keyboard:{...keyboard,geometry:{...keyboard.geometry!,keys:positions.map((p,i)=>i===index?{x:p.x+stepX,y:p.y+stepY}:p)}}});
}

export function resizeMenuTextInputField(input:MenuTextInputConfig,dx:number):MenuTextInputConfig {
  const width=clamp(input.width+Math.round(dx/8),input.maxLength,30-input.x);
  return width===input.width?input:{...input,width};
}

export function configureMenuKeyboard(input:MenuTextInputConfig,patch:Partial<MenuTextInputKeyboardGeometry>):MenuTextInputConfig {
  const keyboard=input.keyboard;if(!keyboard)return input;
  const source={...DEFAULT_NAME_KEYBOARD_GEOMETRY,...keyboard.geometry,...patch};
  const columns=clamp(integer(source.columns,8),4,13),rows=clamp(integer(source.rows,4),Math.ceil(26/columns),9);
  const columnGap=clamp(integer(source.columnGap,0),0,Math.min(4,Math.floor((30-columns*2)/(columns-1))));
  const rowGap=clamp(integer(source.rowGap,0),0,Math.min(4,Math.floor((18-rows*2)/rows)));
  const geometry:MenuTextInputKeyboardGeometry={columns,rows,columnGap,rowGap};
  if(Array.isArray(source.keys)&&source.keys.length===29)geometry.keys=source.keys.map((p,index)=>({
    x:clamp(integer(p?.x,0),-keyboard.x,30-keyboard.x-(index<26?2:5)),y:clamp(integer(p?.y,0),-keyboard.y,18-keyboard.y)
  }));
  const next={...input,keyboard:{...keyboard,geometry}};
  // Changing grid dimensions may require moving its origin into the viewport.
  const fit=rebaseCustomKeyboard(moveMenuTextInput(next,"keyboard",0,0));
  const bounds=menuTextInputLayout(fit)!.keyboardBounds;
  return {...fit,keyboard:{...fit.keyboard!,width:bounds.width/8,height:bounds.height/8}};
}

export function useCustomMenuKeyboard(input:MenuTextInputConfig):MenuTextInputConfig {
  const layout=menuTextInputLayout(input),keyboard=input.keyboard;if(!layout||!keyboard)return input;
  return configureMenuKeyboard(input,{keys:layout.keys.map(k=>({x:k.x/8-keyboard.x,y:k.y/8-keyboard.y}))});
}

function rebaseCustomKeyboard(input:MenuTextInputConfig):MenuTextInputConfig {
  const keyboard=input.keyboard,layout=menuTextInputLayout(input),keys=keyboard?.geometry?.keys;
  if(!keyboard||!layout||!keys)return input;
  const x=layout.keyboardBounds.x/8,y=layout.keyboardBounds.y/8;
  return {...input,keyboard:{...keyboard,x,y,width:layout.keyboardBounds.width/8,height:layout.keyboardBounds.height/8,
    geometry:{...keyboard.geometry!,keys:keys.map(p=>({x:p.x+keyboard.x-x,y:p.y+keyboard.y-y}))}}};
}
