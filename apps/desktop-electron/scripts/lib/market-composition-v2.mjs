/** Review-only layout assembled from the already approved 4x4 modular atlas. */
export function createMarketCompositionV2Candidate() {
  const width = 25;
  const height = 25;
  const cells = Array.from({ length: width * height }, () => ({ material: 'void', height: 0, walkable: false }));
  const fill = (x0, y0, x1, y1, material = 'stone', level = 0) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      cells[y * width + x] = { material, height: level, walkable: true };
    }
  };

  // Tapered market island: the stalls frame a clear route through the plaza.
  fill(8, 7, 13, 7);
  fill(7, 8, 13, 9);
  fill(6, 10, 13, 13);
  fill(7, 14, 13, 14);
  fill(14, 7, 14, 7, 'stairs', 1);

  // Two causeways lead to distinct arrival and side-landing silhouettes.
  fill(7, 15, 8, 18, 'wood');
  fill(7, 19, 9, 19);
  fill(6, 20, 9, 20);
  fill(7, 21, 9, 21);
  fill(14, 12, 16, 13, 'wood');
  fill(17, 11, 19, 11);
  fill(17, 12, 20, 13);
  fill(17, 14, 19, 14);

  // The guard's high terrace remains connected through the single authored ramp.
  fill(16, 2, 19, 2, 'stone', 2);
  fill(15, 3, 20, 6, 'stone', 2);
  fill(15, 7, 19, 7, 'stone', 2);

  // Moss follows the outer rim, leaving the plaza's trading route clear.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const cell = cells[index];
    if (cell.material !== 'stone' || cell.height !== 0) continue;
    const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx < 0 || ny < 0 || nx >= width || ny >= height || !cells[ny * width + nx].walkable;
    });
    if (rim && (x * 3 + y) % 3 !== 1) cells[index] = { ...cell, material: 'moss' };
  }

  const props = [
    { module: 'stall_teal', x: 7, y: 8, width: 2, height: 1, blocking: true },
    { module: 'stall_gold', x: 12, y: 8, width: 2, height: 1, blocking: true },
    { module: 'crates', x: 6, y: 11, width: 1, height: 1, blocking: true },
    { module: 'barrels', x: 13, y: 10, width: 1, height: 1, blocking: true },
    { module: 'lantern', x: 6, y: 20, width: 1, height: 1, blocking: true },
    { module: 'barrels', x: 19, y: 13, width: 1, height: 1, blocking: true },
    { module: 'bridge', x: 8, y: 16, width: 1, height: 1, blocking: false },
    { module: 'bridge', x: 15, y: 12, width: 1, height: 1, blocking: false },
    { module: 'rope_rail', x: 7, y: 16, width: 1, height: 1, blocking: false },
    { module: 'rope_rail', x: 16, y: 10, width: 1, height: 1, blocking: false }
  ];
  for (const prop of props.filter((item) => item.blocking)) {
    for (let y = prop.y; y < prop.y + prop.height; y++) {
      for (let x = prop.x; x < prop.x + prop.width; x++) {
        cells[y * width + x] = { ...cells[y * width + x], walkable: false };
      }
    }
  }

  return {
    version: 2, status: 'candidate-review-only', width, height,
    grid: { tileWidth: 32, tileHeight: 16, heightStep: 8 },
    gameplayMode: 'adventure', cells, props, spawn: { x: 8, y: 20 },
    landmarks: {
      entrance: { x: 8, y: 20 }, plaza: { x: 10, y: 12 },
      trader: { x: 10, y: 9 }, terrace: { x: 18, y: 6 },
      sideLanding: { x: 18, y: 13 }, exit: { x: 19, y: 6 }
    }
  };
}

/** The two layers consumed by the indexed isometric runtime; no BG3 shortcut. */
export function buildMarketCandidateLayers(composition = createMarketCompositionV2Candidate()) {
  const { cells, width, height } = composition;
  const floorIDs = { stone: 1, moss: 2, wood: 4, stairs: 7 };
  const propIDs = {
    stall_teal: 9, stall_gold: 10, crates: 11, barrels: 12,
    rope_rail: 13, bridge: 14, lantern: 15,
    water_shore: 3, stone_water_transition: 16
  };
  const floor = cells.map((cell) => floorIDs[cell.material] ?? 0);
  const foreground = Array(width * height).fill(0);
  const heightLevels = cells.map((cell) => cell.height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = cells[y * width + x];
    if (!cell.walkable) continue;
    for (const [dx, dy, renderDX, renderDY] of [[1, 0, 2, 1], [0, 1, 1, 2]]) {
      const nx = x + dx, ny = y + dy;
      const neighbor = nx < width && ny < height ? cells[ny * width + nx] : null;
      if (neighbor?.walkable && neighbor.height >= cell.height) continue;
      const rx = x + renderDX, ry = y + renderDY;
      if (rx >= width || ry >= height || cells[ry * width + rx].walkable) continue;
      const index = ry * width + rx;
      if (cell.height >= heightLevels[index]) {
        foreground[index] = cell.height >= 2 ? 6 : 5;
        heightLevels[index] = cell.height;
      }
    }
  }
  for (const prop of composition.props) foreground[prop.y * width + prop.x] = propIDs[prop.module];
  const collisions = cells.map((cell) => cell.walkable ? 'free' : 'solid');
  collisions[7 * width + 14] = 'slope_up_right';
  collisions[7 * width + 15] = 'slope_up_right';
  return { floor, foreground, heightLevels, collisions };
}

/** Materialize only in an isolated project copy; never write the canonical template. */
export function applyMarketCompositionV2Candidate(project) {
  const candidate = structuredClone(project);
  const composition = createMarketCompositionV2Candidate();
  const layers = buildMarketCandidateLayers(composition);
  const updateRoom = (room) => room.name !== 'mercado_suspenso' ? room : {
    ...room,
    tilemap: layers.floor,
    collisions: layers.collisions,
    collisionTypes: layers.collisions,
    heightLevels: layers.heightLevels,
    tileLayers: room.tileLayers.map((layer) => ({
      ...layer,
      tilemap: layer.mapping === 'BG2' ? layers.floor
        : layer.mapping === 'BG1' ? layers.foreground
          : layer.tilemap
    }))
  };
  candidate.rooms = candidate.rooms.map(updateRoom);
  candidate.scenas = candidate.scenas.map(updateRoom);
  for (const trigger of candidate.triggers) {
    if (trigger.id === 'trigger-market-bridge') Object.assign(trigger, { x: 15, y: 12 });
    if (trigger.id === 'trigger-market-exit') Object.assign(trigger, { x: 19, y: 6 });
  }
  for (const connection of candidate.editorState?.scenaConnections ?? []) {
    if (connection.to === 'mercado_suspenso') {
      connection.entry = { x: 18, y: 13, width: 1, height: 1 };
    }
  }
  return candidate;
}
