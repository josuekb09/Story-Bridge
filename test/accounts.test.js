import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import express from 'express';
import sharp from 'sharp';
import { parseAccountConfig, createTokenVerifier, signTestToken } from '../server/auth.js';
import { mountAccountRoutes } from '../server/account-routes.js';
import { createFileAccountStore } from '../server/file-account-store.js';
import { createSupabaseStore } from '../server/supabase-store.js';
import { contentSecurityPolicy } from '../server/csp.js';
import { OBJECT_IDS } from '../src/object-records.js';

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = pair.publicKey.export({ format:'jwk' }); jwk.kid = 'local-test-key'; jwk.alg = 'RS256';
const config = { backend:'supabase', authMode:'account', account:true, url:'https://story-bridge-test.supabase.co', publishableKey:'sb_publishable_fake_local_test_key_123456', secretKey:'sb_secret_fake_local_test_key_123456', bucket:'story-bridge-audio', google:false, email:false, jwks:JSON.stringify({keys:[jwk]}) };
const baseClaims = (sub, extra={}) => ({ sub, iss:`${config.url}/auth/v1`, aud:'authenticated', exp:Math.floor(Date.now()/1000)+3600, email:`${sub}@example.test`, ...extra });
const token = (sub, extra) => signTestToken(baseClaims(sub, extra), pair.privateKey);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function fixtureStore() {
  const rows = new Map(); const profiles = new Map();const media=[];const images=new Map();const avatars=new Map(); let lock = Promise.resolve();
  const store = {
    rows,
    async listPublic() { return [...rows.values()].filter(row => row.status==='shared' && row.visibility==='public'); },
    async listMine(userId) { return [...rows.values()].filter(row => row.owner_user_id===userId); },
    async listPending() { return [...rows.values()].filter(row=>row.moderation_status==='pending_review'); },
    async get(id) { return rows.get(id) || null; },
    async create(row) { const saved={id:crypto.randomUUID(),created_at:new Date().toISOString(),...row};rows.set(saved.id,saved);return saved; },
    async update(id,userId,changes) { const row=rows.get(id);if(!row||row.owner_user_id!==userId)return null;Object.assign(row,changes);return row; },
    async countMine(userId) { return [...rows.values()].filter(row=>row.owner_user_id===userId).length; },
    async putPostImage(key,buffer){images.set(key,buffer);},async createPostMedia(list){media.push(...list);return list;},async listPostMedia(id){return media.filter(item=>item.post_id===id);},async getPostImage(key){return{buffer:images.get(key),mime:'image/webp'};},
    async claimLegacy(ownerHash,userId) {
      let release; const prior=lock;lock=new Promise(resolve=>release=resolve);await prior;
      try { const matches=[...rows.values()].filter(row=>row.owner_user_id===null&&row.owner_hash===ownerHash);for(const row of matches){row.owner_user_id=userId;row.owner_hash=null;}return matches.length; }
      finally { release(); }
    },
    async claim(id,ownerHash,userId) { const row=rows.get(id);if(!row||row.owner_user_id!==null||row.owner_hash!==ownerHash)return false;row.owner_user_id=userId;row.owner_hash=null;return true; },
    async profile(id) { return profiles.get(id)||null; },
    async saveProfile(id,profile) { const result={user_id:id,...(profiles.get(id)||{}),...profile};profiles.set(id,result);return result; },
    async putProfileAvatar(key,buffer){avatars.set(key,buffer);},async getProfileAvatar(key){return{buffer:avatars.get(key),mime:'image/webp'};},async removeProfileAvatar(key){avatars.delete(key);},
    async putAudio() {}, async removeAudio() {}, async audioUsage(){return 0;}, async audioResponse(){return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/webm'}});},
  };
  return store;
}
async function serverFor(store=fixtureStore(),draftTranslation=async()=> 'Synthetic mock translation',options={}) {
  const app=express();app.use(express.json());mountAccountRoutes(app,config,{store,verify:createTokenVerifier(config),draftTranslation,objectAdminId:options.objectAdminId||''});app.use((_req,res)=>res.status(503).end());
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  return {base:`http://127.0.0.1:${server.address().port}`,server,store};
}
const auth = user => ({authorization:`Bearer ${token(user)}`});
const storyRow = (id,owner,status='draft',visibility='private',audio_key=null) => ({id,owner_user_id:owner,owner_hash:null,original_language:'Synthetic',text:'Synthetic story',translation_language:'',translation:'',translation_checked:false,checked_by:'',storyteller_name:'Private name',show_name:false,visibility,status,created_at:new Date().toISOString(),audio_key});

test('account sitemap includes public stories and omits private or community-only stories',async t=>{
  const store=fixtureStore();
  store.rows.set('public-sitemap', {...storyRow('public-sitemap','reader','shared','public'),access:'Public'});
  store.rows.set('private-sitemap', {...storyRow('private-sitemap','reader','draft','private'),access:'Public'});
  store.rows.set('community-sitemap', {...storyRow('community-sitemap','reader','shared','public'),access:'Community only'});
  store.listObjectAccess=async()=>[{id:OBJECT_IDS[0],access:'Community only'}];
  const {base,server}=await serverFor(store);t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`${base}/sitemap.xml`);const xml=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/max-age=3600/);
  assert.ok(xml.includes('/stories/public-sitemap'));assert.ok(!xml.includes('/stories/private-sitemap'));assert.ok(!xml.includes('/stories/community-sitemap'));
});

