import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGUAGES, UI_LANGUAGES, AFRICAN_LANGUAGES, pickUiLanguage, findLanguage } from '../src/lib/languages.js';
import { SHOWCASE, REGIONS } from '../src/data/showcase.js';

const readLocale = code => JSON.parse(fs.readFileSync(new URL(`../src/locales/${code}.json`, import.meta.url), 'utf8'));

test('language codes are unique and every UI language has a complete locale file', () => {
  const codes = LANGUAGES.map(language => language.code);
  assert.equal(new Set(codes).size, codes.length);
  const english = readLocale('en');
  for (const language of UI_LANGUAGES) {
    const locale = readLocale(language.code);
    assert.deepEqual(Object.keys(locale).sort(), Object.keys(english).sort(), `${language.code} keys`);
    for (const [key, value] of Object.entries(locale)) assert.ok(String(value).trim(), `${language.code}.${key} is empty`);
  }
});

test('at least fifteen African languages have interface text', () => {
  assert.ok(AFRICAN_LANGUAGES.filter(language => language.uiStatus !== 'none').length >= 15);
});

test('only English and French are marked as reviewed', () => {
  assert.deepEqual(LANGUAGES.filter(language => language.uiStatus === 'reviewed').map(language => language.code).sort(), ['en', 'fr']);
});

test('browser preferences pick a supported interface language', () => {
  assert.equal(pickUiLanguage(['sw-KE', 'en']), 'sw');
  assert.equal(pickUiLanguage(['lua', 'fr-CD']), 'fr');
  assert.equal(pickUiLanguage(['xx']), 'en');
  assert.equal(findLanguage('AR')?.dir, 'rtl');
});

test('showcase entries cover every region and carry no invented images', () => {
  for (const region of REGIONS) assert.ok(SHOWCASE.some(item => item.region === region), region);
  const ids = SHOWCASE.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of SHOWCASE) {
    assert.ok(item.commons || item.local, `${item.id} needs a Commons search or a local licensed image`);
    if (item.local) for (const field of ['src', 'author', 'licence', 'sourceUrl']) assert.ok(item.local[field], `${item.id}.${field}`);
  }
  const images = JSON.parse(fs.readFileSync(new URL('../src/data/africa-images.json', import.meta.url), 'utf8'));
  for (const [id, image] of Object.entries(images)) for (const field of ['src', 'author', 'licence', 'sourceUrl']) assert.ok(image[field], `${id}.${field} missing credit data`);
});
