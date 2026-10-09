import type { PlatformerSceneConfig } from "./sceneTypeProfiles.js";

const TILE_SIZE = 8;
const DASH_THROUGH_WALLS = "actors_triggers_walls";

export interface PlatformerPreviewInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
  glideHeld: boolean;
}

export interface PlatformerPreviewMap {
  width: number;
  height: number;
  collisionTypes: string[];
}

export interface PlatformerPreviewBody {
  x: number;
  y: number;
  width: number;
  height: number;
  collisionOffsetX: number;
  collisionOffsetY: number;
  velocityX: number;
  velocityY: number;
  remainderX: number;
  remainderY: number;
  facing: "left" | "right";
  onGround: boolean;
  onLadder: boolean;
  coyoteFrames: number;
  jumpBufferFrames: number;
  jumpHoldFrames: number;
  airJumpsUsed: number;
  dashFrames: number;
  dashAvailable: boolean;
  dashRechargeFrames: number;
  dropThroughFrames: number;
  dashing: boolean;
  wallSliding: boolean;
  hitWall: boolean;
  hitCeiling: boolean;
  ignoresTileCollisions: boolean;
}

export function createPlatformerPreviewBody(
  x: number,
  y: number,
  width = TILE_SIZE,
  height = TILE_SIZE,
  collisionOffsetX = 0,
  collisionOffsetY = 0
): PlatformerPreviewBody {
  return {
    x,
    y,
    width,
    height,
    collisionOffsetX,
    collisionOffsetY,
    velocityX: 0,
    velocityY: 0,
    remainderX: 0,
    remainderY: 0,
    facing: "right",
    onGround: true,
    onLadder: false,
    coyoteFrames: 0,
    jumpBufferFrames: 0,
    jumpHoldFrames: 0,
    airJumpsUsed: 0,
    dashFrames: 0,
    dashAvailable: true,
    dashRechargeFrames: 0,
    dropThroughFrames: 0,
    dashing: false,
    wallSliding: false,
    hitWall: false,
    hitCeiling: false,
    ignoresTileCollisions: false
  };
}

function cellType(map: PlatformerPreviewMap, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return "solid";
  return map.collisionTypes[y * map.width + x] ?? "free";
}

function isSolidType(type: string): boolean {
  return type === "solid";
}

function slopeFloorYAt(map: PlatformerPreviewMap, pixelX: number, tileY: number): number | null {
  const tileX = Math.floor(pixelX / TILE_SIZE);
  const type = cellType(map, tileX, tileY);
  if (type !== "slope_up_right" && type !== "slope_up_left") return null;
  const localX = Math.max(0, Math.min(TILE_SIZE - 1, Math.floor(pixelX - tileX * TILE_SIZE)));
  const localFloorY = type === "slope_up_right" ? TILE_SIZE - 1 - localX : localX;
  return tileY * TILE_SIZE + localFloorY;
}

function horizontalTypeBlocks(type: string, direction: number): boolean {
  return isSolidType(type) || (direction > 0 && type === "left") || (direction < 0 && type === "right");
}

function verticalTypeBlocks(
  type: string,
  direction: number,
  previousBottom: number,
  nextBottom: number,
  tileTop: number,
  ignoreOneWay: boolean
): boolean {
  if (isSolidType(type)) return true;
  if (direction < 0 && type === "up") return true;
  if (!ignoreOneWay && direction > 0 && type === "down") {
    return previousBottom <= tileTop && nextBottom >= tileTop;
  }
  return false;
}

function rectCells(body: PlatformerPreviewBody): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.floor(body.x / TILE_SIZE),
    top: Math.floor(body.y / TILE_SIZE),
    right: Math.floor((body.x + body.width - 0.0001) / TILE_SIZE),
    bottom: Math.floor((body.y + body.height - 0.0001) / TILE_SIZE)
  };
}

