import os from 'node:os';
import path from 'node:path';

export interface Config {
  confirmThresholdCents: number;
  graphVersion: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  credentialsDir: string;
  facebookAppId: string;
  oauthScopes: string[];
}

export function loadConfig(): Config {
  return {
    confirmThresholdCents: Number(process.env.META_ADS_MCP_CONFIRM_THRESHOLD ?? 3000),
    graphVersion: process.env.META_ADS_MCP_GRAPH_VERSION ?? 'v21.0',
    logLevel: (process.env.META_ADS_MCP_LOG_LEVEL ?? 'info') as Config['logLevel'],
    credentialsDir: process.env.META_ADS_MCP_CREDENTIALS_DIR ?? path.join(os.homedir(), '.meta-ads-mcp'),
    facebookAppId: process.env.META_ADS_MCP_APP_ID ?? 'REPLACE_WITH_FB_APP_ID',
    oauthScopes: [
      'ads_management',
      'ads_read',
      'business_management',
      'pages_show_list',
      'pages_read_engagement',
      'leads_retrieval',
    ],
  };
}
