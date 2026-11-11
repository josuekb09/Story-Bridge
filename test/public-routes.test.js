import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controller = readFileSync(new URL('../src/state/StoryBridgeController.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cultures = readFileSync(new URL('../src/pages/CulturesPage.jsx', import.meta.url), 'utf8');
const brand = readFileSync(new URL('../src/Brand.jsx', import.meta.url), 'utf8');

test('unknown public routes keep their path and render a Discover link', () => {
  assert.ok(controller.includes("return 'not-found';"));
  assert.ok(controller.includes("nextPage === 'not-found'\n      ? currentPath"));
  assert.ok(controller.includes("'not-found': 'Page not found — Story Bridge'"));
  assert.ok(controller.includes('<h1>Page not found</h1>'));
  assert.ok(controller.includes('href="/discover"'));
});

test('culture pages clarify when a summary is missing but stories exist', () => {
  assert.ok(cultures.includes("related.length > 0 ? 'No summary yet — read the member stories below.' : 'Not yet documented — add what you know.'"));
});

test('the Story Bridge wordmark opts out of browser auto-translation', () => {
  assert.ok(brand.includes('translate="no"'));
  assert.ok(brand.includes('wordmark notranslate'));
});
