import { createServer, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { OAuthSession, TOKEN_URL, type OAuthConfig, type OAuthOptions } from '../src/oauth.js';

/** Entire OAuth provider is local/test-only. No Webex account or credentials. */
export async function oauthFixture(options: OAuthOptions = {}) {
  const reserve = createServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const callbackPort = (reserve.address() as { port: number }).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const config: OAuthConfig = { clientId: 'synthetic-client', redirectUri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
    scopes: ['spark:rooms_read', 'spark:messages_read', 'spark:messages_write'] };
  const forms: URLSearchParams[] = []; let challenge = '', mode = 'ok', expiresIn = 3600;
  let held: (() => void) | undefined;
  const respond = (response: ServerResponse, grant: URLSearchParams) => {
    if (mode === 'denied') { response.writeHead(400).end('{"error":"private grant/token details"}'); return; }
    if (mode === 'oversized') { response.writeHead(200).end('x'.repeat(70_000)); return; }
    if (mode === 'redirect') { response.writeHead(302, { Location: 'https://example.invalid/steal' }).end(); return; }
    const count = forms.length;
    const body: Record<string, unknown> = { access_token: `synthetic-access-${count}`, expires_in: expiresIn, token_type: 'Bearer', scope: config.scopes.join(' ') };
    if (mode !== 'retain-refresh' || grant.get('grant_type') === 'authorization_code') {
      body.refresh_token = `synthetic-refresh-${count}`; body.refresh_token_expires_in = 86400;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/token') { response.writeHead(404).end(); return; }
    let text = ''; for await (const chunk of request) text += chunk;
    const form = new URLSearchParams(text); forms.push(form);
    if (form.get('client_secret') !== 'synthetic-client-secret' || form.get('client_id') !== config.clientId
      || form.get('grant_type') === 'authorization_code' && (form.get('redirect_uri') !== config.redirectUri
        || createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== challenge)) {
      response.writeHead(401).end('{"error":"private invalid credentials"}'); return;
    }
    if (mode === 'held') held = () => respond(response, form); else respond(response, form);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const tokenUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/token`;
  const session = new OAuthSession(config, 'synthetic-client-secret', { ...options,
    fetch: async (url, init) => {
      if (url !== TOKEN_URL) throw new Error('Test attempted an unexpected token endpoint.');
      return fetch(tokenUrl, init);
    } });
  const open = async (url: string) => {
    const parsed = new URL(url); challenge = parsed.searchParams.get('code_challenge') ?? '';
    const callback = new URL(config.redirectUri); callback.searchParams.set('code', 'synthetic-code');
    callback.searchParams.set('state', parsed.searchParams.get('state')!);
    await fetch(callback);
  };
  return { session, config, forms, open, setMode(value: string) { mode = value; }, setLifetime(seconds: number) { expiresIn = seconds; },
    setChallenge(value: string) { challenge = value; }, release() { held?.(); held = undefined; },
    async close() { session.close(); held?.(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
