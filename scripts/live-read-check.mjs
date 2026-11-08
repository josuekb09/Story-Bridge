import { loadLocalEnv } from '../server/env.js';

loadLocalEnv();

const expectedHost = 'dstttnakywbcatnbraut.supabase.co';
const required = [
  'STORY_BACKEND',
  'STORY_AUTH_MODE',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_BUCKET',
];

function stop(code, status = '') {
  console.log(`STOP ${code}${status ? ` status=${status}` : ''}`);
  process.exitCode = 1;
  throw new Error('bounded-stop');
}

function isPlaceholder(value) {
  return !value || /<[^>]*>|placeholder/i.test(value);
}

try {
  for (const name of required) {
    if (isPlaceholder(process.env[name] || '')) stop(`CONFIG_${name}`);
  }
  if (process.env.STORY_BACKEND !== 'supabase') stop('CONFIG_STORY_BACKEND');
  if (process.env.STORY_AUTH_MODE !== 'account') stop('CONFIG_STORY_AUTH_MODE');
  if (process.env.SUPABASE_BUCKET !== 'story-bridge-audio') stop('CONFIG_SUPABASE_BUCKET');

  let projectUrl;
  try { projectUrl = new URL(process.env.SUPABASE_URL); } catch { stop('DESTINATION_SUPABASE_URL'); }
  if (projectUrl.protocol !== 'https:' || projectUrl.hostname !== expectedHost || projectUrl.username || projectUrl.password || (projectUrl.port && projectUrl.port !== '443') || projectUrl.pathname !== '/' || projectUrl.search || projectUrl.hash) {
    stop('DESTINATION_SUPABASE_URL');
  }
  const origin = `https://${expectedHost}`;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  async function request(path, { method = 'GET', key, count = false } = {}) {
    const headers = {};
    if (key) {
      headers.apikey = key;
      headers.authorization = `Bearer ${key}`;
    }
    if (count) {
      headers.prefer = 'count=exact';
      headers.range = '0-0';
    }
    let response;
    try {
      response = await fetch(`${origin}${path}`, {
        method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      stop(error?.name === 'TimeoutError' ? 'REQUEST_TIMEOUT' : 'REQUEST_FAILED');
    }
    if (response.status >= 300 && response.status < 400) stop('REDIRECT', response.status);
    return response;
  }

  function requireOk(label, response) {
    if (!response.ok) stop(label, response.status);
  }

  const jwks = await request('/auth/v1/.well-known/jwks.json');
  requireOk('JWKS', jwks);
  let keys;
  try { keys = (await jwks.json()).keys; } catch { stop('JWKS_INVALID'); }
  if (!Array.isArray(keys)) stop('JWKS_INVALID');
  const algorithms = [...new Set(keys.map(key => key?.alg).filter(value => typeof value === 'string'))].sort();
  console.log(`CHECK JWKS PASS status=${jwks.status} signing_keys=${keys.length} algorithms=${algorithms.join(',') || '(none)'}`);
  if (keys.length === 0) stop('JWKS_EMPTY', jwks.status);

  const publishable = await request('/auth/v1/settings', { key: publishableKey });
  requireOk('PUBLISHABLE_KEY', publishable);
  console.log(`CHECK PUBLISHABLE_KEY PASS status=${publishable.status}`);

  async function countRows(table) {
    const response = await request(`/rest/v1/${table}`, { method: 'HEAD', key: secretKey, count: true });
    requireOk(`COUNT_${table.toUpperCase()}`, response);
    const match = response.headers.get('content-range')?.match(/\/(\d+|\*)$/);
    if (!match || match[1] === '*') stop(`COUNT_${table.toUpperCase()}_MISSING`);
    return { status: response.status, count: Number(match[1]) };
  }

  const profiles = await countRows('profiles');
  console.log(`CHECK PROFILES_COUNT PASS status=${profiles.status} count=${profiles.count}`);
  const stories = await countRows('stories');
  console.log(`CHECK STORIES_COUNT PASS status=${stories.status} count=${stories.count}`);

  const bucket = await request('/storage/v1/bucket/story-bridge-audio', { key: secretKey });
  requireOk('AUDIO_BUCKET', bucket);
  let metadata;
  try { metadata = await bucket.json(); } catch { stop('AUDIO_BUCKET_INVALID'); }
  if (typeof metadata?.public !== 'boolean' || !(typeof metadata.file_size_limit === 'number' || typeof metadata.file_size_limit === 'string')) stop('AUDIO_BUCKET_METADATA_MISSING');
  console.log(`CHECK AUDIO_BUCKET PASS status=${bucket.status} public=${metadata.public} file_size_limit=${metadata.file_size_limit}`);
} catch (error) {
  if (error?.message !== 'bounded-stop') {
    console.log('STOP SCRIPT_ERROR');
    process.exitCode = 1;
  }
}
