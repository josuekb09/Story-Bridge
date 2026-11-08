import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import multer from 'multer';
import { createTokenVerifier } from './auth.js';
import { createSupabaseStore } from './supabase-store.js';
import { appendStoryVersion, makeStoryVersion, storyRecord } from './story-record.js';
import { isTranslationApproved, translationDraftHandler } from './translation-draft.js';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = (row, owner = false) => {
  const out = { id: row.id, originalLanguage: row.original_language, text: row.text, translationLanguage: row.translation_language, translation: row.translation, translationOrigin: row.translation_origin || 'storyteller', translationChecked: row.translation_checked, checkedBy: row.translation_checked ? row.checked_by : '', visibility: row.visibility, status: row.status, createdAt: row.created_at, audio: !!row.audio_key, versionLog:storyRecord(row) };
  if (row.show_name || owner) out.storytellerName = row.storyteller_name;
  return out;
};

export function mountAccountRoutes(app, config, { store = createSupabaseStore(config), verify = createTokenVerifier(config), rateLimit = (_req, _res, next) => next(), draftTranslation = async () => { throw new Error('translation-service-unavailable'); } } = {}) {
  const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => /^audio\/[a-z0-9.+-]+$/i.test(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('invalid audio'), { code: 'INVALID_AUDIO' })) });
  const session = async (req, res, next) => {
    const match = req.get('authorization')?.match(/^Bearer ([\w.-]+)$/);
    if (!match) return res.status(401).json({ error: 'Sign in to continue.' });
    try { req.account = await verify(match[1]); next(); }
    catch (error) {
      if (error.message === 'key-discovery-failed') return res.status(503).json({ error: 'Sign-in verification is temporarily unavailable.' });
      return res.status(401).json({ error: 'Your sign-in has expired. Sign in again.' });
    }
  };
  const ownerOnly = async (req, res, next) => {
    try {
      const row = await store.get(req.params.id);
      if (!row) return res.sendStatus(404);
      const owner = req.account?.id && row.owner_user_id === req.account.id;
      if (!owner && !(row.status === 'shared' && row.visibility === 'public')) return res.sendStatus(404);
      req.story = row; req.isStoryOwner = !!owner; next();
    } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); }
  };
  const optionalSession = async (req, res, next) => {
    const match = req.get('authorization')?.match(/^Bearer ([\w.-]+)$/);
    if (!match) return next();
    try { req.account = await verify(match[1]); next(); }
    catch (error) { return error.message === 'key-discovery-failed' ? res.status(503).json({error:'Sign-in verification is temporarily unavailable.'}) : next(); }
  };
  app.get('/api/account/config', (_req, res) => res.json({ account: true, url: config.url, publishableKey: config.publishableKey, google: config.google, email: config.email, brand: 'Story Bridge' }));
  app.post('/api/translation-draft', session, rateLimit, translationDraftHandler(draftTranslation));
  app.get('/api/account/profile', session, async (req, res) => { try { res.json(await store.profile(req.account.id) || { display_name: '' }); } catch { res.status(503).json({ error: 'Profile storage is unavailable.' }); } });
  app.put('/api/account/profile', session, async (req, res) => {
    const name = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    if (name.length > 80) return res.status(400).json({ error: 'Display name must be 80 characters or fewer.' });
    try { res.json(await store.saveProfile(req.account.id, name)); } catch { res.status(503).json({ error: 'Profile storage is unavailable.' }); }
  });
  app.post('/api/account/claim/:id', session, rateLimit, async (req, res) => {
    const token = req.get('x-owner-token');
    if (!token || token.length < 32) return res.status(400).json({ error: 'This browser has no claimable stories.' });
    try {
      const claimed = await store.claim(req.params.id, sha256(token), req.account.id);
      return claimed ? res.json({ claimed: true }) : res.status(409).json({ error: 'This story has already been claimed or cannot be claimed.' });
    } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); }
  });
  app.post('/api/account/claim', session, rateLimit, async (req, res) => {
    const token = req.get('x-owner-token');
    if (!token || token.length < 32) return res.status(400).json({ error: 'This browser has no claimable stories.' });
    try {
      const claimed = await store.claimLegacy(sha256(token), req.account.id);
      return claimed ? res.json({ claimed }) : res.status(409).json({ error: 'No unclaimed stories matched this browser token.' });
    }
    catch { res.status(503).json({ error: 'Story storage is unavailable.' }); }
  });
  app.get('/api/stories', async (_req, res) => { try { res.json((await store.listPublic()).map(row => clean(row))); } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); } });
  app.get('/api/mine', session, async (req, res) => { try { res.json((await store.listMine(req.account.id)).map(row => clean(row, true))); } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); } });
  app.post('/api/stories', session, rateLimit, audioUpload.single('audio'), async (req, res) => {
    const b = req.body || {};
    if (typeof b.originalLanguage !== 'string' || !b.originalLanguage.trim() || b.originalLanguage.length > 80 || b.text !== undefined && (typeof b.text !== 'string' || b.text.length > 12000) || b.translation !== undefined && (typeof b.translation !== 'string' || b.translation.length > 12000) || b.translationLanguage !== undefined && (typeof b.translationLanguage !== 'string' || b.translationLanguage.length > 80)) return res.status(400).json({ error: 'Check the language and story lengths.' });
    if (b.translationOrigin === 'ai_approved' && !isTranslationApproved(b.translationApproved)) return res.status(400).json({ error: 'Approve the AI translation before saving it.' });
    try {
      if ((await store.countMine(req.account.id)) >= 500) return res.status(429).json({ error: 'This account has reached its story limit.' });
      if (req.file && (await store.audioUsage()) + req.file.size > 1024 * 1024 * 1024) return res.status(413).json({ error: 'Upload storage limit reached.' });
      const audioKey = req.file ? crypto.randomUUID() : null;
      if (req.file) await store.putAudio(audioKey, req.file.buffer, req.file.mimetype);
      let row;
      const record={ owner_user_id: req.account.id, owner_hash: null, original_language: b.originalLanguage.trim(), text: b.text || '', translation_language: b.translationLanguage || '', translation: b.translation || '', translation_origin: b.translation ? (b.translationOrigin === 'ai_approved' && isTranslationApproved(b.translationApproved) ? 'ai_approved' : 'storyteller') : 'storyteller', translation_checked: false, checked_by: '', storyteller_name: String(b.storytellerName || '').slice(0,120), show_name: b.showName === true || b.showName === 'true', visibility: 'private', status: 'draft', audio_key: audioKey, audio_mime:req.file?.mimetype || '', audio_sha256:req.file?sha256(req.file.buffer):'' };
      record.version_log=[makeStoryVersion(record,'Story created')];
      try { row = await store.create(record); }
      catch (error) { if (audioKey && store.removeAudio) await store.removeAudio(audioKey).catch(() => {}); throw error; }
      res.status(201).json(clean(row, true));
    } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); }
  });
  app.get('/api/stories/:id', optionalSession, ownerOnly, (req, res) => res.json(clean(req.story, req.isStoryOwner)));
  app.put('/api/stories/:id', session, rateLimit, ownerOnly, async (req, res) => {
    if (!req.isStoryOwner) return res.sendStatus(403);
    const b = req.body || {}; const changes = {};
    for (const [from, to] of Object.entries({ text:'text', translation:'translation', translationLanguage:'translation_language', originalLanguage:'original_language', storytellerName:'storyteller_name', showName:'show_name' })) if (b[from] !== undefined) changes[to] = b[from];
    if (b.visibility !== undefined) {
      if (!['private','public'].includes(b.visibility)) return res.status(400).json({ error:'Invalid visibility.' });
      changes.visibility = b.visibility;
    }
    for (const key of ['text','translation']) if (b[key] !== undefined && (typeof b[key] !== 'string' || b[key].length > 12000)) return res.status(400).json({ error:'Story text is limited to 12,000 characters.' });
    for (const key of ['translationLanguage','originalLanguage']) if (b[key] !== undefined && (typeof b[key] !== 'string' || b[key].length > 80)) return res.status(400).json({ error:'Language is limited to 80 characters.' });
    if (b.storytellerName !== undefined && (typeof b.storytellerName !== 'string' || b.storytellerName.length > 120)) return res.status(400).json({ error:'Storyteller name is limited to 120 characters.' });
    if (b.showName !== undefined && typeof b.showName !== 'boolean') return res.status(400).json({ error:'Invalid name visibility choice.' });
    if (b.translation !== undefined) { changes.translation_checked=false; changes.checked_by=''; changes.translation_origin='storyteller'; }
    if (b.checkTranslation === true) {
      const checker=typeof b.checkedBy==='string'?b.checkedBy.trim().slice(0,120):'';
      if (!checker || !(b.translation ?? req.story.translation)) return res.status(400).json({ error:'Enter the checker name and a translation.' });
      changes.translation_checked=true;changes.checked_by=checker;
    }
    if (b.approve === true) changes.status = 'shared';
    else if (b.approve === false) changes.status = 'draft';
    if (b.withdraw === true) { changes.status = 'withdrawn'; changes.visibility = 'private'; }
    const after={...req.story,...changes};
    const labels=[];
    for(const [field,label] of [['original_language','Original language changed'],['text','Original story edited'],['translation_language','Translation language changed'],['translation','Translation edited'],['translation_origin',`Translation origin set to ${after.translation_origin==='ai_approved'?'AI draft approved by the storyteller':'written by the storyteller'}`],['storyteller_name','Storyteller name changed'],['show_name','Name display choice changed'],['visibility',`Visibility changed to ${after.visibility}`],['status',after.status==='shared'?'Approved for sharing':after.status==='withdrawn'?'Story withdrawn':'Saved as draft'],['translation_checked','Translation review label changed']]) if(changes[field]!==undefined&&changes[field]!==req.story[field]) labels.push(label);
    if(labels.length) changes.version_log=appendStoryVersion(after,labels.join('; '));
    try { const row = await store.update(req.params.id, req.account.id, changes); row ? res.json(clean(row, true)) : res.sendStatus(409); }
    catch { res.status(503).json({ error: 'Story storage is unavailable.' }); }
  });
  app.get('/api/stories/:id/audio', optionalSession, ownerOnly, async (req, res) => {
    if (!req.story.audio_key) return res.sendStatus(404);
    try {
      const upstream = await store.audioResponse(req.story.audio_key,req.story.audio_mime);
      res.status(upstream.status).set('Cache-Control','no-store').type(upstream.headers.get('content-type') || 'application/octet-stream');
      if (upstream.headers.get('content-length')) res.set('Content-Length', upstream.headers.get('content-length'));
      const audio = Readable.fromWeb(upstream.body);
      audio.on('error', () => res.destroy());
      audio.pipe(res);
    }
    catch { res.status(503).json({ error: 'Audio storage is unavailable.' }); }
  });
  return { session };
}
