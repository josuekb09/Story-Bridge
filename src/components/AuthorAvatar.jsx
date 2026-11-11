import { useEffect, useState } from 'react';
import '../styles/components/author-identity.css';

export function authorName(story) {
  return story?.author?.name || story?.storytellerName || 'Community member';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase() : '·';
}

export default function AuthorAvatar({ story, className = '', avatarUrl, size = 'default' }) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const name = authorName(story);
  const anonymous = story?.author?.anonymous === true || (!story?.author?.name && !story?.storytellerName);
  const source = avatarUrl === undefined ? story?.author?.avatarUrl || story?.authorAvatarUrl : avatarUrl;
  const classes = [className, `author-avatar-${size}`].filter(Boolean).join(' ');
  useEffect(() => setImageUnavailable(false), [source]);

  if (source && !imageUnavailable) return <img className={`${classes} author-avatar-image`} src={source} alt="" loading="lazy" decoding="async" onError={() => setImageUnavailable(true)}/>;
  if (anonymous) return <img className={`${classes} author-avatar-placeholder`} src="/assets/icons/profile.svg" alt="" aria-hidden="true"/>;
  return <span className={`${classes} author-avatar-initials`} aria-hidden="true">{initials(name)}</span>;
}
