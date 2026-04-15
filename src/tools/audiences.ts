import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const AUD_FIELDS = 'id,name,description,subtype,approximate_count_lower_bound,approximate_count_upper_bound,time_created,time_updated';

const listSchema = z.object({ ad_account_id: adAccountId, ...paginate.shape });
const createSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  subtype: z.enum(['CUSTOM', 'WEBSITE', 'APP', 'LOOKALIKE', 'ENGAGEMENT']),
  description: z.string().optional(),
  rule: z.record(z.any()).optional(),
});
const updateSchema = z.object({
  audience_id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
});

export const audiencesTools: ToolDef<any>[] = [
  {
    name: 'list_audiences',
    description: 'List custom audiences in an ad account.',
    schema: listSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/customaudiences`, { fields: AUD_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'create_custom_audience',
    description: 'Create a custom audience. Expects subtype and optional targeting rule.',
    schema: createSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      const { ad_account_id, ...body } = a as any;
      return ctx.client.post(`/${acct}/customaudiences`, body);
    },
  },
  {
    name: 'update_audience',
    description: 'Update an audience name/description.',
    schema: updateSchema,
    handler: async (a, ctx) => {
      const { audience_id, ...body } = a as any;
      return ctx.client.post(`/${audience_id}`, body);
    },
  },
];
