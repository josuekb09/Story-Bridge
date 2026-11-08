import './env.js';
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAccountConfig } from './auth.js';
import { mountAccountRoutes } from './account-routes.js';
import { createFileAccountStore } from './file-account-store.js';
import { contentSecurityPolicy } from './csp.js';
import { appendStoryVersion, makeStoryVersion, storyRecord } from './story-record.js';
import { createTranslationDraftService, isTranslationApproved, translationDraftHandler } from './translation-draft.js';

export const MODE = parseAccountConfig();

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA = path.resolve(process.env.STORY_DATA_DIR || path.join(ROOT, 'data'));
export const UPLOADS = path.resolve(process.env.STORY_UPLOAD_DIR || path.join(ROOT, 'uploads'));
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const DB_FILE = path.join(DATA, 'stories.json');
const MAX_AUDIO_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BYTES = positiveInteger(process.env.STORY_MAX_UPLOAD_BYTES, 1024 * 1024 * 1024);
const MAX_STORIES_PER_OWNER = positiveInteger(process.env.STORY_MAX_STORIES_PER_OWNER, 500);
const WRITE_RATE_LIMIT = positiveInteger(process.env.STORY_WRITE_RATE_LIMIT, 60);
const WRITE_RATE_WINDOW_MS = positiveInteger(process.env.STORY_WRITE_RATE_WINDOW_MS, 60_000);
const BACKUP_COUNT = 3;
const uploadReservations = new Map();
const writeWindows = new Map();
const draftTranslation = createTranslationDraftService();

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class StoreError extends Error {
  constructor(reason = 'invalid-store') { super('Story data store is unavailable.'); this.name = 'StoreError'; this.reason = reason; }
}

function hasUploadFiles(directory) {
  if (!fs.existsSync(directory)) return false;
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch { throw new StoreError('data-directory-unreadable'); }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const currentUpload = [...uploadReservations.values()].some(reservation => reservation.filename === entry.name);
    if (entry.isFile() && !entry.name.startsWith('.incoming-') && !currentUpload) return true;
    if (entry.isDirectory() && hasUploadFiles(entryPath)) return true;
  }
  return false;
}

function hasStoreRemnants() {
  try {
    if (fs.readdirSync(DATA).some(name => /^stories\.json(?:\.bak(?:\.\d+)?|\.tmp)/i.test(name))) return 'backup';
    if (hasUploadFiles(UPLOADS)) return 'uploads';
    return '';
  } catch {
    throw new StoreError('cannot-inspect-store-remnants');
  }
}

function validateStore(value) {
  if (!Array.isArray(value)) throw new StoreError('top-level-not-array');
  const seenIds = new Set();
  for (const story of value) {
    if (!story || typeof story !== 'object' || Array.isArray(story)) throw new StoreError('entry-not-object');
    if (typeof story.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(story.id) || seenIds.has(story.id)) throw new StoreError('invalid-id');
    seenIds.add(story.id);
    if (typeof story.ownerHash !== 'string' || !/^[a-f0-9]{64}$/i.test(story.ownerHash)) throw new StoreError('invalid-owner-hash');
    for (const key of ['originalLanguage', 'text', 'translationLanguage', 'translation', 'checkedBy', 'createdAt', 'audio', 'mime', 'storytellerName']) {
      if (typeof story[key] !== 'string') throw new StoreError(`invalid-${key}-type`);
    }
    if (typeof story.translationChecked !== 'boolean' || typeof story.showName !== 'boolean') throw new StoreError('invalid-boolean-field');
    if (story.translationOrigin !== undefined && !['storyteller', 'ai_approved'].includes(story.translationOrigin)) throw new StoreError('invalid-translation-origin');
    if (!['private', 'public'].includes(story.visibility) || !['draft', 'shared', 'withdrawn'].includes(story.status)) throw new StoreError('invalid-visibility-or-status');
    if (story.audio && (path.basename(story.audio) !== story.audio || /[\\/\0]/.test(story.audio))) throw new StoreError('invalid-audio-path');
    if (story.versionLog !== undefined && (!Array.isArray(story.versionLog) || story.versionLog.some(version => !version || typeof version.timestamp !== 'string' || typeof version.language !== 'string' || typeof version.change !== 'string' || typeof version.fingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(version.fingerprint)))) throw new StoreError('invalid-version-log');
  }
  return value;
}

