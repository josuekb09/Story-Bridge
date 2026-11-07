import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { parseAccountConfig, createTokenVerifier, signTestToken } from '../server/auth.js';
import { mountAccountRoutes } from '../server/account-routes.js';

// Everything here is synthetic: locally generated keys, loopback servers, no external calls.
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsaJwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'rsa-1', alg: 'RS256', use: 'sig' };
const ecJwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec-1', alg: 'ES256', use: 'sig' };
const URL_ = 'https://story-bridge-test.supabase.co';
const base = { backend: 'supabase', authMode: 'account', account: true, url: URL_, publishableKey: 'sb_publishable_fake_local_test_key_123456', secretKey: 'sb_secret_fake_local_test_key_123456', bucket: 'story-bridge-audio', google: false, email: false, jwksUrl: '' };
const claims = (sub, extra = {}) => ({ sub, iss: `${URL_}/auth/v1`, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...extra });
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const withFetch = keys => ({ fetchImpl: async () => new Response(JSON.stringify({ keys }), { status: 200 }) });

test('verifier accepts RS256 and P-256 ES256 and rejects alg none, key/algorithm confusion, bad kid and tampering', async () => {
  const verify = createTokenVerifier(base, withFetch([rsaJwk, ecJwk]));
  assert.equal((await verify(signTestToken(claims('u1'), rsa.privateKey, 'rsa-1', 'RS256'))).id, 'u1');
  assert.equal((await verify(signTestToken(claims('u2'), ec.privateKey, 'ec-1', 'ES256'))).id, 'u2');
  const good = signTestToken(claims('u1'), rsa.privateKey, 'rsa-1', 'RS256');
  const [h, p, s] = good.split('.');
  await assert.rejects(verify(`${b64({ alg: 'none', kid: 'rsa-1' })}.${b64(claims('u1'))}.`), /invalid-token/);
  await assert.rejects(verify(`${b64({ alg: 'none', kid: 'rsa-1' })}.${b64(claims('u1'))}.${s}`), /invalid-token/);
  // HS256 signed with the public key material as the shared secret.
  const hsData = `${b64({ alg: 'HS256', kid: 'rsa-1' })}.${b64(claims('evil'))}`;
  const hsKey = rsa.publicKey.export({ type: 'spki', format: 'pem' });
  await assert.rejects(verify(`${hsData}.${crypto.createHmac('sha256', hsKey).update(hsData).digest('base64url')}`), /invalid-token/);
  // Header says ES256 but the key with that kid is RSA, and the reverse.
  await assert.rejects(verify(signTestToken(claims('u1'), ec.privateKey, 'rsa-1', 'ES256')), /invalid-token/);
  await assert.rejects(verify(signTestToken(claims('u1'), rsa.privateKey, 'ec-1', 'RS256')), /invalid-token/);
  await assert.rejects(verify(signTestToken(claims('u1'), rsa.privateKey, 'unknown', 'RS256')), /invalid-token/);
  await assert.rejects(verify(`${h}.${b64(claims('someone-else'))}.${s}`), /invalid-token/);
  await assert.rejects(verify(signTestToken(claims('u1', { nbf: Math.floor(Date.now() / 1000) + 600 }), rsa.privateKey, 'rsa-1')), /invalid-token/);
  await assert.rejects(verify(signTestToken({ ...claims('u1'), sub: undefined }, rsa.privateKey, 'rsa-1')), /invalid-token/);
  await assert.rejects(verify('not-a-token'), /invalid-token/);
});

