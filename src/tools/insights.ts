import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { dateRange } from './schemas.js';

const DEFAULT_METRICS = ['impressions', 'reach', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'actions', 'action_values'];

const schema = z.object({
  level: z.enum(['account', 'campaign', 'adset', 'ad']),
  object_id: z.string().optional(),
  ad_account_id: z.string().regex(/^act_\d+$/).optional(),
  date_range: dateRange,
  breakdowns: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  after: z.string().optional(),
});

export const insightsTools: ToolDef<any>[] = [
  {
    name: 'get_insights',
    description: 'Fetch performance insights at account/campaign/adset/ad level. Provide object_id for non-account levels (or defaults to account).',
    schema,
    handler: async (a, ctx) => {
      const target = a.level === 'account' ? resolveAdAccount(a.ad_account_id, ctx.creds) : a.object_id;
      if (!target) throw { code: 'INVALID_PARAM', message: 'object_id required for non-account insights' };
      return ctx.client.get(`/${target}/insights`, {
        level: a.level,
        time_range: a.date_range,
        breakdowns: a.breakdowns,
        fields: (a.metrics ?? DEFAULT_METRICS).join(','),
        limit: a.limit ?? 100,
        after: a.after,
      });
    },
  },
];
