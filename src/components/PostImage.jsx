import { useEffect, useState } from 'react';
import { authorizedObjectUrl } from '../lib/api.js';
import { isPublicPostMedia } from '../lib/post-media.js';
import '../styles/components/post-media.css';

export default function PostImage({ image, story, className = '', sizes, variant = 'feed' }) {
  const direct = isPublicPostMedia(story);
  const [src, setSrc] = useState(() => direct ? image?.url || '' : '');
  const [state, setState] = useState(image?.url ? 'loading' : 'error');
  const width = image?.width || 640;
  const height = image?.height || 480;
  const sourceUrl = variant === 'full' || !image?.thumbnailUrl ? image?.url : image.thumbnailUrl;
  const mediumUrl = image?.mediumUrl || image?.url;
  const srcSet = direct && variant !== 'full' && image?.thumbnailUrl
    ? `${image.thumbnailUrl} ${image.thumbnailWidth || 640}w, ${mediumUrl} ${image.mediumWidth || image.width || 1280}w`
    : undefined;

  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    setState(image?.url ? 'loading' : 'error');
    if (!image?.url) {
      setSrc('');
      return undefined;
    }
    if (direct) {
      setSrc(image.url);
      return () => { alive = false; };
    }
    setSrc('');
    authorizedObjectUrl(sourceUrl)
      .then(url => {
        objectUrl = url;
        if (alive) setSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {
        if (alive) { setSrc(''); setState('error'); }
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [direct, image?.url, sourceUrl]);

  const classes = ['post-image-frame', className].filter(Boolean).join(' ');
  const ratio = `${width} / ${height}`;
  if (state === 'error') return <span className={`${classes} post-image-unavailable`} role="img" aria-label="Photo unavailable" style={{ aspectRatio: ratio }}><span>Photo unavailable</span></span>;
  return <span className={classes} style={{ aspectRatio: ratio }} aria-busy={state === 'loading' ? 'true' : undefined}>
    {state === 'loading' && <span className="post-image-placeholder" role="status">Loading photo…</span>}
    {src && <img className="post-image-content" src={src} srcSet={srcSet} alt={image.altText || ''} width={width} height={height} sizes={sizes || '(max-width: 700px) 100vw, 640px'} loading="lazy" decoding="async" onLoad={() => setState('ready')} onError={() => { if (src.startsWith('blob:')) URL.revokeObjectURL(src); setSrc(''); setState('error'); }} />}
  </span>;
}
