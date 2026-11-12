import { findBestOpaqueRgbaFramebufferFrame } from './rgb555-framebuffer-contract.mjs';
import { framebufferOcclusionPixels } from './native-scene-framebuffer-contract.mjs';

export function verifiedBattleEffectOcclusion({ source, frameWidth, frameHeight,
  foregroundObject, targetObject, framebuffer, framebufferWidth = 240, framebufferHeight = 160 }) {
  const empty = () => ({ pixels: new Set(), audit: null });
  if (!foregroundObject || !targetObject || foregroundObject.affine || foregroundObject.flipY
    || ![foregroundObject.index, targetObject.index, foregroundObject.priority, targetObject.priority].every(Number.isInteger)
    || !(foregroundObject.priority < targetObject.priority
      || foregroundObject.priority === targetObject.priority && foregroundObject.index < targetObject.index)
    || foregroundObject.width !== frameWidth || foregroundObject.height !== frameHeight
    || !source || source.height !== frameHeight || !Number.isInteger(source.width / frameWidth)) return empty();
  const audit = findBestOpaqueRgbaFramebufferFrame({
    candidateSourceXs: Array.from({ length: source.width / frameWidth }, (_, index) => index * frameWidth),
    candidateTargets: [{ x: foregroundObject.x, y: foregroundObject.y }],
    candidateFlipsX: [Boolean(foregroundObject.flipX)],
    framebuffer, framebufferWidth, framebufferHeight, frameWidth, frameHeight,
    sourcePixels: source.pixels, sourceSheetWidth: source.width, minimumComparedPixelCount: 1
  });
  if (!audit.ok || audit.mismatchCount !== 0) return { ...empty(), audit };
  const pixels = new Uint8Array(frameWidth * frameHeight * 4);
  for (let y = 0; y < frameHeight; y++) for (let x = 0; x < frameWidth; x++) {
    const sx = audit.sourceX + (audit.flipX ? frameWidth - 1 - x : x);
    pixels.set(source.pixels.subarray((y * source.width + sx) * 4, (y * source.width + sx) * 4 + 4), (y * frameWidth + x) * 4);
  }
  return { audit, pixels: framebufferOcclusionPixels([{
    source: { width: frameWidth, height: frameHeight, pixels }, x: foregroundObject.x, y: foregroundObject.y
  }], { width: framebufferWidth, height: framebufferHeight }) };
}
