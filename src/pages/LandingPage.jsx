// Landing page. Owner: Claude (see docs/COLLAB.md).
// Props contract with StoryBridgeController (do not rename without updating both):
//   onListen, onShare, onObjects, onSignIn, showSignIn, repoUrl
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BridgeMark, Wordmark } from '../Brand.jsx';
import { OBJECT_RECORDS } from '../object-records.js';
import { SHOWCASE, REGIONS } from '../data/showcase.js';
import AFRICA_IMAGES from '../data/africa-images.json';
import { LANGUAGES, UI_LANGUAGES } from '../lib/languages.js';
import { useUiLanguage } from '../lib/i18n.js';
import '../styles/components/home.css';

const SLIDE_MS = 7000;
const FIRST_SLIDE_MS = 12000; // Table Mountain opens the page and stays a little longer.

function imageFor(item) {
  const fetched = AFRICA_IMAGES[item.id];
  if (fetched) return fetched;
  if (item.local) return { ...item.local, srcset: '' };
  return null;
}

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return undefined;
    const update = () => setReduced(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function Credit({ image, t }) {
  if (!image) return null;
  return <span className="home-credit">{t('photo')}: <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.author}</a>, {image.licenceUrl ? <a href={image.licenceUrl} target="_blank" rel="noreferrer">{image.licence}</a> : image.licence}</span>;
}

function CountUp({ value, reduced }) {
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced || value === 0) { setShown(value); return undefined; }
    let frame; const start = performance.now();
    const step = now => { const progress = Math.min(1, (now - start) / 900); setShown(Math.round(value * (1 - Math.pow(1 - progress, 3)))); if (progress < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <>{shown}</>;
}

function Hero({ t, onListen, onShare, reduced }) {
  const slides = useMemo(() => SHOWCASE.filter(item => item.hero).map(item => ({ item, image: imageFor(item) })).filter(slide => slide.image), []);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const running = !paused && !hovering && !reduced && slides.length > 1;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setTimeout(() => setIndex(value => (value + 1) % slides.length), index === 0 ? FIRST_SLIDE_MS : SLIDE_MS);
    return () => clearTimeout(timer);
  }, [running, slides.length, index]);
  const current = slides[index];
  return <section className="home-hero" aria-labelledby="home-hero-title" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onFocus={() => setHovering(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovering(false); }}>
    <div className="home-hero-media" aria-hidden="true">
      {slides.length === 0 && <div className="home-hero-fallback"/>}
      {slides.map((slide, slideIndex) => <img key={slide.item.id} className={slideIndex === index ? 'is-active' : ''} src={slide.image.src} srcSet={slide.image.srcset || undefined} sizes="100vw" width={slide.image.width} height={slide.image.height} alt="" loading={slideIndex === 0 ? 'eager' : 'lazy'} fetchpriority={slideIndex === 0 ? 'high' : undefined} decoding="async"/>)}
    </div>
    <div className="home-hero-shade" aria-hidden="true"/>
    <div className="home-hero-inner">
      <p className="home-eyebrow home-eyebrow-light">{t('hero.eyebrow')}</p>
      <h1 id="home-hero-title">{t('hero.title')}</h1>
      <p className="home-hero-lede">{t('hero.lede')}</p>
      <div className="home-actions">
        <button type="button" className="home-btn home-btn-gold" onClick={onListen}>{t('hero.explore')}</button>
        <button type="button" className="home-btn home-btn-ghost" onClick={onShare}>{t('hero.share')}</button>
      </div>
    </div>
    {current && <div className="home-hero-caption">
      <p aria-live="polite"><strong>{current.item.subject}</strong> · {current.item.country}</p>
      <Credit image={current.image} t={t}/>
      {slides.length > 1 && <div className="home-hero-controls">
        {!reduced && <button type="button" className="home-icon-btn" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? t('hero.play') : t('hero.pause')}>{paused ? '▶' : '❚❚'}</button>}
        <div className="home-dots" role="group" aria-label={t('photo')}>
          {slides.map((slide, slideIndex) => <button type="button" key={slide.item.id} className={slideIndex === index ? 'is-active' : ''} aria-label={`${slide.item.subject}, ${slide.item.country}`} aria-current={slideIndex === index} onClick={() => setIndex(slideIndex)}/>)}
        </div>
      </div>}
    </div>}
  </section>;
}

function LanguageMarquee({ reduced }) {
  const names = LANGUAGES.map(language => language.nativeName);
  return <div className={`home-marquee ${reduced ? 'is-static' : ''}`} aria-hidden="true">
    <div className="home-marquee-track">{[...names, ...names].map((name, index) => <span key={index}>{name}</span>)}</div>
  </div>;
}

