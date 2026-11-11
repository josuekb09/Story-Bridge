import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGUAGES, UI_LANGUAGES, AFRICAN_LANGUAGES, pickUiLanguage, findLanguage } from '../src/lib/languages.js';
import { SHOWCASE, REGIONS } from '../src/data/showcase.js';

const readLocale = code => JSON.parse(fs.readFileSync(new URL(`../src/locales/${code}.json`, import.meta.url), 'utf8'));

const machineDraftKeys = [
  'nav.discover', 'nav.share', 'nav.search', 'nav.profile', 'nav.signOut', 'nav.profileSettings', 'nav.myStories', 'nav.admin', 'nav.workspace',
  'nav.primaryNavigation', 'nav.mainNavigation', 'nav.openProfileMenu', 'nav.openAccountMenu',
  'readInMyLanguage', 'translating', 'downloadingLanguagePack', 'machineTranslationLabel', 'showOriginal', 'openInGoogleTranslate',
  'feed.listen', 'feed.composerPlaceholder', 'feed.post', 'feed.allLanguages', 'feed.withAudio', 'feed.region', 'feed.allRegions', 'feed.seeMore',
  'feed.seeLess', 'feed.read', 'feed.share', 'feed.shareStory', 'feed.original', 'feed.translation', 'feed.translationByAuthor',
  'feed.translationByAuthorNoLanguage', 'feed.originalStory', 'feed.exploreCultures', 'feed.collections', 'feed.browseObjects', 'feed.joinStoryBridge',
  'policy.navLabel', 'policy.guidelines', 'policy.terms', 'policy.privacy',
  'audience.public', 'audience.publicDescription', 'audience.members', 'audience.membersDescription', 'audience.private', 'audience.privateDescription',
  'audience.heading', 'audience.whoCanSee', 'audience.pending', 'audience.aiUnavailable',
];
// These four short reader controls have hand-written English and French labels;
// other interface locales intentionally use the English fallback.
const englishFallbackKeys = ['readIn', 'readLanguagePicker', 'translationUnavailable', 'tryAgain'];

test('language codes are unique and machine locales draft all current UI keys', () => {
  const codes = LANGUAGES.map(language => language.code);
  assert.equal(new Set(codes).size, codes.length);
  const english = readLocale('en');
  for (const language of UI_LANGUAGES) {
    const locale = readLocale(language.code);
    const expectedKeys = Object.keys(english).filter(key => language.code === 'en' || language.code === 'fr' || !englishFallbackKeys.includes(key));
    assert.deepEqual(Object.keys(locale).sort(), expectedKeys.sort(), `${language.code} keys`);
    for (const [key, value] of Object.entries(locale)) assert.ok(String(value).trim(), `${language.code}.${key} is empty`);
    if (language.uiStatus === 'machine') {
      for (const key of machineDraftKeys) {
        assert.ok(String(locale[key]).trim(), `${language.code}.${key} is missing its machine draft`);
        assert.notEqual(locale[key], english[key], `${language.code}.${key} still falls back to English`);
        assert.doesNotMatch(locale[key], /§[KP]\d{2,3}§?|P\d{2}§/, `${language.code}.${key} has an untranslated token`);
      }
      for (const key of ['readInMyLanguage', 'downloadingLanguagePack', 'openInGoogleTranslate', 'feed.original', 'feed.translationByAuthor']) {
        assert.ok(locale[key].includes('{language}'), `${language.code}.${key} lost its language placeholder`);
      }
      assert.ok(locale['audience.whoCanSee'].includes('{choice}'), `${language.code}.audience.whoCanSee lost its choice placeholder`);
      assert.ok(locale['audience.pending'].includes('{choice}'), `${language.code}.audience.pending lost its choice placeholder`);
      assert.notEqual(locale['machine.notice'], english['machine.notice'], `${language.code} machine translation notice`);
    }
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
