import { z } from 'zod';
import type { ToolDef } from './register.js';
import { resolveAdAccount } from './register.js';
import { adAccountId, dateRange, paginate } from './schemas.js';

const FORM_FIELDS = 'id,name,status,locale,questions,privacy_policy_url,follow_up_action_url,created_time';
const LEAD_FIELDS = 'id,created_time,ad_id,adset_id,campaign_id,form_id,field_data,platform';

const listFormsSchema = z.object({ ad_account_id: adAccountId, page_id: z.string().optional(), ...paginate.shape });
const getFormSchema = z.object({ form_id: z.string() });
const listLeadsSchema = z.object({ form_id: z.string(), date_range: dateRange.optional(), ...paginate.shape });
const getLeadSchema = z.object({ lead_id: z.string() });
const exportSchema = z.object({ form_id: z.string(), date_range: dateRange });

interface LeadRaw { id: string; created_time: string; ad_id?: string; field_data: Array<{ name: string; values: string[] }> }

function flattenLead(l: LeadRaw): Record<string, string> {
  const out: Record<string, string> = { id: l.id, created_time: l.created_time };
  if (l.ad_id) out.ad_id = l.ad_id;
  for (const f of l.field_data) out[f.name] = f.values.join('; ');
  return out;
}

export const leadsTools: ToolDef<any>[] = [
  {
    name: 'list_lead_forms',
    description: 'List lead generation forms. Provide page_id (preferred) or ad_account_id.',
    schema: listFormsSchema,
    handler: async (a, ctx) => {
      if (a.page_id) return ctx.client.get(`/${a.page_id}/leadgen_forms`, { fields: FORM_FIELDS, limit: a.limit ?? 50, after: a.after });
      const acct = resolveAdAccount(a.ad_account_id, ctx.creds);
      return ctx.client.get(`/${acct}/leadgen_forms`, { fields: FORM_FIELDS, limit: a.limit ?? 50, after: a.after });
    },
  },
  {
    name: 'get_lead_form',
    description: 'Get the full definition of a lead form (questions, privacy policy, etc.).',
    schema: getFormSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.form_id}`, { fields: FORM_FIELDS }),
  },
  {
    name: 'list_leads',
    description: 'List leads for a form. Optionally filter by date range.',
    schema: listLeadsSchema,
    handler: async (a, ctx) => {
      return ctx.client.get(`/${a.form_id}/leads`, {
        fields: LEAD_FIELDS,
        limit: a.limit ?? 100,
        after: a.after,
        filtering: a.date_range ? [{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(new Date(a.date_range.since).getTime() / 1000) }] : undefined,
      });
    },
  },
  {
    name: 'get_lead',
    description: 'Get a single lead including field values.',
    schema: getLeadSchema,
    handler: async (a, ctx) => ctx.client.get(`/${a.lead_id}`, { fields: LEAD_FIELDS }),
  },
  {
    name: 'export_leads',
    description: 'Bulk fetch leads from a form in a date range, returned as flat CSV-ready rows.',
    schema: exportSchema,
    handler: async (a, ctx) => {
      const rows: Record<string, string>[] = [];
      let after: string | undefined;
      const sinceMs = new Date(a.date_range.since).getTime();
      const untilMs = new Date(a.date_range.until).getTime() + 86_400_000;
      for (let page = 0; page < 50; page++) {
        const res = await ctx.client.get(`/${a.form_id}/leads`, { fields: LEAD_FIELDS, limit: 100, after }) as any;
        for (const l of res.data as LeadRaw[]) {
          const t = new Date(l.created_time).getTime();
          if (isNaN(t) || (t >= sinceMs && t <= untilMs)) rows.push(flattenLead(l));
        }
        if (!res.paging?.cursors?.after || res.data.length === 0) break;
        after = res.paging.cursors.after;
      }
      return { rows, count: rows.length };
    },
  },
];
