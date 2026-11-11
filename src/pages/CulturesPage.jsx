// Cultures directory (/cultures) and culture page (/cultures/:id).
// Owner: Claude (see docs/COLLAB.md). Self-contained: it reads and updates its own URL,
// so the controller only needs to render it for any path that starts with /cultures.
// Text here is limited to place, country, region and the photo's subject; nothing about
// beliefs or meanings is invented. Community stories carry that knowledge.
import { useEffect, useMemo, useState } from 'react';
import AuthorAvatar, { authorName } from '../components/AuthorAvatar.jsx';
import { SHOWCASE, REGIONS } from '../data/showcase.js';
import AFRICA_IMAGES from '../data/africa-images.json';
import { COUNTRY_LANGUAGES } from '../data/country-languages.js';
import { findLanguage } from '../lib/languages.js';
import '../styles/components/cultures.css';

function imageFor(item) {
  return AFRICA_IMAGES[item.id] || (item.local ? { ...item.local, srcset: '' } : null);
}

function idFromPath() {
  const match = window.location.pathname.match(/^\/cultures\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

const normalise = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// A story belongs to a culture when its region, tags, people or title name the culture
// (country alone is too broad). This is a client-side match until stories carry an explicit culture field.
export function storiesForCulture(item, stories = []) {
  const needles = [item.culture].map(normalise).filter(Boolean)
    .flatMap(value => value.split(/\s*(?:\(|\)|,| and )\s*/)).filter(value => value.length > 2);
  return stories.filter(story => {
    const tags = Array.isArray(story.tags) ? story.tags.join(' ') : story.tags;
    const haystack = normalise([story.region, tags, story.people, story.title, story.culture, story.country].filter(Boolean).join(' '));
    return needles.some(needle => haystack.includes(needle));
  });
}

export function cultureHref(id) { return `/cultures/${encodeURIComponent(id)}`; }

function Credit({ image }) {
  if (!image) return null;
  return <p className="culture-credit">Photo: <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.author}</a> · {image.licenceUrl ? <a href={image.licenceUrl} target="_blank" rel="noreferrer">{image.licence}</a> : image.licence}</p>;
}

function CultureCard({ item, open }) {
  const image = imageFor(item);
  return <li className="culture-card">
    <a href={cultureHref(item.id)} onClick={event => { event.preventDefault(); open(item.id); }}>
      <div className={`culture-card-media${image ? '' : ' is-empty'}`} data-region={item.region}>
        {image ? <img src={image.src} srcSet={image.srcset || undefined} sizes="(max-width: 700px) 92vw, 340px" width={image.width} height={image.height} alt={`${item.subject}, ${item.country}`} loading="lazy" decoding="async"/> : <span aria-hidden="true">{item.culture.slice(0, 1)}</span>}
      </div>
      <div className="culture-card-body">
        <p className="culture-meta">{item.country} · {item.region}</p>
        <h2>{item.culture}</h2>
        <p>{item.subject}</p>
      </div>
    </a>
  </li>;
}

function CultureDetail({ item, stories, showStory, navigate, back }) {
  const image = imageFor(item);
  const related = useMemo(() => storiesForCulture(item, stories), [item, stories]);
  const neighbours = SHOWCASE.filter(other => other.region === item.region && other.id !== item.id).slice(0, 4);
  useEffect(() => { document.title = `${item.culture} — Story Bridge`; }, [item]);
  return <article className="culture-detail" aria-labelledby="culture-title">
    <button type="button" className="back" onClick={back}>← All cultures</button>
    <header className={`culture-hero${image ? '' : ' is-empty'}`}>
      {image && <img src={image.src} srcSet={image.srcset || undefined} sizes="100vw" width={image.width} height={image.height} alt={`${item.subject}, ${item.country}`} decoding="async" fetchPriority="high"/>}
      <div className="culture-hero-text">
        <p className="culture-meta">{item.country} · {item.region}</p>
        <h1 id="culture-title">{item.culture}</h1>
        <p>{item.subject}</p>
      </div>
    </header>
    <Credit image={image}/>

    <section className="culture-section" aria-labelledby="culture-about">
      <h2 id="culture-about">About</h2>
      <p className="culture-undocumented"><b>Not yet documented — add what you know.</b> We only publish cultural knowledge that comes from people of this culture or from sources we can cite; we do not invent facts. Share a story, a word, a song, an object or a place.</p>
      <button type="button" className="primary" onClick={() => navigate('share')}>Share a story about {item.culture}</button>
    </section>

    {(COUNTRY_LANGUAGES[item.countryCode] || []).length > 0 && <section className="culture-section" aria-labelledby="culture-languages">
      <h2 id="culture-languages">Languages of {item.country}</h2>
      <p className="muted">Stories can be told in any of these. Tap one to look for stories in that language.</p>
      <div className="cultures-chips culture-languages">{COUNTRY_LANGUAGES[item.countryCode].map(findLanguage).filter(Boolean).map(language => <a key={language.code} href={`/search?q=${encodeURIComponent(language.name)}`} lang={language.code}>{language.nativeName}</a>)}</div>
    </section>}

    <section className="culture-section" aria-labelledby="culture-stories">
      <h2 id="culture-stories">Stories {related.length > 0 && <span className="culture-count">{related.length}</span>}</h2>
      {related.length === 0
        ? <p className="muted">No public story mentions {item.culture} yet. Yours could be the first.</p>
        : <ul className="culture-stories">{related.map(story => <li key={story.id}><button type="button" onClick={() => showStory(story)}>
            {story.images?.[0]?.url && <img className="culture-story-thumb" src={story.images[0].url} alt="" loading="lazy" decoding="async"/>}<span className="culture-story-author"><AuthorAvatar story={story} size="small"/><span>{authorName(story)}</span></span><span className="culture-story-lang">{story.originalLanguage}</span>
            <span className="culture-story-title">{story.title || String(story.text || '').slice(0, 90)}</span>
            {story.region && <small>{story.region}</small>}
          </button></li>)}</ul>}
    </section>

    {neighbours.length > 0 && <section className="culture-section" aria-labelledby="culture-more">
      <h2 id="culture-more">More from {item.region}</h2>
      <ul className="culture-grid culture-grid-small">{neighbours.map(other => <CultureCard key={other.id} item={other} open={id => window.dispatchEvent(new CustomEvent('story-bridge:open-culture', { detail: id }))}/>)}</ul>
    </section>}
  </article>;
}

export default function CulturesPage({ stories = [], showStory = () => {}, navigate = () => {} }) {
  const [selectedId, setSelectedId] = useState(idFromPath);
  const [region, setRegion] = useState('all');
  const selected = SHOWCASE.find(item => item.id === selectedId) || null;

  useEffect(() => {
    const sync = () => setSelectedId(idFromPath());
    const openFromEvent = event => open(event.detail);
    window.addEventListener('popstate', sync);
    window.addEventListener('story-bridge:open-culture', openFromEvent);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('story-bridge:open-culture', openFromEvent); };
  }, []);

  useEffect(() => { if (!selected) document.title = 'Cultures — Story Bridge'; window.scrollTo?.(0, 0); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function open(id) {
    window.history.pushState({ storyBridgePage: 'cultures' }, '', cultureHref(id));
    setSelectedId(id);
  }
  function back() {
    window.history.pushState({ storyBridgePage: 'cultures' }, '', '/cultures');
    setSelectedId('');
  }

  if (selectedId && selected) return <main className="cultures-main"><CultureDetail item={selected} stories={stories} showStory={showStory} navigate={navigate} back={back}/></main>;

  const items = SHOWCASE.filter(item => region === 'all' || item.region === region);
  return <main className="cultures-main">
    {selectedId && !selected && <p className="panel" role="alert">This culture page does not exist yet. Here are the cultures we have so far.</p>}
    <header className="cultures-head">
      <p className="culture-meta">Cultures of Africa</p>
      <h1>Every country holds many cultures</h1>
      <p className="muted">Open a culture to see the stories people have shared about it — or be the first to add one.</p>
    </header>
    <div className="cultures-chips" role="group" aria-label="Filter by region">
      <button type="button" aria-pressed={region === 'all'} onClick={() => setRegion('all')}>All of Africa</button>
      {REGIONS.map(name => <button type="button" key={name} aria-pressed={region === name} onClick={() => setRegion(name)}>{name}</button>)}
    </div>
    <ul className="culture-grid">{items.map(item => <CultureCard key={item.id} item={item} open={open}/>)}</ul>
    <p className="muted cultures-foot">Is your culture missing? <button type="button" className="text-button" onClick={() => navigate('share')}>Share a story about it</button> and it will start here.</p>
  </main>;
}
