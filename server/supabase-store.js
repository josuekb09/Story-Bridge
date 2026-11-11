import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function stablePostReportId(reporterId,postId){
  const hex=crypto.createHash('sha256').update(`story-bridge\0post-report\0${reporterId}\0${postId}`).digest('hex').slice(0,32).split('');
  hex[12]='5';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16);
  const value=hex.join('');return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}

// All methods are async so the route layer does not depend on a particular storage engine.
export function createSupabaseStore(config, client = createClient(config.url, config.secretKey, { auth: { autoRefreshToken: false, persistSession: false } })) {
  const fail = (error) => { if (error) throw new Error('storage-unavailable', { cause:error }); };
  return {
    async listPublic() { const { data, error } = await client.from('stories').select('*').eq('status', 'shared').eq('visibility', 'public'); fail(error); return data; },
    async listMine(userId) { const { data, error } = await client.from('stories').select('*').eq('owner_user_id', userId); fail(error); return data; },
    async listPending() { const { data, error } = await client.from('stories').select('*').eq('moderation_status','pending_review'); fail(error); return data || []; },
    async get(id) { const { data, error } = await client.from('stories').select('*').eq('id', id).maybeSingle(); fail(error); return data; },
    async create(record) { const { data, error } = await client.from('stories').insert(record).select('*').single(); fail(error); return data; },
    async listObjectAccess() { const { data, error } = await client.from('object_records').select('id,access'); fail(error); return data || []; },
    async setObjectAccess(id, access) { const { data, error } = await client.from('object_records').upsert({ id, access, updated_at:new Date().toISOString() }, { onConflict:'id' }).select('id,access').single(); fail(error); return data; },
    async update(id, userId, changes) { const { data, error } = await client.from('stories').update(changes).eq('id', id).eq('owner_user_id', userId).select('*').maybeSingle(); fail(error); return data; },
    async updateAdminStory(id,changes) { const {data,error}=await client.from('stories').update(changes).eq('id',id).select('*').maybeSingle();fail(error);return data; },
    async approvePending(id,changes) { const {data,error}=await client.from('stories').update(changes).eq('id',id).eq('moderation_status','pending_review').select('*').maybeSingle();fail(error);return data; },
    async claim(id, ownerHash, userId) {
      const { data, error } = await client.from('stories').update({ owner_user_id: userId, owner_hash: null }).eq('id', id).is('owner_user_id', null).eq('owner_hash', ownerHash).select('id');
      fail(error); return Array.isArray(data) && data.length === 1;
    },
    async claimLegacy(ownerHash, userId) {
      const { data, error } = await client.from('stories').update({ owner_user_id: userId, owner_hash: null }).is('owner_user_id', null).eq('owner_hash', ownerHash).select('id');
      fail(error); return data?.length || 0;
    },
    async countMine(userId) { const { count, error } = await client.from('stories').select('id', { count:'exact', head:true }).eq('owner_user_id',userId); fail(error); return count || 0; },
    async getAudio(id) { const { data, error } = await client.storage.from(config.bucket).download(id); fail(error); return data; },
    async audioResponse(id) {
      const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeURIComponent(id)}`, { headers: { apikey: config.secretKey, authorization: `Bearer ${config.secretKey}` } });
      if (!response.ok || !response.body) throw new Error('storage-unavailable');
      return response;
    },
    async putAudio(id, file, contentType = 'application/octet-stream') { const { error } = await client.storage.from(config.bucket).upload(id, file, { upsert: false, contentType }); fail(error); },
    async removeAudio(id) { const { error } = await client.storage.from(config.bucket).remove([id]); fail(error); },
    async putPostImage(key,buffer) { const {error}=await client.storage.from(config.bucket).upload(`posts/${key}.webp`,buffer,{upsert:false,contentType:'image/webp'});fail(error); },
    async createPostMedia(rows) { const {data,error}=await client.from('post_media').insert(rows).select('*');fail(error);return data||[]; },
    async listPostMedia(postId) { const {data,error}=await client.from('post_media').select('*').eq('post_id',postId).eq('kind','image').order('created_at');fail(error);return data||[]; },
    async getPostImage(key) { const response=await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/posts/${encodeURIComponent(key)}.webp`,{headers:{apikey:config.secretKey,authorization:`Bearer ${config.secretKey}`}});if(!response.ok)throw new Error('storage-unavailable');return{buffer:Buffer.from(await response.arrayBuffer()),mime:'image/webp'}; },
    async audioUsage() {
      let offset = 0, total = 0;
      while (true) {
        const { data, error } = await client.storage.from(config.bucket).list('', { limit: 1000, offset }); fail(error);
        total += (data || []).reduce((sum, item) => sum + (item.metadata?.size || 0), 0);
        if (!data || data.length < 1000) return total;
        offset += data.length;
      }
    },
    async profile(userId) { const { data, error } = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle(); fail(error); return data; },
    async listOpenPostReports() { const {data,error}=await client.from('reports').select('id,target_id,reason,details,created_at').eq('target_type','post').eq('status','open').order('created_at',{ascending:false});fail(error);return data||[]; },
    async createPostReport(record) {
      const id=stablePostReportId(record.reporter_id,record.target_id);
      const {data:existing,error:lookupError}=await client.from('reports').select('id,status').eq('id',id).maybeSingle();fail(lookupError);
      if(existing?.status==='open')return{created:false,report:existing};
      if(existing){
        const {data:reopened,error}=await client.from('reports').update({reason:record.reason,details:record.details,status:'open',created_at:new Date().toISOString()}).eq('id',id).eq('status',existing.status).select('id').maybeSingle();fail(error);
        if(reopened)return{created:true,report:reopened};
        const {data:latest,error:latestError}=await client.from('reports').select('id,status').eq('id',id).maybeSingle();fail(latestError);
        if(latest?.status==='open')return{created:false,report:latest};
      }
      const {data,error}=await client.from('reports').upsert({...record,id},{onConflict:'id',ignoreDuplicates:true}).select('id').maybeSingle();fail(error);
      return data?{created:true,report:data}:{created:false,report:{id}};
    },
    async dismissReport(id) { const {data,error}=await client.from('reports').update({status:'dismissed'}).eq('id',id).eq('status','open').select('id').maybeSingle();fail(error);return !!data; },
    async actionReportsForPost(postId) { const {data,error}=await client.from('reports').update({status:'actioned'}).eq('target_type','post').eq('target_id',postId).eq('status','open').select('id');fail(error);return data?.length||0; },
    async adminStats() {
      let accounts=0,page=1;const perPage=1000;
      while(true){const {data,error}=await client.auth.admin.listUsers({page,perPage});fail(error);const users=data?.users||[];accounts+=users.length;if(users.length<perPage||data?.total!=null&&accounts>=data.total)break;page++;}
      const [profiles,posts,pending,reports]=await Promise.all([
        client.from('profiles').select('user_id',{count:'exact',head:true}).not('display_name','is',null).neq('display_name',''),
        client.from('stories').select('id',{count:'exact',head:true}).eq('status','shared').eq('visibility','public'),
        client.from('stories').select('id',{count:'exact',head:true}).eq('first_post',true).eq('moderation_status','pending_review'),
        client.from('reports').select('id',{count:'exact',head:true}).eq('status','open'),
      ]);
      for(const result of [profiles,posts,pending,reports])fail(result.error);
      return{accounts,profilesCompleted:profiles.count||0,publicPosts:posts.count||0,pendingFirstPosts:pending.count||0,openReports:reports.count||0};
    },
    async saveProfile(userId, profile) { const { data, error } = await client.from('profiles').upsert({ user_id: userId, ...profile }, { onConflict: 'user_id' }).select('*').single(); fail(error); return data; },
    async putProfileAvatar(key, buffer) { const { error }=await client.storage.from(config.bucket).upload(`profiles/${key}.webp`,buffer,{upsert:false,contentType:'image/webp'});fail(error);return{key,mime:'image/webp'}; },
    async getProfileAvatar(key) { const {data,error}=await client.storage.from(config.bucket).download(`profiles/${key}.webp`);fail(error);return{buffer:Buffer.from(await data.arrayBuffer()),mime:'image/webp'}; },
    async removeProfileAvatar(key) { const {error}=await client.storage.from(config.bucket).remove([`profiles/${key}.webp`]);fail(error); },
    // Permanently removes one story owned by userId: its audio, its post images (files and
    // rows) and the story row. Returns false if the story is not the user's.
    async deleteStory(id, userId) {
      const { data: row, error } = await client.from('stories').select('id,audio_key').eq('id', id).eq('owner_user_id', userId).maybeSingle(); fail(error);
      if (!row) return false;
      const { data: media, error: mediaError } = await client.from('post_media').select('storage_key').eq('post_id', id); fail(mediaError);
      const files = [...(row.audio_key ? [row.audio_key] : []), ...(media || []).map(item => `posts/${item.storage_key}.webp`)];
      if (files.length) { const { error: storageError } = await client.storage.from(config.bucket).remove(files); fail(storageError); }
      const { error: deleteError } = await client.from('stories').delete().eq('id', id).eq('owner_user_id', userId); fail(deleteError);
      return true;
    },
    async deleteAccount(userId) { const {data,error:listError}=await client.from('stories').select('id,audio_key').eq('owner_user_id',userId);fail(listError);for(const row of data||[])if(row.audio_key)await client.storage.from(config.bucket).remove([row.audio_key]);const storyIds=(data||[]).map(row=>row.id).filter(Boolean);if(storyIds.length){const {data:media,error:mediaError}=await client.from('post_media').select('storage_key').in('post_id',storyIds);fail(mediaError);const images=(media||[]).map(item=>`posts/${item.storage_key}.webp`);if(images.length){const {error:imageError}=await client.storage.from(config.bucket).remove(images);fail(imageError);}}const {error:storyError}=await client.from('stories').delete().eq('owner_user_id',userId);fail(storyError);const profile=await this.profile(userId);if(profile?.avatar_key)await this.removeProfileAvatar(profile.avatar_key);const {error:profileError}=await client.from('profiles').delete().eq('user_id',userId);fail(profileError);const {error:authError}=await client.auth.admin.deleteUser(userId);fail(authError);return true; },
  };
}
