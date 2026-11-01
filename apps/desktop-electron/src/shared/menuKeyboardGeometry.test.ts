import { expect, it } from "vitest";
import { normalizeMenuSceneConfig } from "./menuScene.js";
import { configureMenuKeyboard, menuTextInputLayout, moveMenuTextInput, resizeMenuTextInputField, useCustomMenuKeyboard } from "./menuTextInputLayout.js";
const input = () => normalizeMenuSceneConfig({ role:"name_input", textInput:{variableName:"player.name",maxLength:8,x:15,y:5,width:8,
  keyboard:{layout:"grid",controlLayout:"bottom_grid",surface:"background",x:11,y:8,width:16,height:10,allowLowercase:true}} }).textInput!;
it("resizes the field on the tile grid while preserving its text capacity and viewport bounds", () => {
  expect(resizeMenuTextInputField(input(), 17)).toMatchObject({width:10,maxLength:8,x:15});
  expect(resizeMenuTextInputField(input(), -100)).toMatchObject({width:8});
  expect(resizeMenuTextInputField(input(), 999)).toMatchObject({width:15});
});
it("authors rows, columns and gaps, moves the origin to fit, and survives normalization", () => {
  const value=configureMenuKeyboard(input(),{columns:6,rows:5,columnGap:1,rowGap:0});
  const layout=menuTextInputLayout(value)!;
  expect(layout.keys[6]).toMatchObject({label:"G",x:value.keyboard!.x*8,y:value.keyboard!.y*8+16});
  expect(layout.keys[1].x-layout.keys[0].x).toBe(24);
  expect(layout.keys[26].y-layout.keys[0].y).toBe(80);
  expect(layout.keyboardBounds.x+layout.keyboardBounds.width).toBeLessThanOrEqual(240);
  expect(layout.keyboardBounds.y+layout.keyboardBounds.height).toBeLessThanOrEqual(160);
  expect(normalizeMenuSceneConfig({role:"name_input",textInput:value}).textInput).toEqual(value);
});
it("moves letters and commands independently then moves the complete custom keyboard", () => {
  const custom=useCustomMenuKeyboard(input());
  expect(custom.keyboard!.geometry!.keys).toHaveLength(29);
  const moved=moveMenuTextInput(custom,"key:0",-8,-8);
  expect(menuTextInputLayout(moved)!.keys[0]).toMatchObject({x:80,y:56});
  expect(menuTextInputLayout(moved)!.keys[1]).toEqual(menuTextInputLayout(custom)!.keys[1]);
  const command=moveMenuTextInput(moved,"key:28",8,8);
  expect(menuTextInputLayout(command)!.keys[28]).toMatchObject({x:192,y:136,width:40});
  const group=moveMenuTextInput(command,"keyboard",-999,-999);
  expect(menuTextInputLayout(group)!.keyboardBounds).toMatchObject({x:0,y:0});
  expect(group.x).toBe(custom.x);
  expect(normalizeMenuSceneConfig({role:"name_input",textInput:group}).textInput).toEqual(group);
});

it("keeps a custom composition when the on-screen keyboard is hidden and shown again",()=>{
 const custom=useCustomMenuKeyboard(input());
 const hidden=normalizeMenuSceneConfig({role:"name_input",textInput:{...custom,keyboard:{...custom.keyboard,layout:"hidden"}}}).textInput!;
 expect(hidden.keyboard!.layout).toBe("hidden");expect(hidden.keyboard!.geometry).toEqual(custom.keyboard!.geometry);
 const shown=normalizeMenuSceneConfig({role:"name_input",textInput:{...hidden,keyboard:{...hidden.keyboard,layout:"grid"}}}).textInput!;
 expect(shown).toEqual(custom);
});
