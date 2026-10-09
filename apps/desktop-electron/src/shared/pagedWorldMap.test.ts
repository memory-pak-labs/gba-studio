import {expect, it} from 'vitest';
import {buildGbaHardwareContract} from './gbaHardwareContract.js';
import {buildScenePreflightReport} from './scenePreflight.js';
import {deriveScenePhysicalDiagnostics} from './scenePhysicalDiagnostics.js';
import type {GBAProjectData} from './projectFile.js';

it('budgets the resident 8bpp window while keeping the complete world map in ROM', () => {
  const data: GBAProjectData = {
    scenas:[{name:'map',sceneType:'worldMap',width:60,height:40,backgroundAssetName:'map.png'}],
    assets:[{name:'map.png',kind:'Background',metadata:{kind:'paged_bg',colorMode:'8bpp-indexed',width:480,height:320}}]
  };
  const hardware=buildGbaHardwareContract(data);
  expect(hardware.scenes[0]).toMatchObject({widthPixels:480,heightPixels:320,screenblocks:1,requiredMapSize:{id:'32x32'}});
  expect(hardware.issues.some(issue => issue.code==='BACKGROUND_MAP_SIZE_EXPANDED')).toBe(false);
  expect(buildScenePreflightReport(data,'map').budget.safeLimit.bgTiles).toBe(1408);
  const diagnostics=deriveScenePhysicalDiagnostics(data,'map');
  expect(diagnostics.metrics.find(metric => metric.id==='bgTiles')).toMatchObject({estimate:1302,safeLimit:1408});
  expect(diagnostics.metrics.find(metric => metric.id==='vramBytes')?.estimate).toBe(41664);
  const regular=structuredClone(data);
  (regular.assets as Array<{metadata:Record<string,unknown>}>)[0].metadata.kind='bg';
  expect(buildGbaHardwareContract(regular).scenes[0].requiredMapSize.id).toBe('64x64');
  expect(buildScenePreflightReport(regular,'map').budget.safeLimit.bgTiles).toBe(896);
});