function Cultures({ t, onShare }) {
  const [region, setRegion] = useState('all');
  const items = SHOWCASE.filter(item => region === 'all' || item.region === region);
  return <section className="home-section home-reveal" aria-labelledby="home-cultures-title" id="cultures">
    <div className="home-heading">
      <p className="home-eyebrow">{t('cultures.eyebrow')}</p>
      <h2 id="home-cultures-title">{t('cultures.title')}</h2>
      <p className="home-lede">{t('cultures.lede')}</p>
    </div>
    <div className="home-chips" role="group" aria-label={t('cultures.eyebrow')}>
      <button type="button" aria-pressed={region === 'all'} onClick={() => setRegion('all')}>Africa</button>
      {REGIONS.map(name => <button type="button" key={name} aria-pressed={region === name} onClick={() => setRegion(name)}>{name}</button>)}
    </div>
    <ul className="home-culture-grid">
      {items.map(item => { const image = imageFor(item); return <li key={item.id} className="home-culture-card">
        <div className={`home-culture-media ${image ? '' : 'is-empty'}`} data-region={item.region}>
          {image ? <img src={image.src} srcSet={image.srcset || undefined} sizes="(max-width: 700px) 85vw, 360px" width={image.width} height={image.height} alt={`${item.subject}, ${item.country}`} loading="lazy" decoding="async"/> : <span aria-hidden="true">{item.culture.slice(0, 1)}</span>}
        </div>
        <div className="home-culture-body">
          <p className="home-culture-meta">{item.country} · {item.region}</p>
          <h3>{item.culture}</h3>
          <p>{item.subject}</p>
          {image && <Credit image={image} t={t}/>}
          <button type="button" className="home-link" onClick={onShare}>{t('cultures.cta')} →</button>
        </div>
      </li>; })}
    </ul>
  </section>;
}

function Live({ t, reduced, onListen }) {
  const [state, setState] = useState({ status: 'loading', stories: [] });
  useEffect(() => {
    let active = true;
    fetch('/api/stories').then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then(stories => { if (active) setState({ status: 'ready', stories: Array.isArray(stories) ? stories : [] }); })
      .catch(() => { if (active) setState({ status: 'error', stories: [] }); });
    return () => { active = false; };
  }, []);
  if (state.status === 'error') return null;
  const { stories } = state;
  const languages = new Set(stories.map(story => String(story.originalLanguage || '').trim().toLowerCase()).filter(Boolean));
  const latest = stories.slice(0, 3);
  return <section className="home-section home-live home-reveal" aria-labelledby="home-live-title" aria-busy={state.status === 'loading'}>
    <div className="home-heading"><p className="home-eyebrow"><span className="home-pulse" aria-hidden="true"/>{t('live.eyebrow')}</p><h2 id="home-live-title" className="home-visually-hidden">{t('live.eyebrow')}</h2></div>
    {state.status === 'ready' && stories.length === 0 ? <p className="home-live-empty">{t('live.empty')}</p> : <>
      <dl className="home-stats">
        <div><dt>{t('live.stories')}</dt><dd><CountUp value={stories.length} reduced={reduced}/></dd></div>
        <div><dt>{t('live.languages')}</dt><dd><CountUp value={languages.size} reduced={reduced}/></dd></div>
      </dl>
      {latest.length > 0 && <div className="home-latest"><h3>{t('live.latest')}</h3><ul>{latest.map(story => <li key={story.id}><button type="button" onClick={onListen}><span className="home-badge">{story.originalLanguage}</span><span>{story.title || String(story.text || '').slice(0, 90)}</span>{story.region && <small>{story.region}</small>}</button></li>)}</ul></div>}
    </>}
  </section>;
}

