// "Read in my language" — reader-side machine translation with no server and no API key.
// Owner: Claude (see docs/COLLAB.md).
// 1. Chrome's built-in Translator API (on-device, free; the language pack downloads once).
// 2. Fallback: open the text in Google Translate in a new tab.
// Both are labelled as machine translation, never saved, and never replace the original.
import { useEffect, useRef, useState } from 'react';
import { findLanguage, LANGUAGES } from '../lib/languages.js';
import { useUiLanguage } from '../lib/i18n.js';

const MAX_CHARS = 5000;

// Map a story language label ("English", "Tshiluba", "fr") to a BCP-47 code when we know it.
export function languageCode(label) {
  if (!label) return '';
  const value = String(label).trim().toLowerCase();
  const hit = LANGUAGES.find(l => l.code === value || l.name.toLowerCase() === value || l.nativeName.toLowerCase() === value);
  return hit ? hit.code : '';
}

function hasBuiltInTranslator() {
  return typeof window !== 'undefined' && 'Translator' in window && typeof window.Translator?.create === 'function';
}

export default function ReadInMyLanguage({ text, sourceLanguage, className = '' }) {
  const { lang: uiLang, t } = useUiLanguage();
  const target = findLanguage(uiLang) || findLanguage('en');
  // t() returns the key itself when a locale has no entry; fall back to English copy then.
  const tr = (key, fallback) => { const value = t(key); return !value || value === key ? fallback : value.replace('{language}', target.nativeName); };
  const source = languageCode(sourceLanguage);
  const [state, setState] = useState('idle'); // idle | checking | downloading | translating | done | unsupported | error
  const [output, setOutput] = useState('');
  const translator = useRef(null);
  const sameLanguage = source && source === target.code;

  useEffect(() => { setState('idle'); setOutput(''); translator.current = null; }, [text, target.code]);

  if (!text || sameLanguage) return null;

  const googleUrl = `https://translate.google.com/?sl=${encodeURIComponent(source || 'auto')}&tl=${encodeURIComponent(target.code)}&op=translate&text=${encodeURIComponent(String(text).slice(0, MAX_CHARS))}`;

  async function translate() {
    if (!hasBuiltInTranslator()) { setState('unsupported'); return; }
    try {
      setState('checking');
      const options = { sourceLanguage: source || 'en', targetLanguage: target.code };
      const availability = await window.Translator.availability(options);
      if (availability === 'unavailable') { setState('unsupported'); return; }
      if (availability !== 'available') setState('downloading');
      translator.current = translator.current || await window.Translator.create({ ...options, monitor(m) { m.addEventListener('downloadprogress', () => setState('downloading')); } });
      setState('translating');
      const result = await translator.current.translate(String(text).slice(0, MAX_CHARS));
      setOutput(result);
      setState('done');
    } catch (error) {
      console.warn('read-in-my-language', error?.name || error);
      setState('unsupported');
    }
  }

  const label = tr('readInMyLanguage', `Read in ${target.nativeName}`);

  return <div className={`read-in-language ${className}`.trim()} lang={state === 'done' ? target.code : undefined} dir={state === 'done' ? target.dir : undefined}>
    {state === 'idle' && <button type="button" className="text-button" onClick={translate}>🌐 {label}</button>}
    {(state === 'checking' || state === 'translating') && <p className="muted" role="status">{tr('translating', 'Translating…')}</p>}
    {state === 'downloading' && <p className="muted" role="status">{tr('downloadingLanguagePack', `Downloading the ${target.nativeName} language pack (once)…`)}</p>}
    {state === 'done' && <div className="read-in-language-output">
      <p className="post-translation-label">{target.nativeName} · {tr('machineTranslationLabel', 'Machine translation, not checked by a speaker')}</p>
      <p>{output}</p>
      <button type="button" className="text-button" onClick={() => { setState('idle'); setOutput(''); }}>{tr('showOriginal', 'Show original')}</button>
    </div>}
    {(state === 'unsupported' || state === 'error') && <p className="muted">
      <a href={googleUrl} target="_blank" rel="noreferrer noopener">🌐 {tr('openInGoogleTranslate', `Open in Google Translate (${target.nativeName})`)}</a>
      {' · '}<span>{tr('machineTranslationLabel', 'Machine translation, not checked by a speaker')}</span>
    </p>}
  </div>;
}
