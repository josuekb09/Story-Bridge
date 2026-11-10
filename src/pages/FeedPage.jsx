import { useMemo, useState } from 'react';
import AudioPlayer from '../components/AudioPlayer.jsx';
import ReadInMyLanguage from '../components/ReadInMyLanguage.jsx';
import { translationOriginLabel } from '../lib/i18n.js';
import { CULTURAL_GROUP_RECORD } from '../object-records.js';
import { SHOWCASE } from '../data/showcase.js';
import AFRICA_IMAGES from '../data/africa-images.json';
import '../styles/components/social.css';
import '../styles/components/cultures.css';

const PAGE_SIZE = 10;

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase() : '·';
}

function timeAgo(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return format.format(0, 'minute');
}

function PostCard({ story, showStory, translationStoryId, setTranslationStoryId }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const author = story.storytellerName || 'Community member';
  const text = story.text || '';
  const long = text.length > 280;
  const showingTranslation = translationStoryId === story.id;
  const images = story.images || [];

  async function share() {
    const title = story.title || 'A story on Story Bridge';
    const url = new URL(`/stories/${encodeURIComponent(story.id)}`, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title, text: `${title} — Story Bridge`, url });
      else { await navigator.clipboard.writeText(`${title} — ${url}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* the reader closed the share sheet */ }
  }

  return <article className="post" aria-labelledby={`post-title-${story.id}`}>
    <header className="post-head">
      <span className="post-avatar" aria-hidden="true">{initials(author)}</span>
      <div className="post-who">
        <b>{author}</b>
        <span>{[story.region, timeAgo(story.createdAt)].filter(Boolean).join(' · ')}</span>
      </div>
      <span className="post-lang" title="Original language">{story.originalLanguage}</span>
    </header>

    <p className="post-trust">{story.trustLabel || 'Told by a community member'}</p>
    {story.title && <h2 id={`post-title-${story.id}`} className="post-title">{story.title}</h2>}

    {text && <p className={`post-text ${expanded || !long ? '' : 'is-clamped'}`}>{text}</p>}
    {text && <ReadInMyLanguage text={story.text} sourceLanguage={story.originalLanguage}/>}
    {long && <button type="button" className="post-more" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'See less' : 'See more'}</button>}
    {!text && !story.audio && !images.length && <p className="post-text muted">No written text.</p>}

      {images.length > 0 && <div className={`post-images count-${Math.min(images.length, 4)}`}>
      {images.slice(0, 4).map(image => <figure key={image.id}><img src={image.url} alt={image.altText || ''} loading="lazy" decoding="async" width={image.width || 640} height={image.height || 480}/></figure>)}
    </div>}

    {story.audio && <div className="post-audio"><AudioPlayer story={story}/></div>}

    {showingTranslation && story.translation && <div className="post-translation">
      <p className="post-translation-label">{story.translationLanguage} · {translationOriginLabel(story.translationOrigin)}{!story.translationChecked && ' · not checked by a speaker'}</p>
      <p>{story.translation}</p>
      <ReadInMyLanguage text={story.translation} sourceLanguage={story.translationLanguage}/>
    </div>}

    <footer className="post-actions">
      <a className="post-read" href={`/stories/${encodeURIComponent(story.id)}`} onClick={event => { event.preventDefault(); showStory(story); }}>📖 Read</a>
      {story.translation && <button type="button" aria-pressed={showingTranslation} onClick={() => setTranslationStoryId(value => value === story.id ? '' : story.id)}>🌍 {showingTranslation ? 'Original' : 'Translation'}</button>}
      <button type="button" onClick={share}>{copied ? '✓ Copied' : '↗ Share'}</button>
    </footer>
  </article>;
}

export default function FeedPage({ accountConfig, visibleStories, languageFilter, setLanguageFilter, regionFilter, setRegionFilter, audioOnly, setAudioOnly, listState, listErrors, retryList, filteredStories, navigate, translationStoryId, setTranslationStoryId, showStory, transitionTo, signedIn = false, onCulture = () => {} }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const languages = useMemo(() => [...new Set(visibleStories.map(story => story.originalLanguage).filter(Boolean))], [visibleStories]);
  const regions = useMemo(() => [...new Set(visibleStories.map(story => story.region).filter(Boolean))], [visibleStories]);
  const cultures = SHOWCASE.slice(0, 6);
  const share = () => navigate('share');

  return <main className="social-main feed-layout">
    <div className="feed-column">
      <h1 className="feed-title">{accountConfig.account ? 'Discover' : 'Listen'}</h1>

      <button type="button" className="composer" onClick={share}>
        <span className="post-avatar" aria-hidden="true">✎</span>
        <span className="composer-prompt">Share something from your culture…</span>
        <span className="composer-cta">Post</span>
      </button>

      <div className="feed-chips" role="group" aria-label="Filter by language">
        <button type="button" aria-pressed={languageFilter === 'all'} onClick={() => setLanguageFilter('all')}>All languages</button>
        {languages.map(language => <button type="button" key={language} aria-pressed={languageFilter === language} onClick={() => setLanguageFilter(language)}>{language}</button>)}
        <button type="button" aria-pressed={audioOnly} onClick={() => setAudioOnly(value => !value)}>🎧 With audio</button>
        {regions.length > 0 && <label className="feed-region"><span className="home-visually-hidden">Region</span><select value={regionFilter} onChange={event => setRegionFilter(event.target.value)}><option value="all">All regions</option>{regions.map(region => <option key={region}>{region}</option>)}</select></label>}
      </div>

      {listState.stories === 'loading' && <div aria-busy="true">{[0, 1, 2].map(index => <div className="post skeleton" key={index}><div className="skeleton-line short"/><div className="skeleton-line wide"/><div className="skeleton-line"/></div>)}<p className="home-visually-hidden" role="status">Loading stories…</p></div>}
      {listState.stories === 'error' && <section className="panel" role="alert"><p>{listErrors.stories}</p><button className="secondary" onClick={() => retryList('stories')}>Try again</button></section>}

      {listState.stories === 'ready' && filteredStories.length === 0 && <section className="feed-empty">
        <p className="feed-empty-mark" aria-hidden="true">🌍</p>
        <h2>{visibleStories.length ? 'No stories match these filters.' : 'The first stories are waiting to be told.'}</h2>
        <p>{visibleStories.length ? 'Try another language or region.' : 'Share something from your culture: a proverb, a recipe, a song, an object, a place.'}</p>
        {visibleStories.length ? <button className="secondary" onClick={() => { setLanguageFilter('all'); setRegionFilter('all'); setAudioOnly(false); }}>Clear filters</button> : <button className="primary" onClick={share}>Share the first story</button>}
      </section>}

      {listState.stories === 'ready' && filteredStories.length > 0 && <>
        <div className="feed-list">{filteredStories.slice(0, shown).map(story => <PostCard key={story.id} story={story} showStory={showStory} translationStoryId={translationStoryId} setTranslationStoryId={setTranslationStoryId}/>)}</div>
        {shown < filteredStories.length ? <button type="button" className="secondary feed-more" onClick={() => setShown(value => value + PAGE_SIZE)}>Show more stories</button> : <p className="feed-end">You're all caught up ✓</p>}
      </>}
    </div>

    <aside className="feed-side" aria-label="Explore">
      <section className="side-card">
        <h2>Explore cultures</h2>
        <ul className="side-cultures">{cultures.map(item => { const image = AFRICA_IMAGES[item.id] || item.local; return <li key={item.id}><button type="button" onClick={() => onCulture(item.id)}>{image ? <img src={image.src} width={46} height={46} alt="" loading="lazy" decoding="async"/> : <span className="side-culture-fallback" aria-hidden="true">{item.culture.slice(0, 1)}</span>}<span><b>{item.culture}</b><small>{item.country}</small></span></button></li>; })}</ul>
      </section>
      <section className="side-card">
        <h2>Collections</h2>
        <p className="muted">Museum records of objects, kept separate from community stories.</p>
        <button className="secondary" onClick={() => navigate('objects')}>Browse objects</button>
        <button className="text-button" onClick={() => transitionTo('group-record')}>{CULTURAL_GROUP_RECORD.title}</button>
      </section>
      {!signedIn && accountConfig.account && <section className="side-card side-join"><h2>Join Story Bridge</h2><p>Post in your language. Read others in yours.</p><button className="primary" onClick={share}>Get started</button></section>}
    </aside>
  </main>;
}
