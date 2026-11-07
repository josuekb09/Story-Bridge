import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

// Account-mode file storage is separate from Stage 1's stories.json and uploads/.
export function createFileAccountStore(directory) {
  const storiesFile = path.join(directory, 'account-stories.json');
  const profilesFile = path.join(directory, 'account-profiles.json');
  const audioDir = path.join(directory, 'account-audio');
  let writes = Promise.resolve();
  const serialize = operation => { const next = writes.then(operation, operation); writes = next.catch(() => {}); return next; };
  async function read(file) {
    try { const value = JSON.parse(await fs.readFile(file, 'utf8')); if (!Array.isArray(value)) throw new Error('invalid-store'); return value; }
    catch (error) { if (error.code === 'ENOENT') return []; throw new Error('storage-unavailable'); }
  }
  async function write(file, value) {
    await fs.mkdir(directory, { recursive:true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(value,null,2), { flag:'wx' }); await fs.rename(temporary,file); }
    catch { await fs.rm(temporary,{force:true}); throw new Error('storage-unavailable'); }
  }
  return {
    async listPublic() { return (await read(storiesFile)).filter(row=>row.status==='shared'&&row.visibility==='public'); },
    async listMine(userId) { return (await read(storiesFile)).filter(row=>row.owner_user_id===userId); },
    async get(id) { return (await read(storiesFile)).find(row=>row.id===id)||null; },
    async create(record) { return serialize(async()=>{const rows=await read(storiesFile);const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),...record};rows.push(row);await write(storiesFile,rows);return row;}); },
    async update(id,userId,changes) { return serialize(async()=>{const rows=await read(storiesFile);const row=rows.find(item=>item.id===id&&item.owner_user_id===userId);if(!row)return null;Object.assign(row,changes);await write(storiesFile,rows);return row;}); },
    async claim(id,ownerHash,userId) { return serialize(async()=>{const rows=await read(storiesFile);const row=rows.find(item=>item.id===id&&item.owner_user_id==null&&item.owner_hash===ownerHash);if(!row)return false;row.owner_user_id=userId;row.owner_hash=null;await write(storiesFile,rows);return true;}); },
    async claimLegacy(ownerHash,userId) { return serialize(async()=>{const rows=await read(storiesFile);const matches=rows.filter(row=>row.owner_user_id==null&&row.owner_hash===ownerHash);if(!matches.length)return 0;for(const row of matches){row.owner_user_id=userId;row.owner_hash=null;}await write(storiesFile,rows);return matches.length;}); },
    async countMine(userId) { return (await read(storiesFile)).filter(row=>row.owner_user_id===userId).length; },
    async putAudio(id,buffer,contentType='application/octet-stream') { await fs.mkdir(audioDir,{recursive:true});await fs.writeFile(path.join(audioDir,`${id}.audio`),buffer,{flag:'wx'});return contentType; },
    async removeAudio(id) { await fs.rm(path.join(audioDir,`${id}.audio`),{force:true}); },
    async audioUsage() { let total=0;try{for(const item of await fs.readdir(audioDir,{withFileTypes:true}))if(item.isFile())total+=(await fs.stat(path.join(audioDir,item.name))).size;}catch(error){if(error.code!=='ENOENT')throw error;}return total; },
    async audioResponse(id,contentType='application/octet-stream') { if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('storage-unavailable');const file=path.join(audioDir,`${id}.audio`);const stat=await fs.stat(file);return new Response(Readable.toWeb((await import('node:fs')).createReadStream(file)),{headers:{'content-type':contentType,'content-length':String(stat.size)}}); },
    async profile(userId) { return (await read(profilesFile)).find(row=>row.user_id===userId)||null; },
    async saveProfile(userId,displayName) { return serialize(async()=>{const rows=await read(profilesFile);let row=rows.find(item=>item.user_id===userId);if(row)row.display_name=displayName;else{row={user_id:userId,display_name:displayName};rows.push(row);}await write(profilesFile,rows);return {display_name:row.display_name};}); },
  };
}
