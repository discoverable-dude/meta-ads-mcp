#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { readCredentials } from './auth/credentials.js';
import { buildContext, registerTools, type ToolContext } from './tools/register.js';
import { accountsTools } from './tools/accounts.js';
import { campaignsTools } from './tools/campaigns.js';
import { adsetsTools } from './tools/adsets.js';
import { adsTools } from './tools/ads.js';
import { creativesTools } from './tools/creatives.js';
import { audiencesTools } from './tools/audiences.js';
import { insightsTools } from './tools/insights.js';
import { leadsTools } from './tools/leads.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = new Server({ name: 'meta-ads-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

  const getContext = async (): Promise<ToolContext> => {
    const creds = await readCredentials(config.credentialsDir);
    if (!creds) throw { code: 'AUTH_EXPIRED', message: 'No credentials. Run: meta-ads-mcp auth' };
    return buildContext(config, creds);
  };

  const all = [
    ...accountsTools, ...campaignsTools, ...adsetsTools, ...adsTools,
    ...creativesTools, ...audiencesTools, ...insightsTools, ...leadsTools,
  ];
  registerTools(server, all, getContext);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ level: 'error', msg: err?.message ?? String(err) }) + '\n');
  process.exit(1);
});
