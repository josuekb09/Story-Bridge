import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs'; import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const projectRoot = path.resolve('.');
const testRun= process.pid+'-'+Date.now();
const temp=path.resolve('.test-data',`unit-test-data-${testRun}`); fs.mkdirSync(temp,{recursive:true}); process.env.STORY_DATA_DIR=path.join(temp,'data');process.env.STORY_UPLOAD_DIR=path.join(temp,'uploads');process.env.NODE_ENV='test';process.env.STORY_BACKEND='file';process.env.STORY_AUTH_MODE='legacy';
const {default:app}=await import('../server/index.js'); let server, base; const owner='a'.repeat(48), other='b'.repeat(48);
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));});
const addPostFields=fd=>{for(const [key,value] of Object.entries({title:'Synthetic post',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true'}))fd.append(key,value);return fd;};
const create=async(token=owner, extra={})=>{const fd=new FormData();for(const [k,v]of Object.entries({originalLanguage:'Language A',text:'A short story.',storytellerName:'Hidden Author',showName:'false',...extra}))fd.append(k,v);addPostFields(fd);const r=await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':token},body:fd});return [r,await r.json()];};
const put=(id,token,body)=>fetch(`${base}/api/stories/${id}`,{method:'PUT',headers:{'content-type':'application/json','x-owner-token':token},body:JSON.stringify(body)});
test('draft, private approval, public sharing and owner-token confidentiality',async()=>{let [r,s]=await create();assert.equal(r.status,201);const id=s.id;assert.equal(s.ownerToken,undefined);assert.equal((await fetch(`${base}/api/stories/${id}`)).status,404);assert.equal((await fetch(`${base}/api/stories/${id}`,{headers:{'x-owner-token':other}})).status,404);assert.equal((await put(id,other,{approve:true})).status,403);assert.equal((await put(id,other,{checkTranslation:true,checkedBy:'X'})).status,403);assert.equal((await put(id,other,{withdraw:true})).status,403);assert.equal((await put(id,owner,{visibility:'private',approve:true})).status,200);assert.equal((await fetch(`${base}/api/stories/${id}`)).status,404);assert.equal((await fetch(`${base}/api/stories/${id}`,{headers:{'x-owner-token':owner}})).status,200);await put(id,owner,{visibility:'public',approve:true});const pubResponse=await fetch(`${base}/api/stories/${id}`);const pub=await pubResponse.json();assert.equal(Object.hasOwn(pub,'storytellerName'),false);assert.equal(JSON.stringify(pub).includes(owner),false);assert.equal(JSON.stringify(pub).includes(other),false);const list=await (await fetch(`${base}/api/stories`)).json();assert.equal(list.some(x=>x.id===id),true);});
test('sitemap lists public routes and stories, caches for one hour, and omits private stories',async()=>{
  const [privateResponse,privateStory]=await create(owner);
  const [publicResponse,publicStory]=await create(owner);
  assert.equal(privateResponse.status,201);assert.equal(publicResponse.status,201);
  assert.equal((await put(publicStory.id,owner,{visibility:'public',approve:true})).status,200);
  const response=await fetch(`${base}/sitemap.xml`);const xml=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('content-type')||'',/application\/xml/);assert.match(response.headers.get('cache-control')||'',/max-age=3600/);
  assert.match(xml,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);assert.match(xml,/https:\/\/story-bridge\.onrender\.com\/discover/);assert.match(xml,/https:\/\/story-bridge\.onrender\.com\/objects\//);
  assert.ok(xml.includes(`/stories/${publicStory.id}`));assert.ok(!xml.includes(`/stories/${privateStory.id}`));
});
test('audio authorization and withdraw immediately hides story and audio',async()=>{const fd=addPostFields(new FormData());fd.append('originalLanguage','Language A');fd.append('text','audio');fd.append('audio',new Blob([Buffer.from('fake audio')],{type:'audio/webm'}),'untrusted.webm');let r=await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':owner},body:fd});let s=await r.json();const url=`${base}/api/stories/${s.id}/audio`;assert.equal((await fetch(url)).status,404);assert.equal((await fetch(url,{headers:{'x-owner-token':owner}})).status,200);await put(s.id,owner,{visibility:'private',approve:true});assert.equal((await fetch(url)).status,404);assert.equal((await fetch(url,{headers:{'x-owner-token':owner}})).status,200);await put(s.id,owner,{visibility:'public',approve:true});assert.equal((await fetch(url)).status,200);await put(s.id,owner,{withdraw:true});assert.equal((await fetch(url)).status,404);assert.equal((await fetch(`${base}/api/stories/${s.id}`)).status,404);});

test('legacy post images are signature-checked, re-encoded, credited, and hidden for Community only access',async()=>{
  const sharp=(await import('sharp')).default;const png=await sharp({create:{width:9,height:6,channels:3,background:'#e9b44c'}}).png().toBuffer();
  const form=addPostFields(new FormData());form.set('title','Synthetic image post');form.set('imageMetadata',JSON.stringify([{altText:'A small gold square fixture',credit:'Synthetic test image'}]));form.append('originalLanguage','Synthetic language');form.append('text','Synthetic post with an image.');form.append('images',new Blob([png],{type:'image/png'}),'browser-name.png');
  const created=await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':owner},body:form});assert.equal(created.status,201);const post=await created.json();assert.equal(post.images.length,1);assert.equal(post.images[0].altText,'A small gold square fixture');assert.match(post.images[0].sha256,/^[a-f0-9]{64}$/);
  const image=await fetch(`${base}${post.images[0].url}`);assert.equal(image.status,404,'Draft image should remain private to visitors.');const owned=await fetch(`${base}${post.images[0].url}`,{headers:{'x-owner-token':owner}});assert.equal(owned.status,200);assert.equal(owned.headers.get('x-content-type-options'),'nosniff');const metadata=await sharp(Buffer.from(await owned.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,9);
  await put(post.id,owner,{visibility:'public',approve:true});assert.equal((await fetch(`${base}${post.images[0].url}`)).status,200);await put(post.id,owner,{access:'Community only'});const publicRows=await fetch(`${base}/api/stories`).then(response=>response.json());assert.equal(publicRows.some(item=>item.id===post.id),false);assert.equal((await fetch(`${base}${post.images[0].url}`)).status,404);assert.equal((await fetch(`${base}${post.images[0].url}`,{headers:{'x-owner-token':owner}})).status,200);
  const bad=addPostFields(new FormData());bad.set('imageMetadata',JSON.stringify([{altText:'An image',credit:'Test'}]));bad.append('originalLanguage','Synthetic');bad.append('images',new Blob(['not an image'],{type:'image/png'}),'spoof.png');assert.equal((await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':owner},body:bad})).status,400);
  const noAlt=addPostFields(new FormData());noAlt.set('imageMetadata','[{}]');noAlt.append('originalLanguage','Synthetic');noAlt.append('images',new Blob([png],{type:'image/png'}),'fixture.png');assert.equal((await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':owner},body:noAlt})).status,400);
});

test('explicit draft transition hides a formerly public legacy story and audio, while owner access and republishing remain available',async()=>{
  const form=addPostFields(new FormData());form.append('originalLanguage','Synthetic language');form.append('text','Synthetic public story.');form.append('audio',new Blob([Buffer.from('synthetic audio bytes')],{type:'audio/webm'}),'synthetic.webm');
  const created=await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':owner},body:form});assert.equal(created.status,201);const story=await created.json();assert.equal(story.versionLog.length,1);assert.equal(story.translationOrigin,'storyteller');const audioHash=crypto.createHash('sha256').update('synthetic audio bytes').digest('hex');const expected=crypto.createHash('sha256').update(['Synthetic language','Synthetic public story.','','','storyteller',audioHash].join('\0')).digest('hex');assert.equal(story.versionLog[0].fingerprint,expected);const url=`${base}/api/stories/${story.id}`;const audioUrl=`${url}/audio`;
  await put(story.id,owner,{visibility:'public',approve:true});
  assert.equal((await fetch(url)).status,200);assert.equal((await fetch(audioUrl)).status,200);
  await put(story.id,owner,{text:'Synthetic public edit without a status request.'});
  let saved=await (await fetch(url,{headers:{'x-owner-token':owner}})).json();assert.equal(saved.status,'shared');assert.equal(saved.versionLog.length,3);assert.equal((await fetch(url)).status,200);
  await put(story.id,owner,{visibility:'public',approve:false});
  saved=await (await fetch(url,{headers:{'x-owner-token':owner}})).json();assert.equal(saved.status,'draft');assert.equal(saved.visibility,'public');
  assert.equal((await (await fetch(`${base}/api/stories`)).json()).some(item=>item.id===story.id),false);
  assert.equal((await fetch(url)).status,404);assert.equal((await fetch(audioUrl)).status,404);
  assert.equal((await fetch(url,{headers:{'x-owner-token':owner}})).status,200);assert.equal((await fetch(audioUrl,{headers:{'x-owner-token':owner}})).status,200);
  await put(story.id,owner,{text:'Synthetic draft edit without a status request.'});
  saved=await (await fetch(url,{headers:{'x-owner-token':owner}})).json();assert.equal(saved.status,'draft');
  await put(story.id,owner,{visibility:'public',approve:true});
  saved=await (await fetch(url,{headers:{'x-owner-token':owner}})).json();assert.equal(saved.status,'shared');assert.equal(saved.visibility,'public');
  assert.equal((await fetch(url)).status,200);assert.equal((await fetch(audioUrl)).status,200);
});
test('translation checked label only changes for owner and edits reset status',async()=>{const [,s]=await create(owner,{translation:'A translation',translationLanguage:'Language B'});assert.equal((await put(s.id,other,{checkTranslation:true,checkedBy:'Speaker'})).status,403);await put(s.id,owner,{checkTranslation:true,checkedBy:'Speaker'});let x=await (await fetch(`${base}/api/stories/${s.id}`,{headers:{'x-owner-token':owner}})).json();assert.equal(x.translationChecked,true);assert.equal(x.checkedBy,'Speaker');await put(s.id,owner,{translation:'Changed'});x=await (await fetch(`${base}/api/stories/${s.id}`,{headers:{'x-owner-token':owner}})).json();assert.equal(x.translationChecked,false);});

test('legacy translation draft is optional when unconfigured and saving an AI draft requires approval',async()=>{
  const prior=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  try {
    const unauth=await fetch(`${base}/api/translation-draft`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Synthetic story',originalLanguage:'A',targetLanguage:'B'})});assert.equal(unauth.status,401);
    const unavailable=await fetch(`${base}/api/translation-draft`,{method:'POST',headers:{'x-owner-token':owner,'content-type':'application/json'},body:JSON.stringify({text:'Synthetic story',originalLanguage:'A',targetLanguage:'B'})});const error=await unavailable.json();assert.equal(unavailable.status,503);assert.match(error.error,/write the translation yourself/);assert.doesNotMatch(JSON.stringify(error),/OPENAI_API_KEY/);
    const denied=await create(owner,{translation:'Synthetic AI translation',translationOrigin:'ai_approved',translationApproved:'false'});assert.equal(denied[0].status,400);
    const accepted=await create(owner,{translation:'Synthetic AI translation',translationOrigin:'ai_approved',translationApproved:'true'});assert.equal(accepted[0].status,201);assert.equal(accepted[1].translationOrigin,'ai_approved');
  } finally { if(prior===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prior; }
});
test('audio upload rejects non-audio and oversized files; text length limited',async()=>{let fd=addPostFields(new FormData());fd.append('originalLanguage','A');fd.append('audio',new Blob(['x'],{type:'text/plain'}),'bad.txt');assert.equal((await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':owner},body:fd})).status,400);fd=addPostFields(new FormData());fd.append('originalLanguage','A');fd.append('audio',new Blob([new Uint8Array(10*1024*1024+1)],{type:'audio/wav'}),'big.wav');assert.equal((await fetch(`${base}/api/stories`,{method:'POST',headers:{'x-owner-token':owner},body:fd})).status,413);assert.equal((await create(owner,{text:'x'.repeat(12001)}))[0].status,413);});

test('seed honors STORY_DATA_DIR and refuses to replace stories unless --force is explicit',()=>{
  const seedDir=path.join(projectRoot,'.test-data',`seed-guard-test-${testRun}`);
  const seedFile=path.join(seedDir,'stories.json');
  fs.mkdirSync(seedDir,{recursive:true});
  const original=[{id:'synthetic-protected-story'}];fs.writeFileSync(seedFile,JSON.stringify(original));
  const env={...process.env,STORY_DATA_DIR:seedDir};
  try{
    const refused=spawnSync(process.execPath,[path.join(projectRoot,'scripts','seed.js')],{cwd:projectRoot,env,encoding:'utf8'});
    assert.equal(refused.status,1,refused.stderr);
    assert.ok(refused.stdout.includes(seedFile),'Seed did not print its isolated target path.');
    assert.deepEqual(JSON.parse(fs.readFileSync(seedFile,'utf8')),original,'Seed changed existing stories without --force.');
    const forced=spawnSync(process.execPath,[path.join(projectRoot,'scripts','seed.js'),'--force'],{cwd:projectRoot,env,encoding:'utf8'});
    assert.equal(forced.status,0,forced.stderr);
    assert.ok(forced.stdout.includes(seedFile),'Forced seed did not print its isolated target path.');
    assert.equal(JSON.parse(fs.readFileSync(seedFile,'utf8')).length,6,'Explicit --force did not create the six public demo stories.');
  }finally{}
});

test('isolated static server serves the built app and assets on its configured port',async t=>{
  const buildDir=path.resolve(process.env.STORY_BRIDGE_BUILD_DIR||path.join(projectRoot,'dist'));
  const distIndex=path.join(buildDir,'index.html');
  if(!fs.existsSync(distIndex)){t.skip('Build the app before checking production static serving.');return;}
  const serverTemp=path.join(projectRoot,'.test-data',`production-start-test-${testRun}`);
  const port=Number(process.env.TEST_API_PORT||4348);
  const server=spawn(process.execPath,[path.join(projectRoot,'server','static-test-server.js')],{
    cwd:projectRoot,
    env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),STORY_BACKEND:'file',STORY_AUTH_MODE:'legacy',STORY_SERVE_STATIC:'1',STORY_DATA_DIR:path.join(serverTemp,'data'),STORY_UPLOAD_DIR:path.join(serverTemp,'uploads'),STORY_BRIDGE_BUILD_DIR:buildDir,STORY_NO_LISTEN:'0'},
    stdio:'ignore',
  });
  const origin=`http://127.0.0.1:${port}`;
  try{
    let response;
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      if(server.exitCode!==null)throw new Error(`Static test server exited early with code ${server.exitCode}.`);
      try{response=await fetch(origin);if(response.ok)break;}catch{}
      await delay(50);
    }
    assert.ok(response?.ok,'Static test server did not serve the built index.html.');
    const html=await response.text();
    const assetPath=html.match(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/)?.[1];
    assert.ok(assetPath,'Built HTML did not reference a static asset.');
    const assetResponse=await fetch(`${origin}${assetPath}`);
    assert.equal(assetResponse.status,200,'Static test server did not serve the built asset.');
    assert.ok((await assetResponse.text()).length>0,'Built asset was empty.');
  }finally{
    if(server.exitCode===null){
      await new Promise(resolve=>{
        const timer=setTimeout(resolve,1500);
        server.once('exit',()=>{clearTimeout(timer);resolve();});
        server.kill();
      });
    }
  }
});
