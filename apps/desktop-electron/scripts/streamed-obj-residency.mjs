function tileAsset(header, name) {
  const body = header.match(new RegExp(
    "gbs::TileAsset\\s+" + name + "\\s*=\\s*\\{([^}]+)\\}\\s*;"
  ))?.[1];
  const match = body?.match(
    /^\s*reinterpret_cast<const\s+uint8_t\s*\*>\s*\((\w+)\)\s*,\s*(\w+)\s*,\s*(0x[0-9a-f]+|\d+)\s*,\s*true\s*$/i
  );
  return match ? {
    data: match[1], count: match[2], destination: Number.parseInt(match[3], 0)
  } : null;
}

// Pixel/palette fidelity is audited separately. This checks that every
// streamed frame uploads its own data to the same bounded resident range.
export function auditStreamedObjResidency({
  headerSource, symbol, frameCount, frameWidth, frameHeight, residentTileCount
}) {
  const header = typeof headerSource === "string" ? headerSource : "";
  const contract = typeof symbol === "string" && /^[A-Za-z_]\w*$/.test(symbol)
    && Number.isInteger(frameCount) && frameCount > 0
    && Number.isInteger(frameWidth) && frameWidth > 0 && frameWidth % 8 === 0
    && Number.isInteger(frameHeight) && frameHeight > 0 && frameHeight % 8 === 0
    && residentTileCount === (frameWidth / 8) * (frameHeight / 8);
  if (!contract) return { ok: false, checks: { contract: false } };

  const resident = header.match(new RegExp(
    "constexpr\\s+int\\s+" + symbol + "_tile_count\\s*=\\s*(\\d+)\\s*;"
  ));
  const count = resident ? Number(resident[1]) : null;
  const base = tileAsset(header, symbol + "_tile_asset");
  const uploads = Array.from({ length: frameCount }, (_, index) =>
    tileAsset(header, symbol + "_frame_" + index + "_tile_asset"));
  const animation = header.match(new RegExp(
    "constexpr\\s+gbs::SpriteAnimationFrame\\s+" + symbol
    + "_animation_frames\\s*\\[(\\d+)\\]\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;"
  ));
  const bindings = animation ? [...animation[2].matchAll(new RegExp(
    "\\{\\s*" + symbol + "_metasprites\\[(\\d+)\\]\\s*,\\s*(\\d+)\\s*,\\s*&"
    + symbol + "_frame_(\\d+)_tile_asset\\s*\\}", "g"
  ))] : [];
  const checks = {
    contract,
    residentTileCount: count === residentTileCount,
    residentAsset: base?.data === symbol + "_tiles"
      && base.count === symbol + "_tile_count",
    frameUploads: uploads.every((upload, index) =>
      upload?.data === symbol + "_frame_" + index + "_tiles"
      && Number(upload.count) === residentTileCount
      && upload.destination === base?.destination),
    animationBindings: Number(animation?.[1]) === frameCount
      && bindings.length === frameCount
      && bindings.every((binding, index) =>
        Number(binding[1]) === index && Number(binding[2]) > 0 && Number(binding[3]) === index)
  };
  return {
    ok: Object.values(checks).every(Boolean), checks,
    residentTileCount: count, destinationTile: base?.destination ?? null
  };
}
