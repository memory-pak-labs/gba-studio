/** @vitest-environment happy-dom */
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogicNavigator, LogicValueInspector } from "./LogicNavigator";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace";
import { createBlankProjectData } from "../shared/newProject";
afterEach(cleanup);
function data(){ return {...createBlankProjectData({name:"Logic"}),variables:[{name:"score"},{name:"player.name",valueType:"text",maxLength:8}],constants:[{name:"limit",value:5}],events:[{id:"script",name:"reward",category:"common",steps:[{command:"add_variable score 1"}]}]}; }
describe("Logic navigator and inspector",()=>{
 it("groups all three kinds and selects the item without another workspace",()=>{
  const project=data(),onSelect=vi.fn();
  render(<LogicNavigator projectData={project} events={deriveEventsWorkspacePresentation(project)} selection={null} onSelect={onSelect}/>);
  expect(screen.getByText("Variáveis")).toBeTruthy();expect(screen.getByText("Scripts")).toBeTruthy();expect(screen.getByText("Constantes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:/reward/}));expect(onSelect).toHaveBeenCalledWith({kind:"script",name:"reward"});
  fireEvent.change(screen.getByRole("searchbox"),{target:{value:"limit"}});expect(screen.queryByRole("button",{name:/reward/})).toBeNull();expect(screen.getByRole("button",{name:/limit/})).toBeTruthy();
 });
 it("selects the created entry",async()=>{
  const onSelect=vi.fn();render(<LogicNavigator projectData={data()} events={null} selection={null} onSelect={onSelect} onCreateVariable={async()=>"new_value"}/>);
  fireEvent.click(screen.getByRole("button",{name:"Adicionar constante"}));await waitFor(()=>expect(onSelect).toHaveBeenCalledWith({kind:"constant",name:"new_value"}));
 });
 it("edits values and prevents deleting used variables",()=>{
  const update=vi.fn();const {rerender}=render(<LogicValueInspector projectData={data()} selection={{kind:"constant",name:"limit"}} onUpdate={update} onRemove={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText("Valor fixo"),{target:{value:"8"}});expect(update).toHaveBeenCalledWith("limit","constant",{value:8});
  rerender(<LogicValueInspector projectData={data()} selection={{kind:"variable",name:"score"}} onUpdate={update} onRemove={vi.fn()}/>);
  expect(screen.getByRole("button",{name:"Excluir variável"}).hasAttribute("disabled")).toBe(true);expect(screen.getByText("reward")).toBeTruthy();
 });
});
