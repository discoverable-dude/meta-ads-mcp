import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const CAMPAIGN_FIELDS = 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,created_time';

const listSchema = z.object({ ad_account_id: adAccountId, status: z.string().optional(), ...paginate.shape });
const getSchema = z.object({ campaign_id: z.string() });
const createSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  objective: z.string(),
  status: z.enum(['PAUSED', 'ACTIVE']).default('PAUSED'),
  special_ad_categories: z.array(z.string()).default([]),
  daily_budget: z.number().int().positive().optional(),
  lifetime_budget: z.number().int().positive().optional(),
});
const updateSchema = z.object({
  campaign_id: z.string(),
  name: z.string().optional(),
  status: z.enum(['PAUSED', 'ACTIVE', 'ARCHIVED']).optional(),
  daily_budget: z.number().int().positive().optional(),
});
const idSchema = z.object({ campaign_id: z.string() });

export const campaignsTools: ToolDef<any>[] = [
  {
    name: 'list_campaigns',
    description: 'List campaigns in an ad account.',
    schema: listSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const res = await ctx.client.get(`/${acct}/campaigns`, {
        fields: CAMPAIGN_FIELDS,
        limit: a.limit ?? 50,
        after: a.after,
        effective_status: a.status ? [a.status] : undefined,
      });
      return res;
    },
  },
  {
    name: 'get_campaign',
    description: 'Get a single campaign by id.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.campaign_id}`, { fields: CAMPAIGN_FIELDS }),
  },
  {
    name: 'create_campaign',
    description: 'Create a campaign. New campaigns with daily_budget above threshold require confirm:true.',
    schema: createSchema.extend({ confirm: z.boolean().optional() }),
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { evaluateGuard } = await import('./guard.js');
      const guard = evaluateGuard({ action: 'create_campaign', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      return ctx.client.post(`/${acct}/campaigns`, {
        name: a.name,
        objective: a.objective,
        status: a.status,
        special_ad_categories: a.special_ad_categories,
        daily_budget: a.daily_budget,
        lifetime_budget: a.lifetime_budget,
      });
    },
  },
  {
    name: 'update_campaign',
    description: 'Update a campaign. Raising daily_budget above threshold requires confirm:true.',
    schema: updateSchema.extend({ confirm: z.boolean().optional() }),
    handler: async (a, ctx) => {
      const { evaluateGuard } = await import('./guard.js');
      const guard = evaluateGuard({ action: 'update_campaign', dailyBudgetCents: a.daily_budget, confirm: !!a.confirm, thresholdCents: ctx.config.confirmThresholdCents });
      if (!guard.ok) return guard.preview;
      const body: any = {};
      if (a.name) body.name = a.name;
      if (a.status) body.status = a.status;
      if (a.daily_budget) body.daily_budget = a.daily_budget;
      return ctx.client.post(`/${a.campaign_id}`, body);
    },
  },
  {
    name: 'pause_campaign',
    description: 'Pause a campaign (no confirm required).',
    schema: idSchema,
    handler: async (a, ctx) => ctx.client.post(`/${a.campaign_id}`, { status: 'PAUSED' }),
  },
  {
    name: 'resume_campaign',
    description: 'Resume a paused campaign.',
    schema: idSchema,
    handler: async (a, ctx) => ctx.client.post(`/${a.campaign_id}`, { status: 'ACTIVE' }),
  },
];
