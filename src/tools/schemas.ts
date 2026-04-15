import { z } from 'zod';

export const adAccountId = z.string().regex(/^act_\d+$/, 'must look like act_123...').optional();

export const dateRange = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const paginate = z.object({
  limit: z.number().int().positive().max(500).optional(),
  after: z.string().optional(),
});

export const confirmFlag = z.object({ confirm: z.boolean().optional() });
