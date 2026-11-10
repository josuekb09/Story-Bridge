// Search (/search?q=…). Owner: Claude (see docs/COLLAB.md).
// Client-side search over public stories and the culture showcase; no API change needed.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SHOWCASE } from '../data/showcase.js';
import AFRICA_IMAGES from '../data/africa-images.json';
import { cultureHref } from './CulturesPage.jsx';
import '../styles/components/cultures.css';

const normalise = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const readQuery = () => new URLSearchParams(window.location.search).get('q') || '';

function matches(terms, fields) {
  const haystack = normalise(fields.filter(Boolean).join(' '));
  return terms.every(term => haystack.includes(term));
}

export default function SearchPage({ stories = [], showStory = () => {} }) {
  const [query, setQuery] = useState(readQuery);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); document.title = 'Search — Story Bridge'; }, []);
  useEffect(() => {
    const url = query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search';
    window.history.replaceState(window.history.state, '', url);
  }, [query]);

  const terms = normalise(query).split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    if (!terms.length) return { stories: [], cultures: [] };
    return {
      stories: stories.filter(story => matches(terms, [story.title, story.text, story.region, story.originalLanguage, Array.isArray(story.tags) ? story.tags.join(' ') : story.tags, story.people, story.storytellerName])).slice(0, 30),
      cultures: SHOWCASE.filter(item => matches(terms, [item.culture, item.country, item.region, item.subject])),
    };
  }, [query, stories]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = results.stories.length + results.cultures.length;
  return <main className="cultures-main search-main">
    <h1>Search</h1>
    <form role="search" className="search-form" onSubmit={event => event.preventDefault()}>
      <label htmlFor="search-input" className="visually-hidden">Search stories and cultures</label>
      <input id="search-input" ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search stories, languages, places, cultures…" autoComplete="off" maxLength="120"/>
    </form>

    {!terms.length && <div className="search-hints">
      <p className="muted">Try a language, a place or a culture:</p>
      <div className="cultures-chips">{['Tshiluba', 'isiZulu', 'Kasai', 'Ndebele', 'Lalibela', 'Kente'].map(hint => <button type="button" key={hint} onClick={() => setQuery(hint)}>{hint}</button>)}</div>
    </div>}

    {terms.length > 0 && <p className="muted" role="status" aria-live="polite">{total === 0 ? `No results for “${query.trim()}”.` : `${total} result${total === 1 ? '' : 's'}`}</p>}

    {results.cultures.length > 0 && <section aria-labelledby="search-cultures" className="culture-section">
      <h2 id="search-cultures">Cultures</h2>
      <ul className="search-cultures">{results.cultures.map(item => { const image = AFRICA_IMAGES[item.id] || item.local; return <li key={item.id}><a href={cultureHref(item.id)}>
        {image ? <img src={image.src} alt="" loading="lazy" width="56" height="56"/> : <span className="search-culture-letter" aria-hidden="true">{item.culture.slice(0, 1)}</span>}
        <span><b>{item.culture}</b><small>{item.country} · {item.region}</small></span>
      </a></li>; })}</ul>
    </section>}

    {results.stories.length > 0 && <section aria-labelledby="search-stories" className="culture-section">
      <h2 id="search-stories">Posts</h2>
      <ul className="culture-stories">{results.stories.map(story => <li key={story.id}><button type="button" onClick={() => showStory(story)}>
        <span className="culture-story-lang">{story.originalLanguage}</span>
        <span className="culture-story-title">{story.title || String(story.text || '').slice(0, 90)}</span>
        {story.region && <small>{story.region}</small>}
      </button></li>)}</ul>
    </section>}
  </main>;
}
