// Language registry: single source of truth for the UI picker and post languages.
// Owner: Claude (see docs/COLLAB.md).
// uiStatus: 'reviewed' = interface text written by a person; 'machine' = interface
// text drafted by a machine and not yet checked by a speaker; 'none' = no interface
// text yet (the language can still be used to write and read stories).

export const LANGUAGES = [
  // International
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', uiStatus: 'reviewed', group: 'international' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', uiStatus: 'reviewed', group: 'international' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', uiStatus: 'machine', group: 'international' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', uiStatus: 'machine', group: 'international' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', uiStatus: 'machine', group: 'international' },
  // Fifteen widely spoken African languages with interface drafts
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'ig', name: 'Igbo', nativeName: 'Asụsụ Igbo', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'om', name: 'Oromo', nativeName: 'Afaan Oromoo', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'zu', name: 'isiZulu', nativeName: 'isiZulu', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'xh', name: 'isiXhosa', nativeName: 'isiXhosa', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'sn', name: 'Shona', nativeName: 'chiShona', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'ln', name: 'Lingala', nativeName: 'Lingála', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  { code: 'wo', name: 'Wolof', nativeName: 'Wolof', dir: 'ltr', uiStatus: 'machine', group: 'african' },
  // More African languages for writing and reading stories (no interface text yet)
  { code: 'lua', name: 'Tshiluba', nativeName: 'Tshiluba', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'kg', name: 'Kikongo', nativeName: 'Kikongo', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'ak', name: 'Akan (Twi)', nativeName: 'Akan', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'ti', name: 'Tigrinya', nativeName: 'ትግርኛ', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'tn', name: 'Setswana', nativeName: 'Setswana', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'ny', name: 'Chichewa', nativeName: 'Chichewa', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'ff', name: 'Fula', nativeName: 'Fulfulde', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'kab', name: 'Kabyle', nativeName: 'Taqbaylit', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'zgh', name: 'Standard Moroccan Tamazight', nativeName: 'ⵜⴰⵎⴰⵣⵉⵖⵜ', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'ts', name: 'Xitsonga', nativeName: 'Xitsonga', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 've', name: 'Tshivenḓa', nativeName: 'Tshivenḓa', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'ss', name: 'siSwati', nativeName: 'siSwati', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'nso', name: 'Sepedi', nativeName: 'Sepedi', dir: 'ltr', uiStatus: 'none', group: 'african' },
  { code: 'nr', name: 'isiNdebele', nativeName: 'isiNdebele', dir: 'ltr', uiStatus: 'none', group: 'african' },
];

export const UI_LANGUAGES = LANGUAGES.filter(language => language.uiStatus !== 'none');
export const AFRICAN_LANGUAGES = LANGUAGES.filter(language => language.group === 'african');

export function findLanguage(code) {
  const base = String(code || '').toLowerCase();
  return LANGUAGES.find(language => language.code === base) || LANGUAGES.find(language => language.code === base.split('-')[0]) || null;
}

// Picks the best interface language from a list of browser preferences.
export function pickUiLanguage(preferences = []) {
  for (const preference of preferences) {
    const match = findLanguage(preference);
    if (match && match.uiStatus !== 'none') return match.code;
  }
  return 'en';
}
