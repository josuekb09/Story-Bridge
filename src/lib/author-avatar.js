export function authorName(story) {
  return story?.author?.name || story?.storytellerName || 'Community member';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase() : '·';
}

export function authorAvatarFallback(story) {
  const name = story?.author?.name || story?.storytellerName || '';
  if (story?.author?.anonymous === true || !String(name).trim()) return { type: 'placeholder' };
  return { type: 'initials', text: initials(name) };
}

export function authorAvatarSource(story, avatarUrl) {
  if (story?.author?.anonymous === true) return undefined;
  const candidate = avatarUrl === undefined ? story?.author?.avatarUrl || story?.authorAvatarUrl : avatarUrl;
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}
