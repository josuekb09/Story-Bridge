// "Read in my language": every reader can read any post in any of the 36 languages.
// Owner: Claude (see docs/COLLAB.md).
// The text is translated by our server (/api/read-translate), so it works in every browser
// and on phones, with no API key and no Chrome-only feature. Output is always labelled as
// machine translation, never saved, and never replaces the original.
import { useEffect, useState } from 'react';
import { findLanguage, LANGUAGES } from '../lib/languages.js';
import { useUiLanguage } from '../lib/i18n.js';

const MAX_CHARS = 5000;

// Map a story language label ("English", "isiZulu", "Tshiluba", "fr") to a code when we know it.
export function languageCode(label) {
  if (!label) return '';
  const value = String(label).trim().toLowerCase();
  const hit = LANGUAGES.find(l => l.code === value || l.name.toLowerCase() === value || l.nativeName.toLowerCase() === value
    || l.name.toLowerCase().replace(/^isi|^si|^chi|^se/, '') === value.replace(/^isi|^si|^chi|^se/, ''));
  return hit ? hit.code : '';
}


// Translate in the reader's own browser first (Google's public endpoint; works from home and
// mobile networks), then fall back to our server. Chunked so long posts work too.
function chunks(text, size = 600) {
  const out = []; let rest = String(text);
  while (rest.length > size) {
    let cut = Math.max(rest.lastIndexOf('\n', size), rest.lastIndexOf('. ', size));
    if (cut < size * 0.4) cut = rest.lastIndexOf(' ', size);
    if (cut < 1) cut = size;
    out.push(rest.slice(0, cut + 1)); rest = rest.slice(cut + 1);
  }
  if (rest) out.push(rest);
  return out;
}
async function translateInBrowser(text, source, target) {
  const parts = [];
  for (const part of chunks(text)) {
    if (!part.trim()) { parts.push(part); continue; }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(source || 'auto')}&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(part)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (!res.ok) throw new Error(`google-${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.[0])) throw new Error('google-shape');
    parts.push(data[0].map(row => row?.[0] || '').join(''));
  }
  const value = parts.join(' ').replace(/ +\n/g, '\n').trim();
  if (!value) throw new Error('empty');
  return value;
}
async function translateOnServer(text, source, target) {
  const res = await fetch('/api/read-translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, source, target }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.translation) throw new Error(data.error || `http-${res.status}`);
  return data.translation;
}

const PREF_KEY = 'story-bridge-read-language';
function savedTarget() { try { return localStorage.getItem(PREF_KEY) || ''; } catch { return ''; } }
function saveTarget(code) { try { localStorage.setItem(PREF_KEY, code); } catch { /* private mode */ } }

function defaultTarget(uiLang, source) {
  const saved = findLanguage(savedTarget());
  if (saved && saved.code !== source) return saved.code;
  const ui = findLanguage(uiLang);
  if (ui && ui.code !== source) return ui.code;
  return source === 'en' ? 'fr' : 'en';
}

export default function ReadInMyLanguage({ text, sourceLanguage, className = '' }) {
  const { lang: uiLang, t } = useUiLanguage();
  const tr = (key, fallback) => {
    if (key === 'showOriginal' && uiLang !== 'en' && uiLang !== 'fr') return fallback;
    const value = t(key);
    return !value || value === key ? fallback : value;
  };
  const source = languageCode(sourceLanguage);
  const [target, setTarget] = useState(() => defaultTarget(uiLang, source));
  const [state, setState] = useState('idle'); // idle | translating | done | error
  const [output, setOutput] = useState('');
  const lang = findLanguage(target) || findLanguage('en');

  useEffect(() => { setState('idle'); setOutput(''); }, [text]);
  useEffect(() => { setTarget(defaultTarget(uiLang, source)); }, [uiLang, source]);

  if (!text || !String(text).trim()) return null;

  const googleUrl = `https://translate.google.com/?sl=${encodeURIComponent(source || 'auto')}&tl=${encodeURIComponent(lang.code)}&op=translate&text=${encodeURIComponent(String(text).slice(0, MAX_CHARS))}`;

  async function translate(code = target) {
    setState('translating');
    const body = String(text).slice(0, MAX_CHARS);
    try {
      let value;
      try { value = await translateInBrowser(body, source, code); }
      catch (first) { console.warn('read-in-my-language: browser route failed, trying server', first?.message); value = await translateOnServer(body, source, code); }
      setOutput(value); setState('done');
    } catch (error) {
      console.warn('read-in-my-language', error?.message || error);
      setState('error');
    }
  }

  function choose(code) { setTarget(code); saveTarget(code); if (state === 'done' || state === 'error') translate(code); }

  const picker = <select className="read-in-language-select" aria-label={tr('readLanguagePicker', 'Language to read in')} value={target} onChange={event => choose(event.target.value)} translate="no">
    {LANGUAGES.filter(l => l.code !== source).map(l => <option key={l.code} value={l.code}>{l.nativeName}{l.nativeName !== l.name ? ` (${l.name})` : ''}</option>)}
  </select>;

  return <div className={`read-in-language ${className}`.trim()}>
    <div className="read-in-language-bar">
      <button type="button" className="read-in-language-button" onClick={() => state === 'done' ? (setState('idle'), setOutput('')) : translate()} disabled={state === 'translating'} aria-expanded={state === 'done'}>
        🌐 {state === 'done' ? tr('showOriginal', 'Hide translation') : state === 'translating' ? tr('translating', 'Translating…') : tr('readIn', 'Read in')}
      </button>
      {picker}
    </div>
    {state === 'done' && <div className="read-in-language-output" lang={lang.code} dir={lang.dir}>
      <p className="post-translation-label">{lang.nativeName} · {tr('machineTranslationLabel', 'Machine translation, not checked by a speaker')}</p>
      <p>{output}</p>
    </div>}
    {state === 'error' && <p className="muted read-in-language-fallback" role="status">
      {tr('translationUnavailable', 'Translation is not available right now.')}{' '}
      <button type="button" className="text-button" onClick={() => translate()}>{tr('tryAgain', 'Try again')}</button>
      {' · '}<a href={googleUrl} target="_blank" rel="noreferrer noopener">{tr('openInGoogleTranslate', 'Open in Google Translate')} ↗</a>
    </p>}
  </div>;
}
