import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, paginate } from './schemas.js';

const CREATIVE_FIELDS = 'id,name,title,body,image_url,thumbnail_url,object_story_spec,status';

const listSchema = z.object({ ad_account_id: adAccountId, ...paginate.shape });
const getSchema = z.object({ creative_id: z.string() });
const uploadSchema = z.object({
  ad_account_id: adAccountId,
  name: z.string(),
  page_id: z.string(),
  image_url: z.string().url(),
  message: z.string(),
  link: z.string().url(),
  link_title: z.string().optional(),
  call_to_action: z.string().optional(),
});

export const creativesTools: ToolDef<any>[] = [
  {
    name: 'list_creatives',
    description: 'List ad creatives in an ad account.',
    schema: listSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/adcreatives`, { fields: CREATIVE_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_creative',
    description: 'Get a single ad creative by id.',
    schema: getSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.creative_id}`, { fields: CREATIVE_FIELDS }),
  },
  {
    name: 'upload_creative',
    description: 'Create a link-ad creative from an image URL.',
    schema: uploadSchema,
    handler: async (a, ctx) => {
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.post(`/${acct}/adcreatives`, {
        name: a.name,
        object_story_spec: {
          page_id: a.page_id,
          link_data: {
            link: a.link,
            message: a.message,
            name: a.link_title,
            picture: a.image_url,
            call_to_action: a.call_to_action ? { type: a.call_to_action } : undefined,
          },
        },
      });
    },
  },
];
