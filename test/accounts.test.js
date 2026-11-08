import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { parseAccountConfig, createTokenVerifier, signTestToken } from '../server/auth.js';
import { mountAccountRoutes } from '../server/account-routes.js';
import { createFileAccountStore } from '../server/file-account-store.js';
import { createSupabaseStore } from '../server/supabase-store.js';
import { contentSecurityPolicy } from '../server/csp.js';

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = pair.publicKey.export({ format:'jwk' }); jwk.kid = 'local-test-key'; jwk.alg = 'RS256';
const config = { backend:'supabase', authMode:'account', account:true, url:'https://story-bridge-test.supabase.co', publishableKey:'sb_publishable_fake_local_test_key_123456', secretKey:'sb_secret_fake_local_test_key_123456', bucket:'story-bridge-audio', google:false, email:false, jwks:JSON.stringify({keys:[jwk]}) };
const baseClaims = (sub, extra={}) => ({ sub, iss:`${config.url}/auth/v1`, aud:'authenticated', exp:Math.floor(Date.now()/1000)+3600, email:`${sub}@example.test`, ...extra });
const token = (sub, extra) => signTestToken(baseClaims(sub, extra), pair.privateKey);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function fixtureStore() {
  const rows = new Map(); const profiles = new Map(); let lock = Promise.resolve();
  const store = {
    rows,
    async listPublic() { return [...rows.values()].filter(row => row.status==='shared' && row.visibility==='public'); },
    async listMine(userId) { return [...rows.values()].filter(row => row.owner_user_id===userId); },
    async get(id) { return rows.get(id) || null; },
    async create(row) { const saved={id:crypto.randomUUID(),created_at:new Date().toISOString(),...row};rows.set(saved.id,saved);return saved; },
    async update(id,userId,changes) { const row=rows.get(id);if(!row||row.owner_user_id!==userId)return null;Object.assign(row,changes);return row; },
    async countMine(userId) { return [...rows.values()].filter(row=>row.owner_user_id===userId).length; },
    async claimLegacy(ownerHash,userId) {
      let release; const prior=lock;lock=new Promise(resolve=>release=resolve);await prior;
      try { const matches=[...rows.values()].filter(row=>row.owner_user_id===null&&row.owner_hash===ownerHash);for(const row of matches){row.owner_user_id=userId;row.owner_hash=null;}return matches.length; }
      finally { release(); }
    },
    async claim(id,ownerHash,userId) { const row=rows.get(id);if(!row||row.owner_user_id!==null||row.owner_hash!==ownerHash)return false;row.owner_user_id=userId;row.owner_hash=null;return true; },
    async profile(id) { return profiles.get(id)||null; },
    async saveProfile(id,name) { const result={display_name:name};profiles.set(id,result);return result; },
    async putAudio() {}, async removeAudio() {}, async audioUsage(){return 0;}, async audioResponse(){return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/webm'}});},
  };
  return store;
}
async function serverFor(store=fixtureStore(),draftTranslation=async()=> 'Synthetic mock translation') {
  const app=express();app.use(express.json());mountAccountRoutes(app,config,{store,verify:createTokenVerifier(config),draftTranslation});app.use((_req,res)=>res.status(503).end());
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  return {base:`http://127.0.0.1:${server.address().port}`,server,store};
}
const auth = user => ({authorization:`Bearer ${token(user)}`});
const storyRow = (id,owner,status='draft',visibility='private',audio_key=null) => ({id,owner_user_id:owner,owner_hash:null,original_language:'Synthetic',text:'Synthetic story',translation_language:'',translation:'',translation_checked:false,checked_by:'',storyteller_name:'Private name',show_name:false,visibility,status,created_at:new Date().toISOString(),audio_key});

test('account config fails closed and production never silently selects file storage', () => {
  assert.throws(()=>parseAccountConfig({STORY_BACKEND:'supabase',STORY_AUTH_MODE:'account',NODE_ENV:'production'}),/Supabase/);
  assert.throws(()=>parseAccountConfig({STORY_BACKEND:'file',STORY_AUTH_MODE:'legacy',NODE_ENV:'production'}),/local development/);
  const valid=parseAccountConfig({STORY_BACKEND:'supabase',STORY_AUTH_MODE:'account',NODE_ENV:'production',SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_SECRET_KEY:config.secretKey,SUPABASE_BUCKET:config.bucket,STORY_EMAIL_CODE_SIGN_IN:'true'});
  assert.equal(valid.backend,'supabase');assert.equal(valid.account,true);assert.equal(valid.email,true);
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
  const audio=Buffer.from('synthetic version audio');const form=new FormData();form.append('originalLanguage','Synthetic language');form.append('text','Synthetic account story');form.append('translationLanguage','English');form.append('translation','Synthetic translation');form.append('audio',new Blob([audio],{type:'audio/webm'}),'synthetic.webm');
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
  const form=new FormData();form.append('originalLanguage','Synthetic');form.append('text','Private synthetic story');form.append('translationLanguage','English');form.append('translation','Synthetic mock translation');form.append('translationOrigin','ai_approved');form.append('translationApproved','false');
  const blocked=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('user-a'),body:form});assert.equal(blocked.status,400);assert.equal(store.rows.size,0);
  form.set('translationApproved','true');
  const saved=await fetch(`${base}/api/stories`,{method:'POST',headers:auth('user-a'),body:form});assert.equal(saved.status,201);
  const story=await saved.json();assert.equal(story.translationOrigin,'ai_approved');assert.match(story.versionLog[0].fingerprint,/^[a-f0-9]{64}$/);
  const edited=await fetch(`${base}/api/stories/${story.id}`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({translation:'Storyteller-edited translation'})});
  assert.equal(edited.status,200);assert.equal((await edited.json()).translationOrigin,'storyteller');
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

test('profile is per-account and only stores a display name', async t=>{
  const {base,server}=await serverFor();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`${base}/api/account/profile`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({displayName:'A Storyteller'})});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{display_name:'A Storyteller'});
  assert.equal((await fetch(`${base}/api/account/profile`,{headers:auth('user-b')})).status,200);
  assert.equal((await fetch(`${base}/api/account/profile`,{method:'PUT',headers:{...auth('user-a'),'content-type':'application/json'},body:JSON.stringify({displayName:'x'.repeat(81)})})).status,400);
});
