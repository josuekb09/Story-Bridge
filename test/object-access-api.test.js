import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mountAccountRoutes } from '../server/account-routes.js';

const config={url:'https://unit.invalid',secretKey:'server-only',bucket:'audio'};
function fixture() {
  const stories=[]; const access=new Map(['luluwa-mask','berlin-statue','ile-aix-statuette','brooklyn-squatting-male'].map(id=>[id,'Public']));
  const store={
    listPublic:async()=>stories.filter(row=>row.status==='shared'&&row.visibility==='public'),
    listMine:async userId=>stories.filter(row=>row.owner_user_id===userId),
    get:async id=>stories.find(row=>row.id===id)||null,
    create:async row=>{const saved={id:`story-${stories.length+1}`,created_at:new Date().toISOString(),...row};stories.push(saved);return saved},
    update:async(id,userId,changes)=>{const row=stories.find(item=>item.id===id&&item.owner_user_id===userId);if(!row)return null;Object.assign(row,changes);return row},
    countMine:async userId=>stories.filter(row=>row.owner_user_id===userId).length,
    audioUsage:async()=>0, putAudio:async()=>{}, removeAudio:async()=>{},
    listObjectAccess:async()=>[...access].map(([id,value])=>({id,access:value})),
    setObjectAccess:async(id,value)=>{access.set(id,value);return{id,access:value}}
  };
  const app=express();app.use(express.json());mountAccountRoutes(app,config,{store,verify:async token=>({id:token==='admin-token'?'admin-user':'speaker-user'}),objectAdminId:'admin-user'});
  return {app,stories,access};
}

async function withServer(app, run) {
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{return await run(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('object Access is admin-only and persists Public or Community only', async()=>{
  const {app,access}=fixture();
  await withServer(app,async base=>{
    const signedOut=await fetch(`${base}/api/objects`).then(r=>r.json());
    assert.equal(signedOut.canManage,false);
    assert.equal(signedOut.objects.find(x=>x.id==='luluwa-mask').access,'Public');
    const noAuth=await fetch(`${base}/api/objects/luluwa-mask/access`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({access:'Community only'})});
    assert.equal(noAuth.status,401);
    const nonAdmin=await fetch(`${base}/api/objects/luluwa-mask/access`,{method:'PUT',headers:{authorization:'Bearer speaker-token','content-type':'application/json'},body:JSON.stringify({access:'Community only'})});
    assert.equal(nonAdmin.status,403);
    const admin=await fetch(`${base}/api/objects/luluwa-mask/access`,{method:'PUT',headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:JSON.stringify({access:'Community only'})});
    assert.equal(admin.status,200);
    assert.equal(access.get('luluwa-mask'),'Community only');
    const invalid=await fetch(`${base}/api/objects/luluwa-mask/access`,{method:'PUT',headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:JSON.stringify({access:'Secret'})});
    assert.equal(invalid.status,400);
    const result=await fetch(`${base}/api/objects`,{headers:{authorization:'Bearer admin-token'}}).then(r=>r.json());
    assert.equal(result.canManage,true);
    assert.equal(result.objects.find(x=>x.id==='luluwa-mask').access,'Community only');
  });
});

test('object-linked public story keeps author and fingerprint and is hidden with a community-only object from visitors', async()=>{
  const {app,stories,access}=fixture();
  await withServer(app,async base=>{
    const data=new FormData();for(const [key,value] of Object.entries({title:'Speaker account',kind:'story',section:'stories',trustLabel:'Told by a community member',licence:'All rights reserved',region:'',people:'',tags:'',sources:'[]',access:'Public',consentConfirmed:'true'}))data.set(key,value);data.set('originalLanguage','Tshiluba');data.set('text','A speaker-authored account.');data.set('objectId','luluwa-mask');data.set('storytellerName','Community Speaker');data.set('showName','false');
    const created=await fetch(`${base}/api/stories`,{method:'POST',headers:{authorization:'Bearer speaker-token'},body:data});
    assert.equal(created.status,201);
    const story=await created.json();assert.equal(story.objectId,'luluwa-mask');assert.equal(story.storytellerName,'Community Speaker');assert.match(story.versionLog[0].fingerprint,/^[a-f0-9]{64}$/);
    const publish=await fetch(`${base}/api/stories/${story.id}`,{method:'PUT',headers:{authorization:'Bearer speaker-token','content-type':'application/json'},body:JSON.stringify({approve:true,visibility:'public'})});
    assert.equal(publish.status,200);
    assert.equal((await publish.json()).moderationStatus,'pending_review');
    const adminApprove=await fetch(`${base}/api/admin/posts/${story.id}/approve`,{method:'POST',headers:{authorization:'Bearer admin-token'}});assert.equal(adminApprove.status,200);
    assert.equal(stories[0].object_id,'luluwa-mask');
    assert.equal((await fetch(`${base}/api/stories`)).status,200);
    assert.equal((await fetch(`${base}/api/stories`).then(r=>r.json())).length,1);
    assert.equal((await fetch(`${base}/api/stories/${story.id}`)).status,200);
    access.set('luluwa-mask','Community only');
    assert.deepEqual(await fetch(`${base}/api/stories`).then(r=>r.json()),[]);
    assert.equal((await fetch(`${base}/api/stories/${story.id}`)).status,404);
    const memberStories=await fetch(`${base}/api/stories`,{headers:{authorization:'Bearer member-token'}}).then(r=>r.json());
    assert.equal(memberStories.length,1);assert.equal(memberStories[0].objectId,'luluwa-mask');
    assert.equal(memberStories[0].storytellerName,undefined);
    assert.equal(memberStories[0].versionLog[0].fingerprint,story.versionLog[0].fingerprint);
  });
});
