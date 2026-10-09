import { describe, expect, it } from "vitest";
import { normalizeHudBehavior, resolveHudComponentState } from "./hudBehavior.js";
describe("HUD element behavior", () => {
  it("persists named states, watch variables and event actions", () => {
    expect(normalizeHudBehavior({ states: { selected: { variable: "var_route", value: 2, text: "PORTO" } }, events: [{ trigger: "confirm", actions: [{ op: "set_variable", variable: "var_route", value: 3 }] }] })).toMatchObject({ states: { selected: { variable: "var_route", value: 2, text: "PORTO" } }, events: [{ trigger: "confirm", actions: [{ op: "set_variable", variable: "var_route", value: 3 }] }] });
  });
  it("resolves hidden before disabled before selected and leaves unbound elements normal", () => {
    const behavior = normalizeHudBehavior({states:{selected:{variable:"v",value:1},disabled:{variable:"v",value:1},hidden:{variable:"h",value:1}}});
    expect(resolveHudComponentState(behavior, {v:1,h:1})).toBe("hidden");
    expect(resolveHudComponentState(behavior, {v:1,h:0})).toBe("disabled");
    expect(resolveHudComponentState(undefined, {})).toBe("normal");
  });
  it("drops malformed triggers and unsafe actions", () => {
    expect(normalizeHudBehavior({events:[{trigger:"every_frame",actions:[]},{trigger:"confirm",actions:[{op:"bad",variable:"v",value:1}]}]}).events).toEqual([]);
  });
});
