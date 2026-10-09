import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './lib/png-icons.mjs';
import { auditRgbaAgainstExportedTilemap } from './rgb555-framebuffer-contract.mjs';
import { buildAssetcTilesetPackGeneration } from '../src/shared/engineProjectExport.js';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';

const templateURL = new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url);
const assetc = fileURLToPath(new URL('../../../packages/GBAStudioEngine/tools/assetc/assetc.py', import.meta.url));
const approved = [
  ['mapa_rota', 'route-map-paged-v2.png', '6887d224a8490c8858fc5e66c779932ad8264f3a87535168e88c64755d88de0c'],
  ['armazem_das_mares', 'armazem-das-mares-gba.png', '808820ff31540bdf0f7f9da778610d76cfe119e195d6ae22e5ac12930594393d'],
  ['observatorio_do_farol', 'observatorio-do-farol-gba.png', '5322e4cd1be4c19dbd2cfff13ce1c0d16b5f0947b9cf1ba4b76650afed07285f'],
  ['conselho_guardia', 'council-v5-background.png', '98a6ccb4597f25f2156e30fed19ce7f9e9f88a5403ea5b46f1cefb1281c1cdff'],
  ['circuito_final', 'circuit-final-loop-v2-runtime.png', '7e1297682bbf62544310cea1cb4ce70ee21c66e8706ef0269cfa48d5f0e67e3f']
];

describe('conversões de background aprovadas em 2026-10-02', () => {
  for (const [scene, name, sha256] of approved) {
    it(`${scene}: recompila os pixels aprovados sem nova perda de cor ou tiles`, () => {
      const saved = JSON.parse(readFileSync(templateURL, 'utf8'));
      const bytes = readFileSync(new URL(`Assets/backgrounds/${name}`, templateURL));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
      const png = decodePngRgba(bytes);
      const project = promoteExemploGBAVerticeCampaign(saved);
      const asset = project.assets.find(asset => asset.name === name);
      expect(asset.metadata).toMatchObject({
        preparedSha256: sha256,
        backgroundPaletteBankBudget: 14,
        visualStatus: 'approved',
        visualApproval: { date: '2026-10-02', contract: 'play-background-fidelity-v1-approved' }
      });
      expect(asset.metadata.backgroundPaletteReferencePlan).toEqual(saved.assets.find(asset => asset.name === name).metadata.backgroundPaletteReferencePlan);
      const packAsset = buildAssetcTilesetPackGeneration(project).packAssets.find(asset => asset.id === name.replace('.png', '').replaceAll('-', '_'));
      expect(packAsset).toBeDefined();
      const root = mkdtempSync(join(tmpdir(), 'gba-approved-bg-contract-'));
      try {
        const output = join(root, 'background.hpp');
        const args = [fileURLToPath(new URL(`Assets/backgrounds/${name}`, templateURL)), '--name', packAsset.symbol, '--output', output];
        if (packAsset.kind === 'paged_bg') {
          args.push('--paged-tilemap');
        } else {
          expect(packAsset.background_palette_reference_plan.banks).toHaveLength(14);
          expect(packAsset.background_palette_reference_plan.tile_palette_banks).toHaveLength(png.width * png.height / 64);
          const planPath = join(root, 'palette-plan.json');
          writeFileSync(planPath, JSON.stringify(packAsset.background_palette_reference_plan));
          args.push('--background-palette-banks', '14', '--background-palette-reference', planPath);
        }
        const reportPath = join(root, 'tiles.json');
        if (scene === 'circuito_final') args.push('--optimize-background-tiles', '--background-tile-budget', '895', '--background-tile-report', reportPath);
        execFileSync(assetc, args, { stdio: 'pipe' });
        const header = readFileSync(output, 'utf8');
        expect(auditRgbaAgainstExportedTilemap({ ...png, headerSource: header, symbol: packAsset.symbol })).toMatchObject({ ok: true, mismatchCount: 0 });
        execFileSync(assetc, args, { stdio: 'pipe' });
        expect(readFileSync(output, 'utf8')).toBe(header);
        if (scene === 'circuito_final') expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({ total_mapping_error: 0, tile_count_after: 894 });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