test('account config fails closed and production never silently selects file storage', () => {
  assert.throws(()=>parseAccountConfig({STORY_BACKEND:'supabase',STORY_AUTH_MODE:'account',NODE_ENV:'production'}),/Supabase/);
  assert.throws(()=>parseAccountConfig({STORY_BACKEND:'file',STORY_AUTH_MODE:'legacy',NODE_ENV:'production'}),/local development/);
  const valid=parseAccountConfig({STORY_BACKEND:'supabase',STORY_AUTH_MODE:'account',NODE_ENV:'production',SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_SECRET_KEY:config.secretKey,SUPABASE_BUCKET:config.bucket,STORY_EMAIL_CODE_SIGN_IN:'true'});
  assert.equal(valid.backend,'supabase');assert.equal(valid.account,true);assert.equal(valid.email,true);
  assert.equal(parseAccountConfig({STORY_BACKEND:'supabase',STORY_AUTH_MODE:'account',NODE_ENV:'test',SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_SECRET_KEY:config.secretKey,SUPABASE_BUCKET:config.bucket,STORY_GOOGLE_SIGN_IN:'true'}).google,true);
  assert.throws(()=>parseAccountConfig({STORY_BACKEND:'file',STORY_AUTH_MODE:'account',NODE_ENV:'development'}),/Supabase URL/);
  assert.throws(()=>parseAccountConfig({STORY_BACKEND:'supabase',STORY_AUTH_MODE:'account',NODE_ENV:'test',STORY_TEST_JWKS:'{'}),/key set is invalid/);
  const child=spawnSync(process.execPath,['-e',"import('./server/index.js')"],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,NODE_ENV:'production',STORY_BACKEND:'supabase',STORY_AUTH_MODE:'account',SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SECRET_KEY:'',STORY_NO_LISTEN:'1'}});
  assert.notEqual(child.status,0);assert.match(child.stderr,/Supabase/);
});

test('local environment loader reads placeholders and preserves process overrides', async()=>{
  const folder=fs.mkdtempSync(path.join(process.cwd(),'_tmp',`env-loader-${process.pid}-`));
  const file=path.join(folder,'fixture.env');fs.writeFileSync(file,'STORY_TEST_LOADER_A="synthetic-value"\nSTORY_TEST_LOADER_B=from-file\n');
  const priorSkip=process.env.STORY_SKIP_DOTENV;process.env.STORY_SKIP_DOTENV='1';
  const {loadLocalEnv}=await import(`../server/env.js?loader-test=${Date.now()}`);
  const priorA=process.env.STORY_TEST_LOADER_A,priorB=process.env.STORY_TEST_LOADER_B;
  try { process.env.STORY_TEST_LOADER_A='process-value';delete process.env.STORY_TEST_LOADER_B;loadLocalEnv(file);assert.equal(process.env.STORY_TEST_LOADER_A,'process-value');assert.equal(process.env.STORY_TEST_LOADER_B,'from-file'); }
  finally { for(const [key,value] of [['STORY_TEST_LOADER_A',priorA],['STORY_TEST_LOADER_B',priorB],['STORY_SKIP_DOTENV',priorSkip]]) if(value===undefined)delete process.env[key];else process.env[key]=value; }
});

