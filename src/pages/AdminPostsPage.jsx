import { useEffect, useState } from 'react';
import { authorizedObjectUrl } from '../lib/api.js';
import '../styles/components/admin.css';

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function excerpt(text) {
  const value = String(text || '').trim();
  return value.length > 280 ? `${value.slice(0, 280).trimEnd()}…` : value || 'No written excerpt.';
}

function ProtectedImage({ image }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    let objectUrl = '';
    authorizedObjectUrl(image.url).then(url => { objectUrl = url; if (live) setSrc(url); else URL.revokeObjectURL(url); }).catch(() => {});
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.url]);
  return src ? <img src={src} alt={image.altText || ''} width={image.width || 160} height={image.height || 120} loading="lazy" decoding="async"/> : <span className="admin-photo-loading" role="status">Loading photo…</span>;
}

export default function AdminPostsPage({ posts = [], error = '', busyId = '', onAction = () => {}, onRetry = () => {} }) {
  const [confirmation, setConfirmation] = useState(null);
  return <main className="admin-main">
    <header className="admin-head">
      <p className="eyebrow">Moderation</p>
      <h1>Admin review</h1>
      <p className="muted">Review first posts before they become public.</p>
    </header>
    {error && <section className="panel" role="alert"><p>{error}</p><button type="button" className="secondary" onClick={onRetry}>Try again</button></section>}
    {!error && posts.length === 0 && <p className="admin-empty">No posts are waiting for review.</p>}
    {posts.length > 0 && <ul className="admin-post-list">{posts.map(post => {
      const busy = busyId === post.id;
      return <li key={post.id}><article className="admin-post">
        <div className="admin-post-heading">
          <div><h2>{post.title || 'Untitled post'}</h2><p>{post.originalLanguage || 'Language not set'}{post.region ? ` · ${post.region}` : ''}</p></div>
          <time dateTime={post.createdAt || undefined}>{dateLabel(post.createdAt)}</time>
        </div>
        <p className="admin-excerpt">{excerpt(post.text)}</p>
        {post.images?.length > 0 && <ul className="admin-photos" aria-label="Post photos">{post.images.map(image => <li key={image.id}>
          <ProtectedImage image={image}/>
          <small>{image.credit || 'Photo credit unavailable'}</small>
        </li>)}</ul>}
        <div className="admin-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => setConfirmation({ id: post.id, action: 'approve' })}>Approve and publish</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmation({ id: post.id, action: 'keep-private' })}>Keep private</button>
        </div>
        {confirmation?.id === post.id && <div className="admin-confirm" role="alertdialog" aria-label="Confirm moderation action">
          <p>{confirmation.action === 'approve' ? 'Publish this post now?' : 'Keep this post private and remove it from the review queue?'}</p>
          <div className="admin-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
            <button type="button" className="primary" disabled={busy} onClick={async () => { await onAction(post.id, confirmation.action); setConfirmation(null); }}>{confirmation.action === 'approve' ? 'Confirm publish' : 'Confirm keep private'}</button>
          </div>
        </div>}
      </article></li>;
    })}</ul>}
  </main>;
}
