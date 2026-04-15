import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GraphClient } from '../graph/client.js';
import type { Config } from '../config.js';
import type { Credentials } from '../auth/credentials.js';
import { writeCredentials } from '../auth/credentials.js';
import { maybeRefresh } from '../auth/refresh.js';
import { log } from '../logger.js';

export interface ToolContext {
  client: GraphClient;
  config: Config;
  creds: Credentials;
  setDefaultAdAccount(id: string): Promise<void>;
}

export interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  handler: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

export async function buildContext(config: Config, credsIn: Credentials): Promise<ToolContext> {
  const creds = await maybeRefresh(credsIn, { appId: config.facebookAppId });
  if (creds !== credsIn) await writeCredentials(config.credentialsDir, creds);
  const client = new GraphClient({ accessToken: creds.accessToken, graphVersion: config.graphVersion });
  return {
    client,
    config,
    creds,
    async setDefaultAdAccount(id: string) {
      const updated = { ...creds, defaultAdAccountId: id };
      await writeCredentials(config.credentialsDir, updated);
      creds.defaultAdAccountId = id;
    },
  };
}

export function resolveAdAccount(explicit: string | undefined, creds: Credentials): string {
  const id = explicit ?? creds.defaultAdAccountId;
  if (!id) {
    throw { code: 'INVALID_PARAM', message: 'No ad_account_id provided and no default set. Call set_default_account first.' };
  }
  return id;
}

export function registerTools(server: Server, defs: ToolDef<any>[], getContext: () => Promise<ToolContext>): void {
  // Register ListToolsRequest handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: defs.map(def => ({
        name: def.name,
        description: def.description,
        inputSchema: {
          type: 'object' as const,
          properties: def.schema.shape ?? {},
          required: [],
        },
      })),
    };
  });

  // Register CallToolRequest handler
  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const def = defs.find(d => d.name === request.params.name);
    if (!def) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Tool not found' }) }], isError: true };
    }

    const start = Date.now();
    try {
      const ctx = await getContext();
      const parsed = def.schema.parse(request.params.arguments);
      const result = await def.handler(parsed, ctx);
      log({ ts: new Date().toISOString(), level: 'info', tool: def.name, durationMs: Date.now() - start, args: parsed });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      log({ ts: new Date().toISOString(), level: 'error', tool: def.name, durationMs: Date.now() - start, code: err.code, msg: err.message });
      return { content: [{ type: 'text', text: JSON.stringify({ error: err }, null, 2) }], isError: true };
    }
  });
}
