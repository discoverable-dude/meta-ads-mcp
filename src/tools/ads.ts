import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const AD_FIELDS = 'id,name,adset_id,campaign_id,status,effective_status,creative,created_time';

const listSchema = z.object({
  ad_set_id: z.string().optional(),
  campaign_id: z.string().optional(),
  ad_account_id: adAccountId,
  ...paginate.shape,
});
const getSchema = z.object({ ad_id: z.string() });
const createSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  adset_id: z.string(),
  creative: z.object({ creative_id: z.string() }),
  status: z.enum(['PAUSED', 'ACTIVE']).default('PAUSED'),
});
const updateSchema = z.object({
  ad_id: z.string(),
  name: z.string().optional(),
  status: z.enum(['PAUSED', 'ACTIVE', 'ARCHIVED']).optional(),
});
const idSchema = z.object({ ad_id: z.string() });

export const adsTools: ToolDef<any>[] = [
  {
    name: 'list_ads',
    description: 'List ads. Provide ad_set_id, campaign_id, or ad_account_id.',
    schema: listSchema,
    handler: async (a, ctx) => {
      if (a.ad_set_id) return ctx.client.get(`/${a.ad_set_id}/ads`, { fields: AD_FIELDS, limit: a.limit ?? 50, after: a.after });
      if (a.campaign_id) return ctx.client.get(`/${a.campaign_id}/ads`, { fields: AD_FIELDS, limit: a.limit ?? 50, after: a.after });
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/ads`, { fields: AD_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_ad',
    description: 'Get a single ad by id.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.ad_id}`, { fields: AD_FIELDS }),
  },
  {
    name: 'create_ad',
    description: 'Create an ad by attaching an existing creative to an ad set.',
    schema: createSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { ad_account_id, ...body } = a as any;
      return ctx.client.post(`/${acct}/ads`, body);
    },
  },
  {
    name: 'update_ad',
    description: 'Update an ad.',
    schema: updateSchema,
    handler: async (a, ctx) => {
      const { ad_id, ...body } = a as any;
      return ctx.client.post(`/${ad_id}`, body);
    },
  },
  { name: 'pause_ad', description: 'Pause an ad.', schema: idSchema, handler: async (a, ctx) => ctx.client.post(`/${a.ad_id}`, { status: 'PAUSED' }) },
  { name: 'resume_ad', description: 'Resume an ad.', schema: idSchema, handler: async (a, ctx) => ctx.client.post(`/${a.ad_id}`, { status: 'ACTIVE' }) },
];
