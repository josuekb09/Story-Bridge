import { createClient } from '@supabase/supabase-js';

// All methods are async so the route layer does not depend on a particular storage engine.
export function createSupabaseStore(config, client = createClient(config.url, config.secretKey, { auth: { autoRefreshToken: false, persistSession: false } })) {
  const fail = (error) => { if (error) throw new Error('storage-unavailable'); };
  return {
    async listPublic() { const { data, error } = await client.from('stories').select('*').eq('status', 'shared').eq('visibility', 'public'); fail(error); return data; },
    async listMine(userId) { const { data, error } = await client.from('stories').select('*').eq('owner_user_id', userId); fail(error); return data; },
    async get(id) { const { data, error } = await client.from('stories').select('*').eq('id', id).maybeSingle(); fail(error); return data; },
    async create(record) { const { data, error } = await client.from('stories').insert(record).select('*').single(); fail(error); return data; },
    async update(id, userId, changes) { const { data, error } = await client.from('stories').update(changes).eq('id', id).eq('owner_user_id', userId).select('*').maybeSingle(); fail(error); return data; },
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
    async audioUsage() {
      let offset = 0, total = 0;
      while (true) {
        const { data, error } = await client.storage.from(config.bucket).list('', { limit: 1000, offset }); fail(error);
        total += (data || []).reduce((sum, item) => sum + (item.metadata?.size || 0), 0);
        if (!data || data.length < 1000) return total;
        offset += data.length;
      }
    },
    async profile(userId) { const { data, error } = await client.from('profiles').select('display_name').eq('user_id', userId).maybeSingle(); fail(error); return data; },
    async saveProfile(userId, displayName) { const { data, error } = await client.from('profiles').upsert({ user_id: userId, display_name: displayName }, { onConflict: 'user_id' }).select('display_name').single(); fail(error); return data; },
  };
}
