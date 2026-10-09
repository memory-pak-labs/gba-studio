import { test } from "vitest";
import assert from "node:assert/strict";
import { fitProjectSpriteFrames } from "./sprite-canvas-audit.mjs";

const project = (tiles, width = 64, height = 64) => ({
  animations: [{ id: "idle", spriteSheet: "hero.png", frameWidth: width, frameHeight: height,
    frameCount: 1, originX: 0, originY: 0,
    frames: [{ width, height, originX: 0, originY: 0, tiles }] }],
  actors: [{ id: "actor", x: 12 }]
});
const tile = (fields = {}) => ({ x: 0, y: 0, sliceX: 0, sliceY: 0,
  tileWidth: 64, tileHeight: 64, sourceSheet: "hero.png", ...fields });

test("fits a 64px tile and preserves its exported offset from the origin", () => {
  const before = project([tile()]);
  const after = fitProjectSpriteFrames(before);
  const frame = after.animations[0].frames[0];
  assert.equal(frame.tiles[0].x, -24);
  assert.equal(frame.originX, -24);
  assert.equal(frame.tiles[0].x - frame.originX, 0);
  assert.deepEqual(after.actors, before.actors);
  assert.equal(before.animations[0].frames[0].tiles[0].x, 0);
  assert.deepEqual(fitProjectSpriteFrames(after), after);
});

test("translates multi-part compositions together without collapsing them", () => {
  const after = fitProjectSpriteFrames(project([
    tile({ tileWidth: 32 }), tile({ x: 32, sliceX: 32, tileWidth: 32 })
  ]));
  assert.deepEqual(after.animations[0].frames[0].tiles.map(t => t.x), [-24, 8]);
});

test("keeps an already contained authored frame intact", () => {
  const before = project([tile({ x: -8, tileWidth: 32, tileHeight: 32 })], 32, 32);
  assert.deepEqual(fitProjectSpriteFrames(before), before);
});

test("corrects a complete source composition stored with top-down Y", () => {
  const after = fitProjectSpriteFrames(project([
    tile({ y: 0, tileHeight: 64 }),
    tile({ y: 64, sliceY: 64, tileHeight: 32 }),
    tile({ y: 96, sliceY: 96, tileHeight: 16 })
  ], 64, 112));
  assert.deepEqual(after.animations[0].frames[0].tiles.map(t => t.y), [48, 16, 0]);
});

test("does not rearrange custom or overlapping parts based on source slices", () => {
  const before = project([tile({ tileHeight: 32 }), tile({ y: 8, sliceY: 32, tileHeight: 32 })]);
  const after = fitProjectSpriteFrames(before);
  assert.deepEqual(after.animations[0].frames[0].tiles.map(t => t.y), [0, 8]);
});

test("materializes implicit frames with the same geometry used by export", () => {
  const before = project([], 48, 48);
  delete before.animations[0].frames;
  const after = fitProjectSpriteFrames(before);
  const frame = after.animations[0].frames[0];
  assert.equal(frame.tiles[0].x, -16);
  assert.equal(frame.tiles[0].y, 16);
  assert.equal(frame.tiles.length, 4);
  assert.equal(frame.originX, 0);
});
