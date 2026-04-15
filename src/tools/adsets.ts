import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { evaluateGuard } from './guard.js';
import { adAccountId, paginate } from './schemas.js';

const ADSET_FIELDS = 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,targeting,start_time,end_time';

const listSchema = z.object({ campaign_id: z.string().optional(), ad_account_id: adAccountId, ...paginate.shape });
const getSchema = z.object({ ad_set_id: z.string() });
const createSchema = z.object({
  ad_account_id: adAccountId,
  campaign_id: z.string(),
  name: z.string(),
  daily_budget: z.number().int().positive().optional(),
  lifetime_budget: z.number().int().positive().optional(),
  optimization_goal: z.string(),
  billing_event: z.string(),
  bid_amount: z.number().int().positive().optional(),
  targeting: z.record(z.any()),
  status: z.enum(['PAUSED', 'ACTIVE']).default('PAUSED'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  confirm: z.boolean().optional(),
});
const updateSchema = z.object({
  ad_set_id: z.string(),
  name: z.string().optional(),
  status: z.enum(['PAUSED', 'ACTIVE', 'ARCHIVED']).optional(),
  daily_budget: z.number().int().positive().optional(),
  bid_amount: z.number().int().positive().optional(),
  targeting: z.record(z.any()).optional(),
  confirm: z.boolean().optional(),
});

export const adsetsTools: ToolDef<any>[] = [
  {
    name: 'list_ad_sets',
    description: 'List ad sets. Provide campaign_id (preferred) or ad_account_id.',
    schema: listSchema,
    handler: async (a, ctx) => {
      if (a.campaign_id) {
        return ctx.client.get(`/${a.campaign_id}/adsets`, { fields: ADSET_FIELDS, limit: a.limit ?? 50, after: a.after });
      }
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/adsets`, { fields: ADSET_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_ad_set',
    description: 'Get a single ad set.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.ad_set_id}`, { fields: ADSET_FIELDS }),
  },
  {
    name: 'create_ad_set',
    description: 'Create an ad set. Budgets above threshold require confirm:true.',
    schema: createSchema,
    handler: async (a, ctx) => {
      const guard = evaluateGuard({ action: 'create_ad_set', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { confirm, ad_account_id, ...body } = a as any;
      return ctx.client.post(`/${acct}/adsets`, body);
    },
  },
  {
    name: 'update_ad_set',
    description: 'Update an ad set. Raising daily_budget above threshold requires confirm:true.',
    schema: updateSchema,
    handler: async (a, ctx) => {
      const guard = evaluateGuard({ action: 'update_ad_set', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      const { ad_set_id, confirm, ...body } = a as any;
      return ctx.client.post(`/${ad_set_id}`, body);
    },
  },
];
