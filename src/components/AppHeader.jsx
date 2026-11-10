import { useEffect, useRef, useState } from 'react';
import { Wordmark } from '../Brand.jsx';
import AppIcon from './AppIcon.jsx';
import { UI_LANGUAGES } from '../lib/languages.js';
import { useUiLanguage } from '../lib/i18n.js';

const links = [
  { key: 'discover', label: 'Discover', path: '/discover', icon: 'discover' },
  { key: 'cultures', label: 'Cultures', path: '/cultures', icon: 'cultures' },
  { key: 'objects', label: 'Collections', path: '/objects', icon: 'bookmark' },
  { key: 'share', label: 'Share', path: '/share', icon: 'share' },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase() || '?';
}

function LanguagePicker({ lang, setLanguage, compact = false }) {
  return <label className={`app-language-picker${compact ? ' is-compact' : ''}`}>
    <span className="visually-hidden">Language</span>
    <select value={lang} onChange={event => setLanguage(event.target.value)} aria-label="Language">
      {UI_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.nativeName}{language.uiStatus === 'machine' ? ' •' : ''}</option>)}
    </select>
  </label>;
}

export function AppHeader({ page, signedIn, accountEnabled, adminEnabled = false, profileName, profileAvatar, onNavigate, onSignIn, onSignOut, onSettings }) {
  const { lang, setLanguage } = useUiLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsideClick = event => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutsideClick); document.removeEventListener('keydown', closeOnEscape); };
  }, [menuOpen]);

  function go(event, nextPage) {
    event.preventDefault();
    setMenuOpen(false);
    onNavigate(nextPage);
  }

  const activePage = page === 'listen' || page === 'detail' ? 'discover' : page;
  const avatar = profileAvatar
    ? <img src={profileAvatar} alt="" width="44" height="44" />
    : signedIn ? <span aria-hidden="true">{initials(profileName)}</span> : <AppIcon name="profile"/>;

  return <header className="app-header" aria-label="Story Bridge">
    <a className="app-header-brand" href="/discover" aria-label="Story Bridge — Discover" onClick={event => go(event, 'discover')}><Wordmark/></a>
    <nav className="app-header-primary" aria-label="Primary navigation">
      {links.map(link => <a key={link.key} href={link.path} className={activePage === link.key ? 'is-active' : ''} aria-current={activePage === link.key ? 'page' : undefined} onClick={event => go(event, link.key)}><AppIcon name={link.icon}/><span>{link.label}</span></a>)}
    </nav>
    <div className="app-header-tools">
      <a className={`app-header-icon-link${activePage === 'search' ? ' is-active' : ''}`} href="/search" aria-label="Search" onClick={event => go(event, 'search')}><AppIcon name="search"/></a>
      <LanguagePicker lang={lang} setLanguage={setLanguage}/>
      <div className="app-avatar-menu" ref={menuRef}>
        <button className="app-avatar-button" type="button" aria-label={signedIn ? 'Open profile menu' : 'Open account menu'} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>{avatar}</button>
        {menuOpen && <div className="app-avatar-dropdown">
          {signedIn && <button type="button" onClick={event => go(event, 'profile')}>Profile</button>}
          {(signedIn || !accountEnabled) && <button type="button" onClick={event => go(event, 'mine')}>My stories</button>}
          {signedIn && adminEnabled && <button type="button" onClick={event => go(event, 'admin')}>Admin</button>}
          {signedIn && <>
            <button type="button" onClick={() => { setMenuOpen(false); onNavigate('workspace'); }}>My workspace</button>
            <button type="button" onClick={() => { setMenuOpen(false); onSettings(); }}>Settings</button>
            <button type="button" onClick={() => { setMenuOpen(false); onSignOut(); }}>Sign out</button>
          </>}
          {!signedIn && accountEnabled && <button type="button" onClick={() => { setMenuOpen(false); onSignIn(); }}>Sign in</button>}
          <div className="app-avatar-mobile-language"><LanguagePicker lang={lang} setLanguage={setLanguage} compact/></div>
        </div>}
      </div>
    </div>
  </header>;
}

export function AppMobileNav({ page, onNavigate }) {
  const tabs = [
    { key: 'discover', label: 'Discover', icon: 'discover' },
    { key: 'cultures', label: 'Cultures', icon: 'cultures' },
    { key: 'share', label: 'Share', icon: 'share', featured: true },
    { key: 'mine', label: 'My stories', icon: 'bookmark' },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ];
  const activePage = page === 'listen' || page === 'detail' ? 'discover' : page;
  return <nav className="app-mobile-nav" aria-label="Main navigation">
    {tabs.map(tab => <button key={tab.key} type="button" className={`${activePage === tab.key ? 'is-active ' : ''}${tab.featured ? 'is-featured' : ''}`} aria-current={activePage === tab.key ? 'page' : undefined} onClick={() => onNavigate(tab.key)}><AppIcon name={tab.icon}/><span>{tab.label}</span></button>)}
  </nav>;
}
