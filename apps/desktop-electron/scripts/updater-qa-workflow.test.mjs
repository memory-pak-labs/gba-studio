import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import nativeAssert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const workflow = require('js-yaml').load(readFileSync(new URL('../../../.github/workflows/desktop-packages.yml', import.meta.url), 'utf8'));

function nativeHosts(platform = 'both', nativePlatform = 'all') {
  const include = workflow.jobs['published-updater-qa'].strategy.matrix.include;
  if (Array.isArray(include)) return include;
  return runInNewContext(include.trim().slice(3, -2), { inputs: { updater_qa_platform: platform, updater_qa_native_platform: nativePlatform }, fromJSON: JSON.parse });
}

describe('installed updater QA workflow', () => {
  it('retries only a selected operating system without repeating already validated native hosts', () => {
    expect(nativeHosts('linux').map(item => item.platform)).toEqual(['linux']);
    expect(nativeHosts('windows').map(item => item.platform)).toEqual(['windows']);
    expect(nativeHosts('both', 'macos-intel').map(item => item.platform)).toEqual(['macos-intel']);
    expect(nativeHosts('linux', 'macos-arm64').map(item => item.platform)).toEqual(['macos-arm64']);
    expect(nativeHosts().map(item => item.platform)).toEqual(['windows', 'linux', 'macos-intel', 'macos-arm64']);
  });
  it('tests the exact updated Linux payload offline without requiring the AppImage shell launcher', () => {
    const step = workflow.jobs['published-updater-qa'].steps.find(item => item.name === 'Validate updated installed editor and ROM on the native host');
    const setup = step.run.match(/((?:let|const) app = [\s\S]*?)\n\s*const env/)[1];
    const calls = [];
    const resolved = runInNewContext(`(() => { ${setup}; return app; })()`, {
      process: { platform: 'linux', env: { PATH: '/usr/bin:/bin' } }, root: '/qa', path,
      fixture: { sourceExecutable: '/qa/rc6.AppImage', targetInstaller: '/qa/rc7.AppImage' },
      mkdirSync: () => {}, assert: nativeAssert,
      spawnSync: (file, args, options) => { calls.push({ file, args, options }); return { status: 0 }; }
    });
    expect(resolved).toBe('/qa/installed-appimage-payload/squashfs-root/gba-studio');
    expect(calls[0].file).toBe('/qa/rc7.AppImage');
    expect(calls[0].args).toEqual(['--appimage-extract']);
    expect(calls[0].options.env.PATH).toBe('/usr/bin:/bin');
  });
  it.each([['win32', 'x64', undefined], ['linux', 'x64', undefined], ['darwin', 'x64', 'x86_64'], ['darwin', 'arm64', 'arm64']])(
    'selects an Electron architecture only on macOS: %s %s', (platform, arch, expected) => {
      const step = workflow.jobs['published-updater-qa'].steps.find(item => item.name === 'Validate updated installed editor and ROM on the native host');
      const expression = step.run.match(/const env = ([\s\S]*?);\n\s*const scripts/)[1];
      const env = runInNewContext(`(${expression})`, { process: { platform, arch, env: {} }, app: '/fixture/app', root: '/qa', path });
      expect(env.GBA_STUDIO_SMOKE_ARCH).toBe(expected);
      expect(env.GBA_STUDIO_PACKAGED_APP_PATH).toBe('/fixture/app');
      expect(env.GBA_STUDIO_OFFLINE_SMOKE).toBe('1');
    }
  );
  it('keeps installer publication steps on the production job and isolates the QA matrix', () => {
    expect(workflow.jobs.desktop.steps.some((step) => step.name === 'Upload validated installer candidates')).toBe(true);
    const qa = workflow.jobs['installed-updater-qa'];
    expect(qa.strategy.matrix.include).toContain('updater_qa_platform');
    expect(qa.strategy.matrix.include).toContain('ubuntu-24.04');
    expect(qa.strategy.matrix.include).toContain('windows-2022');
    expect(workflow.concurrency.group).toContain('github.run_id');
    expect(qa.env.GBA_UPDATER_QA_ROOT).toContain('github.workspace');
    expect(qa.env.GBA_UPDATER_QA_ARTIFACTS).toContain('github.workspace');
    expect(qa.steps.some((step) => step.name === 'Upload validated installer candidates')).toBe(false);
    expect(qa.steps.find((step) => step.name === 'Upload updater evidence').if).toBe('always()');
  });

  it('runs the updater on native hosts with draft visibility scoped to its manual QA job', () => {
    const qa = workflow.jobs['published-updater-qa'];
    expect(nativeHosts().map(({ runner }) => runner)).toEqual([
      'windows-2022', 'ubuntu-24.04', 'macos-15-intel', 'macos-15'
    ]);
    expect(nativeHosts().map(({ architecture }) => architecture)).toEqual(['x64', 'x64', 'x64', 'arm64']);
    expect(qa.steps.find(step => step.name === 'Verify QA changes preserve the frozen candidate').run).toContain("assert.equal(process.arch, '${{ matrix.architecture }}'");
    expect(workflow.permissions.contents).toBe('read');
    expect(qa.permissions.contents).toBe('write');
    for (const name of ['engine-pack', 'desktop', 'installed-updater-qa']) {
      expect(workflow.jobs[name].permissions?.contents ?? workflow.permissions.contents).toBe('read');
    }
    expect(workflow.jobs['engine-pack'].if).toContain('!inputs.updater_qa_published');
    expect(qa.env.GBA_UPDATER_QA_ROOT).toContain('github.workspace');
    expect(qa.steps.map(step => step.run).filter(Boolean).join('\n')).toContain('scripts/prepare-published-updater-qa.mjs');
    expect(qa.steps.find(step => step.name === 'Upload updater evidence').with.path).toMatch(/\/evidence\/$/);
  });
  it('pins unpublished candidates and contains no release publication steps', () => {
    const inputs = workflow.on.workflow_dispatch.inputs;
    expect(Object.keys(inputs).length).toBeLessThanOrEqual(10);
    expect(inputs.updater_qa_source_version.default).toBe('0.1.0-rc.6');
    expect(inputs.updater_qa_target_version.default).toBe('0.1.0-rc.7');
    expect(inputs.updater_qa_target_draft.default).toBe(false);
    expect(inputs.updater_qa_native_platform.default).toBe('all');
    expect(inputs.updater_qa_scene_build_timeout_ms.default).toBe('300000');
    const qa = workflow.jobs['published-updater-qa'];
    expect(qa.env.GBA_UPDATER_QA_TARGET_SHA).toContain('inputs.updater_qa_target_sha');
    expect(qa.env.GBA_UPDATER_QA_TARGET_DRAFT).toContain('inputs.updater_qa_target_draft');
    expect(qa.env.GBA_STUDIO_EXEMPLO_SCENE_BUILD_TIMEOUT_MS).toContain('inputs.updater_qa_scene_build_timeout_ms');
    expect(qa.steps.find(step => step.name === 'Verify QA changes preserve the frozen candidate').if).toBe('inputs.updater_qa_target_draft');
    expect(qa.steps.find(step => step.uses?.startsWith('actions/checkout')).with['fetch-depth']).toBe(0);
    expect(workflow.permissions.contents).toBe('read');
    expect(qa.steps.some(step => /gh release (create|edit|upload)/.test(step.run ?? ''))).toBe(false);
  });
  it('validates the installed updated product, bundled toolchain and scene ROMs on each native host', () => {
    const qa = workflow.jobs['published-updater-qa'];
    const step = qa.steps.find(item => item.name === 'Validate updated installed editor and ROM on the native host');
    for (const script of ['smoke-macos-app-bundle.mjs', 'smoke-electron-welcome.mjs', 'smoke-electron-exemplo-template.mjs', 'smoke-electron-exemplo-scenes.mjs']) {
      expect(step.run).toContain(script);
    }
    expect(step.run).toContain('fixture.sourceExecutable');
    expect(step.run).toContain("GBA_STUDIO_OFFLINE_SMOKE: '1'");
    expect(step.run).toContain('assert.equal(result.status, 0');
    expect(qa['timeout-minutes']).toBeGreaterThanOrEqual(45);
  });
});
