import { describe, it, expect } from 'vitest';
import { evaluateGuard } from '../../src/tools/guard.js';

describe('evaluateGuard', () => {
  it('passes when no budget set', () => {
    expect(evaluateGuard({ action: 'pause_campaign', dailyBudgetCents: undefined, confirm: false, thresholdCents: 3000 }).ok).toBe(true);
  });
  it('passes when budget below threshold', () => {
    expect(evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: 2500, confirm: false, thresholdCents: 3000 }).ok).toBe(true);
  });
  it('blocks when above threshold without confirm', () => {
    const r = evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: 5000, confirm: false, thresholdCents: 3000 });
    expect(r.ok).toBe(false);
    expect(r.preview).toMatchObject({ action: 'update_ad_set', changes: { daily_budget: 5000 } });
  });
  it('passes above threshold with confirm', () => {
    expect(evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: 5000, confirm: true, thresholdCents: 3000 }).ok).toBe(true);
  });
});
