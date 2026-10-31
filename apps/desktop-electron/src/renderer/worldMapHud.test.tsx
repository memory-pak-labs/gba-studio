import {it,expect,vi} from 'vitest';
import {drawHudText} from './hudPreviewSnapshot.js';

it('preserva o contorno de um glyph autorado de 8px na HUD compacta de avanço 6',()=>{
 const drawImage=vi.fn();
 const context={drawImage} as unknown as CanvasRenderingContext2D;
 const font={width:128,height:112} as HTMLCanvasElement;
 drawHudText(context,'! ',30,143,144,8,font,'#304048',6);
 expect(drawImage.mock.calls[0].slice(3,5)).toEqual([8,8]);
 expect(drawImage.mock.calls[0].slice(7,9)).toEqual([8,8]);
});
