import { describe, expect, it } from 'vitest';
import { verifiedBattleEffectOcclusion } from './battle-effect-framebuffer-contract.mjs';
import { auditOpaqueRgbaAgainstFramebufferRegion } from './rgb555-framebuffer-contract.mjs';

const red = [255,0,0,255], blue = [0,0,255,255], green = [0,255,0,255];
function fixture() {
  return { source: { width: 2, height: 1, pixels: Uint8Array.from([...green,...blue]) },
    frameWidth: 1, frameHeight: 1, framebufferWidth: 2, framebufferHeight: 1,
    framebuffer: Uint8Array.from([...blue,...red]),
    foregroundObject: { index: 0, priority: 1, x: 0, y: 0, width: 1, height: 1 },
    targetObject: { index: 1, priority: 1 } };
}
function auditPlayer(framebuffer, allowedOcclusionPixels) {
  return auditOpaqueRgbaAgainstFramebufferRegion({ framebuffer,
    framebufferWidth: 2, framebufferHeight: 1, frameWidth: 2, frameHeight: 1,
    sourcePixels: Uint8Array.from([...red,...red]), sourceSheetWidth: 2,
    sourceX: 0, targetX: 0, targetY: 0, allowedOcclusionPixels });
}
describe('verified authored battle effect foreground', () => {
  it('requires exact effect pixels before allowing the same coordinate and color over a participant', () => {
    const options = fixture(), result = verifiedBattleEffectOcclusion(options);
    expect(result.audit).toMatchObject({ ok: true, mismatchCount: 0, sourceX: 1 });
    expect([...result.pixels]).toEqual(['0:0,0,255']);
    expect(auditPlayer(options.framebuffer, result.pixels).ok).toBe(true);
  });
  it('does not hide corruption in the participant outside the verified effect', () => {
    const options = fixture();options.framebuffer.set(green,4);
    const result = verifiedBattleEffectOcclusion(options);
    expect(result.pixels.size).toBe(1);
    expect(auditPlayer(options.framebuffer, result.pixels)).toMatchObject({ ok: false, mismatchCount: 1 });
  });
  it('does not whitelist an effect with a different actual color', () => {
    const options = fixture();options.framebuffer.set(red,0);
    expect(verifiedBattleEffectOcclusion(options).pixels.size).toBe(0);
  });
  it.each([{ index: 2, priority: 1 },{ index: 0, priority: 2 },{ index: 1, priority: 1 }])(
    'does not mask a sprite behind or equal to the participant: %j', object => {
      const options = fixture();Object.assign(options.foregroundObject,object);
      expect(verifiedBattleEffectOcclusion(options).pixels.size).toBe(0);
    });
  it('uses native priority before OAM index', () => {
    const options = fixture();Object.assign(options.foregroundObject,{ index: 7, priority: 0 });
    expect(verifiedBattleEffectOcclusion(options).pixels.size).toBe(1);
  });
  it('does not infer a foreground from an unavailable native target', () => {
    expect(verifiedBattleEffectOcclusion({ ...fixture(), targetObject: null }).pixels.size).toBe(0);
  });
});