test('local account file adapter serializes claim checks and writes', async()=>{
  const directory=fs.mkdtempSync(path.join(process.cwd(),'.test-data',`account-file-${process.pid}-`));
  const store=createFileAccountStore(directory);const legacy='f'.repeat(64);
  await store.create({owner_user_id:null,owner_hash:legacy,original_language:'Synthetic',text:'Synthetic fixture',translation_language:'',translation:'',translation_checked:false,checked_by:'',storyteller_name:'',show_name:false,visibility:'private',status:'draft',audio_key:null});
  const outcomes=await Promise.all([store.claimLegacy(legacy,'user-a'),store.claimLegacy(legacy,'user-b')]);
  assert.deepEqual(outcomes.sort(),[0,1]);
  const row=(await store.listMine('user-a'))[0] || (await store.listMine('user-b'))[0];
  assert.ok(row);assert.equal(row.owner_hash,null);assert.ok(['user-a','user-b'].includes(row.owner_user_id));
  assert.equal(await store.claimLegacy(legacy,row.owner_user_id),0);
  await store.setObjectAccess('luluwa-mask','Community only');
  assert.equal((await createFileAccountStore(directory).listObjectAccess()).find(item=>item.id==='luluwa-mask').access,'Community only');
});

test('CSP origins are scoped to configured account and Google sign-in',()=>{
  const legacy=contentSecurityPolicy({backend:'file',authMode:'legacy',google:false,url:''});
  assert.ok(!legacy.includes('supabase.co')&&!legacy.includes('accounts.google.com'));
  const account=contentSecurityPolicy({backend:'supabase',authMode:'account',google:false,url:config.url});
  assert.ok(account.includes(config.url));assert.ok(!account.includes('accounts.google.com'));
  const google=contentSecurityPolicy({...config,google:true});assert.ok(google.includes('accounts.google.com'));assert.ok(google.includes('oauth2.googleapis.com'));
});

test('Supabase claim adapter uses one conditional update and migration denies browser table grants',async()=>{
  const calls=[];
  const query={update(value){calls.push(['update',value]);return this;},is(...value){calls.push(['is',...value]);return this;},eq(...value){calls.push(['eq',...value]);return this;},select(value){calls.push(['select',value]);return Promise.resolve({data:[{id:'synthetic'}],error:null});}};
  const client={from(table){calls.push(['from',table]);return query;}};
  const store=createSupabaseStore({...config},client);
  assert.equal(await store.claimLegacy('a'.repeat(64),'user-a'),1);
  assert.deepEqual(calls,[['from','stories'],['update',{owner_user_id:'user-a',owner_hash:null}],['is','owner_user_id',null],['eq','owner_hash','a'.repeat(64)],['select','id']]);
  const sql=readFileSync(path.resolve('supabase/migrations/202611070001_story_bridge_accounts.sql'),'utf8');
  assert.match(sql,/alter table public\.stories enable row level security/i);assert.match(sql,/alter table public\.profiles enable row level security/i);
  assert.match(sql,/revoke all on public\.profiles, public\.stories from anon, authenticated/i);assert.match(sql,/public\s*=\s*false/i);assert.match(sql,/for all to service_role/i);
});

test('verifier checks signature, expiry, issuer and audience using a fake local JWKS', async()=>{
  const verify=createTokenVerifier(config);
  assert.equal((await verify(token('user-a'))).id,'user-a');
  await assert.rejects(verify('unsigned.token.value'));
  await assert.rejects(verify(token('user-a',{exp:1})));
  await assert.rejects(verify(token('user-a',{iss:'https://wrong.example/auth/v1'})));
  await assert.rejects(verify(token('user-a',{aud:'anon'})));
  const broken=createTokenVerifier({...config,jwks:'{}'});await assert.rejects(broken(token('user-a')));
  const malformed=createTokenVerifier({...config,jwks:'{' });await assert.rejects(malformed(token('user-a')),/key-discovery-failed/);
});

