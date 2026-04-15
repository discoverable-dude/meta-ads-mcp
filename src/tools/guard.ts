export interface GuardInput {
  action: string;
  dailyBudgetCents: number | undefined;
  confirm: boolean;
  thresholdCents: number;
}

export interface GuardResult {
  ok: boolean;
  preview?: {
    requires_confirmation: true;
    action: string;
    changes: Record<string, unknown>;
    reason: string;
  };
}

export function evaluateGuard(i: GuardInput): GuardResult {
  if (i.dailyBudgetCents === undefined) return { ok: true };
  if (i.dailyBudgetCents <= i.thresholdCents) return { ok: true };
  if (i.confirm) return { ok: true };
  return {
    ok: false,
    preview: {
      requires_confirmation: true,
      action: i.action,
      changes: { daily_budget: i.dailyBudgetCents },
      reason: `daily_budget ${i.dailyBudgetCents} cents exceeds threshold ${i.thresholdCents} cents`,
    },
  };
}