function horizontalBlocked(
  body: PlatformerPreviewBody,
  map: PlatformerPreviewMap,
  direction: number,
  ignoreAllCollisions: boolean
): boolean {
  if (ignoreAllCollisions) return false;
  const cells = rectCells(body);
    for (let y = cells.top; y <= cells.bottom; y += 1) {
      for (let x = cells.left; x <= cells.right; x += 1) {
      if (horizontalTypeBlocks(cellType(map, x, y), direction)) return true;
      }
    }
  // Ramp tiles are floor geometry, not full solid tiles. Their vertical
  // surface is resolved by snapBodyToSlopeFloor below, matching the native
  // runtime's slope contract instead of creating an artificial side wall.
  return false;
}

function verticalBlocked(
  body: PlatformerPreviewBody,
  map: PlatformerPreviewMap,
  direction: number,
  previousBottom: number,
  ignoreOneWay: boolean,
  ignoreAllCollisions: boolean
): boolean {
  if (ignoreAllCollisions) return false;
  const cells = rectCells(body);
  for (let y = cells.top; y <= cells.bottom; y += 1) {
    for (let x = cells.left; x <= cells.right; x += 1) {
      const tileTop = y * TILE_SIZE;
      if (verticalTypeBlocks(cellType(map, x, y), direction, previousBottom, body.y + body.height, tileTop, ignoreOneWay)) {
        return true;
      }
    }
  }
  // Slopes are intentionally excluded from the generic vertical test. A
  // falling body is placed on their authored floor by snapBodyToSlopeFloor.
  return false;
}

function moveAxis(
  body: PlatformerPreviewBody,
  map: PlatformerPreviewMap,
  delta: number,
  horizontal: boolean,
  ignoreOneWay: boolean,
  ignoreAllCollisions: boolean
): { hit: boolean; landed: boolean } {
  const direction = Math.sign(delta);
  let remaining = Math.abs(delta);
  let hit = false;
  let landed = false;
  while (remaining > 0.0001) {
    const step = Math.min(1, remaining);
    const previousBottom = body.y + body.height;
    const candidate = { ...body };
    if (horizontal) candidate.x += direction * step;
    else candidate.y += direction * step;
    const blocked = horizontal
      ? horizontalBlocked(candidate, map, direction, ignoreAllCollisions)
      : verticalBlocked(candidate, map, direction, previousBottom, ignoreOneWay, ignoreAllCollisions);
    if (blocked) {
      hit = true;
      landed = !horizontal && direction > 0;
      break;
    }
    body.x = candidate.x;
    body.y = candidate.y;
    remaining -= step;
  }
  return { hit, landed };
}

function hasFloorSupport(body: PlatformerPreviewBody, map: PlatformerPreviewMap, ignoreOneWay: boolean): boolean {
  const candidate = { ...body, y: body.y + 0.5 };
  return verticalBlocked(candidate, map, 1, body.y + body.height, ignoreOneWay, false);
}

function snapBodyToSlopeFloor(body: PlatformerPreviewBody, map: PlatformerPreviewMap, maxSnapPixels = 4): boolean {
  const footX = Math.floor(body.x + body.width / 2);
  const footY = body.y + body.height;
  const tileY = Math.floor(footY / TILE_SIZE);
  const floorY = slopeFloorYAt(map, footX, tileY);
  if (floorY === null) return false;
  const deltaY = floorY - footY;
  if (deltaY < -maxSnapPixels || deltaY > maxSnapPixels) return false;
  body.y += deltaY;
  body.onGround = true;
  body.velocityY = 0;
  return true;
}

function dropThroughInput(config: PlatformerSceneConfig, input: PlatformerPreviewInput): boolean {
  if (config.dropThrough === "down_hold") return input.down;
  if (config.dropThrough === "down_tap") return input.down;
  if (config.dropThrough === "down_jump_hold") return input.down && input.jumpHeld;
  if (config.dropThrough === "down_jump_tap") return input.down && input.jumpPressed;
  return false;
}

function dashAllowed(config: PlatformerSceneConfig, onGround: boolean): boolean {
  if (config.dashStyle === "ground") return onGround;
  if (config.dashStyle === "air") return !onGround;
  return true;
}

