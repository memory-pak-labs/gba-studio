import { describe, expect, it } from 'vitest';
import config from '../vitest.config.ts';

describe('full-project fixture scheduling', () => {
  const projects = config.test.projects.map(p => p.test);
  const unit = projects.find(p => p.name === 'unit');
  const integration = projects.find(p => p.name === 'project-integration');
  const performance = projects.find(p => p.name === 'project-open-perf');
  it('keeps the full campaign analysis in the functional suite exactly once', () => {
    const file = 'src/shared/sceneAnalysis.test.ts';
    expect(unit.exclude).toContain(file);
    expect(integration?.include).toContain(file);
    expect(performance.include).not.toContain(file);
  });
  it('runs large project fixtures alone, after unit tests and before performance', () => {
    expect(integration?.maxWorkers).toBe(1);
    expect(integration?.fileParallelism).toBe(false);
    expect(integration?.sequence.groupOrder).toBeGreaterThan(unit.sequence.groupOrder);
    expect(performance.sequence.groupOrder).toBeGreaterThan(integration?.sequence.groupOrder);
  });
});
