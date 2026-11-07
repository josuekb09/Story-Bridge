import crypto from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';

const b64url = value => Buffer.from(value).toString('base64url');
const looksLikeKey = (value, prefix) => value.startsWith(`sb_${prefix}_`) && value.length >= 24 || value.startsWith('eyJ') && value.split('.').length === 3;
export function parseAccountConfig(env = process.env) {
  const backend = env.STORY_BACKEND || '';
  const authMode = env.STORY_AUTH_MODE || '';
  if (!['file', 'supabase'].includes(backend) || !['legacy', 'account'].includes(authMode)) throw new Error('Story Bridge backend and auth mode must be explicitly selected.');
  if (backend === 'file' && env.NODE_ENV === 'production') throw new Error('The file backend is available only in local development.');
  if (backend === 'supabase' && authMode !== 'account') throw new Error('Supabase requires account auth mode.');
  if (authMode === 'account') {
    if (env.STORY_TEST_JWKS && env.NODE_ENV !== 'test') throw new Error('Local test signing keys are allowed only in automated tests.');
    if (env.STORY_TEST_JWKS) {
      try { if (!Array.isArray(JSON.parse(env.STORY_TEST_JWKS).keys)) throw new Error('invalid'); }
      catch { throw new Error('Local test signing key set is invalid.'); }
    }
    let url;
    try { url = new URL(env.SUPABASE_URL); } catch { throw new Error('Supabase URL is missing or invalid.'); }
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) || url.pathname !== '/' || url.search || url.hash) throw new Error('Supabase URL must be an HTTPS project URL.');
    if (!looksLikeKey(env.SUPABASE_PUBLISHABLE_KEY || '', 'publishable') || !looksLikeKey(env.SUPABASE_SECRET_KEY || '', 'secret')) throw new Error('Supabase publishable and server-only secret keys are missing or invalid.');
    if (env.SUPABASE_PUBLISHABLE_KEY === env.SUPABASE_SECRET_KEY) throw new Error('Supabase keys are invalid.');
    if (env.SUPABASE_BUCKET !== 'story-bridge-audio') throw new Error('The private story-bridge-audio bucket is required.');
    let jwksUrl = '';
    if (env.STORY_JWKS_URL) {
      let discovery;
      try { discovery = new URL(env.STORY_JWKS_URL); } catch { throw new Error('Key discovery URL is invalid.'); }
      if (discovery.username || discovery.password) throw new Error('Key discovery URL must not include user information.');
      const loopback = discovery.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(discovery.hostname);
      if (!loopback && !(discovery.protocol === 'https:' && discovery.host === url.host)) throw new Error('Key discovery URL must be on the Supabase project host or loopback.');
      jwksUrl = discovery.href;
    }
    return { backend, authMode, account: true, jwksUrl, url: url.origin, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, secretKey: env.SUPABASE_SECRET_KEY, bucket: env.SUPABASE_BUCKET, google: env.STORY_GOOGLE_SIGN_IN === 'true', email: env.STORY_EMAIL_CODE_SIGN_IN === 'true', jwks: env.STORY_TEST_JWKS || '' };
  }
  if (backend !== 'file' || authMode !== 'legacy') throw new Error('The selected Story Bridge backend and auth mode are incompatible.');
  return { backend, authMode, account: false, jwksUrl: '', url: '', publishableKey: '', secretKey: '', bucket: '', google: false, email: false, jwks: '' };
}

export function createTokenVerifier(config, { fetchImpl = fetch, clock = () => Date.now() } = {}) {
  let cached = null, lastRefresh = 0;
  async function loadKeys(force) {
    const now = clock();
    if (cached && !force && cached.until > now) return cached.set;
    if (force && cached && now - lastRefresh < 30_000) return cached.set;
    let keys;
    try {
      if (config.jwks) keys = JSON.parse(config.jwks).keys;
      else {
        const response = await fetchImpl(config.jwksUrl || `${config.url}/auth/v1/.well-known/jwks.json`, {
          headers: { apikey: config.publishableKey },
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) throw new Error('key-discovery-failed');
        keys = (await response.json()).keys;
      }
    } catch { throw new Error('key-discovery-failed'); }
    if (!Array.isArray(keys) || !keys.length) throw new Error('key-discovery-failed');
    lastRefresh = now;
    cached = { set: createLocalJWKSet({ keys }), until: now + 300_000 };
    return cached.set;
  }
  const options = { algorithms: ['RS256', 'ES256'], issuer: `${config.url}/auth/v1`, audience: 'authenticated', clockTolerance: 5, requiredClaims: ['exp', 'sub'] };
  return async token => {
    let payload;
    try {
      try { ({ payload } = await jwtVerify(token, await loadKeys(false), { ...options, currentDate: new Date(clock()) })); }
      catch (error) {
        if (error?.message === 'key-discovery-failed') throw error;
        if (error?.code !== 'ERR_JWKS_NO_MATCHING_KEY') throw error;
        ({ payload } = await jwtVerify(token, await loadKeys(true), { ...options, currentDate: new Date(clock()) }));
      }
    } catch (error) {
      throw new Error(error?.message === 'key-discovery-failed' ? 'key-discovery-failed' : 'invalid-token');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('invalid-token');
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
  };
}

export function signTestToken(claims, privateKey, kid = 'local-test-key', alg = 'RS256') {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const signature = alg === 'ES256' ? crypto.sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' }) : crypto.sign('RSA-SHA256', Buffer.from(data), privateKey);
  return `${data}.${signature.toString('base64url')}`;
}