test('account isolation covers private, draft, withdrawn and public stories plus audio', async t=>{
  const {base,server,store}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  store.rows.set('b-draft',storyRow('b-draft','user-b','draft','private','audio-b'));
  store.rows.set('b-private',storyRow('b-private','user-b','shared','private'));
  store.rows.set('b-withdrawn',storyRow('b-withdrawn','user-b','withdrawn','private'));
  store.rows.set('b-public',storyRow('b-public','user-b','shared','public'));
  for(const id of ['b-draft','b-private','b-withdrawn']){
    assert.equal((await fetch(`${base}/api/stories/${id}`,{headers:auth('user-a')})).status,404,id);
    for(const body of [{text:'Changed'},{approve:true},{withdraw:true}]) assert.equal((await fetch(`${base}/api/stories/${id}`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify(body)})).status,404,`${id} ${JSON.stringify(body)}`);
    assert.equal((await fetch(`${base}/api/stories/${id}/audio`,{headers:auth('user-a')})).status,404);
  }
  assert.equal((await fetch(`${base}/api/stories/b-draft`,{headers:{'x-owner-token':'a'.repeat(48)}})).status,404);
  assert.equal((await fetch(`${base}/api/stories/b-draft`,{method:'PUT',headers:{'x-owner-token':'a'.repeat(48),'content-type':'application/json'},body:'{"approve":true}'})).status,401);
  assert.equal((await fetch(`${base}/api/stories/b-public`)).status,200);
  assert.equal((await fetch(`${base}/api/stories/b-public/audio`)).status,404);
  assert.equal((await fetch(`${base}/api/stories/b-draft`,{headers:auth('user-b')})).status,200);
  assert.equal((await fetch(`${base}/api/stories/b-draft/audio`,{headers:auth('user-b')})).status,200);
  assert.equal((await fetch(`${base}/api/mine`,{headers:auth('user-a')})).status,200);
  assert.equal((await fetch(`${base}/api/mine`,{headers:{authorization:`Bearer ${token('user-a',{exp:1})}`}})).status,401);
  assert.equal((await fetch(`${base}/api/mine`,{headers:{authorization:`Bearer ${token('user-a',{iss:'https://wrong.example/auth/v1'})}`}})).status,401);
  assert.equal((await fetch(`${base}/api/stories/b-public`,{headers:{authorization:`Bearer ${token('user-a',{exp:1})}`}})).status,200);
});

test('account stories expose version fingerprints on creation and append a version after edits',async t=>{
  const {base,server,store}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const audio=Buffer.from('synthetic version audio');const form=new FormData();for(const [key,value] of Object.entries({title:'Synthetic post',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true'}))form.append(key,value);form.append('originalLanguage','Synthetic language');form.append('text','Synthetic account story');form.append('translationLanguage','English');form.append('translation','Synthetic translation');form.append('audio',new Blob([audio],{type:'audio/webm'}),'synthetic.webm');
  const created=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('user-a'),body:form});assert.equal(created.status,201);
  const story=await created.json();assert.equal(story.versionLog.length,1);assert.equal(story.versionLog[0].change,'Story created');assert.match(story.versionLog[0].fingerprint,/^[a-f0-9]{64}$/);assert.equal(store.rows.get(story.id).audio_sha256,hash(audio));
  const edited=await fetch(`${base}/api/stories/${story.id}`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({text:'Synthetic account story edited'})});assert.equal(edited.status,200);
  const saved=await edited.json();assert.equal(saved.versionLog.length,2);assert.equal(saved.versionLog[1].change,'Original story edited');assert.notEqual(saved.versionLog[0].fingerprint,saved.versionLog[1].fingerprint);assert.equal(store.rows.get(story.id).version_log.length,2);
});

