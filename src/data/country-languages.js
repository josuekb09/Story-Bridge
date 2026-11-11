// Official, national or widely used languages per country, limited to languages that exist in
// src/lib/languages.js so every chip leads somewhere. Order: official/national first.
// Sources: each country's constitution or language law (South Africa: 11 official languages;
// DR Congo: French + 4 national languages; Ethiopia: federal working languages since 2020).
export const COUNTRY_LANGUAGES = {
  ZA: ['zu', 'xh', 'af', 'en', 'nso', 'tn', 'st', 'ts', 'ss', 've', 'nr'],
  CD: ['fr', 'ln', 'sw', 'lua', 'kg'],
  TZ: ['sw', 'en'],
  KE: ['sw', 'en'],
  NG: ['en', 'ha', 'yo', 'ig'],
  GH: ['en', 'ak'],
  ET: ['am', 'om', 'ti', 'so'],
  MA: ['ar', 'zgh', 'fr'],
  ML: ['fr', 'ff'],
  MG: ['mg', 'fr'],
  ZW: ['en', 'sn'],
};
