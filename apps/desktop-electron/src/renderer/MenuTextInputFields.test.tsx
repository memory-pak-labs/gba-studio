/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { normalizeMenuSceneConfig } from "../shared/menuScene";
import { MenuTextInputFields } from "./MenuTextInputFields";
import type { MenuTextInputPart } from "../shared/menuTextInputLayout";
afterEach(cleanup);
function Harness({change}:{change:(value:unknown)=>void}){
 const [value,setValue]=useState(normalizeMenuSceneConfig({role:"name_input",textInput:{variableName:"player.name",maxLength:8,width:8,x:15,y:5,keyboard:{layout:"grid",controlLayout:"bottom_grid",surface:"background",x:11,y:8,width:16,height:10,allowLowercase:true}}}).textInput!);
 const [selected,setSelected]=useState<MenuTextInputPart|null>(null);
 return <MenuTextInputFields value={value} selectedPart={selected} onSelectPart={setSelected} onChange={next=>{change(next);setValue(next);}}/>;
}
it("configures a grid and keeps focus/blur out of project history",()=>{
 const change=vi.fn();render(<Harness change={change}/>);
 fireEvent.blur(screen.getByRole("spinbutton",{name:"Colunas do teclado"}));expect(change).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole("spinbutton",{name:"Colunas do teclado"}),{target:{value:"6"}});
 expect(change.mock.lastCall![0].keyboard.geometry).toMatchObject({columns:6,rows:5});
 fireEvent.change(screen.getByRole("spinbutton",{name:"Espaço horizontal"}),{target:{value:"8"}});
 expect(change.mock.lastCall![0].keyboard.geometry).toMatchObject({columnGap:1});
});
it("creates 29 custom key positions and edits a selected native command",()=>{
 const change=vi.fn();render(<Harness change={change}/>);
 fireEvent.change(screen.getByRole("combobox",{name:"Composição do teclado"}),{target:{value:"custom"}});
 expect(change.mock.lastCall![0].keyboard.geometry.keys).toHaveLength(29);
 fireEvent.change(screen.getByRole("combobox",{name:"Tecla selecionada"}),{target:{value:"28"}});
 fireEvent.change(screen.getByRole("spinbutton",{name:"Tecla X"}),{target:{value:"24"}});
 expect(change.mock.lastCall![0].keyboard.geometry.keys[28].x).toBe(13);
 expect(change.mock.lastCall![0].keyboard.geometry.keys[0]).toEqual({x:0,y:0});
});