test('AI translation draft route requires an account and stores origin only after explicit approval',async t=>{
  const {base,server,store}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const denied=await fetch(`${base}/api/translation-draft`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Private synthetic story',originalLanguage:'Synthetic',targetLanguage:'English'})});
  assert.equal(denied.status,401);
  const draft=await fetch(`${base}/api/translation-draft`,{method:'POST',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({text:'Private synthetic story',originalLanguage:'Synthetic',targetLanguage:'English'})});
  const draftBody=await draft.json();assert.equal(draft.status,200);assert.equal(draftBody.origin,'ai_draft_unapproved');assert.equal(draftBody.translation,'Synthetic mock translation');
  const form=new FormData();for(const [key,value] of Object.entries({title:'Synthetic post',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true'}))form.append(key,value);form.append('originalLanguage','Synthetic');form.append('text','Private synthetic story');form.append('translationLanguage','English');form.append('translation','Synthetic mock translation');form.append('translationOrigin','ai_approved');form.append('translationApproved','false');
  const blocked=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('user-a'),body:form});assert.equal(blocked.status,400);assert.equal(store.rows.size,0);
  form.set('translationApproved','true');
  const saved=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('user-a'),body:form});assert.equal(saved.status,201);
  const story=await saved.json();assert.equal(story.translationOrigin,'ai_approved');assert.match(story.versionLog[0].fingerprint,/^[a-f0-9]{64}$/);
  const edited=await fetch(`${base}/api/stories/${story.id}`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({translation:'Storyteller-edited translation'})});
  assert.equal(edited.status,200);assert.equal((await edited.json()).translationOrigin,'storyteller');
});

test('post creation requires consent and image alt text, and first approved post waits for admin review',async t=>{
  const {base,server,store}=await serverFor(fixtureStore(),undefined,{objectAdminId:'admin-user'});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const sharp=(await import('sharp')).default;const png=await sharp({create:{width:12,height:8,channels:3,background:'#3f7a5c'}}).png().toBuffer();
  const form=new FormData();for(const [key,value] of Object.entries({title:'A documented synthetic post',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'CC BY 4.0',region:'Synthetic region',people:'Synthetic community',tags:'memory,learning',sources:JSON.stringify([{label:'Synthetic source',url:'https://example.org/source'}]),access:'Public',consentConfirmed:'true',imageMetadata:JSON.stringify([{altText:'A green square fixture',credit:'Synthetic fixture'}])}))form.append(key,value);
  form.append('originalLanguage','Synthetic language');form.append('text','Synthetic post body.');form.append('images',new Blob([png],{type:'image/png'}),'untrusted-name.png');
  const created=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('new-user'),body:form});assert.equal(created.status,201);const post=await created.json();assert.equal(post.title,'A documented synthetic post');assert.equal(post.consentConfirmed,true);assert.equal(post.images.length,1);assert.equal(post.images[0].altText,'A green square fixture');assert.match(post.images[0].sha256,/^[a-f0-9]{64}$/);assert.equal(store.rows.get(post.id).first_post,true);
  const publish=await fetch(`${base}/api/stories/${post.id}`,{method:'PUT',headers:{...auth('new-user'),'content-type':'application/json'},body:JSON.stringify({visibility:'public',approve:true})});assert.equal(publish.status,200);const pending=await publish.json();assert.equal(pending.status,'draft');assert.equal(pending.visibility,'private');assert.equal(pending.moderationStatus,'pending_review');assert.deepEqual((await fetch(`${base}/api/stories`).then(r=>r.json())),[]);
  const secondForm=new FormData();for(const [key,value] of form.entries())secondForm.append(key,key==='title'?'Second synthetic post':key==='text'?'Also waits for the first moderation decision.':value);const secondCreated=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('new-user'),body:secondForm});assert.equal(secondCreated.status,201);const secondPost=await secondCreated.json();assert.equal(store.rows.get(secondPost.id).first_post,true);const secondPublish=await fetch(`${base}/api/stories/${secondPost.id}`,{method:'PUT',headers:{...auth('new-user'),'content-type':'application/json'},body:JSON.stringify({visibility:'public',approve:true})});assert.equal((await secondPublish.json()).moderationStatus,'pending_review');
  const notAdmin=await fetch(`${base}/api/admin/posts/pending`,{headers:auth('new-user')});assert.equal(notAdmin.status,403);
  const queue=await fetch(`${base}/api/admin/posts/pending`,{headers:auth('admin-user')});assert.equal((await queue.json()).length,2);
  const approve=await fetch(`${base}/api/admin/posts/${post.id}/approve`,{method:'POST',headers:auth('admin-user')});assert.equal(approve.status,200);assert.equal((await approve.json()).status,'shared');
  const publicPosts=await fetch(`${base}/api/stories`).then(r=>r.json());assert.equal(publicPosts.length,1);assert.equal(publicPosts[0].title,'A documented synthetic post');
  const approveSecond=await fetch(`${base}/api/admin/posts/${secondPost.id}/approve`,{method:'POST',headers:auth('admin-user')});assert.equal(approveSecond.status,200);assert.equal((await fetch(`${base}/api/stories`).then(r=>r.json())).length,2);
  const image=await fetch(`${base}${post.images[0].url}`);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/webp/);assert.equal(image.headers.get('x-content-type-options'),'nosniff');
  const noConsent=new FormData();noConsent.append('originalLanguage','Synthetic language');noConsent.append('title','No consent');const denied=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('other-user'),body:noConsent});assert.equal(denied.status,400);
  const noAlt=new FormData();for(const [key,value] of Object.entries({title:'Image without alt',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true',imageMetadata:'[{}]'}))noAlt.append(key,value);noAlt.append('originalLanguage','Synthetic language');noAlt.append('images',new Blob([png],{type:'image/png'}),'fixture.png');const altDenied=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('alt-user'),body:noAlt});assert.equal(altDenied.status,400);
});

test('admin post approval survives repeated and concurrent requests using file storage',async t=>{
  const tempDir=path.join(process.cwd(),'_tmp',`admin-approval-${crypto.randomUUID()}`);fs.mkdirSync(tempDir,{recursive:true});
  const store=createFileAccountStore(tempDir);const {base,server}=await serverFor(store,undefined,{objectAdminId:'admin-user'});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(tempDir,{recursive:true,force:true});});
  const approvals=[];
  for(let index=0;index<32;index++){
    const row=await store.create({owner_user_id:`member-${index}`,original_language:'Synthetic',text:`Synthetic approval fixture ${index}`,translation_language:'',translation:'',translation_origin:'storyteller',status:'draft',visibility:'private',requested_visibility:'public',first_post:true,moderation_status:'pending_review',version_log:[{timestamp:new Date().toISOString(),language:'Synthetic',change:'Fixture created',fingerprint:'a'.repeat(64)}]});
    const response=await fetch(`${base}/api/admin/posts/${row.id}/approve`,{method:'POST',headers:auth('admin-user')});
    assert.equal(response.status,200,`Approval ${index} should succeed.`);const saved=await response.json();assert.equal(saved.status,'shared');assert.equal(saved.moderationStatus,'approved');assert.equal(saved.versionLog.at(-1).change,'Admin approved first post');approvals.push(row.id);
  }
  const concurrent=await store.create({owner_user_id:'concurrent-member',original_language:'Synthetic',text:'Synthetic concurrency fixture',translation_language:'',translation:'',translation_origin:'storyteller',status:'draft',visibility:'private',requested_visibility:'public',first_post:true,moderation_status:'pending_review',version_log:[{timestamp:new Date().toISOString(),language:'Synthetic',change:'Fixture created',fingerprint:'b'.repeat(64)}]});
  const duplicateResponses=await Promise.all(Array.from({length:20},()=>fetch(`${base}/api/admin/posts/${concurrent.id}/approve`,{method:'POST',headers:auth('admin-user')})));
  assert.ok(duplicateResponses.every(response=>response.status===200),'Concurrent retries should converge to the same approved result.');
  assert.equal((await store.get(concurrent.id)).version_log.length,2,'Concurrent retries must append only one approval version.');
  assert.equal((await store.listPublic()).length,33);
  assert.equal(approvals.length,32);
});

