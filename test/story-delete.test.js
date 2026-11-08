import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createTokenVerifier, signTestToken } from '../server/auth.js';
import { mountAccountRoutes } from '../server/account-routes.js';
import { createFileAccountStore } from '../server/file-account-store.js';

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = pair.publicKey.export({ format: 'jwk' }); jwk.kid = 'local-test-key'; jwk.alg = 'RS256';
const config = { backend: 'supabase', authMode: 'account', account: true, url: 'https://story-bridge-test.supabase.co', publishableKey: 'sb_publishable_fake_local_test_key_123456', secretKey: 'sb_secret_fake_local_test_key_123456', bucket: 'story-bridge-audio', google: false, email: false, jwks: JSON.stringify({ keys: [jwk] }) };
const token = sub => signTestToken({ sub, iss: `${config.url}/auth/v1`, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, email: `${sub}@example.test` }, pair.privateKey);
const auth = user => ({ authorization: `Bearer ${token(user)}` });

async function setup() {
  fs.mkdirSync('.test-data', { recursive: true });
  const directory = fs.mkdtempSync(path.join('.test-data', 'story-delete-'));
  const store = createFileAccountStore(directory);
  const app = express(); app.use(express.json());
  mountAccountRoutes(app, config, { store, verify: createTokenVerifier(config), draftTranslation: async () => '', objectAdminId: '' });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, server, store, directory };
}

test('owners can permanently delete a story with its audio and images; others cannot', async t => {
  const { base, server, store, directory } = await setup();
  t.after(() => server.close());
  const story = await store.create({ owner_user_id: 'owner-a', owner_hash: null, original_language: 'Synthetic', text: 'Synthetic draft', translation_language: '', translation: '', translation_checked: false, checked_by: '', storyteller_name: '', show_name: false, visibility: 'private', status: 'withdrawn', audio_key: 'audio-key-1' });
  await store.putAudio('audio-key-1', Buffer.from([1, 2, 3]));
  await store.putPostImage('image-key-1', Buffer.from([4, 5, 6]));
  await store.createPostMedia([{ id: crypto.randomUUID(), post_id: story.id, kind: 'image', storage_key: 'image-key-1', alt_text: 'Synthetic image' }]);

  const stranger = await fetch(`${base}/api/stories/${story.id}`, { method: 'DELETE', headers: auth('owner-b') });
  assert.equal(stranger.status, 404, 'a private story is invisible to other accounts');
  const anonymous = await fetch(`${base}/api/stories/${story.id}`, { method: 'DELETE' });
  assert.equal(anonymous.status, 401);
  assert.ok(await store.get(story.id), 'failed attempts change nothing');

  const removed = await fetch(`${base}/api/stories/${story.id}`, { method: 'DELETE', headers: auth('owner-a') });
  assert.equal(removed.status, 204);
  assert.equal(await store.get(story.id), null);
  assert.deepEqual(await store.listPostMedia(story.id), []);
  assert.equal(fs.existsSync(path.join(directory, 'account-audio', 'audio-key-1.audio')), false);
  const mine = await fetch(`${base}/api/mine`, { headers: auth('owner-a') });
  assert.deepEqual(await mine.json(), []);

  const again = await fetch(`${base}/api/stories/${story.id}`, { method: 'DELETE', headers: auth('owner-a') });
  assert.equal(again.status, 404);
});
