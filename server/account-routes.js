import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import multer from 'multer';
import { createTokenVerifier } from './auth.js';
import { createSupabaseStore } from './supabase-store.js';
import { appendStoryVersion, makeStoryVersion, storyRecord } from './story-record.js';
import { isTranslationApproved, translationDraftHandler } from './translation-draft.js';
import { OBJECT_IDS } from '../src/object-records.js';
import { IMAGE_MAX_BYTES, normalizePostMetadata, validateAndReencodeImage, validateImageMetadata, validatePostMetadata } from './post-content.js';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = (row, owner = false) => {
  const out = { id: row.id, objectId: row.object_id || null, title:row.title||'',kind:row.kind||'story',section:row.section||'stories',trustLabel:row.trust_label||'Told by a community member',licence:row.licence||'All rights reserved',region:row.region||'',people:row.people||'',tags:row.tags||[],sources:row.sources||[],consentConfirmed:!!row.consent_confirmed,access:row.access||'Public',moderationStatus:row.moderation_status||'approved',originalLanguage: row.original_language, text: row.text, translationLanguage: row.translation_language, translation: row.translation, translationOrigin: row.translation_origin || 'storyteller', translationChecked: row.translation_checked, checkedBy: row.translation_checked ? row.checked_by : '', visibility: row.visibility, status: row.status, createdAt: row.created_at, audio: !!row.audio_key, versionLog:storyRecord(row) };
  if (row.show_name || owner) out.storytellerName = row.storyteller_name;
  return out;
};
const cleanPost = async (row, owner = false, store) => ({...clean(row,owner),images:(await store.listPostMedia?.(row.id)||[]).filter(media=>media.kind==='image').map(media=>({id:media.id,kind:media.kind,altText:media.alt_text,credit:media.credit,licence:media.licence,width:media.width,height:media.height,sha256:media.sha256,url:`/api/posts/${row.id}/media/${encodeURIComponent(media.storage_key)}`}))});