test('admin queue includes private post photos and Keep private clears review without publishing',async t=>{
  const store=fixtureStore();
  const row={...storyRow('admin-own-pending','admin-user'),title:'Synthetic own pending post',first_post:true,requested_visibility:'public',moderation_status:'pending_review',version_log:[{timestamp:new Date().toISOString(),language:'Synthetic',change:'Created',fingerprint:'c'.repeat(64)}]};
  store.rows.set(row.id,row);
  const key='synthetic-admin-image';
  await store.putPostImage(key,Buffer.from('fixture image bytes'));
  await store.createPostMedia([{id:'admin-image-id',post_id:row.id,kind:'image',storage_key:key,alt_text:'Synthetic test photo',credit:'Synthetic credit',licence:'CC0',width:3,height:2,sha256:'d'.repeat(64)}]);
  const {base,server}=await serverFor(store,undefined,{objectAdminId:'admin-user'});t.after(()=>new Promise(resolve=>server.close(resolve)));
  assert.equal((await fetch(`${base}/api/admin/posts/pending`,{headers:auth('other-user')})).status,403);
  const queueResponse=await fetch(`${base}/api/admin/posts/pending`,{headers:auth('admin-user')});assert.equal(queueResponse.status,200);
  const queue=await queueResponse.json();assert.equal(queue.length,1);assert.equal(queue[0].images[0].altText,'Synthetic test photo');
  const privateImage=await fetch(`${base}${queue[0].images[0].url}`);assert.equal(privateImage.status,404);
  const adminImage=await fetch(`${base}${queue[0].images[0].url}`,{headers:auth('admin-user')});assert.equal(adminImage.status,200);assert.equal(adminImage.headers.get('cache-control'),'private, no-store');
  assert.equal((await fetch(`${base}/api/admin/posts/${row.id}/keep-private`,{method:'POST',headers:auth('other-user')})).status,403);
  const response=await fetch(`${base}/api/admin/posts/${row.id}/keep-private`,{method:'POST',headers:auth('admin-user')});assert.equal(response.status,200);
  const kept=await response.json();assert.equal(kept.status,'draft');assert.equal(kept.visibility,'private');assert.equal(kept.moderationStatus,'approved');assert.equal(kept.versionLog.at(-1).change,'Admin kept first post private');
  assert.equal((await fetch(`${base}/api/admin/posts/pending`,{headers:auth('admin-user')}).then(r=>r.json())).length,0);
  const resubmitted=await fetch(`${base}/api/stories/${row.id}`,{method:'PUT',headers:{...auth('admin-user'),'content-type':'application/json'},body:JSON.stringify({visibility:'public',approve:true})});
  assert.equal((await resubmitted.json()).moderationStatus,'pending_review','A first post must still request admin review before becoming public.');
});

