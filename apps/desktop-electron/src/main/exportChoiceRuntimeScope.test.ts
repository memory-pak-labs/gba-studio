import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEngineExportProjectContract } from './exportEngineProject.js';

describe('choice callbacks in mixed runtime projects', () => {
  it('keeps a topdown shop callback out of visual novel groups without changing dialogue indices', () => {
    const p = JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8'));
    p.dialogues.push({ key: 'scope_shop', text: 'Workshop', choices: ['Scoped shop'] });
    p.events.push(
      { id: 'scope-binding', name: 'scope_binding', roomName: 'porto_lumen', category: 'Test', detail: 'Scoped choice', command: 'noop', steps: [{ command: 'choice_event scope_shop 0 scope_purchase' }, { command: 'show_choice scope_shop' }] },
      { id: 'scope-purchase', name: 'scope_purchase', roomName: 'porto_lumen', category: 'Test', detail: 'Scoped shop', command: 'noop', steps: [{ command: 'open_shop port-mechanic' }] }
    );
    p.events.push({ id: 'unequip', name: 'unequip', roomName: 'porto_lumen', category: 'Test', detail: 'Clear slot', command: 'noop', steps: [{ command: 'set_equipped_item 0 none' }] });
    const c = buildEngineExportProjectContract(p);
    expect(c.topdown_project!.scripts.find(s => s.name === 'unequip')!.script).toContainEqual({ op: 'set_equipped_item', slot: 0, item: -1 });
    const line = p.dialogues.findIndex((d: { key: string }) => d.key === 'scope_shop');
    expect(c.topdown_project!.choice_groups!.find(g => g.line === line)!.choices[0]!.script).toContainEqual(expect.objectContaining({ op: 'open_shop' }));
    expect(c.visual_novel_project!.choice_groups!.find(g => g.line === line)!.choices[0]!.script).toBeUndefined();
    expect(c.visual_novel_project!.choice_groups!.find(g => g.line === p.dialogues.findIndex((d: { key: string }) => d.key === 'conselho'))!.choices[0]!.script?.length).toBeGreaterThan(0);
  });
});