function readDb() {
  let source;
  try { source = fs.readFileSync(DB_FILE, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') {
      const remnants = hasStoreRemnants();
      if (remnants) throw new StoreError(`missing-with-${remnants}`);
      return [];
    }
    throw new StoreError('unreadable-store');
  }
  try { return validateStore(JSON.parse(source)); }
  catch { throw new StoreError('invalid-json-or-shape'); }
}

function rotateBackups() {
  const backupPath = index => `${DB_FILE}.bak.${index}`;
  for (let index = BACKUP_COUNT; index >= 2; index--) {
    const destination = backupPath(index);
    const source = backupPath(index - 1);
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    if (fs.existsSync(source)) fs.renameSync(source, destination);
  }
  fs.copyFileSync(DB_FILE, backupPath(1), fs.constants.COPYFILE_EXCL);
}

function writeDb(stories) {
  validateStore(stories);
  const previous = readDb();
  const hadStore = fs.existsSync(DB_FILE);
  if (hadStore) {
    // readDb above guarantees the prior data is valid before it is backed up or replaced.
    rotateBackups();
  } else if (previous.length) {
    throw new StoreError();
  }
  const temporary = path.join(DATA, `.stories-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(stories, null, 2), { flag: 'wx' });
    fs.renameSync(temporary, DB_FILE);
  } catch {
    try { fs.unlinkSync(temporary); } catch {}
    throw new StoreError();
  }
}

const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const ownerToken = req => typeof req.get('x-owner-token') === 'string' && req.get('x-owner-token').length >= 32 ? req.get('x-owner-token') : '';
const isOwner = (req, story) => {
  const token = ownerToken(req);
  return !!token && crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(story.ownerHash));
};
const clean = (story, owner) => {
  const result = { id: story.id, originalLanguage: story.originalLanguage, text: story.text, translationLanguage: story.translationLanguage, translation: story.translation, translationOrigin: story.translationOrigin || 'storyteller', translationChecked: story.translationChecked, checkedBy: story.translationChecked ? story.checkedBy : '', visibility: story.visibility, status: story.status, createdAt: story.createdAt, audio: !!story.audio };
  result.versionLog=storyRecord(story);
  if (story.showName || owner) result.storytellerName = story.storytellerName;
  return result;
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.STORY_TRUST_PROXY === '1');
app.use((req, res, next) => {
  res.set('Content-Security-Policy', contentSecurityPolicy(MODE));
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  if (process.env.STORY_HTTPS === '1') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '256kb' }));

if (MODE.authMode === 'account') {
  const accountStore = MODE.backend === 'supabase' ? undefined : createFileAccountStore(path.resolve(process.env.STORY_ACCOUNT_DATA_DIR || path.join(ROOT,'account-data')));
  mountAccountRoutes(app, MODE, { store:accountStore, rateLimit: rateLimitWrites, draftTranslation });
  app.use('/api', (_req, res) => res.status(503).json({ error: 'This account operation is not available.' }));
} else {
  app.get('/api/account/config', (_req, res) => res.json({ account: false, brand: 'Story Bridge' }));
  app.post('/api/translation-draft', rateLimitWrites, (req, res, next) => {
    if (!ownerToken(req)) return res.status(401).json({ error: 'Start a local story session before requesting an AI translation.' });
    next();
  }, translationDraftHandler(draftTranslation));
}

function rateLimitWrites(req, res, next) {
  const now = Date.now();
  for (const [ip, window] of writeWindows) if (window.until <= now) writeWindows.delete(ip);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let window = writeWindows.get(ip);
  if (!window || window.until <= now) { window = { count: 0, until: now + WRITE_RATE_WINDOW_MS }; writeWindows.set(ip, window); }
  if (window.count >= WRITE_RATE_LIMIT) return res.status(429).json({ error: 'Too many write requests. Please wait and try again.' });
  window.count++;
  if (writeWindows.size > 10_000) writeWindows.clear();
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOADS),
    filename: (req, _file, callback) => callback(null, req.uploadTempName),
  }),
  limits: { fileSize: MAX_AUDIO_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!/^audio\/[a-z0-9.+-]+$/i.test(file.mimetype)) return callback(Object.assign(new Error('invalid audio'), { code: 'INVALID_AUDIO' }));
    callback(null, true);
  },
});

function uploadDiskBytes() {
  let total = 0;
  const visit = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { throw Object.assign(new Error('upload storage unavailable'), { code: 'UPLOAD_STORAGE' }); }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) {
        const active = entry.name.startsWith('.incoming-') && [...uploadReservations.values()].some(reservation => reservation.filename === entry.name);
        if (!active) total += fs.statSync(fullPath).size;
      }
    }
  };
  visit(UPLOADS);
  return total;
}

function reserveUploadSpace(req, res, next) {
  if (!/^multipart\/form-data(?:;|$)/i.test(req.get('content-type') || '')) return next();
  let expected = MAX_AUDIO_FILE_BYTES;
  const contentLength = Number(req.get('content-length'));
  if (Number.isSafeInteger(contentLength) && contentLength > 0) expected = Math.min(MAX_AUDIO_FILE_BYTES, contentLength);
  const reserved = [...uploadReservations.values()].reduce((sum, reservation) => sum + reservation.amount, 0);
  try {
    if (uploadDiskBytes() + reserved + expected > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'Upload storage limit reached. Remove older recordings before uploading more.' });
  } catch (error) { return next(error); }
  const reservationId = crypto.randomUUID();
  req.uploadTempName = `.incoming-${crypto.randomUUID()}.tmp`;
  uploadReservations.set(reservationId, { amount: expected, filename: req.uploadTempName });
  req.uploadReservationId = reservationId;
  next();
}

function releaseUpload(req) {
  if (req.uploadReservationId) uploadReservations.delete(req.uploadReservationId);
}

function storeGuard(_req, _res, next) {
  try { readDb(); next(); } catch (error) { next(error); }
}

function find(id, stories = readDb()) { return stories.find(story => story.id === id); }
const access = (req, story) => MODE.backend === 'file' && isOwner(req, story) || (story.status === 'shared' && story.visibility === 'public');

if (MODE.backend === 'file' && MODE.authMode === 'legacy') app.get('/api/stories', (_req, res) => res.json(readDb().filter(story => story.status === 'shared' && story.visibility === 'public').map(story => clean(story, false))));
if (MODE.backend === 'file' && MODE.authMode === 'legacy') app.get('/api/mine', (req, res) => {
  const stories = readDb();
  if (!ownerToken(req)) return res.status(400).json({ error: 'A browser owner token is required.' });
  res.json(stories.filter(story => isOwner(req, story)).map(story => clean(story, true)));
});

if (MODE.backend === 'file' && MODE.authMode === 'legacy') app.post('/api/stories', rateLimitWrites, storeGuard, reserveUploadSpace, upload.single('audio'), async (req, res, next) => {
  try {
    const token = ownerToken(req);
    if (!token) return res.status(400).json({ error: 'A browser owner token is required.' });
    const body = req.body || {};
    const text = String(body.text || '');
    if (text.length > 12_000) return res.status(413).json({ error: 'Story text is limited to 12,000 characters.' });
    if (String(body.originalLanguage || '').trim().length > 80 || String(body.translation || '').length > 12_000) return res.status(413).json({ error: 'Language or translation is too long.' });
    if (!String(body.originalLanguage || '').trim()) return res.status(400).json({ error: 'Enter the language of the story.' });
    if (body.translationOrigin === 'ai_approved' && !isTranslationApproved(body.translationApproved)) return res.status(400).json({ error: 'Approve the AI translation before saving it.' });

    const all = readDb();
    const ownerHash = hash(token);
    if (all.filter(story => story.ownerHash === ownerHash).length >= MAX_STORIES_PER_OWNER) return res.status(429).json({ error: 'This browser has reached its story limit.' });

    if (req.file) {
      const otherReservations = [...uploadReservations.entries()].filter(([id]) => id !== req.uploadReservationId).reduce((sum, [, reservation]) => sum + reservation.amount, 0);
      if (uploadDiskBytes() + otherReservations + req.file.size > MAX_UPLOAD_BYTES) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(413).json({ error: 'Upload storage limit reached. Remove older recordings before uploading more.' });
      }
    }

    const id = crypto.randomUUID();
    const audioName = req.file ? `${crypto.randomUUID()}.audio` : '';
    if (req.file) {
      fs.renameSync(req.file.path, path.join(UPLOADS, audioName));
      const reservation = uploadReservations.get(req.uploadReservationId);
      if (reservation) reservation.filename = audioName;
    }
    const story = {
      id, ownerHash, originalLanguage: String(body.originalLanguage).trim(), text,
      translationLanguage: String(body.translationLanguage || '').trim(), translation: String(body.translation || ''),
      translationOrigin: body.translation ? (body.translationOrigin === 'ai_approved' && isTranslationApproved(body.translationApproved) ? 'ai_approved' : 'storyteller') : 'storyteller',
      translationChecked: false, checkedBy: '', storytellerName: String(body.storytellerName || '').slice(0, 120),
      showName: body.showName === 'true', visibility: 'private', status: 'draft', createdAt: new Date().toISOString(),
      audio: audioName, mime: req.file?.mimetype || '', audioFingerprint:audioName?crypto.createHash('sha256').update(fs.readFileSync(path.join(UPLOADS,audioName))).digest('hex'):'',
    };
    story.versionLog=[makeStoryVersion(story,'Story created')];
    all.push(story);
    try { writeDb(all); }
    catch (error) {
      if (audioName) { try { fs.unlinkSync(path.join(UPLOADS, audioName)); } catch {} }
      throw error;
    }
    res.status(201).json(clean(story, true));
  } catch (error) { next(error); }
  finally {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch {} }
    releaseUpload(req);
  }
});

if (MODE.backend === 'file' && MODE.authMode === 'legacy') app.get('/api/stories/:id', (req, res) => {
  const story = find(req.params.id);
  if (!story || !access(req, story)) return res.sendStatus(404);
  res.json(clean(story, isOwner(req, story)));
});

if (MODE.backend === 'file' && MODE.authMode === 'legacy') app.put('/api/stories/:id', rateLimitWrites, (req, res) => {
  const all = readDb();
  const story = find(req.params.id, all);
  if (!story) return res.sendStatus(404);
  if (!isOwner(req, story)) return res.sendStatus(403);
  const body = req.body || {};
  const before={...story};
  if (body.text !== undefined) { if (typeof body.text !== 'string' || body.text.length > 12_000) return res.status(413).json({ error: 'Story text is limited to 12,000 characters.' }); story.text = body.text; }
  if (body.translation !== undefined) { if (typeof body.translation !== 'string' || body.translation.length > 12_000) return res.status(413).json({ error: 'Translation is limited to 12,000 characters.' }); story.translation = body.translation; story.translationChecked = false; story.checkedBy = ''; }
  if (body.translation !== undefined || body.translationOrigin !== undefined) {
    if (body.translationOrigin === 'ai_approved' && !isTranslationApproved(body.translationApproved)) return res.status(400).json({ error: 'Approve the AI translation before saving it.' });
    story.translationOrigin = story.translation ? (body.translationOrigin === 'ai_approved' && isTranslationApproved(body.translationApproved) ? 'ai_approved' : 'storyteller') : 'storyteller';
  }
  if (body.translationLanguage !== undefined) story.translationLanguage = String(body.translationLanguage).slice(0, 80);
  if (body.originalLanguage !== undefined) story.originalLanguage = String(body.originalLanguage).slice(0, 80);
  if (body.storytellerName !== undefined) story.storytellerName = String(body.storytellerName).slice(0, 120);
  if (body.showName !== undefined) story.showName = !!body.showName;
  if (body.checkTranslation === true) { const name = String(body.checkedBy || '').trim().slice(0, 120); if (!name || !story.translation) return res.status(400).json({ error: 'Enter the checker name and a translation.' }); story.translationChecked = true; story.checkedBy = name; }
  if (body.visibility !== undefined) { if (!['private', 'public'].includes(body.visibility)) return res.status(400).json({ error: 'Invalid visibility.' }); story.visibility = body.visibility; }
  if (body.approve === true) story.status = 'shared';
  else if (body.approve === false) story.status = 'draft';
  if (body.withdraw === true) { story.status = 'withdrawn'; story.visibility = 'private'; }
  const versionChanges=[];
  if(before.originalLanguage!==story.originalLanguage)versionChanges.push('Original language changed');
  if(before.text!==story.text)versionChanges.push('Original story edited');
  if(before.translationLanguage!==story.translationLanguage)versionChanges.push('Translation language changed');
  if(before.translation!==story.translation)versionChanges.push('Translation edited');
  if(before.translationOrigin!==story.translationOrigin)versionChanges.push(`Translation origin set to ${story.translationOrigin === 'ai_approved' ? 'AI draft approved by the storyteller' : 'written by the storyteller'}`);
  if(before.translationChecked!==story.translationChecked)versionChanges.push('Translation review label changed');
  if(before.storytellerName!==story.storytellerName||before.showName!==story.showName)versionChanges.push('Name display choice changed');
  if(before.visibility!==story.visibility)versionChanges.push(`Visibility changed to ${story.visibility}`);
  if(before.status!==story.status)versionChanges.push(story.status==='shared'?'Approved for sharing':story.status==='withdrawn'?'Story withdrawn':'Saved as draft');
  if(versionChanges.length)story.versionLog=appendStoryVersion(story,versionChanges.join('; '));
  writeDb(all);
  res.json(clean(story, true));
});

if (MODE.backend === 'file' && MODE.authMode === 'legacy') app.get('/api/stories/:id/audio', (req, res) => {
  const story = find(req.params.id);
  if (!story || !story.audio || !access(req, story)) return res.sendStatus(404);
  const uploadRoot = path.resolve(UPLOADS);
  const audioPath = path.resolve(uploadRoot, story.audio);
  if (!audioPath.startsWith(`${uploadRoot}${path.sep}`) || !fs.existsSync(audioPath) || !fs.statSync(audioPath).isFile()) return res.sendStatus(404);
  res.set('Cache-Control', 'no-store');
  res.type(story.mime || 'application/octet-stream');
  res.set('Content-Length', String(fs.statSync(audioPath).size));
  const stream = fs.createReadStream(audioPath);
  stream.on('error', () => { if (!res.headersSent) res.sendStatus(404); else res.destroy(); });
  stream.pipe(res);
});

if (process.env.NODE_ENV === 'production' || process.env.STORY_SERVE_STATIC === '1') {
  const buildDir = path.resolve(process.env.STORY_BRIDGE_BUILD_DIR || path.join(ROOT, 'dist'));
  app.use(express.static(buildDir));
  app.get('*path', (_req, res) => res.sendFile(path.join(buildDir, 'index.html')));
}

export function safeErrorHandler(error, req, res, _next) {
  releaseUpload(req);
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Audio upload limit is 10 MB.' });
  if (error?.code === 'INVALID_AUDIO') return res.status(400).json({ error: 'Choose a supported audio file.' });
  if (error instanceof StoreError) {
    console.error(`Story Bridge story store unavailable (STORE_UNAVAILABLE, ${error.reason}).`);
    return res.status(500).json({ error: 'Story data is unavailable. No changes were saved.' });
  }
  if (error?.code === 'UPLOAD_STORAGE') return res.status(500).json({ error: 'Upload storage is unavailable.' });
  if (error?.type === 'entity.parse.failed' || error?.status === 400) return res.status(400).json({ error: 'The request could not be read.' });
  // Never log request bodies, URL parameters, owner tokens, story content, or raw error messages.
  const safeCode = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'UNEXPECTED';
  console.error(`Story Bridge request failed (${req.method}, ${Number.isInteger(error?.status) ? error.status : 'unexpected'}, ${safeCode}).`);
  res.status(500).json({ error: 'The request could not be completed.' });
}
app.use(safeErrorHandler);

export default app;
if (process.env.NODE_ENV !== 'test' && process.env.STORY_NO_LISTEN !== '1') {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  app.listen(port, host, () => console.log(`Story Bridge API listening at http://${host}:${port} (${MODE.backend}/${MODE.authMode})`));
}
