import { loadConfig } from '../src/config.js';
import { readCredentials } from '../src/auth/credentials.js';
import { buildContext } from '../src/tools/register.js';
import { accountsTools } from '../src/tools/accounts.js';
import { campaignsTools } from '../src/tools/campaigns.js';
import { insightsTools } from '../src/tools/insights.js';

async function main() {
  const config = loadConfig();
  const creds = await readCredentials(config.credentialsDir);
  if (!creds) throw new Error('Not authenticated. Run: meta-ads-mcp auth');
  const ctx = await buildContext(config, creds);

  console.log('--- whoami ---');
  console.log(await accountsTools.find(t => t.name === 'whoami')!.handler({}, ctx));

  console.log('--- list_ad_accounts ---');
  console.log(await accountsTools.find(t => t.name === 'list_ad_accounts')!.handler({}, ctx));

  console.log('--- list_campaigns ---');
  console.log(await campaignsTools.find(t => t.name === 'list_campaigns')!.handler({ limit: 5 }, ctx));

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  console.log('--- get_insights (account, last 7d) ---');
  console.log(await insightsTools[0].handler({ level: 'account', date_range: { since: weekAgo, until: today } }, ctx));
}

main().catch((e) => { console.error(e); process.exit(1); });
