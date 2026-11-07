import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const baseDir = path.join(root, '.test-data', `stage1-hardening-${process.pid}-${Date.now()}`);
let instance = 0;
const owner = 'a'.repeat(48);
const other = 'b'.repeat(48);

async function withServer(label, config, callback) {
  const dir = path.join(baseDir, label);
  const dataDir = path.join(dir, 'data');
  const uploadsDir = path.join(dir, 'uploads');
  const envNames = ['STORY_DATA_DIR', 'STORY_UPLOAD_DIR', 'STORY_MAX_UPLOAD_BYTES', 'STORY_MAX_STORIES_PER_OWNER', 'STORY_WRITE_RATE_LIMIT', 'STORY_WRITE_RATE_WINDOW_MS', 'STORY_TRUST_PROXY', 'STORY_HTTPS', 'NODE_ENV'];
  const prior = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, { NODE_ENV: 'test', STORY_DATA_DIR: dataDir, STORY_UPLOAD_DIR: uploadsDir });
  for (const name of envNames) if (Object.hasOwn(config, name)) process.env[name] = String(config[name]);
  try {
    const { default: app, safeErrorHandler } = await import(`../server/index.js?hardening=${++instance}-${Date.now()}`);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try { await callback({ app, server, base, dataDir, uploadsDir, safeErrorHandler }); }
    finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  } finally {
    for (const name of envNames) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
}

async function makeStory(base, token = owner, text = 'Synthetic isolated story.', extraHeaders = {}) {
  const body = new FormData();
  body.append('originalLanguage', 'Synthetic language');
  body.append('text', text);
  return fetch(`${base}/api/stories`, { method: 'POST', headers: { 'x-owner-token': token, ...extraHeaders }, body });
}

const putStory = (base, id, token, body) => fetch(`${base}/api/stories/${id}`, {
  method: 'PUT', headers: { 'content-type': 'application/json', 'x-owner-token': token }, body: JSON.stringify(body),
});

test('store first run accepts an uploaded story, writes atomically, and keeps three rotating backups', async () => {
  await withServer('backups', {}, async ({ base, dataDir, uploadsDir }) => {
    assert.deepEqual(await (await fetch(`${base}/api/stories`)).json(), []);
    assert.deepEqual(await (await fetch(`${base}/api/mine`, { headers: { 'x-owner-token': owner } })).json(), []);
    const form = new FormData();
    form.append('originalLanguage', 'Synthetic language');
    form.append('text', 'Synthetic first-run story with audio.');
    form.append('audio', new Blob([new Uint8Array(128)], { type: 'audio/wav' }), 'fixture.wav');
    const created = await fetch(`${base}/api/stories`, { method: 'POST', headers: { 'x-owner-token': owner }, body: form });
    assert.equal(created.status, 201);
    const story = await created.json();
    assert.equal(story.audio, true);
    assert.equal(fs.readdirSync(uploadsDir).filter(name => !name.startsWith('.incoming-')).length, 1);
    for (let revision = 1; revision <= 5; revision++) {
      const response = await putStory(base, story.id, owner, { text: `synthetic revision ${revision}` });
      assert.equal(response.status, 200);
    }
    const backupFiles = fs.readdirSync(dataDir).filter(name => /^stories\.json\.bak\.\d+$/.test(name)).sort();
    assert.deepEqual(backupFiles, ['stories.json.bak.1', 'stories.json.bak.2', 'stories.json.bak.3']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'stories.json'), 'utf8'))[0].text, 'synthetic revision 5');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'stories.json.bak.1'), 'utf8'))[0].text, 'synthetic revision 4');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'stories.json.bak.2'), 'utf8'))[0].text, 'synthetic revision 3');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'stories.json.bak.3'), 'utf8'))[0].text, 'synthetic revision 2');
    assert.ok(!fs.readdirSync(dataDir).some(name => /^\.stories-.*\.tmp$/.test(name)), 'Temporary atomic-write file was left behind.');
  });
});

test('invalid or missing-with-remnants stores fail closed and never overwrite data', async () => {
  await withServer('corrupt', {}, async ({ base, dataDir, uploadsDir }) => {
    const variants = [
      ['corrupt.json', '{invalid synthetic store'],
      ['empty.json', ''],
      ['wrong-shape.json', '{"synthetic":"not an array"}'],
      ['wrong-entry.json', '[{"id":"synthetic"}]'],
    ];
    const token = 'z'.repeat(48);
    for (const [name, contents] of variants) {
      const storePath = path.join(dataDir, 'stories.json');
      fs.writeFileSync(storePath, contents);
      const before = fs.readFileSync(storePath);
      const list = await fetch(`${base}/api/stories`);
      assert.equal(list.status, 500, name);
      const listText = await list.text();
      assert.match(listText, /Story data is unavailable/);
      assert.ok(!listText.includes('synthetic store'), 'Raw stored content escaped in the response.');
      assert.equal((await fetch(`${base}/api/mine`)).status, 500, `mine route: ${name}`);
      assert.equal((await fetch(`${base}/api/stories/anything`)).status, 500, `read route: ${name}`);
      const body = new FormData(); body.append('originalLanguage', 'Synthetic'); body.append('text', 'Must not save');
      const create = await fetch(`${base}/api/stories`, { method: 'POST', headers: { 'x-owner-token': token }, body });
      assert.equal(create.status, 500, `create route: ${name}`);
      assert.deepEqual(fs.readFileSync(storePath), before, `Store changed for ${name}.`);
      assert.deepEqual(fs.readdirSync(uploadsDir), [], `Upload was written for ${name}.`);
    }

    fs.renameSync(path.join(dataDir, 'stories.json'), path.join(dataDir, 'stories.synthetic-moved'));
    fs.writeFileSync(path.join(dataDir, 'stories.json.bak.1'), 'synthetic backup');
    assert.equal((await fetch(`${base}/api/stories`)).status, 500, 'Missing store with backup should fail closed.');
    fs.renameSync(path.join(dataDir, 'stories.json.bak.1'), path.join(dataDir, 'backup.synthetic-moved'));
    fs.writeFileSync(path.join(uploadsDir, 'orphan.synthetic-audio'), 'synthetic bytes');
    assert.equal((await fetch(`${base}/api/stories`)).status, 500, 'Missing store with uploads should fail closed.');
    assert.ok(fs.existsSync(path.join(uploadsDir, 'orphan.synthetic-audio')));
  });
});