export function mountAccountRoutes(app, config, { store = createSupabaseStore(config), verify = createTokenVerifier(config), rateLimit = (_req, _res, next) => next(), draftTranslation = async () => { throw new Error('translation-service-unavailable'); }, objectAdminId = process.env.STORY_BRIDGE_OBJECT_ADMIN_ID || '' } = {}) {
  const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => /^audio\/[a-z0-9.+-]+$/i.test(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('invalid audio'), { code: 'INVALID_AUDIO' })) });
  const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => /^image\/(jpeg|png|webp)$/i.test(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('invalid image'), { code: 'INVALID_IMAGE' })) });
  const postUpload = multer({ storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:7},fileFilter:(_req,file,cb)=>/^(audio\/[a-z0-9.+-]+|image\/(jpeg|png|webp))$/i.test(file.mimetype)?cb(null,true):cb(Object.assign(new Error('invalid media'),{code:'INVALID_MEDIA'})) });
  const limitPostBody=(req,res,next)=>{const size=Number(req.get('content-length'));if(Number.isFinite(size)&&size>10*1024*1024+6*IMAGE_MAX_BYTES+512*1024)return res.status(413).json({error:'A post may contain up to six 8 MB images and one 10 MB audio recording.'});next()};
  const parsePostUpload=(req,res,next)=>postUpload.fields([{name:'audio',maxCount:1},{name:'images',maxCount:6}])(req,res,error=>{if(!error)return next();if(error.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'Each image is limited to 8 MB and audio to 10 MB.'});return res.status(400).json({error:'Choose JPEG, PNG, WebP images or supported audio.'})});
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
  app.get('/api/account/config', (_req, res) => res.json({ account: true, url: config.url, publishableKey: config.publishableKey, google: config.google, email: config.email, emailCodeLength: config.emailCodeLength, brand: 'Story Bridge' }));
  app.post('/api/translation-draft', session, rateLimit, translationDraftHandler(draftTranslation));
  app.get('/api/account/profile', session, async (req, res) => { try { const profile=await store.profile(req.account.id)||{display_name:'',country:'',languages:[]};const {avatar_key,...safe}=profile;res.json({...safe,avatar_url:avatar_key?'/api/account/profile/avatar':''}); } catch { res.status(503).json({ error: 'Profile storage is unavailable.' }); } });
  app.put('/api/account/profile', session, async (req, res) => {
    const name = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    if (name.length > 80) return res.status(400).json({ error: 'Display name must be 80 characters or fewer.' });
    const country=typeof req.body?.country==='string'?req.body.country.trim():'';
    const languages=req.body?.languages;
    if(country.length>100||languages!==undefined&&(!Array.isArray(languages)||languages.length>12||languages.some(item=>typeof item!=='string'||item.trim().length>60)))return res.status(400).json({error:'Check the country and language fields.'});
    try { const saved=await store.saveProfile(req.account.id,{display_name:name,country,languages:languages||[]});const {avatar_key,...safe}=saved;res.json(safe); } catch { res.status(503).json({ error: 'Profile storage is unavailable.' }); }
  });
  app.post('/api/account/profile/avatar',session,rateLimit,(req,res)=>avatarUpload.single('avatar')(req,res,async error=>{
    if(error)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:'Choose a JPEG, PNG or WebP photo up to 2 MB.'});
    if(!req.file)return res.status(400).json({error:'Choose a profile photo.'});
    let prepared;try{if(req.file.buffer.length>2*1024*1024)return res.status(413).json({error:'Profile photos are limited to 2 MB.'});prepared=await validateAndReencodeImage(req.file.buffer)}catch{return res.status(400).json({error:'The photo must be a valid JPEG, PNG or WebP image.'})}
    const key=crypto.randomUUID();
    try{const old=await store.profile(req.account.id);await store.putProfileAvatar(key,prepared.buffer);const saved=await store.saveProfile(req.account.id,{...(old||{}),avatar_key:key});if(old?.avatar_key)await store.removeProfileAvatar(old.avatar_key).catch(()=>{});res.json({avatar_url:'/api/account/profile/avatar',width:prepared.width,height:prepared.height})}catch{return res.status(503).json({error:'Profile photo could not be saved.'})}
  }));
  app.delete('/api/account/profile/avatar',session,rateLimit,async(req,res)=>{try{const profile=await store.profile(req.account.id);if(profile?.avatar_key)await store.removeProfileAvatar(profile.avatar_key);const {avatar_key,...safe}=await store.saveProfile(req.account.id,{...(profile||{}),avatar_key:null});res.json({...safe,avatar_url:''})}catch{return res.status(503).json({error:'Profile photo could not be removed.'})}});
  app.get('/api/account/profile/avatar',session,async(req,res)=>{try{const profile=await store.profile(req.account.id);if(!profile?.avatar_key)return res.sendStatus(404);const image=await store.getProfileAvatar(profile.avatar_key);res.set('X-Content-Type-Options','nosniff').set('Cache-Control','private, no-store').type('image/webp').send(image.buffer)}catch{return res.sendStatus(404)}});
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
  const objectAccessList = async () => {
    const rows = await store.listObjectAccess?.() || [];
    return OBJECT_IDS.map(id => ({ id, access: rows.find(row => row.id === id)?.access || 'Public' }));
  };
  app.get('/api/objects', optionalSession, async (req, res) => {
    try { res.json({ objects: await objectAccessList(), canManage: !!objectAdminId && req.account?.id === objectAdminId }); }
    catch { res.status(503).json({ error: 'Object access settings are unavailable.' }); }
  });
  app.put('/api/objects/:id/access', session, rateLimit, async (req, res) => {
    if (!objectAdminId || req.account.id !== objectAdminId) return res.sendStatus(403);
    if (!OBJECT_IDS.includes(req.params.id) || !['Public','Community only'].includes(req.body?.access)) return res.status(400).json({ error:'Choose a valid object and access setting.' });
    try { res.json(await store.setObjectAccess(req.params.id, req.body.access)); }
    catch { res.status(503).json({ error:'Object access could not be saved.' }); }
  });
  app.get('/api/admin/posts/pending', session, async (req,res)=>{
    if(!objectAdminId||req.account.id!==objectAdminId)return res.sendStatus(403);
    try{res.json((await store.listPending()).map(row=>clean(row,true)))}catch{res.status(503).json({error:'Pending posts are unavailable.'})}
  });
  app.post('/api/admin/posts/:id/approve', session, rateLimit, async (req,res)=>{
    if(!objectAdminId||req.account.id!==objectAdminId)return res.sendStatus(403);
    let stage='load_post';
    try {
      const row=await store.get(req.params.id);
      if(!row)return res.sendStatus(404);
      if(row.moderation_status!=='pending_review')return row.moderation_status==='approved'&&row.status==='shared'?res.json(clean(row,true)):res.sendStatus(404);
      const next={...row,status:'shared',visibility:row.requested_visibility||'public',moderation_status:'approved',first_post:false};
      next.version_log=appendStoryVersion(next,'Admin approved first post');
      stage='persist_approval';
      const saved=typeof store.approvePending==='function'
        ? await store.approvePending(row.id,{status:next.status,visibility:next.visibility,moderation_status:next.moderation_status,first_post:false,version_log:next.version_log})
        : await store.update(row.id,row.owner_user_id,{status:next.status,visibility:next.visibility,moderation_status:next.moderation_status,first_post:false,version_log:next.version_log});
      if(saved)return res.json(clean(saved,true));
      const current=await store.get(row.id);
      return current?.moderation_status==='approved'&&current.status==='shared'?res.json(clean(current,true)):res.sendStatus(409);
    } catch(error) {
      const rawCode=error?.cause?.code||error?.code||error?.cause?.status||error?.status||error?.name||'unknown';
      const errorCode=typeof rawCode==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(rawCode)?rawCode:'unknown';
      console.error(JSON.stringify({event:'admin_post_approval_failed',stage,errorCode}));
      return res.status(503).json({error:'Post could not be approved.'});
    }
  });
  app.get('/api/stories', optionalSession, async (req, res) => { try {
    const access = await objectAccessList();
    const restricted = new Set(access.filter(item=>item.access==='Community only').map(item=>item.id));
    const rows = (await store.listPublic()).filter(row => (!!req.account||row.access!=='Community only')&&(!row.object_id || !restricted.has(row.object_id) || !!req.account)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
    res.json(await Promise.all(rows.map(row => cleanPost(row,false,store))));
  } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); } });
  app.get('/api/mine', session, async (req, res) => { try { res.json(await Promise.all((await store.listMine(req.account.id)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).map(row => cleanPost(row,true,store)))); } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); } });
  app.post('/api/stories', session, rateLimit, limitPostBody, parsePostUpload, async (req, res) => {
    const b = req.body || {};
    const metadataError=validatePostMetadata({...b,consentConfirmed:b.consentConfirmed});
    if(metadataError)return res.status(400).json({error:metadataError});
    let imageMetadata=[];try{imageMetadata=JSON.parse(b.imageMetadata||'[]')}catch{return res.status(400).json({error:'Image details could not be read.'})}
    const images=req.files?.images||[];const imageMetadataError=validateImageMetadata(images,imageMetadata);if(imageMetadataError)return res.status(400).json({error:imageMetadataError});
    const audioFile=req.files?.audio?.[0];
    if (typeof b.originalLanguage !== 'string' || !b.originalLanguage.trim() || b.originalLanguage.length > 80 || b.text !== undefined && (typeof b.text !== 'string' || b.text.length > 12000) || b.translation !== undefined && (typeof b.translation !== 'string' || b.translation.length > 12000) || b.translationLanguage !== undefined && (typeof b.translationLanguage !== 'string' || b.translationLanguage.length > 80) || b.objectId !== undefined && b.objectId !== '' && !OBJECT_IDS.includes(b.objectId)) return res.status(400).json({ error: 'Check the language, object, and story lengths.' });
    if (b.translationOrigin === 'ai_approved' && !isTranslationApproved(b.translationApproved)) return res.status(400).json({ error: 'Approve the AI translation before saving it.' });
    try {
      if ((await store.countMine(req.account.id)) >= 500) return res.status(429).json({ error: 'This account has reached its story limit.' });
      if (audioFile && (await store.audioUsage()) + audioFile.size > 1024 * 1024 * 1024) return res.status(413).json({ error: 'Upload storage limit reached.' });
      const audioKey = audioFile ? crypto.randomUUID() : null;
      if (audioFile) await store.putAudio(audioKey, audioFile.buffer, audioFile.mimetype);
      const normalized=normalizePostMetadata(b);const converted=[];
      for(let index=0;index<images.length;index++){let prepared;try{prepared=await validateAndReencodeImage(images[index].buffer)}catch(error){return res.status(error.message==='image-too-large'?413:400).json({error:error.message==='image-too-large'?'Image files are limited to 8 MB.':'An uploaded image is not a valid JPEG, PNG or WebP.'})}const key=crypto.randomUUID();await store.putPostImage(key,prepared.buffer);converted.push({id:crypto.randomUUID(),kind:'image',storage_key:key,alt_text:imageMetadata[index].altText.trim(),credit:imageMetadata[index].credit.trim(),licence:normalized.licence,width:prepared.width,height:prepared.height,sha256:prepared.sha256});}
      const existingPosts=await store.listMine(req.account.id);
      const firstPost=existingPosts.length===0||existingPosts.some(item=>item.first_post&&item.moderation_status==='pending_review');
      let row;
      const record={ ...normalized, owner_user_id: req.account.id, owner_hash: null, first_post:firstPost, moderation_status:'approved',requested_visibility:'private', object_id:b.objectId || null, original_language: b.originalLanguage.trim(), text: b.text || '', translation_language: b.translationLanguage || '', translation: b.translation || '', translation_origin: b.translation ? (b.translationOrigin === 'ai_approved' && isTranslationApproved(b.translationApproved) ? 'ai_approved' : 'storyteller') : 'storyteller', translation_checked: false, checked_by: '', storyteller_name: String(b.storytellerName || '').slice(0,120), show_name: b.showName === true || b.showName === 'true', visibility: 'private', status: 'draft', audio_key: audioKey, audio_mime:audioFile?.mimetype || '', audio_sha256:audioFile?sha256(audioFile.buffer):'' };
      record.version_log=[makeStoryVersion(record,'Story created')];
      try { row = await store.create(record); }
      catch (error) { if (audioKey && store.removeAudio) await store.removeAudio(audioKey).catch(() => {}); throw error; }
      const media=[...converted.map(item=>({...item,post_id:row.id})),...(audioKey?[{id:crypto.randomUUID(),post_id:row.id,kind:'audio',storage_key:audioKey,alt_text:null,credit:'',licence:normalized.licence,width:null,height:null,sha256:sha256(audioFile.buffer)}]:[])];
      if(media.length)await store.createPostMedia(media);
      if(converted.length)row.images=converted.map(item=>({...item,url:`/api/posts/${row.id}/media/${item.storage_key}`}));
      res.status(201).json(await cleanPost(row,true,store));
    } catch { res.status(503).json({ error: 'Story storage is unavailable.' }); }
  });
  app.get('/api/posts/:id/media/:key',optionalSession,async(req,res)=>{try{const row=await store.get(req.params.id);if(!row)return res.sendStatus(404);const isOwner=!!req.account&&row.owner_user_id===req.account.id;if(!isOwner&&!(row.status==='shared'&&row.visibility==='public'&&row.moderation_status!=='pending_review'))return res.sendStatus(404);const access=await objectAccessList();if(!req.account&&row.access==='Community only')return res.sendStatus(404);if(!req.account&&row.object_id&&access.some(item=>item.id===row.object_id&&item.access==='Community only'))return res.sendStatus(404);const item=(await store.listPostMedia(row.id)).find(media=>media.storage_key===req.params.key);if(!item)return res.sendStatus(404);const image=await store.getPostImage(item.storage_key);res.set('X-Content-Type-Options','nosniff').set('Cache-Control','public, max-age=300').type(image.mime).send(image.buffer)}catch{return res.status(503).json({error:'Post media is unavailable.'})}});
  app.get('/api/stories/:id', optionalSession, ownerOnly, async (req, res) => {
    if(req.story.access==='Community only'&&!req.account)return res.sendStatus(404);
    if (req.story.object_id && !req.account) {
      try { if ((await objectAccessList()).some(item=>item.id===req.story.object_id&&item.access==='Community only')) return res.sendStatus(404); }
      catch { return res.status(503).json({error:'Story access is unavailable.'}); }
    }
    res.json(await cleanPost(req.story, req.isStoryOwner,store));
  });
  // Permanent delete: the owner removes the story, its audio and its images. Nothing is kept.
  app.delete('/api/stories/:id', session, rateLimit, ownerOnly, async (req, res) => {
    if (!req.isStoryOwner) return res.sendStatus(403);
    try { const removed = await store.deleteStory(req.story.id, req.account.id); if (!removed) return res.sendStatus(404); res.sendStatus(204); }
    catch (error) { console.error(JSON.stringify({ event: 'story-delete-failed', code: error?.cause?.code || error?.message || 'unknown' })); res.status(503).json({ error: 'Story storage is unavailable.' }); }
  });
  app.put('/api/stories/:id', session, rateLimit, ownerOnly, async (req, res) => {
    if (!req.isStoryOwner) return res.sendStatus(403);
    const b = req.body || {}; const changes = {};
    for (const [from, to] of Object.entries({ text:'text', translation:'translation', translationLanguage:'translation_language', originalLanguage:'original_language', storytellerName:'storyteller_name', showName:'show_name' })) if (b[from] !== undefined) changes[to] = b[from];
    for (const [from,to] of Object.entries({title:'title',kind:'kind',section:'section',trustLabel:'trust_label',licence:'licence',region:'region',people:'people',tags:'tags',sources:'sources',access:'access'})) if(b[from]!==undefined)changes[to]=b[from];
    if (b.visibility !== undefined) {
      if (!['private','public'].includes(b.visibility)) return res.status(400).json({ error:'Invalid visibility.' });
      changes.visibility = b.visibility;
    }
    for (const key of ['text','translation']) if (b[key] !== undefined && (typeof b[key] !== 'string' || b[key].length > 12000)) return res.status(400).json({ error:'Story text is limited to 12,000 characters.' });
    for (const key of ['translationLanguage','originalLanguage']) if (b[key] !== undefined && (typeof b[key] !== 'string' || b[key].length > 80)) return res.status(400).json({ error:'Language is limited to 80 characters.' });
    if (b.storytellerName !== undefined && (typeof b.storytellerName !== 'string' || b.storytellerName.length > 120)) return res.status(400).json({ error:'Storyteller name is limited to 120 characters.' });
    if (b.showName !== undefined && typeof b.showName !== 'boolean') return res.status(400).json({ error:'Invalid name visibility choice.' });
    if(b.access!==undefined&&!['Public','Community only'].includes(b.access))return res.status(400).json({error:'Choose Public or Community only access.'});
    if(b.title!==undefined&&(typeof b.title!=='string'||!b.title.trim()||b.title.length>160))return res.status(400).json({error:'Post title must be 1–160 characters.'});
    if(b.tags!==undefined&&(!Array.isArray(b.tags)||b.tags.length>20||b.tags.some(tag=>typeof tag!=='string'||tag.length>40)))return res.status(400).json({error:'Use up to 20 tags, each 40 characters or fewer.'});
    if(b.sources!==undefined&&(!Array.isArray(b.sources)||b.sources.length>20||b.sources.some(item=>!item||typeof item.label!=='string'||typeof item.url!=='string'||!/^https:\/\//i.test(item.url))))return res.status(400).json({error:'Sources must be labels and HTTPS links.'});
    if (b.translation !== undefined) { changes.translation_checked=false; changes.checked_by=''; changes.translation_origin='storyteller'; }
    if (b.checkTranslation === true) {
      const checker=typeof b.checkedBy==='string'?b.checkedBy.trim().slice(0,120):'';
      if (!checker || !(b.translation ?? req.story.translation)) return res.status(400).json({ error:'Enter the checker name and a translation.' });
      changes.translation_checked=true;changes.checked_by=checker;
    }
    if (b.approve === true && req.story.first_post) {
      if (req.story.moderation_status === 'pending_review') return res.status(409).json({error:'This first post is awaiting admin review.'});
      changes.status='draft';changes.visibility='private';changes.requested_visibility=b.visibility==='public'?'public':'private';changes.moderation_status='pending_review';
    }
    else if (b.approve === true) changes.status = 'shared';
    else if (b.approve === false) changes.status = 'draft';
    if (b.withdraw === true) { changes.status = 'withdrawn'; changes.visibility = 'private'; }
    const after={...req.story,...changes};
    const labels=[];
    for(const [field,label] of [['original_language','Original language changed'],['text','Original story edited'],['title','Post title changed'],['kind','Post type changed'],['section','Post section changed'],['trust_label','Trust label changed'],['licence','Licence changed'],['region','Region changed'],['people','People field changed'],['tags','Tags changed'],['sources','Sources changed'],['access','Post access changed'],['moderation_status','Submitted for admin review'],['translation_language','Translation language changed'],['translation','Translation edited'],['translation_origin',`Translation origin set to ${after.translation_origin==='ai_approved'?'AI draft approved by the storyteller':'written by the storyteller'}`],['storyteller_name','Storyteller name changed'],['show_name','Name display choice changed'],['visibility',`Visibility changed to ${after.visibility}`],['status',after.status==='shared'?'Approved for sharing':after.status==='withdrawn'?'Story withdrawn':'Saved as draft'],['translation_checked','Translation review label changed']]) if(changes[field]!==undefined&&changes[field]!==req.story[field]) labels.push(label);
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