test('verifier refreshes keys once for an unknown kid and fails closed when discovery fails', async () => {
  let calls = 0, keys = [rsaJwk];
  const verify = createTokenVerifier(base, { fetchImpl: async () => { calls++; return new Response(JSON.stringify({ keys }), { status: 200 }); }, clock: () => now });
  let now = Date.now();
  assert.equal((await verify(signTestToken(claims('u1'), rsa.privateKey, 'rsa-1'))).id, 'u1');
  keys = [rsaJwk, ecJwk]; now += 31_000;
  assert.equal((await verify(signTestToken(claims('u2'), ec.privateKey, 'ec-1', 'ES256'))).id, 'u2');
  assert.equal(calls, 2);
  const down = createTokenVerifier(base, { fetchImpl: async () => new Response('x', { status: 500 }) });
  await assert.rejects(down(signTestToken(claims('u1'), rsa.privateKey, 'rsa-1')), /key-discovery-failed/);
  const empty = createTokenVerifier(base, withFetch([]));
  await assert.rejects(empty(signTestToken(claims('u1'), rsa.privateKey, 'rsa-1')), /key-discovery-failed/);
  const thrown = createTokenVerifier(base, { fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(thrown(signTestToken(claims('u1'), rsa.privateKey, 'rsa-1')), /key-discovery-failed/);
});

function memoryStore() {
  const rows = new Map(); const nothing = async () => null;
  return { rows, listPublic: async () => [], listMine: async () => [], get: async id => rows.get(id) || null, create: async r => ({ id: crypto.randomUUID(), ...r }), update: nothing, countMine: async () => 0, claim: async () => false, claimLegacy: async () => 0, profile: async () => ({ display_name: '' }), saveProfile: async (_i, n) => ({ display_name: n }), putAudio: async () => {}, removeAudio: async () => {}, audioUsage: async () => 0, audioResponse: async () => new Response('x', { headers: { 'content-type': 'audio/webm' } }) };
}
async function serve(verify) {
  const app = express(); app.use(express.json());
  mountAccountRoutes(app, base, { store: memoryStore(), verify });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, server };
}

test('every protected route returns 401 for expired, unsigned, wrong-issuer and wrong-audience tokens, and 503 when keys cannot be discovered', async t => {
  const verify = createTokenVerifier(base, withFetch([rsaJwk]));
  const { origin, server } = await serve(verify); t.after(() => new Promise(r => server.close(r)));
  const sign = extra => signTestToken(claims('u1', extra), rsa.privateKey, 'rsa-1');
  const bad = { expired: sign({ exp: 1 }), unsigned: `${b64({ alg: 'none' })}.${b64(claims('u1'))}.`, issuer: sign({ iss: 'https://other.supabase.co/auth/v1' }), audience: sign({ aud: 'anon' }), none: undefined };
  const routes = [
    ['POST', '/api/stories', 'application/json', '{"originalLanguage":"x"}'], ['PUT', '/api/stories/abc', 'application/json', '{"approve":true}'],
    ['GET', '/api/mine'], ['GET', '/api/account/profile'], ['PUT', '/api/account/profile', 'application/json', '{"displayName":"x"}'],
    ['POST', '/api/account/claim'], ['POST', '/api/account/claim/abc'],
  ];
  for (const [name, token] of Object.entries(bad)) for (const [method, route, type, body] of routes) {
    const response = await fetch(origin + route, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(type ? { 'content-type': type } : {}), 'x-owner-token': 'z'.repeat(48) }, body });
    assert.equal(response.status, 401, `${name} ${method} ${route}`);
  }
  // Private audio and private story reads do not become accessible with a bad token.
  const store = memoryStore(); store.rows.set('d', { id: 'd', owner_user_id: 'u1', status: 'draft', visibility: 'private', audio_key: 'k' });
  const app2 = express(); mountAccountRoutes(app2, base, { store, verify });
  const s2 = app2.listen(0, '127.0.0.1'); await new Promise(r => s2.once('listening', r)); t.after(() => new Promise(r => s2.close(r)));
  const o2 = `http://127.0.0.1:${s2.address().port}`;
  for (const token of [bad.expired, bad.unsigned, bad.issuer, bad.audience, undefined]) for (const suffix of ['', '/audio']) {
    assert.equal((await fetch(`${o2}/api/stories/d${suffix}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })).status, 404);
  }
  assert.equal((await fetch(`${o2}/api/stories/d`, { headers: { authorization: `Bearer ${sign()}` } })).status, 200);
  const down = await serve(createTokenVerifier(base, { fetchImpl: async () => new Response('x', { status: 500 }) })); t.after(() => new Promise(r => down.server.close(r)));
  assert.equal((await fetch(`${down.origin}/api/mine`, { headers: { authorization: `Bearer ${sign()}` } })).status, 503);
  assert.equal((await fetch(`${down.origin}/api/stories/d`, { headers: { authorization: `Bearer ${sign()}` } })).status, 503);
});

test('test-only environment switches cannot weaken a production or development start', () => {
  const env = { STORY_BACKEND: 'supabase', STORY_AUTH_MODE: 'account', SUPABASE_URL: URL_, SUPABASE_PUBLISHABLE_KEY: base.publishableKey, SUPABASE_SECRET_KEY: base.secretKey, SUPABASE_BUCKET: 'story-bridge-audio' };
  const jwks = JSON.stringify({ keys: [rsaJwk] });
  for (const NODE_ENV of ['production', 'development', undefined]) assert.throws(() => parseAccountConfig({ ...env, NODE_ENV, STORY_TEST_JWKS: jwks }), /only in automated tests/);
  assert.equal(parseAccountConfig({ ...env, NODE_ENV: 'test', STORY_TEST_JWKS: jwks }).account, true);
  assert.throws(() => parseAccountConfig({ ...env, NODE_ENV: 'production', STORY_BACKEND: 'file' }), /local development/);
  assert.throws(() => parseAccountConfig({ ...env, NODE_ENV: 'production', STORY_JWKS_URL: 'https://attacker.example/jwks.json' }), /project host or loopback/);
  assert.throws(() => parseAccountConfig({ ...env, NODE_ENV: 'production', STORY_JWKS_URL: 'http://example.com/jwks.json' }), /project host or loopback/);
  assert.equal(parseAccountConfig({ ...env, NODE_ENV: 'production', STORY_JWKS_URL: 'http://127.0.0.1:9/jwks.json' }).jwksUrl, 'http://127.0.0.1:9/jwks.json');
  // Real process: production entry with the inline test key set refuses to start, and so does STORY_SERVE_STATIC with a missing config.
  const run = extra => spawnSync(process.execPath, ['server/start.js'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, STORY_SKIP_DOTENV: '1', PORT: '0', ...extra } });
  const inline = run({ ...env, STORY_TEST_JWKS: jwks });
  assert.notEqual(inline.status, 0); assert.match(inline.stderr, /only in automated tests/);
  const none = run({ STORY_BACKEND: 'supabase', STORY_AUTH_MODE: 'account', STORY_SERVE_STATIC: '1', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_SECRET_KEY: '' });
  assert.notEqual(none.status, 0); assert.match(none.stderr, /Supabase/);
  const file = run({ STORY_BACKEND: 'file', STORY_AUTH_MODE: 'legacy' });
  assert.notEqual(file.status, 0); assert.match(file.stderr, /local development/);
  const unset = run({ STORY_BACKEND: '', STORY_AUTH_MODE: '' });
  assert.notEqual(unset.status, 0); assert.match(unset.stderr, /explicitly selected/);
});

test('npm start entry serves the built app when configured, using ordinary key discovery against a local mock endpoint', async t => {
  const buildDir = path.resolve(process.env.STORY_BRIDGE_BUILD_DIR || 'dist');
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) { t.skip('Build the app first.'); return; }
  let discoveries = 0; const status = 200; let lastApikey = '';
  const mock = http.createServer((req, res) => { discoveries++; lastApikey = String(req.headers.apikey || ''); res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [rsaJwk] })); });
  await new Promise(r => mock.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => mock.close(r)));
  const port = Number(process.env.TEST_START_PORT || 4358);
  const env = { ...process.env, STORY_SKIP_DOTENV: '1', HOST: '127.0.0.1', PORT: String(port), STORY_BACKEND: 'supabase', STORY_AUTH_MODE: 'account', SUPABASE_URL: URL_, SUPABASE_PUBLISHABLE_KEY: base.publishableKey, SUPABASE_SECRET_KEY: base.secretKey, SUPABASE_BUCKET: 'story-bridge-audio', STORY_EMAIL_CODE_SIGN_IN: 'true', STORY_JWKS_URL: `http://127.0.0.1:${mock.address().port}/auth/v1/.well-known/jwks.json`, STORY_BRIDGE_BUILD_DIR: buildDir };
  delete env.NODE_ENV; delete env.STORY_TEST_JWKS;
  let output = '';
  const child = spawn(process.execPath, ['server/start.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const origin = `http://127.0.0.1:${port}`; let page;
  for (const deadline = Date.now() + 8000; Date.now() < deadline;) {
    if (child.exitCode !== null) throw new Error(`npm start entry exited early: ${output.replace(/sb_[a-z]+_\S+/g, '[key]')}`);
    try { page = await fetch(origin); if (page.ok) break; } catch {}
    await delay(50);
  }
  assert.ok(page?.ok); assert.match(output, /supabase\/account/);
  const csp = page.headers.get('content-security-policy');
  assert.ok(csp.includes(`connect-src 'self' ${URL_}`));
  assert.match(await page.text(), /<div id="root">/);
  const config = await (await fetch(`${origin}/api/account/config`)).json();
  assert.equal(config.account, true); assert.equal(config.email, true); assert.equal(config.google, false); assert.ok(!JSON.stringify(config).includes('sb_secret'));
  const forged = signTestToken(claims('u1'), ec.privateKey, 'rsa-1', 'RS256');
  assert.equal((await fetch(`${origin}/api/mine`, { headers: { authorization: `Bearer ${forged}` } })).status, 401);
  assert.ok(discoveries >= 1, 'verifier did not use the configured discovery endpoint'); assert.equal(lastApikey, base.publishableKey);
  assert.ok(!output.includes(base.secretKey));
});

test('dist secret check fails on a planted fake secret without printing it and passes on a clean copy', t => {
  const source = path.resolve('dist');
  if (!fs.existsSync(source)) { t.skip('Build the app first.'); return; }
  const folder = fs.mkdtempSync(path.join(path.resolve('_tmp'), `dist-secret-${process.pid}-`));
  fs.cpSync(source, folder, { recursive: true });
  const fake = `sb_secret_synthetic_${crypto.randomBytes(12).toString('hex')}`;
  const run = extra => spawnSync(process.execPath, ['scripts/check-dist-secrets.js'], { encoding: 'utf8', env: { ...process.env, STORY_SKIP_DOTENV: '1', STORY_BRIDGE_BUILD_DIR: folder, SUPABASE_SECRET_KEY: fake, ...extra } });
  assert.equal(run({}).status, 0);
  fs.writeFileSync(path.join(folder, 'planted.js'), `var k="${fake}";`);
  const failed = run({}); assert.notEqual(failed.status, 0);
  assert.ok(!(failed.stdout + failed.stderr).includes(fake));
  fs.rmSync(path.join(folder, 'planted.js'));
  fs.writeFileSync(path.join(folder, 'planted.js'), `var n="${'VITE_SUPABASE_'}${'SECRET_KEY'}";`);
  assert.notEqual(run({}).status, 0);
  fs.rmSync(path.join(folder, 'planted.js'));
  assert.notEqual(run({ [`VITE_SUPABASE_${'SERVICE_ROLE_KEY'}`]: 'x' }).status, 0);
});
