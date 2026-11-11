import { useEffect, useState } from 'react';
import AudioPlayer from '../components/AudioPlayer.jsx';
import AuthorAvatar, { authorName } from '../components/AuthorAvatar.jsx';
import ReadInMyLanguage from '../components/ReadInMyLanguage.jsx';
import ReportPostAction from '../components/ReportPostAction.jsx';
import PostImage from '../components/PostImage.jsx';
import { translationOriginLabel, useUiLanguage } from '../lib/i18n.js';
import { shouldShowMachineTranslation } from '../share-validation.js';
import { audienceLine } from '../audience.js';
import '../styles/components/story-detail.css';
import '../styles/components/cultures.css';

function storyTitle(story) {
  return story.title || (story.text || 'A voice carried across languages').split(/[.!?\n]/)[0].slice(0, 90);
}

function relativeDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const seconds = (date.getTime() - Date.now()) / 1000;
  const units = [['year',31536000],['month',2592000],['week',604800],['day',86400],['hour',3600],['minute',60]];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric:'auto' });
  for (const [unit,size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return format.format(0, 'minute');
}

function excerpt(value, max = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function setMeta(selector, attribute, key, content) {
  let element = document.head.querySelector(`${selector}[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

export default function StoryDetailPage({ story, navigate, backPage = 'discover', signedIn = false, isAuthor = !!story._own, profileAvatar = '', onChangeAuthorVisibility = () => {}, saving = false, onReportSignIn = () => {}, onReported = () => {} }) {
  const { lang: uiLanguage, t } = useUiLanguage();
  const [shareFeedback, setShareFeedback] = useState('');
  const privateAudio = !!story._own && !(story.status === 'shared' && story.visibility === 'public');
  const title = storyTitle(story);
  const publicStory = story.status === 'shared' && story.visibility === 'public';
  const whoCanSee = audienceLine(story, t);
  const date = story.createdAt && !Number.isNaN(new Date(story.createdAt).getTime()) ? new Date(story.createdAt) : null;
  const showMachineTranslation = shouldShowMachineTranslation(story, uiLanguage);

  useEffect(() => {
    const pageTitle = publicStory ? `${title} — Story Bridge` : 'Private story — Story Bridge';
    const description = publicStory ? excerpt(story.text) || `${story.originalLanguage} story on Story Bridge.` : 'A private story on Story Bridge.';
    const storyUrl = new URL(`/stories/${encodeURIComponent(story.id)}`, window.location.origin).href;
    document.title = pageTitle;
    setMeta('meta','property','og:type','article');
    setMeta('meta','property','og:title',pageTitle);
    setMeta('meta','property','og:description',description);
    setMeta('meta','property','og:url',publicStory ? storyUrl : window.location.origin);
    setMeta('meta','name','description',description);
    setMeta('meta','name','twitter:title',pageTitle);
    setMeta('meta','name','twitter:description',description);
    const imageUrl = publicStory && story.images?.[0]?.url ? new URL(story.images[0].url, window.location.origin).href : 'https://story-bridge.onrender.com/assets/social/story-bridge-share.svg';
    setMeta('meta','property','og:image',imageUrl);
    setMeta('meta','name','twitter:card',story.images?.length ? 'summary_large_image' : 'summary');
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = publicStory ? storyUrl : window.location.origin;
  }, [story, title, publicStory]);

  useEffect(() => { if (!shareFeedback) return undefined; const timer = setTimeout(() => setShareFeedback(''), 2500); return () => clearTimeout(timer); }, [shareFeedback]);

  async function shareStory() {
    const url = new URL(`/stories/${encodeURIComponent(story.id)}`, window.location.origin).href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} — Story Bridge`, url });
        setShareFeedback('Shared');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareFeedback('Link copied');
      } else {
        const input = document.createElement('textarea'); input.value = url; input.setAttribute('readonly',''); input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.appendChild(input); input.select(); const copied = document.execCommand('copy'); input.remove();
        setShareFeedback(copied ? 'Link copied' : 'Copy the address from your browser');
      }
    } catch {
      setShareFeedback('Share was cancelled');
    }
  }

  return <main className="story-detail-main">
    <button type="button" className="back" onClick={() => navigate(backPage)}>{backPage === 'discover' ? '← Back to Discover' : '← Back'}</button>
    <article className="story-detail" aria-labelledby="story-detail-title">
      <header className="story-detail-head">
        <p className="eyebrow">{story.trustLabel || 'Told by a community member'}</p>
        <h1 id="story-detail-title">{title}</h1>
        <p className="story-detail-meta">
          <span className="story-detail-author"><AuthorAvatar className="story-detail-author-avatar" size="small" story={story} avatarUrl={story._own && story.showName ? profileAvatar || undefined : undefined}/><b>{authorName(story)}</b></span>
          <span>{story.originalLanguage || 'Original language not set'}</span>
          {story.region && <span>{story.region}</span>}
          {date && <time dateTime={date.toISOString()} title={date.toLocaleString()}>{relativeDate(date)}</time>}
        </p>
        <button type="button" className="secondary story-share" onClick={shareStory}>↗ {t('feed.shareStory')}</button>
        <ReportPostAction postId={story.id} signedIn={signedIn} isAuthor={isAuthor} onSignIn={onReportSignIn} onReported={onReported}/>
        {shareFeedback && <span className="story-share-feedback" role="status">{shareFeedback}</span>}
        {story._own && <label className="check story-author-toggle"><input type="checkbox" checked={story.showName !== false} disabled={saving} onChange={event => onChangeAuthorVisibility(event.target.checked)}/> Show my name and photo on this post</label>}
      </header>

      {story.images?.length > 0 && <section className="post-gallery" aria-label="Story photos">
        {story.images.map(image => <figure key={image.id}>
          <PostImage image={image} story={story} className="story-detail-post-image" sizes="(max-width: 720px) 100vw, 860px"/>
          <figcaption>{image.altText && <span>{image.altText}</span>}<span>{image.credit || 'Photo credit not provided'}{image.licence ? ` · ${image.licence}` : ''}</span></figcaption>
        </figure>)}
      </section>}

      <section className="panel story-detail-original"><h2>{t('feed.original').replace('{language}', story.originalLanguage || t('feed.translation'))}</h2><AudioPlayer story={story} privateAudio={privateAudio}/><p className="story-text">{story.text || 'No written text provided.'}</p>{showMachineTranslation && <ReadInMyLanguage text={story.text} sourceLanguage={story.originalLanguage}/>}</section>

      <section className="panel story-detail-documentation">
        <h2>Documentation</h2>
        {story.people && <p><b>People:</b> {story.people}</p>}
        {story.region && <p><b>Region:</b> {story.region}</p>}
        {story.tags?.length > 0 && <p><b>Tags:</b> {story.tags.join(', ')}</p>}
        {story.sources?.length > 0 && <div><h3>Sources</h3><ul>{story.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label || source.url}</a></li>)}</ul></div>}
        {story.licence && <p><b>Licence:</b> {story.licence}</p>}
        <p>{whoCanSee}</p>
      </section>

      {String(story.translation || '').trim() && <section className="panel translation-panel story-detail-translation">
        <h2>{story.translationLanguage ? t('feed.translationByAuthor').replace('{language}', story.translationLanguage) : t('feed.translationByAuthorNoLanguage')}</h2>
        <p className="notice">{story.translationChecked ? `Checked by ${story.checkedBy} (self-reported)` : 'Not yet checked by a speaker of this language'}</p>
        <p className="translation-credit">{translationOriginLabel(story.translationOrigin)} · Original story remains available above.</p>
        <p className="story-text">{story.translation}</p>
      </section>}

      {story.versionLog?.length > 0 && <section className="panel story-record"><h2>Story record</h2><p>SHA-256 fingerprints let readers compare versions available in this proof of concept.</p>{story.versionLog.map((version, index) => <article key={`${version.timestamp}-${index}`}><div><b>{version.change}</b><span>{version.language}</span><time dateTime={version.timestamp}>{new Date(version.timestamp).toLocaleString()}</time></div><code>{version.fingerprint}</code></article>)}</section>}
    </article>
  </main>;
}
