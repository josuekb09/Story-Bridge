// Reader-side translation: "Read in my language" on every post.
// Owner: Claude (see docs/COLLAB.md).
// POST /api/read-translate { text, source, target } -> { translation, provider, detected }
// Works in every browser (no Chrome-only API, no API key, no OpenAI credit needed).
// Providers, in order: Google Translate public endpoint, then MyMemory.
// Nothing is stored except a small in-memory cache; the original is never replaced.
import { LANGUAGES } from '../src/lib/languages.js';

const MAX_CHARS = 5000;
const CODES = new Set(LANGUAGES.map(l => l.code));
const cache = new Map();          // key -> { translation, provider, detected }
const CACHE_MAX = 800;
const windows = new Map();        // ip -> { count, until }
const LIMIT = 80, WINDOW_MS = 10 * 60 * 1000;

function chunks(text, size) {
  const out = []; let rest = String(text);
  while (rest.length > size) {
    let cut = Math.max(rest.lastIndexOf('\n', size), rest.lastIndexOf('. ', size), rest.lastIndexOf('! ', size), rest.lastIndexOf('? ', size));
    if (cut < size * 0.4) cut = rest.lastIndexOf(' ', size);
    if (cut < 1) cut = size;
    out.push(rest.slice(0, cut + 1)); rest = rest.slice(cut + 1);
  }
  if (rest) out.push(rest);
  return out;
}

async function google(text, source, target, fetchImpl) {
  let detected = '';
  const parts = [];
  for (const part of chunks(text, 600)) {
    if (!part.trim()) { parts.push(part); continue; }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(source || 'auto')}&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(part)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 StoryBridge/1.0' } });
    if (!res.ok) throw new Error(`google-${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.[0])) throw new Error('google-shape');
    parts.push(data[0].map(row => row?.[0] || '').join(''));
    if (!detected && typeof data[2] === 'string') detected = data[2];
  }
  // keep paragraph breaks that sat between chunks
  return { translation: parts.join(/\n$/.test(parts[0] || '') ? '' : ' ').replace(/ +\n/g, '\n').trim(), detected };
}

async function myMemory(text, source, target, fetchImpl) {
  const parts = [];
  for (const part of chunks(text, 450)) {
    if (!part.trim()) continue;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(part)}&langpair=${encodeURIComponent(source || 'autodetect')}|${encodeURIComponent(target)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mymemory-${res.status}`);
    const data = await res.json();
    const value = data?.responseData?.translatedText;
    if (!value || Number(data?.responseStatus) !== 200 || /MYMEMORY WARNING|INVALID LANGUAGE/i.test(value)) throw new Error('mymemory-failed');
    parts.push(value);
  }
  return { translation: parts.join(' ').trim(), detected: '' };
}

export async function readTranslate({ text, source, target }, fetchImpl = fetch) {
  const key = `${source}|${target}|${text}`;
  if (cache.has(key)) return cache.get(key);
  const errors = [];
  for (const [provider, run] of [['google', google], ['mymemory', myMemory]]) {
    try {
      const { translation, detected } = await run(text, source, target, fetchImpl);
      if (!translation) throw new Error(`${provider}-empty`);
      const result = { translation, provider, detected };
      cache.set(key, result);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return result;
    } catch (error) { errors.push(error?.message || String(error)); }
  }
  throw Object.assign(new Error('translation-unavailable'), { details: errors });
}

export function mountReadTranslate(app, { fetchImpl = fetch } = {}) {
  app.post('/api/read-translate', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let w = windows.get(ip);
    if (!w || w.until <= now) { w = { count: 0, until: now + WINDOW_MS }; windows.set(ip, w); }
    if (++w.count > LIMIT) return res.status(429).json({ error: 'Too many translations. Please wait a few minutes.' });
    if (windows.size > 10_000) windows.clear();

    const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, MAX_CHARS) : '';
    const target = String(req.body?.target || '').toLowerCase();
    let source = String(req.body?.source || '').toLowerCase();
    if (!text.trim()) return res.status(400).json({ error: 'Nothing to translate.' });
    if (!CODES.has(target)) return res.status(400).json({ error: 'Unknown target language.' });
    if (!CODES.has(source)) source = 'auto';
    if (source === target) return res.json({ translation: text, provider: 'none', detected: source });
    try {
      const result = await readTranslate({ text, source, target }, fetchImpl);
      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      console.warn('read-translate failed', error.details || error.message);
      res.status(502).json({ error: 'Translation is not available right now.' });
    }
  });
}
