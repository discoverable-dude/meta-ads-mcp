#!/usr/bin/env node
import { loadConfig } from './config.js';
import { readCredentials, writeCredentials, clearCredentials } from './auth/credentials.js';
import { runOAuthFlow } from './auth/oauth.js';
import { exchangeCode } from './auth/refresh.js';

async function cmdAuth(): Promise<void> {
  const config = loadConfig();
  process.stderr.write('Opening browser for Meta OAuth. If nothing opens, visit the URL below.\n');
  const creds = await runOAuthFlow({
    appId: config.facebookAppId,
    scopes: config.oauthScopes,
    exchange: async (code, verifier, redirectUri) => exchangeCode({ appId: config.facebookAppId, code, verifier, redirectUri }),
    onAuthUrl: (url) => {
      process.stderr.write(`\n${url}\n\n`);
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      import('node:child_process').then(({ spawn }) => spawn(opener, [url], { stdio: 'ignore', detached: true }).unref()).catch(() => {});
    },
  });
  await writeCredentials(config.credentialsDir, {
    userId: creds.userId,
    accessToken: creds.accessToken,
    expiresAt: creds.expiresAt,
  });
  process.stderr.write(`Authenticated as user ${creds.userId}. Token expires ${creds.expiresAt}.\n`);
}

async function cmdLogout(): Promise<void> {
  const config = loadConfig();
  await clearCredentials(config.credentialsDir);
  process.stderr.write('Credentials cleared.\n');
}

async function cmdWhoami(): Promise<void> {
  const config = loadConfig();
  const creds = await readCredentials(config.credentialsDir);
  if (!creds) { process.stderr.write('Not authenticated. Run: meta-ads-mcp auth\n'); process.exit(1); }
  process.stdout.write(JSON.stringify({
    userId: creds.userId,
    expiresAt: creds.expiresAt,
    defaultAdAccountId: creds.defaultAdAccountId ?? null,
  }, null, 2) + '\n');
}

const cmd = process.argv[2];
const run = cmd === 'auth' ? cmdAuth : cmd === 'logout' ? cmdLogout : cmd === 'whoami' ? cmdWhoami : null;
if (!run) {
  process.stderr.write('Usage: meta-ads-mcp <auth|logout|whoami>\n');
  process.exit(1);
}
run().catch((err) => { process.stderr.write(`Error: ${err.message ?? err}\n`); process.exit(1); });
