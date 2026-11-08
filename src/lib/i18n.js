import { useEffect, useState } from 'react';
import en from '../locales/en.json';
import { findLanguage, pickUiLanguage } from './languages.js';

// Existing helpers (used by story pages) — keep their behaviour.
export function translationOriginLabel(origin) {
  return origin === 'ai_approved' ? 'AI draft approved by the storyteller' : 'Written by the storyteller';
}

export function browserLanguage() {
  return (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').toLowerCase();
}

// Interface translation. English is bundled; other locales load on demand so a
// visitor on mobile data only downloads the language they chose.
const loaders = import.meta.glob('../locales/*.json', { import: 'default' });
const cache = { en };
const STORAGE_KEY = 'story-bridge-ui-language';
const listeners = new Set();

function storedLanguage() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

function initialLanguage() {
  const stored = storedLanguage();
  if (stored && findLanguage(stored)) return findLanguage(stored).code;
  const preferences = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return pickUiLanguage(preferences);
}

let current = typeof window === 'undefined' ? 'en' : initialLanguage();

async function load(code) {
  if (cache[code]) return cache[code];
  const loader = loaders[`../locales/${code}.json`];
  if (!loader) return en;
  try { cache[code] = await loader(); } catch { cache[code] = en; }
  return cache[code];
}

function applyDocumentLanguage(code) {
  if (typeof document === 'undefined') return;
  const language = findLanguage(code);
  document.documentElement.lang = code;
  document.documentElement.dir = language?.dir || 'ltr';
}

export async function setUiLanguage(code) {
  const language = findLanguage(code);
  if (!language || language.uiStatus === 'none') return;
  await load(language.code);
  current = language.code;
  try { localStorage.setItem(STORAGE_KEY, current); } catch { /* storage may be blocked */ }
  applyDocumentLanguage(current);
  listeners.forEach(listener => listener(current));
}

export function translate(code, key) {
  return cache[code]?.[key] ?? en[key] ?? key;
}

// React hook: returns { lang, t, setLanguage, status } and re-renders on change.
export function useUiLanguage() {
  const [lang, setLang] = useState(current);
  const [, setLoaded] = useState(0);
  useEffect(() => {
    listeners.add(setLang);
    if (!cache[current]) load(current).then(() => { applyDocumentLanguage(current); setLoaded(value => value + 1); });
    else applyDocumentLanguage(current);
    return () => listeners.delete(setLang);
  }, []);
  return {
    lang,
    t: key => translate(lang, key),
    setLanguage: setUiLanguage,
    status: findLanguage(lang)?.uiStatus || 'reviewed',
  };
}
