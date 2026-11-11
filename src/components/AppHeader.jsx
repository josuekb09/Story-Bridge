import { useEffect, useRef, useState } from 'react';
import { Wordmark } from '../Brand.jsx';
import AppIcon from './AppIcon.jsx';
import { UI_LANGUAGES } from '../lib/languages.js';
import { useUiLanguage } from '../lib/i18n.js';

const links = [
  { key: 'discover', labelKey: 'nav.discover', path: '/discover', icon: 'discover' },
  { key: 'cultures', labelKey: 'nav.cultures', path: '/cultures', icon: 'cultures' },
  { key: 'objects', labelKey: 'nav.collections', path: '/objects', icon: 'bookmark' },
  { key: 'share', labelKey: 'nav.share', path: '/share', icon: 'share' },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase() || '?';
}

function LanguagePicker({ lang, setLanguage, label, compact = false }) {
  return <label className={`app-language-picker${compact ? ' is-compact' : ''}`}>
    <span className="visually-hidden">{label}</span>
    <select value={lang} onChange={event => setLanguage(event.target.value)} aria-label={label}>
      {UI_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.nativeName}{language.uiStatus === 'machine' ? ' •' : ''}</option>)}
    </select>
  </label>;
}

export function AppHeader({ page, signedIn, accountEnabled, adminEnabled = false, profileName, profileAvatar, onNavigate, onSignIn, onSignOut, onSettings }) {
  const { lang, setLanguage, t } = useUiLanguage();
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
    <a className="app-header-brand" href="/discover" aria-label={`Story Bridge — ${t('nav.discover')}`} onClick={event => go(event, 'discover')}><Wordmark/></a>
    <nav className="app-header-primary" aria-label={t('nav.primaryNavigation')}>
      {links.map(link => <a key={link.key} href={link.path} className={activePage === link.key ? 'is-active' : ''} aria-current={activePage === link.key ? 'page' : undefined} onClick={event => go(event, link.key)}><AppIcon name={link.icon}/><span>{t(link.labelKey)}</span></a>)}
    </nav>
    <div className="app-header-tools">
      <a className={`app-header-icon-link${activePage === 'search' ? ' is-active' : ''}`} href="/search" aria-label={t('nav.search')} onClick={event => go(event, 'search')}><AppIcon name="search"/></a>
      <LanguagePicker lang={lang} setLanguage={setLanguage} label={t('nav.language')}/>
      <div className="app-avatar-menu" ref={menuRef}>
        <button className="app-avatar-button" type="button" aria-label={signedIn ? t('nav.openProfileMenu') : t('nav.openAccountMenu')} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>{avatar}</button>
        {menuOpen && <div className="app-avatar-dropdown">
          {signedIn && <button type="button" onClick={event => go(event, 'profile')}>{t('nav.profile')}</button>}
          {(signedIn || !accountEnabled) && <button type="button" onClick={event => go(event, 'mine')}>{t('nav.myStories')}</button>}
          {signedIn && adminEnabled && <button type="button" onClick={event => go(event, 'admin')}>{t('nav.admin')}</button>}
          {signedIn && <>
            <button type="button" onClick={() => { setMenuOpen(false); onNavigate('workspace'); }}>{t('nav.workspace')}</button>
            <button type="button" onClick={() => { setMenuOpen(false); onSettings(); }}>{t('nav.profileSettings')}</button>
            <button type="button" onClick={() => { setMenuOpen(false); onSignOut(); }}>{t('nav.signOut')}</button>
          </>}
          {!signedIn && accountEnabled && <button type="button" onClick={() => { setMenuOpen(false); onSignIn(); }}>{t('nav.signIn')}</button>}
          <div className="app-avatar-mobile-language"><LanguagePicker lang={lang} setLanguage={setLanguage} label={t('nav.language')} compact/></div>
        </div>}
      </div>
    </div>
  </header>;
}

export function AppMobileNav({ page, onNavigate }) {
  const { t } = useUiLanguage();
  const tabs = [
    { key: 'discover', labelKey: 'nav.discover', icon: 'discover' },
    { key: 'cultures', labelKey: 'nav.cultures', icon: 'cultures' },
    { key: 'share', labelKey: 'nav.share', icon: 'share', featured: true },
    { key: 'mine', labelKey: 'nav.myStories', icon: 'bookmark' },
    { key: 'profile', labelKey: 'nav.profile', icon: 'profile' },
  ];
  const activePage = page === 'listen' || page === 'detail' ? 'discover' : page;
  return <nav className="app-mobile-nav" aria-label={t('nav.mainNavigation')}>
    {tabs.map(tab => <button key={tab.key} type="button" className={`${activePage === tab.key ? 'is-active ' : ''}${tab.featured ? 'is-featured' : ''}`} aria-current={activePage === tab.key ? 'page' : undefined} onClick={() => onNavigate(tab.key)}><AppIcon name={tab.icon}/><span>{t(tab.labelKey)}</span></button>)}
  </nav>;
}