export function stepPlatformerBlankPreview(current: PlatformerPreviewBody, gravity: number, config: PlatformerSceneConfig, map: PlatformerPreviewMap): PlatformerPreviewBody {
  const body = { ...current, velocityX: 0, remainderX: 0, hitWall: false, hitCeiling: false };
  body.velocityY = Math.min(config.maxFallSpeed, body.velocityY + Math.max(0, Math.trunc(gravity / 16)) / 256);
  const vertical = moveAxis(body, map, body.velocityY, false, false, false);
  body.onGround = vertical.hit && vertical.landed;
  if (vertical.hit) { body.hitCeiling = !vertical.landed; body.velocityY = 0; body.remainderY = 0; }
  return body;
}

export function stepPlatformerPreview(
  current: PlatformerPreviewBody,
  input: PlatformerPreviewInput,
  config: PlatformerSceneConfig,
  map: PlatformerPreviewMap
): PlatformerPreviewBody {
  const body = { ...current };
  const touchedWallLastFrame = body.hitWall && !body.onGround;
  body.hitWall = false;
  body.hitCeiling = false;
  body.wallSliding = false;
  body.dashing = false;
  body.ignoresTileCollisions = false;

  if (body.dashRechargeFrames > 0) body.dashRechargeFrames -= 1;
  if (body.onGround) {
    body.airJumpsUsed = 0;
    if (body.dashRechargeFrames === 0) body.dashAvailable = true;
  }

  if (input.jumpPressed) body.jumpBufferFrames = config.jumpBuffer;
  else if (body.jumpBufferFrames > 0) body.jumpBufferFrames -= 1;

  if (body.onGround && dropThroughInput(config, input)) {
    body.dropThroughFrames = 8;
    body.onGround = false;
    body.jumpBufferFrames = 0;
  }

  if (config.dash && input.dashPressed && body.dashAvailable && dashAllowed(config, body.onGround) && config.dashFrames > 0) {
    body.dashFrames = config.dashFrames;
    body.dashAvailable = false;
    body.dashRechargeFrames = config.dashRechargeFrames;
  }

  if (body.dashFrames > 0) {
    body.dashing = true;
    body.ignoresTileCollisions = config.dashThrough === DASH_THROUGH_WALLS;
    if (config.dashMomentum !== "vertical") {
      body.velocityX = body.facing === "left" ? -config.dashSpeed : config.dashSpeed;
    } else {
      body.velocityX = 0;
    }
    if (config.dashMomentum === "vertical") {
      body.velocityY = input.down ? config.dashSpeed : -config.dashSpeed;
    } else if (config.dashMomentum === "horizontal") {
      body.velocityY = 0;
    }
    body.dashFrames -= 1;
  } else {
    const canControl = body.onGround || body.onLadder || config.airControl;
    if (input.left && canControl) {
      body.velocityX -= config.acceleration;
      if (body.onGround || body.onLadder || config.changeDirectionInAir) body.facing = "left";
    } else if (input.right && canControl) {
      body.velocityX += config.acceleration;
      if (body.onGround || body.onLadder || config.changeDirectionInAir) body.facing = "right";
    } else if (body.onGround || body.onLadder) {
      body.velocityX = Math.sign(body.velocityX) * Math.max(0, Math.abs(body.velocityX) - config.friction);
    } else if (config.airDeceleration > 0) {
      body.velocityX = Math.sign(body.velocityX) * Math.max(0, Math.abs(body.velocityX) - config.airDeceleration);
    }
    body.velocityX = Math.max(-config.walkSpeed, Math.min(config.walkSpeed, body.velocityX));
  }

  const probeLeft = body.x + Math.trunc(body.width / 4);
  const probeWidth = Math.max(1, Math.trunc(body.width / 2));
  body.onLadder = config.ladders && Array.from({ length: Math.ceil((body.y + body.height) / TILE_SIZE) - Math.floor(body.y / TILE_SIZE) }, (_, dy) => Math.floor(body.y / TILE_SIZE) + dy)
    .some(y => Array.from({ length: Math.ceil((probeLeft + probeWidth) / TILE_SIZE) - Math.floor(probeLeft / TILE_SIZE) }, (_, dx) => Math.floor(probeLeft / TILE_SIZE) + dx)
      .some(x => cellType(map, x, y) === "ladder"));

  if (!body.dashing && body.onLadder && (input.up || input.down)) {
    body.velocityY = input.up ? -config.walkSpeed : config.walkSpeed;
  } else if (!body.dashing) {
    body.velocityY += config.gravity;
    body.velocityY = Math.min(config.maxFallSpeed, body.velocityY);
    if (config.wallJump && config.wallSlide && touchedWallLastFrame && body.velocityY > 0) {
      body.wallSliding = true;
      body.velocityY = Math.min(body.velocityY, config.wallSlideSpeed);
    }
    if (config.glide && input.glideHeld && body.velocityY > 0) {
      body.velocityY = Math.min(body.velocityY, config.glideFallSpeed);
    }
  }

  if (body.onGround) body.coyoteFrames = config.coyoteTime;
  else if (body.coyoteFrames > 0) body.coyoteFrames -= 1;

  const minimumJumpSpeed = Math.max(0, Math.min(config.jumpMinHeight, config.jumpSpeed));
  const groundedJumpSpeed = minimumJumpSpeed > 0 ? minimumJumpSpeed : config.jumpSpeed;
  if (body.jumpBufferFrames > 0 && (body.onGround || body.onLadder || body.coyoteFrames > 0)) {
    body.velocityY = -groundedJumpSpeed;
    body.jumpHoldFrames = config.jumpFrames;
    body.onGround = false;
    body.onLadder = false;
    body.coyoteFrames = 0;
    body.jumpBufferFrames = 0;
    body.dashFrames = 0;
  } else if (body.jumpBufferFrames > 0 && config.doubleJump && body.airJumpsUsed < 1) {
    const reducedJumpSpeed = config.jumpSpeed - config.jumpReduction * body.airJumpsUsed;
    body.velocityY = -(minimumJumpSpeed > 0 ? Math.max(minimumJumpSpeed, reducedJumpSpeed) : reducedJumpSpeed);
    body.jumpHoldFrames = config.jumpFrames;
    body.airJumpsUsed += 1;
    body.jumpBufferFrames = 0;
    body.dashFrames = 0;
  }

  if (!body.dashing && body.jumpHoldFrames > 0) {
    if (input.jumpHeld && body.velocityY < 0 && config.jumpFrames > 0) {
      const remainingBoost = config.jumpSpeed - minimumJumpSpeed;
      const boostPerFrame = Math.ceil(remainingBoost / config.jumpFrames);
      body.velocityY = Math.max(-config.jumpSpeed, body.velocityY - boostPerFrame);
      body.jumpHoldFrames -= 1;
    } else {
      body.jumpHoldFrames = 0;
    }
  }

  const ignoreOneWay = body.dropThroughFrames > 0;
  const horizontal = moveAxis(body, map, body.velocityX, true, false, body.ignoresTileCollisions);
  if (horizontal.hit) {
    body.hitWall = true;
    body.velocityX = 0;
  }

  const vertical = moveAxis(body, map, body.velocityY, false, ignoreOneWay, body.ignoresTileCollisions);
  const slopeSnapped = !body.dashing && body.velocityY >= 0
    ? snapBodyToSlopeFloor(body, map)
    : false;
  if (vertical.hit) {
    if (vertical.landed) body.onGround = true;
    else body.hitCeiling = true;
    body.velocityY = 0;
    body.jumpHoldFrames = 0;
    if (slopeSnapped) body.onGround = true;
  } else {
    body.onGround = slopeSnapped || hasFloorSupport(body, map, ignoreOneWay);
    if (body.onGround) body.velocityY = 0;
  }

  if (body.dropThroughFrames > 0) body.dropThroughFrames -= 1;
  if (body.onLadder && !input.up && !input.down) body.velocityY = 0;
  return body;
}
