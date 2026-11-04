import { expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent, tickPreviewRuntime } from "./previewRuntime.js";
it("simulates nonblocking per-instance scaling across waits and animation changes",()=>{
  const data=createBlankProjectData({name:"Scale"});
  data.events=[{name:"scale",category:"Ator",steps:[{command:"animate_actor_scale Player 150 75 4"},{command:"wait 4"}]}];
  const initial=createPreviewRuntime(data);
  const started=runPreviewRuntimeEvent(initial,"scale");
  const key='actor:'+started.player!.id;
  expect(started.nativeEvents.scales[key]).toMatchObject({x256:256,y256:256,duration:4});
  const half=tickPreviewRuntime(started,1000/60*2);
  expect(half.nativeEvents.scales[key]).toMatchObject({x256:320,y256:224});
  expect(tickPreviewRuntime(half,1000/60*2).nativeEvents.scales[key]).toMatchObject({x256:384,y256:192});
  expect(initial.nativeEvents.scales).toEqual({});
});
