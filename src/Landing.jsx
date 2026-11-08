import React, { useState } from 'react';
import { BridgeMark, Waveform, Wordmark } from './Brand.jsx';

function titleFor(story) {
  const first=(story.text||'A story in the storyteller’s own words').split(/[.!?\n]/)[0].trim();
  return first.length>74?`${first.slice(0,71).trimEnd()}…`:first;
}

export default function Landing({stories=[],onListen,onShare,onOpen,onBrowse,onSignIn,showSignIn=true,repoUrl}) {
  const [menuOpen,setMenuOpen]=useState(false);
  const languages=[...new Set(stories.map(story=>story.originalLanguage).filter(Boolean))];
  const runAction=action=>{setMenuOpen(false);action?.()};
  return <div className="landing page-enter">
    <header className="site-header">
      <a className="site-brand" href="#top" aria-label="Story Bridge home"><Wordmark/></a>
      <button type="button" className="menu-toggle" aria-label={menuOpen?'Close navigation menu':'Open navigation menu'} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={()=>setMenuOpen(value=>!value)}><span aria-hidden="true">{menuOpen?'×':'☰'}</span><span>{menuOpen?'Close':'Menu'}</span></button>
      <nav id="landing-navigation" className={menuOpen?'nav-open':''} aria-label="Landing navigation"><button className="nav-link" onClick={()=>runAction(onListen)}>Listen</button>{showSignIn&&<button className="nav-link" onClick={()=>runAction(onSignIn)}>Sign in</button>}</nav>
    </header>
    <main id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><Wordmark stacked/>
          <h1 id="hero-title">Tell it in your own voice.</h1>
          <p className="hero-lede">Write or record in your language, add a translation if you like, and choose who can hear your story.</p>
          <div className="hero-actions"><button className="primary" onClick={onListen}>Listen to stories</button><button className="secondary" onClick={onShare}>Share your story</button></div>
          <div className="promise-line"><span>Your voice first</span><span>Your consent</span><span>Your story record</span></div>
        </div>
        <figure className="hero-art"><img className="hero-illustration" src="/assets/illustrations/bridge-river.svg" alt=""/><figcaption>Stories travel farther when people can hear them in their own words.</figcaption></figure>
      </section>
      <section className="promise-strip" aria-label="Story Bridge principles"><article><span className="promise-number">01</span><h2>Your voice first</h2><p>Original words and recordings stay at the centre. Translation is always a second layer.</p></article><article><span className="promise-number">02</span><h2>Your consent</h2><p>Nothing becomes public until you review and approve it. You can withdraw it later.</p></article><article><span className="promise-number">03</span><h2>Your story record</h2><p>See when a version changed and check its SHA-256 fingerprint.</p></article></section>
      <section className="how-section"><div className="section-heading"><p className="eyebrow">A simple path</p><h2>How it works</h2></div><div className="steps-grid"><article><span>Tell it</span><h3>Write or record</h3><p>Start in the language and voice that feel like yours.</p></article><article><span>Check it</span><h3>Review and choose</h3><p>Read your story, add an optional translation, and decide who can see it.</p></article><article><span>Carry it</span><h3>Publish with its record</h3><p>Approve it for sharing—or keep it private. Your choice can change later.</p></article></div><BridgeMark className="section-mark"/></section>
      <section className="featured-section" aria-labelledby="featured-title"><div className="section-heading"><div><p className="eyebrow">Fictional demo story</p><h2 id="featured-title">Featured story</h2></div><button className="text-link" onClick={onListen}>Listen to stories</button></div>
        {stories.length? (()=>{const story=stories[0];return <article className="featured-paper"><div className="featured-paper-top"><span className="language-badge">{story.originalLanguage}</span><Waveform/></div><button className="story-title-button" onClick={()=>onOpen(story)}>{titleFor(story)}</button><p className="featured-excerpt story-text">{(story.text||'An audio story, told in its original voice.').split(/[.!?\n]/)[0]}.</p><div className="featured-paper-footer"><span>{story.storytellerName||'Anonymous'} · Original first</span>{story.audio&&<audio controls preload="none" aria-label={`Listen to audio for ${titleFor(story)}`} src={`/api/stories/${story.id}/audio`}/>}<button className="text-link" onClick={()=>onOpen(story)}>Read this story</button></div></article>})():<p className="empty">Community stories will appear here when they are ready to be shared.</p>}
      </section>
      <section className="language-section"><div><p className="eyebrow">Start with a language</p><h2>Browse by language</h2></div><div className="language-chips">{languages.length?languages.map(language=><button key={language} onClick={()=>onBrowse(language)}>{language}<span aria-hidden="true"> ↗</span></button>):<p>New languages are welcome here.</p>}</div></section>
      <section className="peace-section"><div className="peace-symbol"><BridgeMark/></div><div><p className="eyebrow">Why stories matter</p><h2>Peace begins when people can hear one another.</h2><p>Stories make room for memory, belonging and perspective. Story Bridge is a small tool for sharing those voices with care—without asking storytellers to give up control of their words.</p><button className="text-link" onClick={onListen}>Listen with care <span aria-hidden="true">↗</span></button></div></section>
    </main>
    <footer className="site-footer"><Wordmark light/><p>Stories stay under the storyteller’s control.</p><a href={repoUrl} target="_blank" rel="noreferrer">View the project on GitHub</a><span>For judges · A working proof of concept for the Telling African Stories capstone.</span></footer>
  </div>;
}