test('admin approval logs stage and safe error code without story or identity data',async t=>{
  const store=fixtureStore();store.get=async()=>{throw new Error('storage-unavailable',{cause:Object.assign(new Error('private fixture detail'),{code:'EIO'})});};
  const {base,server}=await serverFor(store,undefined,{objectAdminId:'admin-user'});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const original=console.error;const logs=[];console.error=value=>logs.push(String(value));
  try{
    const response=await fetch(`${base}/api/admin/posts/synthetic-id/approve`,{method:'POST',headers:auth('admin-user')});
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Post could not be approved.'});
  }finally{console.error=original;}
  assert.equal(logs.length,1);const event=JSON.parse(logs[0]);assert.deepEqual(event,{event:'admin_post_approval_failed',stage:'load_post',errorCode:'EIO'});
  assert.ok(!logs[0].includes('admin-user')&&!logs[0].includes('private fixture detail'));
});

test('legacy claim is conditional, single-owner, token-bound and race-safe', async t=>{
  const {base,server,store}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const legacy='l'.repeat(48);store.rows.set('old',storyRow('old',null,'draft','private'));store.rows.get('old').owner_hash=hash(legacy);
  const claim=(user,provided=legacy,headers={})=>fetch(`${base}/api/account/claim`,{method:'POST',headers:{...auth(user),'x-owner-token':provided,...headers}});
  const [first,second]=await Promise.all([claim('user-a'),claim('user-b')]);
  assert.deepEqual([first.status,second.status].sort(),[200,409]);
  const outcomes=await Promise.all([first.json(),second.json()]);assert.equal(outcomes.filter(x=>x.claimed===1).length,1);
  const row=store.rows.get('old');const winner=row.owner_user_id;assert.equal(row.owner_hash,null);
  assert.equal((await claim(winner)).status,409);assert.equal((await claim(winner)).status,409);
  assert.equal((await claim('user-c','x'.repeat(48))).status,409);
  assert.equal((await fetch(`${base}/api/account/claim`,{method:'POST',headers:{'x-owner-token':legacy}})).status,401);
  assert.equal((await fetch(`${base}/api/account/claim`,{method:'POST',headers:{authorization:`Bearer ${token('user-c',{exp:1})}`,'x-owner-token':legacy}})).status,401);
  assert.equal((await claim('user-d','')).status,400);
  assert.equal((await fetch(`${base}/api/stories/old`,{headers:{'x-owner-token':legacy}})).status,404);
  assert.equal((await fetch(`${base}/api/stories/old`,{method:'PUT',headers:{'x-owner-token':legacy,'content-type':'application/json'},body:'{"approve":true}'})).status,401);
  assert.equal((await fetch(`${base}/api/stories/old`,{method:'PUT',headers:{'x-owner-token':legacy,'content-type':'application/json'},body:'{"text":"edit"}'})).status,401);
  assert.equal((await fetch(`${base}/api/stories/old`,{method:'PUT',headers:{'x-owner-token':legacy,'content-type':'application/json'},body:'{"withdraw":true}'})).status,401);
  assert.equal((await fetch(`${base}/api/stories/old/audio`,{headers:{'x-owner-token':legacy}})).status,404);
});

