import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getPostImagePresentation } from '../src/lib/post-image-presentation.js';

test('small culture and search thumbnails stay square without a loading label', () => {
  assert.deepEqual(getPostImagePresentation('thumbnail', { width: 1600, height: 900 }), {
    aspectRatio: '1 / 1', showLoadingLabel: false, showUnavailableText: false,
  });
  const culturePage = fs.readFileSync(new URL('../src/pages/CulturesPage.jsx', import.meta.url), 'utf8');
  const searchPage = fs.readFileSync(new URL('../src/pages/SearchPage.jsx', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../src/styles/components/cultures.css', import.meta.url), 'utf8');
  assert.match(culturePage, /className="culture-story-thumb"[^>]*variant="thumbnail" sizes="56px"/);
  assert.match(searchPage, /className="culture-story-thumb"[^>]*variant="thumbnail" sizes="56px"/);
  assert.match(styles, /\.culture-story-thumb\{[^}]*aspect-ratio:1 \/ 1/);
  assert.match(styles, /\.culture-story-thumb>\.post-image-content\{object-fit:cover\}/);
});

test('full and feed images retain photo dimensions and their loading labels', () => {
  assert.deepEqual(getPostImagePresentation('full', { width: 1600, height: 900 }), {
    aspectRatio: '1600 / 900', showLoadingLabel: true, showUnavailableText: true,
  });
  assert.deepEqual(getPostImagePresentation('feed', { width: 800, height: 600 }), {
    aspectRatio: '800 / 600', showLoadingLabel: true, showUnavailableText: true,
  });
});