export default function Landing({ onListen, onShare, onObjects, onSignIn, showSignIn = true, repoUrl }) {
  const { lang, t, setLanguage, status } = useUiLanguage();
  const reduced = usePrefersReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const nodes = rootRef.current?.querySelectorAll('.home-reveal') || [];
    if (reduced || !('IntersectionObserver' in window)) { nodes.forEach(node => node.classList.add('is-visible')); return undefined; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: 0.08 });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [reduced]);

  const run = action => { setMenuOpen(false); action?.(); };
  const scrollTo = id => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); };
  const shownImages = SHOWCASE.map(item => ({ item, image: imageFor(item) })).filter(entry => entry.image);

  return <div className="home" ref={rootRef}>
    <a className="home-skip" href="#home-main">Skip to content</a>
    <header className={`home-header ${scrolled ? 'is-solid' : ''}`}>
      <a className="home-brand" href="#top" aria-label="Story Bridge home"><Wordmark light={!scrolled}/></a>
      <button type="button" className="home-menu-toggle" aria-expanded={menuOpen} aria-controls="home-nav" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? t('nav.close') : t('nav.menu')}</button>
      <nav id="home-nav" className={menuOpen ? 'is-open' : ''} aria-label="Main">
        <button type="button" onClick={() => run(onListen)}>{t('nav.explore')}</button>
        <button type="button" onClick={() => scrollTo('cultures')}>{t('nav.cultures')}</button>
        <button type="button" onClick={() => run(onObjects)}>{t('nav.collections')}</button>
        <label className="home-lang"><span className="home-visually-hidden">{t('nav.language')}</span>
          <select value={lang} onChange={event => setLanguage(event.target.value)} aria-label={t('nav.language')}>
            {UI_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.nativeName}{language.uiStatus === 'machine' ? ' •' : ''}</option>)}
          </select>
        </label>
        {showSignIn && <button type="button" className="home-btn home-btn-small" onClick={() => run(onSignIn)}>{t('nav.signIn')}</button>}
      </nav>
    </header>
    {status === 'machine' && <p className="home-machine-notice" role="note">{t('machine.notice')}</p>}

    <main id="home-main">
      <div id="top"/>
      <Hero t={t} onListen={onListen} onShare={onShare} reduced={reduced}/>
      <LanguageMarquee reduced={reduced}/>

      <section className="home-section home-reveal" aria-labelledby="home-how-title">
        <div className="home-heading"><p className="home-eyebrow">{t('how.eyebrow')}</p><h2 id="home-how-title">{t('how.title')}</h2></div>
        <ol className="home-steps">
          {[1, 2, 3].map(step => <li key={step}><span className="home-step-number">0{step}</span><h3>{t(`how.s${step}t`)}</h3><p>{t(`how.s${step}`)}</p></li>)}
        </ol>
      </section>

      <Cultures t={t} onShare={onShare}/>
      <Live t={t} reduced={reduced} onListen={onListen}/>

      <section className="home-section home-collection home-reveal" aria-labelledby="home-collection-title">
        <div className="home-heading home-heading-row">
          <div><p className="home-eyebrow">{t('collections.eyebrow')}</p><h2 id="home-collection-title">{t('collections.title')}</h2><p className="home-lede">{t('collections.lede')}</p></div>
          <button type="button" className="home-btn home-btn-outline" onClick={onObjects}>{t('collections.browse')}</button>
        </div>
        <ul className="home-objects">{OBJECT_RECORDS.map(record => <li key={record.id}><button type="button" onClick={onObjects}><img src={record.image} alt="" loading="lazy" decoding="async"/><span>{record.title}</span></button></li>)}</ul>
      </section>

      <section className="home-section home-languages home-reveal" aria-labelledby="home-languages-title">
        <div className="home-heading"><p className="home-eyebrow">{t('langs.eyebrow')}</p><h2 id="home-languages-title">{t('langs.title')}</h2><p className="home-lede">{t('langs.lede')}</p></div>
        <ul className="home-language-list">{LANGUAGES.map(language => <li key={language.code} lang={language.code} dir={language.dir} title={language.name}>{language.nativeName}{language.uiStatus === 'machine' && <span className="home-dot" aria-label="machine translated interface"/>}</li>)}</ul>
      </section>

      <section className="home-section home-rights home-reveal" aria-labelledby="home-rights-title">
        <div className="home-rights-mark" aria-hidden="true"><BridgeMark/></div>
        <div>
          <p className="home-eyebrow">{t('rights.eyebrow')}</p><h2 id="home-rights-title">{t('rights.title')}</h2>
          <div className="home-rights-grid">{[1, 2, 3].map(item => <article key={item}><h3>{t(`rights.c${item}t`)}</h3><p>{t(`rights.c${item}`)}</p></article>)}</div>
        </div>
      </section>
    </main>

    <footer className="home-footer">
      <Wordmark light/>
      <p>{t('footer.tagline')}</p>
      <details className="home-credits">
        <summary>{t('footer.credits')}</summary>
        <ul>{shownImages.map(({ item, image }) => <li key={item.id}>{item.subject}, {item.country} — <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.title || 'source'}</a> · {image.author} · {image.licence}</li>)}
          {OBJECT_RECORDS.map(record => <li key={record.id}>{record.title} — {record.credit}</li>)}</ul>
      </details>
      {repoUrl && <a href={repoUrl} target="_blank" rel="noreferrer">{t('footer.github')}</a>}
    </footer>
  </div>;
}