test('account draft transition hides a formerly public story and audio, while owner access and republishing remain available',async t=>{
  const {base,server,store}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  store.rows.set('workflow',storyRow('workflow','user-a','shared','public','synthetic-audio'));
  const url=`${base}/api/stories/workflow`,audioUrl=`${url}/audio`;
  assert.equal((await fetch(url)).status,200);assert.equal((await fetch(audioUrl)).status,200);
  const edit=body=>fetch(url,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify(body)});
  await edit({text:'Synthetic public edit without a status request.'});
  let row=store.rows.get('workflow');assert.equal(row.status,'shared');
  await edit({visibility:'public',approve:false});
  row=store.rows.get('workflow');assert.equal(row.status,'draft');assert.equal(row.visibility,'public');
  assert.equal((await (await fetch(`${base}/api/stories`)).json()).some(item=>item.id==='workflow'),false);
  assert.equal((await fetch(url)).status,404);assert.equal((await fetch(audioUrl)).status,404);
  assert.equal((await fetch(url,{headers:auth('user-a')})).status,200);assert.equal((await fetch(audioUrl,{headers:auth('user-a')})).status,200);
  await edit({text:'Synthetic draft edit without a status request.'});assert.equal(store.rows.get('workflow').status,'draft');
  await edit({visibility:'public',approve:true});
  row=store.rows.get('workflow');assert.equal(row.status,'shared');assert.equal(row.visibility,'public');
  assert.equal((await fetch(url)).status,200);assert.equal((await fetch(audioUrl)).status,200);
});

test('profile is per-account and stores welcome fields without exposing avatar storage keys', async t=>{
  const {base,server}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`${base}/api/account/profile`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({displayName:'A Storyteller'})});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{user_id:'user-a',display_name:'A Storyteller',country:'',languages:[]});
  const other=await fetch(`${base}/api/account/profile`,{headers:auth('user-b')});assert.equal(other.status,200);assert.deepEqual(await other.json(),{display_name:'',country:'',languages:[],avatar_url:''});
  assert.equal((await fetch(`${base}/api/account/profile`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({displayName:'x'.repeat(81)})})).status,400);
  assert.equal((await fetch(`${base}/api/account/profile`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({displayName:'Name',country:'x'.repeat(101)})})).status,400);
});

test('profile avatar upload verifies image bytes, is private, and serves nosniff WebP',async t=>{
  const {base,server,store}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const png=await sharp({create:{width:2,height:2,channels:3,background:'#1f4d3a'}}).png().toBuffer();
  const form=new FormData();form.append('avatar',new Blob([png],{type:'image/png'}),'anything.png');
  const uploaded=await fetch(`${base}/api/account/profile/avatar`,{method:'POST',headers:auth('user-a'),body:form});assert.equal(uploaded.status,200);assert.equal((await uploaded.json()).avatar_url,'/api/account/profile/avatar');
  const image=await fetch(`${base}/api/account/profile/avatar`,{headers:auth('user-a')});assert.equal(image.status,200);assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.match(image.headers.get('content-type'),/image\/webp/);
  assert.equal((await fetch(`${base}/api/account/profile/avatar`,{headers:auth('user-b')})).status,404);
  const invalid=new FormData();invalid.append('avatar',new Blob([Buffer.from('not an image')],{type:'image/png'}),'fake.png');assert.equal((await fetch(`${base}/api/account/profile/avatar`,{method:'POST',headers:auth('user-a'),body:invalid})).status,400);
  const profile=await store.profile('user-a');assert.ok(profile.avatar_key);assert.equal(await store.profile('user-b'),null);
});
