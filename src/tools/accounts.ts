import { z } from 'zod';
import type { ToolDef } from './register.js';

const listSchema = z.object({});
const setDefaultSchema = z.object({ ad_account_id: z.string().regex(/^act_\d+$/) });
const whoamiSchema = z.object({});

export const accountsTools: ToolDef<any>[] = [
  {
    name: 'list_ad_accounts',
    description: 'List all Meta ad accounts the authenticated user can access.',
    schema: listSchema,
    handler: async (_args, ctx) => {
      const res = await ctx.client.get('/me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name' });
      return { accounts: res.data };
    },
  },
  {
    name: 'set_default_account',
    description: 'Set the default ad account used when tools are called without ad_account_id.',
    schema: setDefaultSchema,
    handler: async (args, ctx) => {
      await ctx.setDefaultAdAccount(args.ad_account_id);
      return { ok: true, defaultAdAccountId: args.ad_account_id };
    },
  },
  {
    name: 'whoami',
    description: 'Return the authenticated user and current default ad account.',
    schema: whoamiSchema,
    handler: async (_args, ctx) => {
      const me = await ctx.client.get('/me', { fields: 'id,name' });
      return { userId: me.id, name: me.name, defaultAdAccountId: ctx.creds.defaultAdAccountId };
    },
  },
];
