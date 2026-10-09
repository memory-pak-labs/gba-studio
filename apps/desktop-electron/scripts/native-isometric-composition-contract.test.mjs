import { expect, it } from 'vitest';
import { auditNativeIsometricComposition, decodeNativeIsometricPagedComposition } from './native-isometric-composition-contract.mjs';

it('decodes the shared native paged palette and transparent foreground, preserving origin', () => {
  const header = `constexpr uint8_t market_paged_tiles[] = {${Array(64).fill(1)},${Array(64).fill(2)}};
    constexpr uint16_t market_paged_palette_colors[] = {0,31,992};
    constexpr uint16_t market_paged_background[] = {0};
    constexpr uint16_t market_paged_foreground[] = {1};
    constexpr gbs::IsoBakedComposition market_paged { market_paged_tiles, 2, market_paged_background, market_paged_foreground, 1, 1, { 4, -8 }, &market_paged_palette, 1 };`;
  const decoded = decodeNativeIsometricPagedComposition(header, {name:'market'});
  expect(decoded.origin).toEqual({x:4,y:-8});
  expect(Array.from(decoded.background.pixels.slice(0,4))).toEqual([255,0,0,255]);
  expect(Array.from(decoded.foreground.pixels.slice(0,4))).toEqual([0,255,0,255]);
  const empty = decodeNativeIsometricPagedComposition(header.replace('market_paged_foreground[] = {1}', 'market_paged_foreground[] = {0}').replace(Array(64).fill(1).join(','), Array(64).fill(0).join(',')), {name:'market'});
  expect(empty.foreground.pixels[3]).toBe(0);
  expect(() => decodeNativeIsometricPagedComposition(header.replace('market_paged_background[] = {0}', 'market_paged_background[] = {9}'), {name:'market'})).toThrow(/tile/);
  expect(decodeNativeIsometricPagedComposition(header,{name:'other'})).toBeNull();
});

it('checks the native tiles and palette, rejecting a changed pixel', () => {
  const room = {name:'market',width_tiles:1,height_tiles:1,visual_tiles:[1],height_levels:[0],background_layers:{bg1:[0]},
    tileset_tile_width_pixels:8,tileset_tile_height_pixels:8,tileset_render_width_pixels:8,tileset_render_height_pixels:8,
    tileset_render_offset_y_pixels:-8,grid:{origin:{x:4,y:0},height_step_pixels:8}};
  const source = {width:8,height:8,pixels:Uint8Array.from(Array.from({length:64},()=>[255,0,0,255]).flat())};
  const header = `constexpr uint8_t market_baked_tiles[] = {${Array(64).fill(0)},${Array(64).fill(1)}};
    constexpr uint16_t market_baked_palette_colors[] = {0,31};
    constexpr uint16_t market_baked_background[] = {1};
    constexpr uint16_t market_baked_foreground[] = {0};
    constexpr gbs::IsoBakedComposition market_baked { market_baked_tiles, 2, market_baked_background, market_baked_foreground, 1, 1, { 0, -8 }, &market_baked_palette };`;
  expect(auditNativeIsometricComposition(header,room,source)).toMatchObject({ok:true,mismatchCount:0,comparedPixelCount:128});
  expect(auditNativeIsometricComposition(header.replace('{0,31}','{0,32}'),room,source)).toMatchObject({ok:false,mismatchCount:64});
});
