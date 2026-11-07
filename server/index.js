import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA = process.env.STORY_DATA_DIR || path.join(ROOT, 'data');
export const UPLOADS = process.env.STORY_UPLOAD_DIR || path.join(ROOT, 'uploads');
fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(UPLOADS, { recursive: true });
const dbFile = path.join(DATA, 'stories.json');
const readDb = () => { try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch { return []; } };
const writeDb = stories => { const tmp = `${dbFile}.tmp`; fs.writeFileSync(tmp, JSON.stringify(stories, null, 2)); fs.renameSync(tmp, dbFile); };
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const ownerToken = req => typeof req.get('x-owner-token') === 'string' && req.get('x-owner-token').length >= 32 ? req.get('x-owner-token') : '';
const isOwner = (req, story) => !!ownerToken(req) && crypto.timingSafeEqual(Buffer.from(hash(ownerToken(req))), Buffer.from(story.ownerHash));
const clean = (s, owner) => { const result={ id:s.id, originalLanguage:s.originalLanguage, text:s.text, translationLanguage:s.translationLanguage, translation:s.translation, translationChecked:s.translationChecked, checkedBy:s.translationChecked ? s.checkedBy : '', visibility:s.visibility, status:s.status, createdAt:s.createdAt, audio:!!s.audio }; if(s.showName||owner)result.storytellerName=s.storytellerName; return result; };
const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit: '256kb' }));
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize:10*1024*1024, files:1 }, fileFilter:(req,file,cb)=> cb(/^audio\/[a-z0-9.+-]+$/i.test(file.mimetype) ? null : new Error('Audio files only'), /^audio\/[a-z0-9.+-]+$/i.test(file.mimetype)) });
const find = id => readDb().find(s => s.id === id);
const access = (req, story) => isOwner(req, story) || (story.status === 'shared' && story.visibility === 'public');
app.get('/api/stories', (req,res)=>res.json(readDb().filter(s=>s.status==='shared'&&s.visibility==='public').map(s=>clean(s,false))));
app.get('/api/mine', (req,res)=>{const token=ownerToken(req);if(!token)return res.status(400).json({error:'A browser owner token is required.'});res.json(readDb().filter(s=>isOwner(req,s)).map(s=>clean(s,true)));});
app.post('/api/stories', upload.single('audio'), (req,res)=>{
  const token=ownerToken(req); if(!token) return res.status(400).json({error:'A browser owner token is required.'});
  const body=req.body || {}; const text=String(body.text||'');
  if(text.length>12000) return res.status(413).json({error:'Story text is limited to 12,000 characters.'});
  if(String(body.originalLanguage||'').trim().length>80 || String(body.translation||'').length>12000) return res.status(413).json({error:'Language or translation is too long.'});
  if(!String(body.originalLanguage||'').trim()) return res.status(400).json({error:'Enter the language of the story.'});
  const id=crypto.randomUUID(), audioName=req.file ? `${crypto.randomUUID()}.audio` : '';
  if(req.file) fs.writeFileSync(path.join(UPLOADS,audioName), req.file.buffer, {flag:'wx'});
  const s={id, ownerHash:hash(token), originalLanguage:String(body.originalLanguage).trim(), text, translationLanguage:String(body.translationLanguage||'').trim(), translation:String(body.translation||''), translationChecked:false, checkedBy:'', storytellerName:String(body.storytellerName||'').slice(0,120), showName:body.showName==='true', visibility:'private', status:'draft', createdAt:new Date().toISOString(), audio:audioName, mime:req.file?.mimetype||''};
  const all=readDb(); all.push(s); writeDb(all); res.status(201).json(clean(s,true));
});
app.get('/api/stories/:id', (req,res)=>{ const s=find(req.params.id); if(!s||!access(req,s)) return res.sendStatus(404); res.json(clean(s,isOwner(req,s))); });
app.put('/api/stories/:id', (req,res)=>{ const all=readDb(), s=all.find(x=>x.id===req.params.id); if(!s) return res.sendStatus(404); if(!isOwner(req,s)) return res.sendStatus(403); const b=req.body||{};
  if(b.text!==undefined){if(typeof b.text!=='string'||b.text.length>12000)return res.status(413).json({error:'Story text is limited to 12,000 characters.'});s.text=b.text;}
  if(b.translation!==undefined){if(typeof b.translation!=='string'||b.translation.length>12000)return res.status(413).json({error:'Translation is limited to 12,000 characters.'});s.translation=b.translation;s.translationChecked=false;s.checkedBy='';}
  if(b.translationLanguage!==undefined)s.translationLanguage=String(b.translationLanguage).slice(0,80);
  if(b.originalLanguage!==undefined)s.originalLanguage=String(b.originalLanguage).slice(0,80);
  if(b.storytellerName!==undefined)s.storytellerName=String(b.storytellerName).slice(0,120);
  if(b.showName!==undefined)s.showName=!!b.showName;
  if(b.checkTranslation===true){const name=String(b.checkedBy||'').trim().slice(0,120); if(!name||!s.translation)return res.status(400).json({error:'Enter the checker name and a translation.'});s.translationChecked=true;s.checkedBy=name;}
  if(b.visibility!==undefined){if(!['private','public'].includes(b.visibility))return res.status(400).json({error:'Invalid visibility.'});s.visibility=b.visibility;}
  if(b.approve===true)s.status='shared'; if(b.withdraw===true){s.status='withdrawn';s.visibility='private';} writeDb(all);res.json(clean(s,true)); });
app.get('/api/stories/:id/audio', (req,res)=>{const s=find(req.params.id);if(!s||!s.audio||!access(req,s))return res.sendStatus(404);const uploadRoot=path.resolve(UPLOADS),audioPath=path.resolve(uploadRoot,s.audio);if(!audioPath.startsWith(`${uploadRoot}${path.sep}`)||!fs.existsSync(audioPath)||!fs.statSync(audioPath).isFile())return res.sendStatus(404);res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');res.type(s.mime||'application/octet-stream');res.set('Content-Length',String(fs.statSync(audioPath).size));const stream=fs.createReadStream(audioPath);stream.on('error',()=>{if(!res.headersSent)res.sendStatus(404);else res.destroy();});stream.pipe(res);});
app.use((err,req,res,next)=>{ if(err instanceof multer.MulterError && err.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'Audio upload limit is 10 MB.'}); if(err)return res.status(400).json({error:err.message||'Invalid request.'}); next(); });
if(process.env.NODE_ENV==='production'){app.use(express.static(path.join(ROOT,'dist')));app.get('*path',(req,res)=>res.sendFile(path.join(ROOT,'dist','index.html')));}
export default app;
if(process.env.NODE_ENV!=='test' && process.env.STORY_NO_LISTEN!=='1'){const host=process.env.HOST||'127.0.0.1';const port=Number(process.env.PORT||3000);app.listen(port,host,()=>console.log(`Story Bridge API listening at http://${host}:${port}`));}
