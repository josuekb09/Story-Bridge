import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { OBJECT_IDS } from '../src/object-records.js';

// Account-mode file storage is separate from Stage 1's stories.json and uploads/.
export function createFileAccountStore(directory) {
  const storiesFile = path.join(directory, 'account-stories.json');
  const profilesFile = path.join(directory, 'account-profiles.json');
  const objectsFile = path.join(directory, 'object-access.json');
  const audioDir = path.join(directory, 'account-audio');
  const avatarDir = path.join(directory, 'profile-avatars');
  const postMediaFile = path.join(directory, 'post-media.json');
  const postMediaDir = path.join(directory, 'post-media');
  const reportsFile = path.join(directory, 'account-reports.json');
  let writes = Promise.resolve();
  const serialize = operation => { const next = writes.then(operation, operation); writes = next.catch(() => {}); return next; };
  async function read(file) {
    try { const value = JSON.parse(await fs.readFile(file, 'utf8')); if (!Array.isArray(value)) throw new Error('invalid-store'); return value; }
    catch (error) { if (error.code === 'ENOENT') return []; throw new Error('storage-unavailable',{cause:error}); }
  }
  async function write(file, value) {
    await fs.mkdir(directory, { recursive:true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(value,null,2), { flag:'wx' }); await fs.rename(temporary,file); }
    catch (error) { await fs.rm(temporary,{force:true}); throw new Error('storage-unavailable',{cause:error}); }
  }
  return {
    async listPublic() { return (await read(storiesFile)).filter(row=>row.status==='shared'&&row.visibility==='public'); },
    async listMine(userId) { return (await read(storiesFile)).filter(row=>row.owner_user_id===userId); },
    async listPending() { return (await read(storiesFile)).filter(row=>row.moderation_status==='pending_review'); },
    async get(id) { return (await read(storiesFile)).find(row=>row.id===id)||null; },
    async updateAdminStory(id,changes) { return serialize(async()=>{const rows=await read(storiesFile);const row=rows.find(item=>item.id===id);if(!row)return null;Object.assign(row,changes);await write(storiesFile,rows);return row;}); },
    async listOpenPostReports() { return (await read(reportsFile)).filter(row=>row.target_type==='post'&&row.status==='open').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)); },
    async createPostReport(record) { return serialize(async()=>{const rows=await read(reportsFile);const existing=rows.find(row=>row.reporter_id===record.reporter_id&&row.target_type==='post'&&row.target_id===record.target_id&&row.status==='open');if(existing)return{created:false,report:existing};const report={id:crypto.randomUUID(),created_at:new Date().toISOString(),...record};rows.push(report);await write(reportsFile,rows);return{created:true,report};}); },
    async dismissReport(id) { return serialize(async()=>{const rows=await read(reportsFile);const report=rows.find(row=>row.id===id&&row.status==='open');if(!report)return false;report.status='dismissed';await write(reportsFile,rows);return true;}); },
    async actionReportsForPost(postId) { return serialize(async()=>{const rows=await read(reportsFile);let changed=0;for(const report of rows)if(report.target_type==='post'&&report.target_id===postId&&report.status==='open'){report.status='actioned';changed++;}if(changed)await write(reportsFile,rows);return changed;}); },
    async adminStats() { const [stories,profiles,reports]=await Promise.all([read(storiesFile),read(profilesFile),read(reportsFile)]);return{accounts:new Set(profiles.map(row=>row.user_id).filter(Boolean)).size,profilesCompleted:profiles.filter(row=>typeof row.display_name==='string'&&row.display_name.trim()).length,publicPosts:stories.filter(row=>row.status==='shared'&&row.visibility==='public').length,pendingFirstPosts:stories.filter(row=>row.first_post&&row.moderation_status==='pending_review').length,openReports:reports.filter(row=>row.status==='open').length}; },
    async approvePending(id,changes) { return serialize(async()=>{const rows=await read(storiesFile);const row=rows.find(item=>item.id===id&&item.moderation_status==='pending_review');if(!row)return null;Object.assign(row,changes);await write(storiesFile,rows);return row;}); },
    async create(record) { return serialize(async()=>{const rows=await read(storiesFile);const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),...record};rows.push(row);await write(storiesFile,rows);return row;}); },
    async update(id,userId,changes) { return serialize(async()=>{const rows=await read(storiesFile);const row=rows.find(item=>item.id===id&&item.owner_user_id===userId);if(!row)return null;Object.assign(row,changes);await write(storiesFile,rows);return row;}); },
    async claim(id,ownerHash,userId) { return serialize(async()=>{const rows=await read(storiesFile);const row=rows.find(item=>item.id===id&&item.owner_user_id==null&&item.owner_hash===ownerHash);if(!row)return false;row.owner_user_id=userId;row.owner_hash=null;await write(storiesFile,rows);return true;}); },
    async claimLegacy(ownerHash,userId) { return serialize(async()=>{const rows=await read(storiesFile);const matches=rows.filter(row=>row.owner_user_id==null&&row.owner_hash===ownerHash);if(!matches.length)return 0;for(const row of matches){row.owner_user_id=userId;row.owner_hash=null;}await write(storiesFile,rows);return matches.length;}); },
    async countMine(userId) { return (await read(storiesFile)).filter(row=>row.owner_user_id===userId).length; },
    async putAudio(id,buffer,contentType='application/octet-stream') { await fs.mkdir(audioDir,{recursive:true});await fs.writeFile(path.join(audioDir,`${id}.audio`),buffer,{flag:'wx'});return contentType; },
    async removeAudio(id) { await fs.rm(path.join(audioDir,`${id}.audio`),{force:true}); },
    async audioUsage() { let total=0;try{for(const item of await fs.readdir(audioDir,{withFileTypes:true}))if(item.isFile())total+=(await fs.stat(path.join(audioDir,item.name))).size;}catch(error){if(error.code!=='ENOENT')throw error;}return total; },
    async audioResponse(id,contentType='application/octet-stream') { if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('storage-unavailable');const file=path.join(audioDir,`${id}.audio`);const stat=await fs.stat(file);return new Response(Readable.toWeb((await import('node:fs')).createReadStream(file)),{headers:{'content-type':contentType,'content-length':String(stat.size)}}); },
    async putPostImage(key,buffer) { await fs.mkdir(postMediaDir,{recursive:true});await fs.writeFile(path.join(postMediaDir,`${key}.webp`),buffer,{flag:'wx'}); },
    async createPostMedia(rows) { return serialize(async()=>{const all=await read(postMediaFile);all.push(...rows);await write(postMediaFile,all);return rows;}); },
    async listPostMedia(postId) { return (await read(postMediaFile)).filter(row=>row.post_id===postId&&row.kind==='image'); },
    async getPostImage(key) { const buffer=await fs.readFile(path.join(postMediaDir,`${key}.webp`));return {buffer,mime:'image/webp'}; },
    async profile(userId) { return (await read(profilesFile)).find(row=>row.user_id===userId)||null; },
    async profilesByUserIds(userIds) { const wanted=new Set(userIds);return (await read(profilesFile)).filter(row=>wanted.has(row.user_id)); },
    async saveProfile(userId,profile) { return serialize(async()=>{const rows=await read(profilesFile);let row=rows.find(item=>item.user_id===userId);if(row)Object.assign(row,profile);else{row={user_id:userId,...profile};rows.push(row);}await write(profilesFile,rows);return {...row};}); },
    async putProfileAvatar(key,buffer) { await fs.mkdir(avatarDir,{recursive:true});await fs.writeFile(path.join(avatarDir,`${key}.webp`),buffer,{flag:'wx'});return {key,mime:'image/webp'}; },
    async getProfileAvatar(key) { const buffer=await fs.readFile(path.join(avatarDir,`${key}.webp`));return {buffer,mime:'image/webp'}; },
    async removeProfileAvatar(key) { await fs.rm(path.join(avatarDir,`${key}.webp`),{force:true}); },
    async deleteStory(id,userId) { return serialize(async()=>{const rows=await read(storiesFile);const row=rows.find(item=>item.id===id&&item.owner_user_id===userId);if(!row)return false;if(row.audio_key)await fs.rm(path.join(audioDir,`${row.audio_key}.audio`),{force:true});const media=await read(postMediaFile);for(const item of media.filter(entry=>entry.post_id===id))await fs.rm(path.join(postMediaDir,`${item.storage_key}.webp`),{force:true});await write(postMediaFile,media.filter(entry=>entry.post_id!==id));await write(storiesFile,rows.filter(item=>item.id!==id));return true;}); },
    async deleteAccount(userId) { return serialize(async()=>{const stories=await read(storiesFile);const owned=stories.filter(item=>item.owner_user_id===userId);for(const story of owned)if(story.audio_key)await fs.rm(path.join(audioDir,`${story.audio_key}.audio`),{force:true});const ids=new Set(owned.map(story=>story.id));const media=await read(postMediaFile);for(const item of media.filter(entry=>ids.has(entry.post_id)))await fs.rm(path.join(postMediaDir,`${item.storage_key}.webp`),{force:true});await write(postMediaFile,media.filter(entry=>!ids.has(entry.post_id)));await write(storiesFile,stories.filter(item=>item.owner_user_id!==userId));const profiles=await read(profilesFile);const profile=profiles.find(item=>item.user_id===userId);if(profile?.avatar_key)await fs.rm(path.join(avatarDir,`${profile.avatar_key}.webp`),{force:true});await write(profilesFile,profiles.filter(item=>item.user_id!==userId));const reports=await read(reportsFile);await write(reportsFile,reports.filter(item=>item.reporter_id!==userId));return true;}); },
    async listObjectAccess() { const rows=await read(objectsFile); return OBJECT_IDS.map(id=>({id,access:rows.find(item=>item.id===id)?.access||'Public'})); },
    async setObjectAccess(id,access) { if(!OBJECT_IDS.includes(id)||!['Public','Community only'].includes(access))throw new Error('invalid-object-access');return serialize(async()=>{const rows=await read(objectsFile);const row=rows.find(item=>item.id===id);if(row)row.access=access;else rows.push({id,access});await write(objectsFile,rows);return {id,access};}); },
  };
}