test('write rate, owner-story and on-disk upload limits return clear 429 or 413', async () => {
  await withServer('limits', {
    STORY_MAX_UPLOAD_BYTES: 1024 * 1024,
    STORY_MAX_STORIES_PER_OWNER: 1,
    STORY_WRITE_RATE_LIMIT: 4,
    STORY_WRITE_RATE_WINDOW_MS: 60_000,
    STORY_TRUST_PROXY: '1',
  }, async ({ app, base, uploadsDir }) => {
    assert.equal(app.get('trust proxy'), true);
    const ipA = { 'x-forwarded-for': '203.0.113.10' };
    assert.equal((await makeStory(base, owner, 'Synthetic isolated story.', ipA)).status, 201);
    let limited = await makeStory(base, owner, 'Second story from same owner.', ipA);
    assert.equal(limited.status, 429);
    assert.match(await limited.text(), /story limit/i);
    assert.equal((await makeStory(base, other, 'Different owner on same address.', ipA)).status, 201);
    assert.equal((await makeStory(base, 'c'.repeat(48), 'Third owner on same address.', ipA)).status, 201);
    limited = await makeStory(base, 'd'.repeat(48), 'Rate limited owner.', ipA);
    assert.equal(limited.status, 429);
    assert.match(await limited.text(), /Too many write requests/i);
    assert.equal((await makeStory(base, 'g'.repeat(48), 'Different client IP.', { 'x-forwarded-for': '203.0.113.11' })).status, 201);

    const upload = async (token, bytes, ip) => {
      const body = new FormData(); body.append('originalLanguage', 'Synthetic');
      body.append('audio', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), 'fixture.wav');
      return fetch(`${base}/api/stories`, { method: 'POST', headers: { 'x-owner-token': token, 'x-forwarded-for': ip }, body });
    };
    const accepted = await upload('e'.repeat(48), 600 * 1024, '203.0.113.20');
    assert.equal(accepted.status, 201);
    const overDiskCap = await upload('f'.repeat(48), 500 * 1024, '203.0.113.21');
    assert.equal(overDiskCap.status, 413);
    assert.match(await overDiskCap.text(), /Upload storage limit/i);
    const realUploadFiles = fs.readdirSync(uploadsDir).filter(name => !name.startsWith('.incoming-'));
    assert.equal(realUploadFiles.length, 1, 'Rejected upload left a file on disk.');
  });
});

test('security headers are present, HSTS is opt-in, and proxy trust defaults off', async () => {
  await withServer('headers-default', {}, async ({ app, base }) => {
    assert.equal(app.get('trust proxy'), false);
    const response = await fetch(`${base}/api/stories`);
    const headers = response.headers;
    assert.match(headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(headers.get('content-security-policy'), /media-src 'self' blob:/);
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.get('referrer-policy'), 'no-referrer');
    assert.equal(headers.has('strict-transport-security'), false);
  });
  await withServer('headers-https', { STORY_HTTPS: '1' }, async ({ base }) => {
    const response = await fetch(`${base}/api/stories`);
    assert.match(response.headers.get('strict-transport-security'), /max-age=31536000/);
  });
});

test('unexpected request and store errors return generic messages without leaking fixture content', async () => {
  await withServer('safe-errors', {}, async ({ base, dataDir, safeErrorHandler }) => {
    fs.writeFileSync(path.join(dataDir, 'stories.json'), 'synthetic-private-sentinel-not-json');
    const store = await fetch(`${base}/api/stories`);
    const storeText = await store.text();
    assert.equal(store.status, 500);
    assert.ok(!storeText.includes('synthetic-private-sentinel'));
    const malformed = await fetch(`${base}/api/stories`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'synthetic-malformed-private-sentinel' });
    const malformedText = await malformed.text();
    assert.equal(malformed.status, 400);
    assert.ok(!malformedText.includes('synthetic-malformed-private-sentinel'));
    const secret = 'synthetic-private-error-sentinel';
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    const logEntries = [];
    const originalError = console.error;
    console.error = message => logEntries.push(String(message));
    try { safeErrorHandler(new Error(secret), { method: 'POST' }, response, () => {}); }
    finally { console.error = originalError; }
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: 'The request could not be completed.' });
    assert.ok(!JSON.stringify(response.body).includes(secret));
    assert.equal(logEntries.length, 1);
    assert.ok(!logEntries[0].includes(secret));
  });
});
