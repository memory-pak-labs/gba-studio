import { describe, expect, it } from "vitest";
import {
  normalizeSceneRouteTable,
  resolveSceneRoute,
  updateSceneRouteTableInProject
} from "./sceneRouteTables.js";

describe("scene route tables", () => {
  it("normalizes destinations for the current project contract", () => {
    const table = normalizeSceneRouteTable({
      id: "dock-routes",
      name: "Rotas do cais",
      variable: "routeFlags.activeRoute",
      routes: [{
        value: "1",
        scene: "penedos",
        x: "4.8",
        y: 23.9,
        direction: "right",
        fadeFrames: 9999
      }]
    });

    expect(table).toEqual({
      id: "dock-routes",
      name: "Rotas do cais",
      variable: "routeFlags.activeRoute",
      routes: [{
        value: 1,
        scene: "penedos",
        x: 4,
        y: 23,
        direction: "right",
        fadeFrames: 3600
      }],
      fallback: null
    });
  });

  it("resolves an exact variable value and then the fallback route", () => {
    const table = normalizeSceneRouteTable({
      id: "routes",
      variable: "route",
      routes: [{ value: 0, scene: "porto", x: 1, y: 2 }],
      fallback: { scene: "title", x: 3, y: 4, direction: "up" }
    });

    expect(resolveSceneRoute(table, 0)).toMatchObject({ scene: "porto", x: 1, y: 2 });
    expect(resolveSceneRoute(table, 7)).toMatchObject({ scene: "title", x: 3, y: 4, direction: "up" });
    expect(resolveSceneRoute(table, 7)?.fadeFrames).toBe(0);
  });

  it("updates only the selected table in project data", () => {
    const project = {
      sceneRouteTables: [
        { id: "first", variable: "route_a", routes: [{ value: 0, scene: "start" }] },
        { id: "second", variable: "route_b", routes: [{ value: 0, scene: "shop" }] }
      ],
      name: "Example"
    };

    const updated = updateSceneRouteTableInProject(project, "second", {
      name: "Rotas da loja",
      variable: "routeFlags.activeRoute"
    });

    expect(updated.name).toBe("Example");
    expect(updated.sceneRouteTables).toEqual([
      { id: "first", name: "first", variable: "route_a", routes: [{ value: 0, scene: "start", x: 0, y: 0, direction: "down", fadeFrames: 0 }], fallback: null },
      { id: "second", name: "Rotas da loja", variable: "routeFlags.activeRoute", routes: [{ value: 0, scene: "shop", x: 0, y: 0, direction: "down", fadeFrames: 0 }], fallback: null }
    ]);
  });
});
