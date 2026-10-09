import { describe, expect, it, vi } from 'vitest';
import { drawHudComponent, drawStandardHud, drawHudText } from './hudPreviewSnapshot.js';
import type { HudComponent } from '../shared/hudPresets.js';
import { DEFAULT_HUD_PRESET } from '../shared/hudPresets.js';
const component: HudComponent = {id:'frame',kind:'frame',label:'',text:'',asset:'',x:8,y:8,width:224,height:144,zIndex:0,visible:true};
const context = () => ({drawImage:vi.fn(),fillRect:vi.fn(),strokeRect:vi.fn(),fillText:vi.fn()}) as unknown as CanvasRenderingContext2D;
describe('HUD rendering matches the tile frame contract', () => {
  it('preserves an authored purple bar image without an orange overlay', () => {
    const ctx=context();const image={naturalWidth:72,naturalHeight:8} as HTMLImageElement;
    drawHudComponent(ctx,{...component,kind:'bar',width:72,height:8},image,'');
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
  it('tiles a 24x24 skin with unchanged 8px corners instead of cropping a stretched image', () => {
    const ctx=context(); const image={naturalWidth:24,naturalHeight:24} as HTMLImageElement;
    drawHudComponent(ctx,component,image,'');
    expect(ctx.drawImage).toHaveBeenCalledTimes(28*18);
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1,image,0,0,8,8,8,8,8,8);
    expect(ctx.drawImage).toHaveBeenLastCalledWith(image,16,16,8,8,224,144,8,8);
  });
  it('draws text without opaque boxes that hide the authored frame', () => {
    const ctx=context();drawHudComponent(ctx,{...component,kind:'text',label:'Missoes',width:144,height:8},undefined,'');
    expect(ctx.strokeRect).not.toHaveBeenCalled();expect(ctx.fillText).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(ctx.fillRect).mock.calls.every(call => call[2] === 1 && call[3] === 1)).toBe(true);
  });
  it('uses the project atlas at 8px, wraps by tiles and clips to the component', () => {
    const ctx = context(); const atlas = {} as HTMLCanvasElement;
    drawHudText(ctx, 'ABCDEF', 8, 16, 16, 16, atlas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(4);
    expect(vi.mocked(ctx.drawImage).mock.calls.map(call => call.slice(5))).toEqual([[8,16,8,8],[16,16,8,8],[8,24,8,8],[16,24,8,8]]);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
  it('keeps 8px corners when a theme supplies the standard HUD skin', () => {
    const ctx = context();
    ctx.measureText = vi.fn(() => ({width: 0})) as unknown as typeof ctx.measureText;
    const image = {naturalWidth:24,naturalHeight:24} as HTMLImageElement;
    drawStandardHud(ctx, {...DEFAULT_HUD_PRESET, width:240, height:24, position:'Superior', builtIn:false, ready:true, warning:null}, image, '');
    expect(ctx.drawImage).toHaveBeenCalledTimes(30 * 3);
    expect(ctx.drawImage).toHaveBeenLastCalledWith(image,16,16,8,8,232,16,8,8);
  });
});
