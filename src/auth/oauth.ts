import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createPkcePair } from './pkce.js';

export interface ExchangeResult {
  accessToken: string;
  userId: string;
  expiresIn: number; // seconds
}

export interface OAuthOptions {
  appId: string;
  scopes: string[];
  exchange: (code: string, verifier: string, redirectUri: string) => Promise<ExchangeResult>;
  onAuthUrl: (url: string) => void;
}

export interface OAuthCredentials {
  accessToken: string;
  userId: string;
  expiresAt: string;
}

export async function runOAuthFlow(opts: OAuthOptions): Promise<OAuthCredentials> {
  const { verifier, challenge, method } = createPkcePair();
  const state = randomBytes(16).toString('base64url');

  return new Promise<OAuthCredentials>((resolve, reject) => {
    let redirectUri = '';
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const returnedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authentication complete.</h2>You can close this window.</body></html>');
      server.close();
      if (error) return reject(new Error(`OAuth error: ${error}`));
      if (returnedState !== state) return reject(new Error('OAuth state mismatch'));
      if (!code) return reject(new Error('OAuth missing code'));
      try {
        const r = await opts.exchange(code, verifier, redirectUri);
        resolve({
          accessToken: r.accessToken,
          userId: r.userId,
          expiresAt: new Date(Date.now() + r.expiresIn * 1000).toISOString(),
        });
      } catch (e) { reject(e as Error); }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      redirectUri = `http://localhost:${port}/callback`;
      const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
      authUrl.searchParams.set('client_id', opts.appId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', opts.scopes.join(','));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', method);
      authUrl.searchParams.set('response_type', 'code');
      opts.onAuthUrl(authUrl.toString());
    });
  });
}
