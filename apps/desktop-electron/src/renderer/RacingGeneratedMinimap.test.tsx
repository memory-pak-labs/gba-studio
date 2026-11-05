/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RacingGeneratedMinimap } from "./RacingGeneratedMinimap";

afterEach(cleanup);

it("shows the authored route and starting markers in the runtime minimap area", () => {
  const track = {
    cameraDeadZoneX: 0, cameraDeadZoneY: 0, finishAtZero: true,
    pathPoints: [{ x: 0, y: 0 }, { x: 511, y: 0 }, { x: 511, y: 511 }, { x: 0, y: 511 }],
    checkpoints: [{ id: "finish", x: 0, y: 0, width: 8, height: 8 }, { id: "next", x: 511, y: 0, width: 8, height: 8 }]
  };
  render(<RacingGeneratedMinimap label="Minimapa" width={512} height={512} track={track}
    player={{ x: 240, y: 112 }} rivalCount={2} />);
  const minimap = screen.getByRole("img", { name: "Minimapa" });
  expect(minimap).toHaveAttribute("viewBox", "0 0 64 40");
  expect(minimap.querySelector("polygon")).toHaveAttribute("points", "5,5 58,5 58,34 5,34");
  const markers = Array.from(minimap.querySelectorAll("rect"));
  expect(markers[2]).toHaveAttribute("x", "57");
  expect(markers[2]).toHaveAttribute("y", "4");
  expect(markers[3]).toHaveAttribute("x", "5");
  expect(markers[3]).toHaveAttribute("y", "6");
  expect(markers[4]).toHaveAttribute("x", "5");
  expect(markers[4]).toHaveAttribute("y", "8");
  expect(markers[5]).toHaveAttribute("x", "29");
  expect(markers[5]).toHaveAttribute("y", "10");
});
