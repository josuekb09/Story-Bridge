import { useState } from 'react';
import { authorAvatarFallback, authorAvatarSource } from '../lib/author-avatar.js';
import '../styles/components/author-identity.css';

export { authorName } from '../lib/author-avatar.js';

export default function AuthorAvatar({ story, className = '', avatarUrl, size = 'default' }) {
  const [imageState, setImageState] = useState({ source: '', loaded: false, unavailable: false });
  const fallback = authorAvatarFallback(story);
  const source = authorAvatarSource(story, avatarUrl);
  const classes = [className, `author-avatar-${size}`].filter(Boolean).join(' ');
  const imageLoaded = imageState.source === source && imageState.loaded;
  const imageUnavailable = imageState.source === source && imageState.unavailable;

  const fallbackElement = fallback.type === 'initials'
    ? <span className={`${classes} author-avatar-initials`} aria-hidden="true">{fallback.text}</span>
    : <img className={`${classes} author-avatar-placeholder`} src="/assets/icons/profile.svg" alt="" aria-hidden="true"/>;

  if (source && !imageUnavailable) return <span className={`${classes} author-avatar-frame`} aria-hidden="true">
    {fallbackElement}
    <img className={`author-avatar-image${imageLoaded ? ' is-loaded' : ''}`} src={source} alt="" loading="lazy" decoding="async" onLoad={() => setImageState({ source, loaded: true, unavailable: false })} onError={() => setImageState({ source, loaded: false, unavailable: true })}/>
  </span>;
  return fallbackElement;
}
